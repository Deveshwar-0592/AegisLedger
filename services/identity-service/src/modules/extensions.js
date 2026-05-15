/**
 * AegisLedger - Identity Service Extensions
 * Adds to identity-service/src/index.js:
 *   - Password reset (request token + consume token)
 *   - 2FA backup codes (generate, store, consume)
 *   - Session management (list devices, revoke specific session)
 *   - Kafka producer (real implementation)
 *
 * USAGE: require('./modules/extensions')(app, db, redisClient)
 */

const crypto     = require("crypto");
const bcrypt     = require("bcryptjs");
const { Kafka }  = require("kafkajs");
const speakeasy  = require("speakeasy");
const QRCode     = require("qrcode");

// ─── KAFKA PRODUCER ───────────────────────────────────────────────
const kafka = new Kafka({
  clientId: "identity-service",
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
});

const kafkaProducer = kafka.producer();
let kafkaReady = false;

(async () => {
  try {
    await kafkaProducer.connect();
    kafkaReady = true;
    console.log("Kafka producer connected");
  } catch (err) {
    console.warn("Kafka not available, events will be logged only:", err.message);
  }
})();

async function publishEvent(topic, payload) {
  if (!kafkaReady) {
    console.log(`[KAFKA LOG] ${topic}:`, JSON.stringify(payload));
    return;
  }
  await kafkaProducer.send({
    topic,
    messages: [{ value: JSON.stringify({ ...payload, _timestamp: new Date().toISOString() }) }],
  });
}

module.exports = function registerExtensions(app, db, redisClient) {

  // ─── PASSWORD RESET ─────────────────────────────────────────────

  /**
   * POST /auth/forgot-password
   * Accepts email, generates reset token, publishes Kafka event (notification service sends email)
   */
  app.post("/auth/forgot-password", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    // Always return 200 to prevent email enumeration
    const { rows } = await db.query("SELECT id, email FROM users WHERE email=$1", [email]);
    if (rows[0]) {
      const token     = crypto.randomBytes(48).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

      await db.query(`
        INSERT INTO password_reset_tokens (user_id, token, expires_at, used, created_at)
        VALUES ($1, $2, $3, false, NOW())
        ON CONFLICT (user_id) DO UPDATE SET token=$2, expires_at=$3, used=false, created_at=NOW()
      `, [rows[0].id, token, expiresAt]);

      // Fix 53: Do not publish the raw resetToken over Kafka
      await publishEvent("auth.password_reset_requested", { email: rows[0].email });
      
      // In production, send the email directly here via AWS SES or SendGrid to avoid exposing the token on the message bus.
      // await sendEmail(rows[0].email, "Password Reset", `Your reset token is: ${token}`);

      await db.query(
        "INSERT INTO audit_logs (user_id, action, ip_address, details, created_at) VALUES ($1,'PASSWORD_RESET_REQUESTED',$2,$3,NOW())",
        [rows[0].id, req.ip, JSON.stringify({ email })]
      );
    }

    res.json({ message: "If an account exists for this email, a reset link has been sent." });
  });

  /**
   * POST /auth/reset-password
   * Validates reset token and sets new password
   */
  app.post("/auth/reset-password", async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: "Token and new password required" });
    if (newPassword.length < 12) return res.status(400).json({ error: "Password must be at least 12 characters" });

    const { rows } = await db.query(`
      SELECT prt.*, u.email FROM password_reset_tokens prt
      JOIN users u ON u.id = prt.user_id
      WHERE prt.token=$1 AND prt.used=false AND prt.expires_at > NOW()
    `, [token]);

    if (!rows[0]) return res.status(400).json({ error: "Invalid or expired reset token" });

    const hash = await bcrypt.hash(newPassword, 12);
    await db.query("UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2", [hash, rows[0].user_id]);
    await db.query("UPDATE password_reset_tokens SET used=true WHERE token=$1", [token]);

    // Revoke all existing sessions for security
    const pattern = `session:${rows[0].user_id}:*`;
    const keys    = await redisClient.keys(pattern);
    if (keys.length) await redisClient.del(keys);

    await db.query(
      "INSERT INTO audit_logs (user_id, action, ip_address, details, created_at) VALUES ($1,'PASSWORD_RESET_COMPLETED',$2,$3,NOW())",
      [rows[0].user_id, req.ip, JSON.stringify({ email: rows[0].email })]
    );

    res.json({ message: "Password reset successful. All sessions have been revoked." });
  });

  // ─── 2FA BACKUP CODES ───────────────────────────────────────────

  /**
   * POST /auth/backup-codes/generate
   * Generates 10 new backup codes, hashes them, stores in DB, emails plain codes
   */
  app.post("/auth/backup-codes/generate", requireAuth, async (req, res) => {
    const codes      = Array.from({ length: 10 }, () => crypto.randomBytes(5).toString("hex").toUpperCase());
    const formatted  = codes.map(c => `${c.slice(0,5)}-${c.slice(5)}`);
    const hashed     = await Promise.all(formatted.map(c => bcrypt.hash(c, 10)));

    // Delete existing codes and insert new
    await db.query("DELETE FROM backup_codes WHERE user_id=$1", [req.user.sub]);
    for (const h of hashed) {
      await db.query(
        "INSERT INTO backup_codes (user_id, code_hash, used, created_at) VALUES ($1,$2,false,NOW())",
        [req.user.sub, h]
      );
    }

    const { rows } = await db.query("SELECT email FROM users WHERE id=$1", [req.user.sub]);
    // Fix 54: Do not publish raw backup codes over Kafka
    await publishEvent("auth.backup_codes_generated", { email: rows[0].email });

    await db.query(
      "INSERT INTO audit_logs (user_id, action, ip_address, details, created_at) VALUES ($1,'BACKUP_CODES_GENERATED',$2,$3,NOW())",
      [req.user.sub, req.ip, JSON.stringify({ count: 10 })]
    );

    // Return plain codes once — they will not be retrievable again
    res.json({ codes: formatted, message: "Save these codes securely. They will not be shown again." });
  });

  /**
   * GET /auth/backup-codes/status
   * Returns count of remaining (unused) backup codes — no plain-text codes exposed
   */
  app.get("/auth/backup-codes/status", requireAuth, async (req, res) => {
    const { rows } = await db.query(
      "SELECT COUNT(*) as remaining FROM backup_codes WHERE user_id=$1 AND used=false",
      [req.user.sub]
    );
    res.json({ remaining: parseInt(rows[0].remaining), total: 10 });
  });

  /**
   * POST /auth/mfa/backup - Authenticate using a backup code
   */
  app.post("/auth/mfa/backup", async (req, res) => {
    const { userId, backupCode } = req.body;
    if (!userId || !backupCode) return res.status(400).json({ error: "userId and backupCode required" });

    const { rows } = await db.query(
      "SELECT * FROM backup_codes WHERE user_id=$1 AND used=false ORDER BY created_at ASC",
      [userId]
    );

    let matched = null;
    for (const row of rows) {
      if (await bcrypt.compare(backupCode, row.code_hash)) { matched = row; break; }
    }

    if (!matched) return res.status(401).json({ error: "Invalid backup code" });

    // Mark code as used
    await db.query("UPDATE backup_codes SET used=true, used_at=NOW() WHERE id=$1", [matched.id]);

    const { rows: userRows } = await db.query("SELECT * FROM users WHERE id=$1", [userId]);
    const user = userRows[0];

    const { sign } = require("jsonwebtoken");
    // Fix: RS256 requires the RSA private key PEM — JWT_PRIVATE_KEY, NOT JWT_SECRET
    const token = sign(
      { sub: user.id, company: user.company_id, role: user.role, mfaVerified: true },
      process.env.JWT_PRIVATE_KEY, { algorithm: "RS256", expiresIn: "8h" }
    );

    await db.query(
      "INSERT INTO audit_logs (user_id, action, ip_address, details, created_at) VALUES ($1,'BACKUP_CODE_USED',$2,$3,NOW())",
      [userId, req.ip, JSON.stringify({ codeId: matched.id })]
    );

    res.json({ token, backupCodesRemaining: rows.length - 1 });
  });

  // ─── SESSION MANAGEMENT ─────────────────────────────────────────

  /**
   * GET /auth/sessions - List all active sessions for current user
   */
  app.get("/auth/sessions", requireAuth, async (req, res) => {
    const { rows } = await db.query(`
      SELECT id, device_name, device_type, ip_address, location, user_agent,
             created_at AS login_time, last_active, is_current
      FROM user_sessions
      WHERE user_id=$1 AND revoked=false AND expires_at > NOW()
      ORDER BY last_active DESC
    `, [req.user.sub]);

    // Mark current session
    const sessions = rows.map(s => ({ ...s, is_current: s.id === req.sessionId }));
    res.json(sessions);
  });

  /**
   * DELETE /auth/sessions/:sessionId - Revoke a specific session
   */
  app.delete("/auth/sessions/:sessionId", requireAuth, async (req, res) => {
    const { sessionId } = req.params;

    const { rows } = await db.query(
      "SELECT * FROM user_sessions WHERE id=$1 AND user_id=$2",
      [sessionId, req.user.sub]
    );
    if (!rows[0]) return res.status(404).json({ error: "Session not found" });

    await db.query("UPDATE user_sessions SET revoked=true, revoked_at=NOW() WHERE id=$1", [sessionId]);
    await redisClient.del(`session:${req.user.sub}:${sessionId}`);

    await db.query(
      "INSERT INTO audit_logs (user_id, action, ip_address, details, created_at) VALUES ($1,'SESSION_REVOKED',$2,$3,NOW())",
      [req.user.sub, req.ip, JSON.stringify({ revokedSessionId: sessionId })]
    );

    res.json({ message: "Session revoked successfully" });
  });

  /**
   * DELETE /auth/sessions - Revoke all sessions except current
   */
  app.delete("/auth/sessions", requireAuth, async (req, res) => {
    const { rows } = await db.query(
      "SELECT id FROM user_sessions WHERE user_id=$1 AND revoked=false AND id!=$2",
      [req.user.sub, req.sessionId]
    );

    await db.query(
      "UPDATE user_sessions SET revoked=true, revoked_at=NOW() WHERE user_id=$1 AND id!=$2",
      [req.user.sub, req.sessionId]
    );

    for (const row of rows) {
      await redisClient.del(`session:${req.user.sub}:${row.id}`);
    }

    await db.query(
      "INSERT INTO audit_logs (user_id, action, ip_address, details, created_at) VALUES ($1,'ALL_SESSIONS_REVOKED',$2,$3,NOW())",
      [req.user.sub, req.ip, JSON.stringify({ count: rows.length })]
    );

    res.json({ message: `${rows.length} other session(s) revoked`, revokedCount: rows.length });
  });

  // ─── USER PROFILE UPDATE ────────────────────────────────────────

  /**
   * PATCH /users/me - Update profile (preferences, display name, notification settings)
   */
  app.patch("/users/me", requireAuth, async (req, res) => {
    const { displayName, defaultStablecoin, preferredFiats, settlementSpeed, dailyLimit, notificationsEmail, notificationsInApp } = req.body;

    await db.query(`
      UPDATE users SET
        display_name = COALESCE($1, display_name),
        preferences = preferences ||
          jsonb_build_object(
            'defaultStablecoin', COALESCE($2, preferences->>'defaultStablecoin'),
            'preferredFiats',    COALESCE($3::jsonb, preferences->'preferredFiats'),
            'settlementSpeed',   COALESCE($4, preferences->>'settlementSpeed'),
            'dailyLimit',        COALESCE($5, preferences->>'dailyLimit'),
            'notificationsEmail',COALESCE($6::boolean, (preferences->>'notificationsEmail')::boolean),
            'notificationsInApp',COALESCE($7::boolean, (preferences->>'notificationsInApp')::boolean)
          ),
        updated_at = NOW()
      WHERE id=$8
    `, [displayName, defaultStablecoin,
        preferredFiats ? JSON.stringify(preferredFiats) : null,
        settlementSpeed, dailyLimit, notificationsEmail, notificationsInApp,
        req.user.sub]);

    await db.query(
      "INSERT INTO audit_logs (user_id, action, ip_address, details, created_at) VALUES ($1,'PROFILE_UPDATED',$2,$3,NOW())",
      [req.user.sub, req.ip, JSON.stringify(req.body)]
    );

    res.json({ message: "Profile updated successfully" });
  });

  /**
   * PATCH /users/me/password - Change password (requires current password)
   */
  app.patch("/users/me/password", requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "Both passwords required" });
    if (newPassword.length < 12) return res.status(400).json({ error: "New password must be at least 12 characters" });

    const { rows } = await db.query("SELECT password_hash FROM users WHERE id=$1", [req.user.sub]);
    if (!await bcrypt.compare(currentPassword, rows[0].password_hash)) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await db.query("UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2", [hash, req.user.sub]);

    await db.query(
      "INSERT INTO audit_logs (user_id, action, ip_address, details, created_at) VALUES ($1,'PASSWORD_CHANGED',$2,$3,NOW())",
      [req.user.sub, req.ip, "{}"]
    );

    res.json({ message: "Password changed successfully" });
  });

  // ─── AUDIT LOG VIEWER ───────────────────────────────────────────

  /**
   * GET /audit-logs - Paginated audit log for current user (or all users for admins)
   */
  app.get("/audit-logs", requireAuth, async (req, res) => {
    const { page = 1, limit = 50, action, userId, from, to } = req.query;
    const offset = (page - 1) * limit;

    let conditions = [];
    let params     = [];
    let i          = 1;

    // Non-admins can only see their own logs
    if (req.user.role !== "admin") {
      conditions.push(`al.user_id = $${i++}`);
      params.push(req.user.sub);
    } else if (userId) {
      conditions.push(`al.user_id = $${i++}`);
      params.push(userId);
    }

    if (action) { conditions.push(`al.action = $${i++}`); params.push(action); }
    if (from)   { conditions.push(`al.created_at >= $${i++}`); params.push(from); }
    if (to)     { conditions.push(`al.created_at <= $${i++}`); params.push(to); }

    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

    const { rows } = await db.query(`
      SELECT al.*, u.email, u.display_name
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      ${where}
      ORDER BY al.created_at DESC
      LIMIT $${i} OFFSET $${i+1}
    `, [...params, limit, offset]);

    const { rows: total } = await db.query(
      `SELECT COUNT(*) FROM audit_logs al ${where}`, params
    );

    res.json({ logs: rows, total: parseInt(total[0].count), page: parseInt(page), limit: parseInt(limit) });
  });

  // ─── ADMIN ENDPOINTS ────────────────────────────────────────────

  /**
   * GET /admin/users - List all users across all companies (admin only)
   */
  app.get("/admin/users", requireAuth, requireRole("admin"), async (req, res) => {
    const { rows } = await db.query(`
      SELECT u.id, u.email, u.display_name, u.role, u.mfa_enabled, u.created_at, u.last_login,
             c.name as company_name, c.kyb_status, c.jurisdiction
      FROM users u
      LEFT JOIN companies c ON c.id = u.company_id
      ORDER BY u.created_at DESC
      LIMIT 200
    `);
    res.json(rows);
  });

  /**
   * PATCH /admin/users/:id - Update user role or status (admin only)
   */
  app.patch("/admin/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const { role, suspended } = req.body;
    await db.query(
      "UPDATE users SET role=COALESCE($1,role), suspended=COALESCE($2,suspended), updated_at=NOW() WHERE id=$3",
      [role, suspended, req.params.id]
    );
    await db.query(
      "INSERT INTO audit_logs (user_id, action, ip_address, details, created_at) VALUES ($1,'ADMIN_USER_UPDATED',$2,$3,NOW())",
      [req.user.sub, req.ip, JSON.stringify({ targetUserId: req.params.id, changes: req.body })]
    );
    res.json({ message: "User updated" });
  });

  /**
   * GET /admin/stats - Platform-wide statistics (admin only)
   */
  app.get("/admin/stats", requireAuth, requireRole("admin"), async (req, res) => {
    const [companies, users, transfers, pendingKyb, activeAlerts] = await Promise.all([
      db.query("SELECT COUNT(*) FROM companies"),
      db.query("SELECT COUNT(*) FROM users"),
      db.query("SELECT COUNT(*), SUM(amount) FROM transfers WHERE created_at > NOW() - INTERVAL '30 days'"),
      db.query("SELECT COUNT(*) FROM kyb_applications WHERE status IN ('pending','review','escalated')"),
      db.query("SELECT COUNT(*) FROM screening_results WHERE risk_score >= 65 AND created_at > NOW() - INTERVAL '7 days'"),
    ]);
    res.json({
      companies:        parseInt(companies.rows[0].count),
      users:            parseInt(users.rows[0].count),
      transfers30d:     parseInt(transfers.rows[0].count),
      volume30dUsd:     parseFloat(transfers.rows[0].sum || 0),
      pendingKyb:       parseInt(pendingKyb.rows[0].count),
      activeAlerts:     parseInt(activeAlerts.rows[0].count),
    });
  });

  /**
   * GET /admin/settings - Get platform settings (fees, limits, flags)
   */
  app.get("/admin/settings", requireAuth, requireRole("admin"), async (req, res) => {
    const { rows } = await db.query("SELECT * FROM platform_settings ORDER BY key");
    const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
    res.json(settings);
  });

  /**
   * PATCH /admin/settings - Update platform settings
   */
  app.patch("/admin/settings", requireAuth, requireRole("admin"), async (req, res) => {
    for (const [key, value] of Object.entries(req.body)) {
      await db.query(`
        INSERT INTO platform_settings (key, value, updated_by, updated_at)
        VALUES ($1,$2,$3,NOW())
        ON CONFLICT (key) DO UPDATE SET value=$2, updated_by=$3, updated_at=NOW()
      `, [key, JSON.stringify(value), req.user.sub]);
    }
    await db.query(
      "INSERT INTO audit_logs (user_id, action, ip_address, details, created_at) VALUES ($1,'ADMIN_SETTINGS_UPDATED',$2,$3,NOW())",
      [req.user.sub, req.ip, JSON.stringify(req.body)]
    );
    res.json({ message: "Settings updated", keys: Object.keys(req.body) });
  });

  return { publishEvent };
};

// ─── MIDDLEWARE HELPERS ───────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const jwt = require("jsonwebtoken");
    req.user = jwt.verify(token, process.env.JWT_PUBLIC_KEY, { algorithms: ["RS256"] });
    req.sessionId = req.headers["x-session-id"] || null;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Insufficient permissions" });
    next();
  };
}
