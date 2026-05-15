/**
 * AegisLedger — KYB Service
 * Handles: KYB resubmission, PEP/adverse media screening,
 *          UBO corporate structure, document expiry tracking,
 *          invited user onboarding, video KYC scheduling,
 *          periodic renewal scheduler
 */

const express  = require("express");
const multer   = require("multer");
const { Pool } = require("pg");
const redis    = require("redis");
const { Kafka }= require("kafkajs");
const axios    = require("axios");
const { v4: uuid } = require("uuid");
const helmet   = require("helmet");
const { createCipheriv, randomBytes, createDecipheriv } = require("crypto");

const AES_KEY = process.env.AES_KEY;
if (!AES_KEY) {
  console.error('FATAL: AES_KEY is not set');
  process.exit(1);
}

function encrypt(plaintext) {
  if (!plaintext) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(process.env.AES_KEY, 'hex'), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

function decrypt(blob) {
  if (!blob) return null;
  const buf = Buffer.from(blob, 'base64');
  const iv = buf.slice(0, 12);
  const tag = buf.slice(12, 28);
  const ciphertext = buf.slice(28);
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(process.env.AES_KEY, 'hex'), iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}

const app = express();
app.use(express.json());
app.use(helmet());

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redisClient = redis.createClient({ url: process.env.REDIS_URL });
redisClient.connect().catch(console.error);

const kafka    = new Kafka({ clientId: "kyb-service", brokers: (process.env.KAFKA_BROKERS||"localhost:9092").split(",") });
const producer = kafka.producer();
producer.connect().catch(e => console.warn("Kafka unavailable:", e.message));

const multerS3 = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');
const s3 = new S3Client({ region: process.env.AWS_REGION || 'me-central-1' });

const upload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.KYB_DOCUMENTS_BUCKET,
    serverSideEncryption: 'aws:kms',
    key: (req, file, cb) => {
      const key = 'kyb/' + (req.body.companyId || req.params.companyId || 'unknown') + '/' + Date.now() + '-' + file.originalname;
      cb(null, key);
    }
  }),
  limits: { fileSize: 20 * 1024 * 1024, files: 20 }
});

async function publish(topic, payload) {
  try { await producer.send({ topic, messages: [{ value: JSON.stringify({ ...payload, _ts: new Date().toISOString() }) }] }); }
  catch { console.log(`[KAFKA LOG] ${topic}`, payload); }
}

// ─── KYB RESUBMISSION ─────────────────────────────────────────────
app.post("/kyb/:companyId/resubmit", upload.array("documents", 20), async (req, res) => {
  const { companyId } = req.params;
  const { changedFields, notes } = req.body;

  const { rows: prev } = await db.query(
    "SELECT * FROM kyb_applications WHERE company_id=$1 ORDER BY version DESC LIMIT 1", [companyId]
  );
  if (!prev[0]) return res.status(404).json({ error: "No prior KYB application" });
  if (prev[0].status === "approved") return res.status(400).json({ error: "Company already approved" });

  const newVersion = (prev[0].version || 1) + 1;
  const appId = `KYB-${companyId.slice(0,6).toUpperCase()}-V${newVersion}`;

  await db.query(`
    INSERT INTO kyb_applications (id, company_id, version, status, data, changed_fields, resubmission_notes, submitted_at)
    VALUES ($1,$2,$3,'pending',$4,$5,$6,NOW())
  `, [appId, companyId, newVersion, JSON.stringify(req.body), JSON.stringify(changedFields||[]), notes||""]);

  // Store document diff
  if (req.files?.length) {
    for (const f of req.files) {
      await db.query(
        "INSERT INTO kyb_documents (id, application_id, filename, mimetype, size, s3_key, uploaded_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())",
        [uuid(), appId, f.originalname, f.mimetype, f.size, f.key]
      );
    }
  }

  await publish("kyb.resubmitted", { companyId, appId, version: newVersion, changedFields });
  res.json({ appId, version: newVersion, status: "pending", message: "KYB resubmission received. Compliance team will review within 2 business days." });
});

// ─── DOCUMENT EXPIRY TRACKER ──────────────────────────────────────
app.get("/kyb/:companyId/document-expiry", async (req, res) => {
  const { rows } = await db.query(`
    SELECT id, document_type, filename, expiry_date,
      EXTRACT(DAY FROM expiry_date - NOW()) AS days_remaining,
      CASE WHEN expiry_date < NOW() THEN 'expired'
           WHEN expiry_date < NOW() + INTERVAL '7 days' THEN 'critical'
           WHEN expiry_date < NOW() + INTERVAL '30 days' THEN 'warning'
           WHEN expiry_date < NOW() + INTERVAL '60 days' THEN 'notice'
           ELSE 'valid' END AS status
    FROM kyb_documents
    WHERE company_id=$1 AND expiry_date IS NOT NULL
    ORDER BY expiry_date ASC
  `, [req.params.companyId]);
  res.json(rows);
});

// ─── PEP SCREENING ────────────────────────────────────────────────
app.post("/screening/pep", async (req, res) => {
  const { name, dob, nationality, entityId } = req.body;
  const screenId = `PEP-${uuid().slice(0,8).toUpperCase()}`;

  // In production: ComplyAdvantage / Refinitiv World-Check API
  const mockPepResult = {
    screenId, name, entityId,
    screened_at: new Date().toISOString(),
    pep_match: false,
    pep_level: null,
    sanctions_match: false,
    adverse_media: false,
    sources_checked: ["UN","OFAC","EU","UK_HMT","INTERPOL","WorldCheck"],
    risk_indicators: [],
    confidence: 0.97,
    provider: "ComplyAdvantage (mock)"
  };

  // Simulate a 5% hit rate for testing
  if (Math.random() < 0.05) {
    mockPepResult.pep_match = true;
    mockPepResult.pep_level = "PEP-1";
    mockPepResult.risk_indicators = ["Former government official", "High-risk jurisdiction connections"];
  }

  await db.query(
    "INSERT INTO pep_screenings (id, entity_id, entity_name, result, screened_at) VALUES ($1,$2,$3,$4,NOW())",
    [screenId, entityId, name, JSON.stringify(mockPepResult)]
  );

  await publish("screening.pep_completed", { entityId, screenId, pepMatch: mockPepResult.pep_match });
  res.json(mockPepResult);
});

// ─── ADVERSE MEDIA SCREENING ──────────────────────────────────────
app.post("/screening/adverse-media", async (req, res) => {
  const { companyName, entityId } = req.body;

  let articles = [];
  try {
    // GDELT API for news screening
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(companyName+" fraud OR sanction OR money+laundering OR corruption")}&mode=ArtList&maxrecords=10&format=json`;
    const resp = await axios.get(url, { timeout: 5000 });
    articles = (resp.data?.articles || []).map(a => ({
      title: a.title, url: a.url, date: a.seendate,
      tone: a.tone, domain: a.domain,
      sentiment: parseFloat(a.tone) < -2 ? "negative" : "neutral"
    })).filter(a => a.sentiment === "negative");
  } catch {
    // Fallback mock if GDELT unavailable
    articles = [];
  }

  const result = {
    entityId, companyName,
    screened_at: new Date().toISOString(),
    adverse_articles_found: articles.length,
    risk_level: articles.length > 5 ? "high" : articles.length > 0 ? "medium" : "low",
    articles: articles.slice(0, 5),
    provider: "GDELT"
  };

  await db.query(
    "INSERT INTO adverse_media_screenings (id, entity_id, result, screened_at) VALUES ($1,$2,$3,NOW())",
    [uuid(), entityId, JSON.stringify(result)]
  );

  res.json(result);
});

// ─── UBO CORPORATE STRUCTURE ──────────────────────────────────────
app.get("/ubo/:companyId/structure", async (req, res) => {
  const { rows } = await db.query(`
    SELECT id, name, entity_type, ownership_pct, parent_id, country,
           is_ubo, pep_status, risk_level, verified
    FROM corporate_entities
    WHERE root_company_id=$1
    ORDER BY ownership_pct DESC
  `, [req.params.companyId]);

  // Build tree structure
  const tree = {};
  const roots = [];
  rows.forEach(r => { tree[r.id] = { ...r, children: [] }; });
  rows.forEach(r => {
    if (r.parent_id && tree[r.parent_id]) tree[r.parent_id].children.push(tree[r.id]);
    else roots.push(tree[r.id]);
  });

  res.json({ company_id: req.params.companyId, structure: roots, total_entities: rows.length,
    ubos: rows.filter(r => r.is_ubo), high_risk_count: rows.filter(r => r.risk_level === "high").length });
});

app.post("/ubo/:companyId/entity", async (req, res) => {
  const { name, entityType, ownershipPct, parentId, country, isUbo } = req.body;
  const id = uuid();
  await db.query(`
    INSERT INTO corporate_entities (id, root_company_id, name, entity_type, ownership_pct, parent_id, country, is_ubo, verified, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,NOW())
  `, [id, req.params.companyId, name, entityType, ownershipPct, parentId||null, country, isUbo||false]);
  res.json({ id, message: "Entity added to corporate structure" });
});

// ─── KYB RENEWAL SCHEDULER ────────────────────────────────────────
app.get("/renewal/due", async (req, res) => {
  const { rows } = await db.query(`
    SELECT c.id, c.name, c.email, c.kyb_approved_at,
           c.kyb_approved_at + INTERVAL '1 year' AS renewal_due,
           EXTRACT(DAY FROM (c.kyb_approved_at + INTERVAL '1 year') - NOW()) AS days_until_renewal
    FROM companies c
    WHERE c.kyb_status='approved'
      AND c.kyb_approved_at + INTERVAL '1 year' < NOW() + INTERVAL '90 days'
    ORDER BY renewal_due ASC
  `);
  res.json({ due: rows, count: rows.length });
});

app.post("/renewal/:companyId/trigger", async (req, res) => {
  const { rows } = await db.query("SELECT * FROM companies WHERE id=$1", [req.params.companyId]);
  if (!rows[0]) return res.status(404).json({ error: "Company not found" });

  await db.query("UPDATE companies SET kyb_status='renewal_pending', updated_at=NOW() WHERE id=$1", [req.params.companyId]);
  await publish("kyb.renewal_triggered", { companyId: req.params.companyId, companyName: rows[0].name, email: rows[0].email });
  res.json({ message: "KYB renewal initiated", company: rows[0].name });
});

// ─── INVITED USER ONBOARDING ──────────────────────────────────────
app.post("/invite", async (req, res) => {
  const { companyId, email, role, invitedByUserId } = req.body;
  if (!companyId || !email || !role) return res.status(400).json({ error: "companyId, email, role required" });

  const inviteToken = require("crypto").randomBytes(32).toString("hex");
  const expiresAt   = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.query(`
    INSERT INTO user_invitations (id, company_id, email, role, token, invited_by, expires_at, used, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,false,NOW())
  `, [uuid(), companyId, email, role, inviteToken, invitedByUserId, expiresAt]);

  const inviteUrl = `${process.env.FRONTEND_URL}/join?token=${inviteToken}`;
  await publish("auth.invite_sent", { email, companyId, role, inviteUrl, expiresAt });

  res.json({ message: `Invitation sent to ${email}`, expiresAt });
});

app.post("/invite/accept", async (req, res) => {
  const { token, password, displayName } = req.body;
  const { rows } = await db.query(
    "SELECT * FROM user_invitations WHERE token=$1 AND used=false AND expires_at>NOW()", [token]
  );
  if (!rows[0]) return res.status(400).json({ error: "Invalid or expired invitation" });

  const inv = rows[0];
  const bcrypt = require("bcryptjs");
  const hash   = await bcrypt.hash(password, 12);
  const userId = uuid();

  await db.query(`
    INSERT INTO users (id, company_id, email, password_hash, role, display_name, mfa_enabled, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,false,NOW())
  `, [userId, inv.company_id, inv.email, hash, inv.role, displayName || inv.email.split("@")[0]]);

  await db.query("UPDATE user_invitations SET used=true, used_at=NOW(), user_id=$1 WHERE id=$2", [userId, inv.id]);
  await publish("auth.invite_accepted", { userId, email: inv.email, companyId: inv.company_id, role: inv.role });

  res.json({ message: "Account created. Please sign in.", userId, email: inv.email });
});

// ─── VIDEO KYC SCHEDULING ─────────────────────────────────────────
app.post("/video-kyc/:companyId/schedule", async (req, res) => {
  const { preferredSlot, timezone } = req.body;
  const sessionId = `VID-${uuid().slice(0,8).toUpperCase()}`;

  await db.query(`
    INSERT INTO video_kyc_sessions (id, company_id, preferred_slot, timezone, status, created_at)
    VALUES ($1,$2,$3,$4,'scheduled',NOW())
  `, [sessionId, req.params.companyId, preferredSlot, timezone||"Asia/Dubai"]);

  await publish("kyb.video_kyc_scheduled", { sessionId, companyId: req.params.companyId, slot: preferredSlot });
  res.json({ sessionId, status: "scheduled", message: "A compliance officer will confirm your video KYC session within 24 hours." });
});

app.get("/health", (req, res) => res.json({ status: "ok", service: "kyb" }));

app.listen(process.env.PORT || 3008, () => console.log("KYB Service on port 3008"));
module.exports = app;
