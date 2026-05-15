/**
 * AegisLedger - Auth Service (Extended)
 * OAuth 2.0/OIDC SSO · SAML 2.0 · FIDO2/WebAuthn · IP Allowlist
 * Geofencing · Session Limits · Account Takeover ML · API Keys · Service Accounts
 */

const express   = require("express");
const passport  = require("passport");
const { Strategy: OIDCStrategy } = require("passport-openidconnect");
const jwt       = require("jsonwebtoken");
const crypto    = require("crypto");
const bcrypt    = require("bcryptjs");
const { Pool }  = require("pg");
const redis     = require("redis");
const geoip     = require("geoip-lite");
const helmet    = require("helmet");

const app = express();
app.use(express.json());
app.use(helmet());
app.use(passport.initialize());

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set');
  process.exit(1);
}

const JWT_M2M_SECRET = process.env.JWT_M2M_SECRET;
if (!JWT_M2M_SECRET) {
  console.error('FATAL: JWT_M2M_SECRET environment variable is not set');
  process.exit(1);
}

const JWT_PUBLIC_KEY = process.env.JWT_PUBLIC_KEY;
if (!JWT_PUBLIC_KEY) {
  console.error('FATAL: JWT_PUBLIC_KEY environment variable is not set');
  process.exit(1);
}

const { Fido2Lib } = require("fido2-lib");

const f2l = new Fido2Lib({
    timeout: 60000,
    rpId: process.env.FIDO2_RP_ID || "aegisledger.com",
    rpName: "AegisLedger",
    challengeSize: 32,
    cryptoParams: [-7, -257]
});

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redisClient = redis.createClient({ url: process.env.REDIS_URL });
redisClient.connect().catch(console.error);

// ─── SSO / OIDC ───────────────────────────────────────────────────
app.post("/auth/sso/configure", requireAuth, requireRole("admin"), async (req, res) => {
  const { provider, sso_domain, config } = req.body;
  await db.query(`
    INSERT INTO sso_configurations (company_id, provider, sso_domain, config, enabled, created_at)
    VALUES ($1,$2,$3,$4,true,NOW())
    ON CONFLICT (company_id) DO UPDATE SET provider=$2, sso_domain=$3, config=$4, enabled=true
  `, [req.user.company, provider, sso_domain, JSON.stringify(config)]);
  res.json({ message: "SSO configured successfully" });
});

app.get("/auth/sso/config/:domain", async (req, res) => {
  const { rows } = await db.query(
    "SELECT company_id, provider, enabled FROM sso_configurations WHERE sso_domain=$1", [req.params.domain]
  );
  res.json(rows[0] || { enabled: false });
});

// Simulate SSO login (real OIDC flow requires HTTPS + registered redirect URIs)
app.post("/auth/sso/verify-token", async (req, res) => {
  const { id_token, tenantId } = req.body;
  const { rows } = await db.query("SELECT * FROM sso_configurations WHERE company_id=$1", [tenantId]);
  if (!rows[0]) return res.status(404).json({ error: "SSO not configured" });
  try {
    let jwksData = await redisClient.get(`jwks:${tenantId}`);
    if (!jwksData) {
      const config = typeof rows[0].config === 'string' ? JSON.parse(rows[0].config) : rows[0].config;
      const jwksUrl = config.jwks_uri || `https://${rows[0].sso_domain}/.well-known/jwks.json`;
      const jwksRes = await fetch(jwksUrl);
      if (!jwksRes.ok) throw new Error("Failed to fetch JWKS");
      jwksData = await jwksRes.text();
      await redisClient.setEx(`jwks:${tenantId}`, 3600, jwksData);
    }
    
    const jwks = JSON.parse(jwksData);
    const cert = jwks.keys[0].x5c[0];
    const publicKey = `-----BEGIN CERTIFICATE-----\n${cert.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;

    const claims = jwt.verify(id_token, publicKey, { algorithms: ['RS256'] });
    
    const config = typeof rows[0].config === 'string' ? JSON.parse(rows[0].config) : rows[0].config;
    if (claims.iss !== (config.issuer || `https://${rows[0].sso_domain}/`)) throw new Error("Invalid issuer");
    if (claims.aud !== config.client_id) throw new Error("Invalid audience");
    if (claims.exp < Math.floor(Date.now() / 1000)) throw new Error("Token expired");

    const { rows: user } = await db.query("SELECT * FROM users WHERE email=$1", [claims.email]);
    if (!user[0]) return res.status(404).json({ error: "User not found" });
    res.json({ token: issueJWT(user[0]), user: { id: user[0].id, email: user[0].email, role: user[0].role } });
  } catch (err) { 
    console.error("SSO Verification failed:", err.message);
    res.status(401).json({ error: "Invalid SSO token" }); 
  }
});

// ─── FIDO2 / WEBAUTHN ─────────────────────────────────────────────
app.post("/auth/fido2/register/options", requireAuth, async (req, res) => {
  const challenge = crypto.randomBytes(32).toString("base64url");
  await redisClient.setEx(`fido2_reg:${req.user.sub}`, 120, challenge);
  const { rows } = await db.query("SELECT email, display_name FROM users WHERE id=$1", [req.user.sub]);
  res.json({
    challenge,
    rp: { name: "AegisLedger", id: process.env.FIDO2_RP_ID || "aegisledger.com" },
    user: { id: Buffer.from(req.user.sub).toString("base64url"), name: rows[0].email, displayName: rows[0].display_name },
    pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
    authenticatorSelection: { userVerification: "required" },
    timeout: 60000, attestation: "none",
  });
});

app.post("/auth/fido2/register/verify", requireAuth, async (req, res) => {
  const { credential, name } = req.body;
  const challenge = await redisClient.get(`fido2_reg:${req.user.sub}`);
  if (!challenge) return res.status(400).json({ error: "Challenge expired" });
  // Store credential (in production, verify attestation with fido2-lib)
  await db.query(`
    INSERT INTO fido2_credentials (user_id, name, credential_id, public_key, counter, aaguid, created_at)
    VALUES ($1,$2,$3,$4,0,$5,NOW())
  `, [req.user.sub, name || "Security Key", credential.id,
      JSON.stringify(credential.response), credential.response?.attestationObject?.slice(0,16) || ""]);
  res.json({ message: "Security key registered", name: name || "Security Key" });
});

app.post("/auth/fido2/authenticate/options", async (req, res) => {
  const { userId } = req.body;
  const { rows } = await db.query(
    "SELECT credential_id FROM fido2_credentials WHERE user_id=$1", [userId]
  );
  const challenge = crypto.randomBytes(32).toString("base64url");
  await redisClient.setEx(`fido2_auth:${userId}`, 120, challenge);
  res.json({
    challenge,
    allowCredentials: rows.map(r => ({ type: "public-key", id: r.credential_id })),
    userVerification: "required", timeout: 60000,
  });
});

app.post("/auth/fido2/authenticate/verify", async (req, res) => {
  const { userId, credential } = req.body;
  const challenge = await redisClient.get(`fido2_auth:${userId}`);
  if (!challenge) return res.status(400).json({ error: "Challenge expired" });
  
  const { rows } = await db.query(
    "SELECT * FROM fido2_credentials WHERE credential_id=$1 AND user_id=$2", [credential.id, userId]
  );
  if (!rows[0]) return res.status(401).json({ error: "Unknown credential" });

  try {
    const origin = process.env.FRONTEND_URL || "https://aegisledger.com";
    const assertionResult = await f2l.assertionResult(credential, {
      challenge,
      origin,
      factor: "either",
      publicKey: rows[0].public_key,
      prevCounter: rows[0].counter,
      userHandle: Buffer.from(userId).toString("base64url")
    });
    
    if (!assertionResult) throw new Error("Falsy assertion result");

    const newCounter = assertionResult.authnrData.get("counter");
    if (newCounter <= rows[0].counter && newCounter !== 0) {
      console.warn("Replay attack detected. Counter did not increase.");
      return res.status(401).json({ error: "Replay attack detected" });
    }

    await db.query("UPDATE fido2_credentials SET counter=$1, last_used=NOW() WHERE id=$2", [newCounter, rows[0].id]);
    const { rows: user } = await db.query("SELECT * FROM users WHERE id=$1", [userId]);
    res.json({ token: issueJWT(user[0]), method: "fido2" });
  } catch (err) {
    console.error("FIDO2 verification failed:", err.message);
    res.status(401).json({ error: "Invalid assertion" });
  }
});

app.get("/auth/fido2/credentials", requireAuth, async (req, res) => {
  const { rows } = await db.query(
    "SELECT id, name, last_used, created_at FROM fido2_credentials WHERE user_id=$1", [req.user.sub]
  );
  res.json(rows);
});

app.delete("/auth/fido2/credentials/:id", requireAuth, async (req, res) => {
  await db.query("DELETE FROM fido2_credentials WHERE id=$1 AND user_id=$2", [req.params.id, req.user.sub]);
  res.json({ message: "Security key removed" });
});

// ─── IP ALLOWLIST ──────────────────────────────────────────────────
app.get("/auth/ip-allowlist", requireAuth, async (req, res) => {
  const { rows } = await db.query(
    "SELECT * FROM ip_allowlists WHERE company_id=$1 ORDER BY created_at DESC", [req.user.company]
  );
  res.json(rows);
});

app.post("/auth/ip-allowlist", requireAuth, requireRole("admin", "treasury"), async (req, res) => {
  const { cidr_range, label } = req.body;
  const { rows } = await db.query(`
    INSERT INTO ip_allowlists (company_id, cidr_range, label, enabled, created_by, created_at)
    VALUES ($1,$2,$3,true,$4,NOW()) RETURNING *
  `, [req.user.company, cidr_range, label, req.user.sub]);
  res.json(rows[0]);
});

app.patch("/auth/ip-allowlist/:id", requireAuth, requireRole("admin"), async (req, res) => {
  await db.query("UPDATE ip_allowlists SET enabled=$1 WHERE id=$2 AND company_id=$3",
    [req.body.enabled, req.params.id, req.user.company]);
  res.json({ message: "Updated" });
});

app.delete("/auth/ip-allowlist/:id", requireAuth, requireRole("admin"), async (req, res) => {
  await db.query("DELETE FROM ip_allowlists WHERE id=$1 AND company_id=$2",
    [req.params.id, req.user.company]);
  res.json({ message: "Removed" });
});

// ─── GEOFENCING ───────────────────────────────────────────────────
app.get("/auth/geofencing", requireAuth, async (req, res) => {
  const { rows } = await db.query(
    "SELECT * FROM geofencing_rules WHERE company_id=$1", [req.user.company]
  );
  res.json(rows[0] || { allowed_countries: [], blocked_countries: [], action: "block" });
});

app.post("/auth/geofencing", requireAuth, requireRole("admin"), async (req, res) => {
  const { allowed_countries, blocked_countries, action } = req.body;
  await db.query(`
    INSERT INTO geofencing_rules (company_id, allowed_countries, blocked_countries, action, updated_at)
    VALUES ($1,$2,$3,$4,NOW())
    ON CONFLICT (company_id) DO UPDATE SET allowed_countries=$2, blocked_countries=$3, action=$4, updated_at=NOW()
  `, [req.user.company, JSON.stringify(allowed_countries || []),
      JSON.stringify(blocked_countries || []), action || "block"]);
  res.json({ message: "Geofencing rules saved" });
});

// ─── SESSION POLICY ────────────────────────────────────────────────
app.get("/auth/session-policy", requireAuth, async (req, res) => {
  const { rows } = await db.query(
    "SELECT * FROM session_policies WHERE company_id=$1", [req.user.company]
  );
  res.json(rows[0] || { max_sessions: 5, idle_timeout_minutes: 30, require_mfa: true });
});

app.post("/auth/session-policy", requireAuth, requireRole("admin"), async (req, res) => {
  const { max_sessions, idle_timeout_minutes, require_mfa } = req.body;
  await db.query(`
    INSERT INTO session_policies (company_id, max_sessions, idle_timeout_minutes, require_mfa, updated_at)
    VALUES ($1,$2,$3,$4,NOW())
    ON CONFLICT (company_id) DO UPDATE SET max_sessions=$2, idle_timeout_minutes=$3, require_mfa=$4, updated_at=NOW()
  `, [req.user.company, max_sessions || 5, idle_timeout_minutes || 30, require_mfa !== false]);
  res.json({ message: "Session policy updated" });
});

// ─── API KEY MANAGEMENT ────────────────────────────────────────────
app.get("/api-keys", requireAuth, async (req, res) => {
  const { rows } = await db.query(`
    SELECT id, name, key_prefix, scopes, last_used, created_at, expires_at
    FROM api_keys WHERE company_id=$1 AND revoked=false ORDER BY created_at DESC
  `, [req.user.company]);
  res.json(rows);
});

app.post("/api-keys", requireAuth, requireRole("admin", "treasury"), async (req, res) => {
  const { name, scopes, expires_in_days } = req.body;
  const rawKey    = `aegis_live_${crypto.randomBytes(28).toString("hex")}`;
  const keyHash   = await bcrypt.hash(rawKey, 10);
  const keyPrefix = rawKey.slice(0, 16) + "...";
  const expiresAt = expires_in_days ? new Date(Date.now() + expires_in_days * 86400000) : null;
  const { rows } = await db.query(`
    INSERT INTO api_keys (company_id, user_id, name, key_hash, key_prefix, scopes, expires_at, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING id, name, key_prefix, scopes, created_at
  `, [req.user.company, req.user.sub, name, keyHash, keyPrefix,
      JSON.stringify(scopes || ["transfers:read", "wallets:read"]), expiresAt]);
  res.status(201).json({ ...rows[0], key: rawKey, warning: "Save this key — it will not be shown again" });
});

app.patch("/api-keys/:id", requireAuth, requireRole("admin"), async (req, res) => {
  await db.query("UPDATE api_keys SET name=$1, scopes=$2 WHERE id=$3 AND company_id=$4",
    [req.body.name, JSON.stringify(req.body.scopes), req.params.id, req.user.company]);
  res.json({ message: "API key updated" });
});

app.delete("/api-keys/:id", requireAuth, requireRole("admin", "treasury"), async (req, res) => {
  await db.query("UPDATE api_keys SET revoked=true, revoked_at=NOW() WHERE id=$1 AND company_id=$2",
    [req.params.id, req.user.company]);
  res.json({ message: "API key revoked" });
});

// ─── SERVICE ACCOUNTS ─────────────────────────────────────────────
app.get("/service-accounts", requireAuth, requireRole("admin"), async (req, res) => {
  const { rows } = await db.query(
    "SELECT id, name, client_id, scopes, last_used, created_at FROM service_accounts WHERE company_id=$1",
    [req.user.company]
  );
  res.json(rows);
});

app.post("/service-accounts", requireAuth, requireRole("admin"), async (req, res) => {
  const { name, scopes } = req.body;
  const clientId     = `sa_${crypto.randomBytes(12).toString("hex")}`;
  const clientSecret = crypto.randomBytes(40).toString("hex");
  const secretHash   = await bcrypt.hash(clientSecret, 10);
  await db.query(`
    INSERT INTO service_accounts (company_id, name, client_id, client_secret_hash, scopes, created_at)
    VALUES ($1,$2,$3,$4,$5,NOW())
  `, [req.user.company, name, clientId, secretHash, JSON.stringify(scopes || [])]);
  res.status(201).json({ clientId, clientSecret, warning: "Save this secret — it will not be shown again" });
});

app.delete("/service-accounts/:id", requireAuth, requireRole("admin"), async (req, res) => {
  await db.query("DELETE FROM service_accounts WHERE id=$1 AND company_id=$2",
    [req.params.id, req.user.company]);
  res.json({ message: "Service account deleted" });
});

// M2M token exchange
app.post("/auth/token", async (req, res) => {
  const { client_id, client_secret, grant_type } = req.body;
  if (grant_type !== "client_credentials") return res.status(400).json({ error: "Unsupported grant_type" });
  const { rows } = await db.query("SELECT * FROM service_accounts WHERE client_id=$1", [client_id]);
  if (!rows[0] || !await bcrypt.compare(client_secret, rows[0].client_secret_hash)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = jwt.sign(
    { sub: rows[0].id, company: rows[0].company_id, role: "service_account", scopes: rows[0].scopes, type: "m2m" },
    process.env.JWT_M2M_SECRET,
    { expiresIn: "1h", keyid: 'm2m-v1' }
  );
  await db.query("UPDATE service_accounts SET last_used=NOW() WHERE id=$1", [rows[0].id]);
  res.json({ access_token: token, token_type: "Bearer", expires_in: 3600, scope: rows[0].scopes.join(" ") });
});

// ─── ACCOUNT TAKEOVER RISK SCORING ────────────────────────────────
app.post("/auth/risk-score", async (req, res) => {
  const { userId, ip, deviceFingerprint } = req.body;
  const geo = geoip.lookup(ip) || {};
  const country = geo.country || "unknown";

  const { rows: history } = await db.query(`
    SELECT ip_address, country, device_fingerprint
    FROM user_sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20
  `, [userId]);

  let score = 0;
  const knownCountries = [...new Set(history.map(h => h.country))];
  const knownDevices   = history.map(h => h.device_fingerprint).filter(Boolean);

  if (!knownCountries.includes(country)) score += 35;
  if (deviceFingerprint && !knownDevices.includes(deviceFingerprint)) score += 25;
  if (history.length === 0) score += 10; // New account

  const { rows: failures } = await db.query(`
    SELECT COUNT(*) FROM audit_logs
    WHERE user_id=$1 AND action='LOGIN_FAILED' AND created_at > NOW() - INTERVAL '1 hour'
  `, [userId]);
  const failCount = parseInt(failures[0].count);
  if (failCount >= 5) score += 40;
  else if (failCount >= 2) score += 15;

  const risk = score >= 60 ? "high" : score >= 30 ? "medium" : "low";
  res.json({ score: Math.min(score, 100), risk, country, isNewCountry: !knownCountries.includes(country), requiresMFA: score >= 30 });
});

// ─── HELPERS ──────────────────────────────────────────────────────
function issueJWT(user) {
  return jwt.sign(
    { sub: user.id, company: user.company_id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "8h", keyid: 'user-v1' }
  );
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = jwt.decode(token, { complete: true });
    const kid = decoded?.header?.kid;
    const key = kid === 'm2m-v1' ? process.env.JWT_M2M_SECRET : process.env.JWT_PUBLIC_KEY;
    const algo = kid === 'm2m-v1' ? 'HS256' : 'RS256';
    req.user = jwt.verify(token, key, { algorithms: [algo] });
    next();
  } catch (err) { res.status(401).json({ error: "Invalid token" }); }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Insufficient permissions" });
    next();
  };
}

app.get("/health", (req, res) => res.json({ status: "ok", service: "auth-extended" }));

app.post('/api/v1/auth/ws-ticket', requireAuth, async (req, res) => {
  const ticket = crypto.randomBytes(32).toString('hex');
  await redisClient.setEx('ws-ticket:' + ticket, 10, req.user.id);
  res.json({ ticket });
});

app.listen(process.env.PORT || 3008, () => console.log("Auth Service on port 3008"));
module.exports = { app };
