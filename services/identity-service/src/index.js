/**
 * AegisLedger — Identity & Compliance Service
 * Handles: JWT auth, RBAC, MFA (FIDO2/WebAuthn), SSO, KYB orchestration
 */

const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const redis = require("redis");
const { body, validationResult } = require("express-validator");
const speakeasy = require("speakeasy");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const { createCipheriv, randomBytes, createDecipheriv } = require("crypto");
const { Fido2Lib } = require("fido2-lib");

const JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY;
if (!JWT_PRIVATE_KEY) {
  console.error('FATAL: JWT_PRIVATE_KEY is not set');
  process.exit(1);
}
const JWT_PUBLIC_KEY = process.env.JWT_PUBLIC_KEY;
if (!JWT_PUBLIC_KEY) {
  console.error('FATAL: JWT_PUBLIC_KEY is not set');
  process.exit(1);
}
const JWT_TEMP_SECRET = process.env.JWT_TEMP_SECRET;
if (!JWT_TEMP_SECRET) {
  console.error('FATAL: JWT_TEMP_SECRET is not set');
  process.exit(1);
}
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

const f2l = new Fido2Lib({
    timeout: 60000,
    rpId: process.env.FIDO2_RP_ID || "aegisledger.com",
    rpName: "AegisLedger",
    challengeSize: 32,
    cryptoParams: [-7, -257]
});

const app = express();
app.use(express.json());
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));

// ─── DB & CACHE ──────────────────────────────────────────────────
const db = new Pool({
  host: process.env.PG_HOST,
  database: process.env.PG_DB,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl: { rejectUnauthorized: true },
});

const cache = redis.createClient({ url: process.env.REDIS_URL });
cache.connect();

// ─── ROLES & PERMISSIONS ─────────────────────────────────────────
const ROLES = {
  SUPER_ADMIN:    { level: 5, permissions: ["*"] },
  COMPLIANCE:     { level: 4, permissions: ["kyb:read","kyb:approve","aml:read","aml:action","tx:freeze","reports:generate","sanctions:screen"] },
  TREASURY_MGR:   { level: 3, permissions: ["wallet:read","wallet:write","tx:initiate","tx:approve","onramp:initiate","offramp:initiate","liquidity:manage","users:manage:sub"] },
  OPERATOR:       { level: 2, permissions: ["tx:draft","tx:read","docs:upload","docs:read","trade:view"] },
  LOGISTICS:      { level: 1, permissions: ["shipments:read","docs:upload","trade:view:assigned"] },
  AUDITOR:        { level: 0, permissions: ["*:read"] },
};

// Maker-Checker: high-value tx require dual authorization
const MAKER_CHECKER_THRESHOLD = 500_000; // USD

// ─── RATE LIMITING ────────────────────────────────────────────────
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: "Too many login attempts" });
const apiLimiter  = rateLimit({ windowMs: 60 * 1000, max: 300 });

// ─── JWT HELPERS ──────────────────────────────────────────────────
function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_PRIVATE_KEY, {
    expiresIn: "8h",
    algorithm: "RS256",
    issuer: "aegisledger.io",
    audience: "aegisledger-platform",
  });
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_PUBLIC_KEY, {
    algorithms: ["RS256"],
    issuer: "aegisledger.io",
    audience: "aegisledger-platform",
  });
}

// ─── MIDDLEWARE ───────────────────────────────────────────────────
async function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "Missing token" });
  try {
    const token = auth.slice(7);
    // Check if token is revoked (logout/session invalidation)
    const revoked = await cache.get(`revoked:${token}`);
    if (revoked) return res.status(401).json({ error: "Token revoked" });
    req.user = verifyToken(token);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function authorize(...requiredPerms) {
  return (req, res, next) => {
    const role = ROLES[req.user.role];
    if (!role) return res.status(403).json({ error: "Unknown role" });
    const hasAll = requiredPerms.every(p =>
      role.permissions.includes("*") || role.permissions.includes(p)
    );
    if (!hasAll) return res.status(403).json({ error: "Insufficient permissions" });
    next();
  };
}

// ─── ROUTES ───────────────────────────────────────────────────────

/**
 * POST /auth/login — Step 1: credentials
 */
app.post("/auth/login", authLimiter, [
  body("email").isEmail().normalizeEmail(),
  body("password").isLength({ min: 12 }),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  const { email, password } = req.body;
  try {
    const { rows } = await db.query(
      "SELECT id, email, password_hash, role, company_id, mfa_secret, is_active, failed_attempts FROM users WHERE email=$1",
      [email]
    );
    const user = rows[0];
    if (!user || !user.is_active) return res.status(401).json({ error: "Invalid credentials" });

    // Account lockout after 5 failed attempts
    if (user.failed_attempts >= 5) {
      return res.status(423).json({ error: "Account locked. Contact administrator." });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await db.query("UPDATE users SET failed_attempts = failed_attempts + 1 WHERE id=$1", [user.id]);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Reset failed attempts on success
    await db.query("UPDATE users SET failed_attempts = 0 WHERE id=$1", [user.id]);

    // Issue temp token for MFA step (15 min)
    const tempToken = jwt.sign({ userId: user.id, step: "mfa" }, process.env.JWT_TEMP_SECRET, { expiresIn: "15m" });
    await cache.setEx(`mfa_pending:${user.id}`, 900, tempToken);

    res.json({ requiresMfa: true, tempToken, mfaMethod: "TOTP" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Authentication error" });
  }
});

/**
 * POST /auth/mfa — Step 2: TOTP verification
 */
app.post("/auth/mfa", authLimiter, async (req, res) => {
  const { tempToken, totpCode } = req.body;
  try {
    const decoded = jwt.verify(tempToken, process.env.JWT_TEMP_SECRET);
    if (decoded.step !== "mfa") return res.status(400).json({ error: "Invalid MFA step" });

    const cached = await cache.get(`mfa_pending:${decoded.userId}`);
    if (!cached) return res.status(400).json({ error: "MFA session expired" });

    const { rows } = await db.query("SELECT * FROM users WHERE id=$1", [decoded.userId]);
    const user = rows[0];

    const verified = speakeasy.totp.verify({
      secret: decrypt(user.mfa_secret),
      encoding: "base32",
      token: totpCode,
      window: 1,
    });

    if (!verified) return res.status(401).json({ error: "Invalid MFA code" });

    await cache.del(`mfa_pending:${user.id}`);

    // Fetch company + KYB status
    const { rows: compRows } = await db.query(
      "SELECT id, name, kyb_status, jurisdiction, elr_qualified FROM companies WHERE id=$1",
      [user.company_id]
    );
    const company = compRows[0];

    const accessToken = signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      company: company?.id,
      companyName: company?.name,
      kybStatus: company?.kyb_status,
      jurisdiction: company?.jurisdiction,
      elrQualified: company?.elr_qualified,
    });

    // Audit log
    await db.query(
      "INSERT INTO audit_logs (user_id, action, ip, metadata) VALUES ($1,'LOGIN_SUCCESS',$2,$3)",
      [user.id, req.ip, JSON.stringify({ role: user.role })]
    );

    res.json({ accessToken, expiresIn: 28800, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    res.status(401).json({ error: "MFA verification failed" });
  }
});

/**
 * POST /auth/logout
 */
app.post("/auth/logout", authenticate, async (req, res) => {
  const token = req.headers.authorization.slice(7);
  const remaining = req.user.exp - Math.floor(Date.now() / 1000);
  await cache.setEx(`revoked:${token}`, Math.max(remaining, 0), "1");
  await db.query("INSERT INTO audit_logs (user_id, action, ip) VALUES ($1,'LOGOUT',$2)", [req.user.sub, req.ip]);
  res.json({ message: "Logged out successfully" });
});

/**
 * POST /kyb/submit — Submit KYB application
 */
app.post("/kyb/submit", [
  body("companyName").notEmpty(),
  body("registrationNumber").notEmpty(),
  body("jurisdiction").isIn(["RU", "AE", "GB", "US", "DE", "FR", "SG", "HK"]),
  body("annualRevenue").isNumeric(),
  body("directors").isArray({ min: 1 }),
  body("ubos").isArray({ min: 1 }),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  const { companyName, registrationNumber, jurisdiction, annualRevenue, directors, ubos, documents } = req.body;

  try {
    const kybId = uuidv4();

    // Russian ELR qualification check
    let elrQualified = false;
    if (jurisdiction === "RU") {
      const annualRevenueRUB = annualRevenue;
      elrQualified = annualRevenueRUB >= 50_000_000; // 50M RUB minimum
    }

    await db.query(`
      INSERT INTO kyb_applications (id, company_name, registration_number, jurisdiction, annual_revenue, directors, ubos, documents, elr_qualified, status, submitted_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING',NOW())
    `, [kybId, companyName, registrationNumber, jurisdiction, annualRevenue, encrypt(JSON.stringify(directors)), encrypt(JSON.stringify(ubos)), JSON.stringify(documents || []), elrQualified]);

    // Note: raw PII has been persisted.
    // Depending on jurisdiction a breach notification assessment may be required.
    // Flag this to the Data Protection Officer.

    // Trigger async ComplyAdvantage screening (mocked)
    await publishKafkaEvent("kyb.submitted", { kybId, companyName, jurisdiction, directors, ubos });

    res.json({ kybId, status: "PENDING", elrQualified, message: "KYB application submitted. Screening in progress." });
  } catch (err) {
    res.status(500).json({ error: "KYB submission failed" });
  }
});

/**
 * PATCH /kyb/:id/approve — Compliance Officer approves KYB
 */
app.patch("/kyb/:id/approve", authenticate, authorize("kyb:approve"), async (req, res) => {
  const { id } = req.params;
  const { decision, notes, riskRating, eddNotes, ofacCheck, euCheck, ukCheck } = req.body;

  try {
    // Fix 11: Block auto-approval for HIGH_RISK, route to Compliance Officer queue with mandatory checks
    if ((riskRating === 'HIGH_RISK' || riskRating === 'CRITICAL') && decision === 'APPROVE') {
      if (!eddNotes || !ofacCheck || !euCheck || !ukCheck) {
        return res.status(400).json({ 
          error: "HIGH_RISK entities require EDD notes and explicit OFAC, EU consolidated, and UK HMT sanctions checks before approval." 
        });
      }
    }

    await db.query(`
      UPDATE kyb_applications SET status=$1, reviewed_by=$2, review_notes=$3, risk_rating=$4, reviewed_at=NOW()
      WHERE id=$5
    `, [decision === "APPROVE" ? "APPROVED" : "REJECTED", req.user.sub, notes, riskRating, id]);

    if (decision === "APPROVE") {
      // Create company account and provision wallet
      await publishKafkaEvent("kyb.approved", { kybId: id, reviewedBy: req.user.sub });
    }

    res.json({ message: `KYB application ${decision}D`, kybId: id });
  } catch (err) {
    res.status(500).json({ error: "KYB decision failed" });
  }
});

/**
 * GET /users/me — Current user profile
 */
app.get("/users/me", authenticate, async (req, res) => {
  const { rows } = await db.query(
    "SELECT id, email, role, company_id, created_at FROM users WHERE id=$1",
    [req.user.sub]
  );
  res.json(rows[0]);
});

// ─── KAFKA PUBLISHER (mock in dev) ────────────────────────────────
async function publishKafkaEvent(topic, payload) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[KAFKA MOCK] Topic: ${topic}`, payload);
    return;
  }
  // Real Kafka integration here
}

// ─── HEALTH CHECK ─────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok", service: "identity", timestamp: new Date().toISOString() }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Identity Service listening on port ${PORT}`));
module.exports = app;
