/**
 * AegisLedger - Notification Service
 * Consumes Kafka events and dispatches: email (SendGrid), in-app alerts (Redis pub/sub)
 * Topics consumed:
 *   kyb.submitted, kyb.approved, kyb.rejected,
 *   transfer.submitted, transfer.settled, transfer.flagged,
 *   escrow.created, escrow.conditions_met, escrow.released,
 *   auth.otp_requested, auth.password_reset, auth.login_new_device
 */

const { Kafka, logLevel } = require("kafkajs");
const sgMail               = require("@sendgrid/mail");
const nodemailer           = require("nodemailer");
const redis                = require("redis");
const { Pool }             = require("pg");
const express              = require("express");
const helmet               = require("helmet");

const app = express();
app.use(express.json());
app.use(helmet());

sgMail.setApiKey(process.env.SENDGRID_API_KEY || "mock");

const db = new Pool({ connectionString: process.env.DATABASE_URL });

const redisClient = redis.createClient({ url: process.env.REDIS_URL });
redisClient.connect().catch(console.error);

const MOCK_EMAIL = process.env.MOCK_EMAIL !== "false";

// ─── EMAIL TRANSPORT ──────────────────────────────────────────────
const devTransport = nodemailer.createTransport({
  host: "localhost", port: 1025, // MailHog for local dev
  ignoreTLS: true,
});

async function sendEmail({ to, subject, html, text }) {
  if (MOCK_EMAIL) {
    console.log(`[EMAIL MOCK] To: ${to} | Subject: ${subject}`);
    if (process.env.NODE_ENV === "development") {
      await devTransport.sendMail({ from: "noreply@aegisledger.com", to, subject, html, text })
        .catch(() => console.log("[EMAIL] MailHog not running, email logged only"));
    }
    return { mocked: true };
  }
  return sgMail.send({ from: { email: "noreply@aegisledger.com", name: "AegisLedger" }, to, subject, html, text });
}

// ─── EMAIL TEMPLATES ─────────────────────────────────────────────
const BRAND = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;background:#04101E;padding:32px;border-radius:12px;max-width:560px;margin:0 auto">
  <div style="margin-bottom:24px;border-bottom:1px solid #112235;padding-bottom:16px">
    <span style="color:#00E5B0;font-weight:700;font-size:20px;letter-spacing:0.3px">AegisLedger</span>
    <span style="color:#4A6A88;font-size:11px;margin-left:10px">B2B Settlement Gateway</span>
  </div>
`;
const BRAND_CLOSE = `
  <div style="margin-top:24px;padding-top:16px;border-top:1px solid #112235;color:#4A6A88;font-size:10px">
    AES-256 encrypted · VARA Licensed · ISO 27001<br/>
    If you did not request this, contact support@aegisledger.com immediately.
  </div></div>
`;

const templates = {
  otp: ({ otp, expiryMinutes, email }) => ({
    subject: "Your AegisLedger verification code",
    html: `${BRAND}
      <h2 style="color:#E2EAF4;font-size:18px;margin:0 0 8px">Email Verification</h2>
      <p style="color:#4A6A88;font-size:13px">Your one-time verification code for <strong style="color:#E2EAF4">${email}</strong>:</p>
      <div style="background:#060F1C;border:1px solid #112235;border-radius:10px;padding:24px;text-align:center;margin:20px 0">
        <span style="color:#00E5B0;font-family:monospace;font-size:36px;font-weight:700;letter-spacing:14px">${otp}</span>
      </div>
      <p style="color:#4A6A88;font-size:12px">This code expires in <strong style="color:#F0B429">${expiryMinutes} minutes</strong>. Do not share it with anyone.</p>
      ${BRAND_CLOSE}`,
  }),

  password_reset: ({ resetUrl, expiryMinutes }) => ({
    subject: "AegisLedger password reset request",
    html: `${BRAND}
      <h2 style="color:#E2EAF4;font-size:18px;margin:0 0 8px">Reset Your Password</h2>
      <p style="color:#4A6A88;font-size:13px">A password reset was requested for your account. Click the button below to set a new password.</p>
      <div style="text-align:center;margin:24px 0">
        <a href="${resetUrl}" style="background:linear-gradient(135deg,#00E5B0,#0088CC);color:#04101E;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;display:inline-block">Reset Password</a>
      </div>
      <p style="color:#4A6A88;font-size:11px">Link expires in ${expiryMinutes} minutes. If you did not request this, your account is safe — ignore this email.</p>
      ${BRAND_CLOSE}`,
  }),

  kyb_submitted: ({ companyName, referenceId }) => ({
    subject: `KYB application received — ${referenceId}`,
    html: `${BRAND}
      <h2 style="color:#E2EAF4;font-size:18px">KYB Application Received</h2>
      <p style="color:#4A6A88;font-size:13px">We have received the KYB application for <strong style="color:#E2EAF4">${companyName}</strong>.</p>
      <div style="background:#060F1C;border:1px solid #112235;border-radius:8px;padding:16px;margin:16px 0">
        <div style="color:#4A6A88;font-size:11px;text-transform:uppercase;letter-spacing:0.8px">Reference ID</div>
        <div style="color:#00E5B0;font-family:monospace;font-size:16px;font-weight:700;margin-top:4px">${referenceId}</div>
      </div>
      <p style="color:#4A6A88;font-size:12px">A Compliance Officer will review your documents within <strong style="color:#F0B429">1-2 business days</strong>. You will receive an email once a decision is made.</p>
      ${BRAND_CLOSE}`,
  }),

  kyb_approved: ({ companyName, reviewerName }) => ({
    subject: "Your AegisLedger account has been approved",
    html: `${BRAND}
      <h2 style="color:#00E5B0;font-size:18px">Account Approved</h2>
      <p style="color:#4A6A88;font-size:13px">Congratulations. The KYB application for <strong style="color:#E2EAF4">${companyName}</strong> has been approved by our compliance team.</p>
      <p style="color:#4A6A88;font-size:13px">You now have full access to the AegisLedger settlement platform including wallet provisioning, stablecoin transfers, and trade finance escrow.</p>
      <div style="text-align:center;margin:24px 0">
        <a href="${process.env.FRONTEND_URL}/login" style="background:linear-gradient(135deg,#00E5B0,#0088CC);color:#04101E;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;display:inline-block">Sign In to Platform</a>
      </div>
      ${BRAND_CLOSE}`,
  }),

  kyb_rejected: ({ companyName, reason }) => ({
    subject: "AegisLedger KYB application update",
    html: `${BRAND}
      <h2 style="color:#F04438;font-size:18px">Application Requires Attention</h2>
      <p style="color:#4A6A88;font-size:13px">After review, the KYB application for <strong style="color:#E2EAF4">${companyName}</strong> could not be approved at this time.</p>
      <div style="background:#F0443812;border:1px solid #F0443840;border-radius:8px;padding:14px;margin:16px 0">
        <div style="color:#4A6A88;font-size:11px;text-transform:uppercase;margin-bottom:4px">Reason</div>
        <div style="color:#F04438;font-size:12px">${reason}</div>
      </div>
      <p style="color:#4A6A88;font-size:12px">Please contact compliance@aegisledger.com to discuss resubmission requirements.</p>
      ${BRAND_CLOSE}`,
  }),

  transfer_settled: ({ txId, amount, currency, recipient, txHash }) => ({
    subject: `Settlement confirmed — ${txId}`,
    html: `${BRAND}
      <h2 style="color:#00E5B0;font-size:18px">Settlement Confirmed</h2>
      <div style="background:#060F1C;border:1px solid #112235;border-radius:8px;padding:16px;margin:16px 0">
        ${[["TX ID", txId], ["Amount", `${amount} ${currency}`], ["Recipient", recipient], ["Blockchain Hash", txHash]].map(([k,v]) =>
          `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1A305030">
            <span style="color:#4A6A88;font-size:11px">${k}</span>
            <span style="color:#E2EAF4;font-size:11px;font-family:monospace">${v}</span>
          </div>`).join("")}
      </div>
      ${BRAND_CLOSE}`,
  }),

  transfer_flagged: ({ txId, amount, alertType, severity }) => ({
    subject: `[${severity.toUpperCase()}] Compliance flag on ${txId}`,
    html: `${BRAND}
      <h2 style="color:#F04438;font-size:18px">Transaction Flagged</h2>
      <p style="color:#4A6A88;font-size:13px">Transaction <strong style="color:#E2EAF4">${txId}</strong> for <strong style="color:#E2EAF4">${amount}</strong> has been flagged by AML screening.</p>
      <div style="background:#F0443812;border:1px solid #F0443840;border-radius:8px;padding:14px;margin:16px 0">
        <div style="color:#F04438;font-weight:700;font-size:12px">Alert Type: ${alertType}</div>
        <div style="color:#4A6A88;font-size:11px;margin-top:4px">Severity: ${severity}</div>
      </div>
      <p style="color:#4A6A88;font-size:12px">Funds are held pending compliance review. Log in to take action.</p>
      ${BRAND_CLOSE}`,
  }),

  new_device_login: ({ email, device, location, loginTime, securityUrl }) => ({
    subject: "New login detected on your AegisLedger account",
    html: `${BRAND}
      <h2 style="color:#F0B429;font-size:18px">New Device Login</h2>
      <p style="color:#4A6A88;font-size:13px">A new login was detected for <strong style="color:#E2EAF4">${email}</strong>.</p>
      <div style="background:#060F1C;border:1px solid #112235;border-radius:8px;padding:16px;margin:16px 0">
        ${[["Device", device], ["Location", location], ["Time", loginTime]].map(([k,v]) =>
          `<div style="display:flex;justify-content:space-between;padding:5px 0">
            <span style="color:#4A6A88;font-size:11px">${k}</span>
            <span style="color:#E2EAF4;font-size:11px">${v}</span>
          </div>`).join("")}
      </div>
      <p style="color:#4A6A88;font-size:12px">If this was not you, <a href="${securityUrl}" style="color:#F04438">revoke this session immediately</a>.</p>
      ${BRAND_CLOSE}`,
  }),

  backup_codes: ({ codes }) => ({
    subject: "Your AegisLedger 2FA backup codes — save these now",
    html: `${BRAND}
      <h2 style="color:#E2EAF4;font-size:18px">2FA Backup Codes</h2>
      <p style="color:#F04438;font-size:12px;font-weight:700">Store these codes somewhere safe. Each can only be used once.</p>
      <div style="background:#060F1C;border:1px solid #112235;border-radius:8px;padding:16px;margin:16px 0;display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${codes.map(c => `<span style="color:#00E5B0;font-family:monospace;font-size:14px;font-weight:700">${c}</span>`).join("")}
      </div>
      <p style="color:#4A6A88;font-size:11px">These codes will not be shown again. Print or store them in a password manager.</p>
      ${BRAND_CLOSE}`,
  }),
};

// ─── KAFKA CONSUMER ───────────────────────────────────────────────
const kafka = new Kafka({
  clientId: "notification-service",
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
  logLevel: logLevel.WARN,
});

const consumer = kafka.consumer({ groupId: "notification-service-group" });

const TOPIC_HANDLERS = {
  "auth.otp_requested": async ({ email, otp, expiryMinutes }) => {
    await sendEmail({ to: email, ...templates.otp({ otp, expiryMinutes: expiryMinutes || 10, email }) });
    await storeInAppNotification(email, "otp", "Verification code sent to your email");
  },

  "auth.password_reset": async ({ email, resetToken }) => {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    await sendEmail({ to: email, ...templates.password_reset({ resetUrl, expiryMinutes: 30 }) });
  },

  "auth.login_new_device": async ({ email, device, location, loginTime, userId }) => {
    const securityUrl = `${process.env.FRONTEND_URL}/profile/sessions`;
    await sendEmail({ to: email, ...templates.new_device_login({ email, device, location, loginTime, securityUrl }) });
    await storeInAppNotification(userId, "security", `New login from ${device} — ${location}`);
  },

  "kyb.submitted": async ({ email, companyName, referenceId }) => {
    await sendEmail({ to: email, ...templates.kyb_submitted({ companyName, referenceId }) });
    await storeInAppNotification(email, "kyb", `KYB application submitted — ${referenceId}`);
  },

  "kyb.approved": async ({ email, companyName, reviewerName }) => {
    await sendEmail({ to: email, ...templates.kyb_approved({ companyName, reviewerName }) });
    await storeInAppNotification(email, "kyb", "Your KYB application has been approved");
  },

  "kyb.rejected": async ({ email, companyName, reason }) => {
    await sendEmail({ to: email, ...templates.kyb_rejected({ companyName, reason }) });
    await storeInAppNotification(email, "kyb", "Your KYB application requires attention");
  },

  "transfer.settled": async ({ userId, txId, amount, currency, recipient, txHash }) => {
    const { rows } = await db.query("SELECT email FROM users WHERE id=$1", [userId]);
    if (rows[0]) {
      await sendEmail({ to: rows[0].email, ...templates.transfer_settled({ txId, amount, currency, recipient, txHash }) });
    }
    await storeInAppNotification(userId, "settlement", `Settlement confirmed: ${amount} ${currency} — ${txId}`);
  },

  "transfer.flagged": async ({ userId, txId, amount, alertType, severity }) => {
    const { rows } = await db.query("SELECT email FROM users WHERE id=$1", [userId]);
    if (rows[0]) {
      await sendEmail({ to: rows[0].email, ...templates.transfer_flagged({ txId, amount, alertType, severity }) });
    }
    await storeInAppNotification(userId, "alert", `Transaction flagged [${severity}]: ${txId}`);
  },

  "auth.backup_codes_generated": async ({ email, codes }) => {
    await sendEmail({ to: email, ...templates.backup_codes({ codes }) });
  },
};

async function storeInAppNotification(userId, type, message) {
  try {
    await db.query(
      "INSERT INTO notifications (user_id, type, message, read, created_at) VALUES ($1,$2,$3,false,NOW())",
      [userId, type, message]
    );
    // Publish to Redis pub/sub so WebSocket service can push to connected clients
    await redisClient.publish("notifications", JSON.stringify({ userId, type, message, timestamp: new Date().toISOString() }));
  } catch (err) {
    console.error("Failed to store notification:", err.message);
  }
}

async function startConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topics: Object.keys(TOPIC_HANDLERS), fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const payload = JSON.parse(message.value.toString());
        const handler = TOPIC_HANDLERS[topic];
        if (handler) {
          await handler(payload);
          console.log(`[OK] Processed ${topic}`);
        }
      } catch (err) {
        console.error(`[ERROR] Failed to process ${topic}:`, err.message);
      }
    },
  });
}

// ─── HTTP API ────────────────────────────────────────────────────
// GET /notifications/:userId - fetch unread in-app notifications
app.get("/notifications/:userId", async (req, res) => {
  const { rows } = await db.query(
    "SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",
    [req.params.userId]
  );
  res.json(rows);
});

// PATCH /notifications/:id/read - mark notification as read
app.patch("/notifications/:id/read", async (req, res) => {
  await db.query("UPDATE notifications SET read=true WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

app.get("/health", (req, res) => res.json({ status: "ok", service: "notification", mockEmail: MOCK_EMAIL }));

// ─── START ────────────────────────────────────────────────────────
async function start() {
  await startConsumer().catch(err => console.error("Kafka consumer failed:", err.message));
  app.listen(process.env.PORT || 3006, () => console.log("Notification Service running on port 3006"));
}

start();
module.exports = app;
