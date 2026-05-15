/**
 * AegisLedger - Webhook & Integrations Service
 * Features: Webhook delivery with retry, Slack integration,
 *           Telegram bot, escalation chains, per-event preferences,
 *           delivery logs, event replay
 */

const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const { Pool } = require("pg");
const redis = require("redis");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const { Kafka } = require("kafkajs");
const helmet = require("helmet");
const Telegraf = require("telegraf");

const app = express();
app.use(express.json());
app.use(helmet());

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redisClient = redis.createClient({ url: process.env.REDIS_URL });
redisClient.connect().catch(console.error);

const kafka = new Kafka({ clientId: "webhook-service", brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(",") });
const consumer = kafka.consumer({ groupId: "webhook-service-group" });

const auth = (req, res, next) => {
  const token = req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try { req.user = jwt.verify(token, process.env.JWT_PUBLIC_KEY, { algorithms: ["RS256"] }); next(); }
  catch { res.status(401).json({ error: "Invalid token" }); }
};

// ─── WEBHOOK REGISTRATION ─────────────────────────────────────────
// Fix 41: SSRF and DNS Rebinding Protection
const { Resolver } = require('dns').promises;
async function validateWebhookUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS webhooks are permitted');
  }

  const resolver = new Resolver();
  const addresses = await resolver.resolve4(parsed.hostname);

  const blockedRanges = [
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./,
    /^0\./
  ];

  for (const ip of addresses) {
    if (blockedRanges.some(pattern => pattern.test(ip))) {
      throw new Error('Webhook URL resolves to a private or reserved address');
    }
  }
}

app.post("/webhooks", auth, async (req, res) => {
  const { url, events, description, secret } = req.body;
  if (!url || !events?.length) return res.status(400).json({ error: "url and events required" });

  try {
    await validateWebhookUrl(url);
  } catch (err) {
    return res.status(422).json({ error: err.message || "Invalid URL or unreachable host" });
  }

  const webhookId = uuidv4();
  const signingSecret = secret || crypto.randomBytes(32).toString("hex");

  await db.query(`
    INSERT INTO webhooks (id, company_id, url, events, description, signing_secret, enabled, created_by, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,true,$7,NOW())
  `, [webhookId, req.user.company, url, JSON.stringify(events), description, signingSecret, req.user.sub]);

  res.status(201).json({
    webhookId, url, events, signingSecret,
    note: "Store the signing secret. Use it to verify webhook signatures via HMAC-SHA256."
  });
});

app.get("/webhooks", auth, async (req, res) => {
  const { rows } = await db.query(
    "SELECT id, url, events, description, enabled, created_at, last_delivery_at, success_rate FROM webhooks WHERE company_id=$1",
    [req.user.company]
  );
  res.json(rows);
});

app.patch("/webhooks/:id", auth, async (req, res) => {
  const { enabled, events, url } = req.body;
  await db.query("UPDATE webhooks SET enabled=COALESCE($1,enabled), events=COALESCE($2,events), url=COALESCE($3,url) WHERE id=$4 AND company_id=$5",
    [enabled, events ? JSON.stringify(events) : null, url, req.params.id, req.user.company]);
  res.json({ message: "Webhook updated" });
});

app.delete("/webhooks/:id", auth, async (req, res) => {
  await db.query("DELETE FROM webhooks WHERE id=$1 AND company_id=$2", [req.params.id, req.user.company]);
  res.json({ message: "Webhook deleted" });
});

// ─── WEBHOOK DELIVERY ENGINE ──────────────────────────────────────
const RETRY_DELAYS = [10, 30, 120, 600, 3600]; // seconds: 10s, 30s, 2m, 10m, 1h

async function deliverWebhook(webhookId, eventType, payload, attempt = 0) {
  const { rows } = await db.query("SELECT * FROM webhooks WHERE id=$1 AND enabled=true", [webhookId]);
  if (!rows[0]) return;

  const webhook = rows[0];
  const deliveryId = uuidv4();
  const body = JSON.stringify({ id: deliveryId, event: eventType, timestamp: new Date().toISOString(), data: payload });
  const signature = "sha256=" + crypto.createHmac("sha256", webhook.signing_secret).update(body).digest("hex");

  try {
    await validateWebhookUrl(webhook.url); // Fix 41: Check for DNS Rebinding right before dispatch
  } catch (err) {
    console.error(`[WEBHOOK] Blocked delivery to ${webhook.url} due to SSRF protection`);
    return;
  }

  try {
    const response = await axios.post(webhook.url, body, {
      headers: { "Content-Type": "application/json", "X-AegisLedger-Signature": signature, "X-AegisLedger-Event": eventType, "X-AegisLedger-Delivery": deliveryId },
      timeout: 10000,
    });

    await db.query(`
      INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload, status_code, response_body, attempt, delivered_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
    `, [deliveryId, webhookId, eventType, body, response.status, response.data?.toString?.()?.slice(0, 500), attempt]);

    await db.query("UPDATE webhooks SET last_delivery_at=NOW(), consecutive_failures=0 WHERE id=$1", [webhookId]);
  } catch (err) {
    const statusCode = err.response?.status || 0;
    await db.query(`
      INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload, status_code, error, attempt, delivered_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
    `, [deliveryId, webhookId, eventType, body, statusCode, err.message?.slice(0, 500), attempt]);

    await db.query("UPDATE webhooks SET consecutive_failures=consecutive_failures+1 WHERE id=$1", [webhookId]);

    if (attempt < RETRY_DELAYS.length - 1) {
      const delay = RETRY_DELAYS[attempt + 1];
      await redisClient.setEx(`webhook:retry:${deliveryId}`, delay + 60, JSON.stringify({ webhookId, eventType, payload, attempt: attempt + 1 }));
      console.log(`[WEBHOOK] Retry ${attempt + 1} scheduled in ${delay}s for ${webhookId}`);
    } else {
      console.warn(`[WEBHOOK] Max retries reached for ${webhookId}, disabling`);
      await db.query("UPDATE webhooks SET enabled=false WHERE id=$1 AND consecutive_failures>=5", [webhookId]);
    }
  }
}

async function dispatchToAllWebhooks(eventType, payload, companyId) {
  const { rows } = await db.query(
    "SELECT id FROM webhooks WHERE (company_id=$1 OR company_id IS NULL) AND enabled=true AND events @> $2",
    [companyId, JSON.stringify([eventType])]
  );
  await Promise.all(rows.map(r => deliverWebhook(r.id, eventType, payload)));
}

// ─── EVENT REPLAY ─────────────────────────────────────────────────
app.post("/webhooks/:webhookId/redeliver/:deliveryId", auth, async (req, res) => {
  const { rows } = await db.query(
    "SELECT wd.* FROM webhook_deliveries wd JOIN webhooks w ON w.id=wd.webhook_id WHERE wd.id=$1 AND w.company_id=$2",
    [req.params.deliveryId, req.user.company]
  );
  if (!rows[0]) return res.status(404).json({ error: "Delivery not found" });

  await deliverWebhook(req.params.webhookId, rows[0].event_type, JSON.parse(rows[0].payload), 0);
  res.json({ message: "Redelivery queued" });
});

app.get("/webhooks/:webhookId/deliveries", auth, async (req, res) => {
  const { rows } = await db.query(
    "SELECT id, event_type, status_code, attempt, delivered_at, error FROM webhook_deliveries WHERE webhook_id=$1 ORDER BY delivered_at DESC LIMIT 100",
    [req.params.webhookId]
  );
  res.json(rows);
});

// ─── SLACK INTEGRATION ────────────────────────────────────────────
async function sendSlackMessage(webhookUrl, message) {
  if (!webhookUrl || process.env.MOCK_INTEGRATIONS !== "false") {
    console.log("[SLACK MOCK]", JSON.stringify(message));
    return;
  }
  await axios.post(webhookUrl, message, { headers: { "Content-Type": "application/json" }, timeout: 5000 });
}

const SLACK_TEMPLATES = {
  "transfer.settled": (data) => ({
    text: `Settlement Confirmed`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "Settlement Confirmed" } },
      {
        type: "section", fields: [
          { type: "mrkdwn", text: `*Amount:*\n${data.amount} ${data.currency}` },
          { type: "mrkdwn", text: `*TX ID:*\n${data.txId}` },
          { type: "mrkdwn", text: `*Recipient:*\n${data.recipient}` },
          { type: "mrkdwn", text: `*Status:*\n:white_check_mark: Settled` },
        ]
      },
    ],
  }),
  "compliance.alert": (data) => ({
    text: `Compliance Alert - ${data.severity}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: `Compliance Alert [${data.severity}]` } },
      { type: "section", text: { type: "mrkdwn", text: `*Alert Type:* ${data.alertType}\n*TX:* ${data.txId}\n*Action Required:* Review in AegisLedger compliance centre` } },
      { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Review Now" }, url: `${process.env.FRONTEND_URL}/compliance` }] },
    ],
  }),
};

app.post("/integrations/slack", auth, async (req, res) => {
  const { webhookUrl, events } = req.body;
  await db.query(`
    INSERT INTO slack_integrations (company_id, webhook_url, events, enabled, created_by, created_at)
    VALUES ($1,$2,$3,true,$4,NOW())
    ON CONFLICT (company_id) DO UPDATE SET webhook_url=$2, events=$3, enabled=true
  `, [req.user.company, webhookUrl, JSON.stringify(events || ["transfer.settled", "compliance.alert"])]);

  await sendSlackMessage(webhookUrl, { text: "AegisLedger Slack integration connected successfully." });
  res.json({ message: "Slack integration configured" });
});

// ─── TELEGRAM BOT ─────────────────────────────────────────────────
const telegramBot = process.env.TELEGRAM_BOT_TOKEN
  ? new Telegraf(process.env.TELEGRAM_BOT_TOKEN)
  : null;

if (telegramBot) {
  telegramBot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    const code = ctx.message.text.split(" ")[1];
    if (code) {
      const companyId = await redisClient.get(`telegram:verify:${code}`);
      if (companyId) {
        await db.query("UPDATE telegram_subscribers SET chat_id=$1, verified=true WHERE verify_code=$2", [chatId, code]);
        await ctx.reply("AegisLedger Telegram alerts activated. You will receive balance alerts and compliance notifications.");
        return;
      }
    }
    ctx.reply("Send /start <verification-code> to activate alerts. Get your code from the AegisLedger integrations page.");
  });

  telegramBot.launch();
}

async function sendTelegramAlert(chatId, message) {
  if (!telegramBot || process.env.MOCK_INTEGRATIONS !== "false") {
    console.log("[TELEGRAM MOCK]", chatId, message);
    return;
  }
  await telegramBot.telegram.sendMessage(chatId, message, { parse_mode: "HTML" });
}

app.post("/integrations/telegram/setup", auth, async (req, res) => {
  const verifyCode = crypto.randomBytes(8).toString("hex").toUpperCase();
  await redisClient.setEx(`telegram:verify:${verifyCode}`, 600, req.user.company);
  await db.query(`
    INSERT INTO telegram_subscribers (company_id, user_id, verify_code, created_at)
    VALUES ($1,$2,$3,NOW()) ON CONFLICT (company_id) DO UPDATE SET verify_code=$3
  `, [req.user.company, req.user.sub, verifyCode]);

  res.json({
    verifyCode,
    instruction: `Open Telegram, search @AegisLedgerBot and send: /start ${verifyCode}`,
    expiresIn: "10 minutes",
  });
});

// ─── ESCALATION CHAINS ────────────────────────────────────────────
app.post("/escalation-chains", auth, async (req, res) => {
  const { name, triggerEvent, triggerCondition, steps } = req.body;
  const chainId = uuidv4();

  await db.query(`
    INSERT INTO escalation_chains (id, company_id, name, trigger_event, trigger_condition, steps, enabled, created_by, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,true,$7,NOW())
  `, [chainId, req.user.company, name, triggerEvent, JSON.stringify(triggerCondition), JSON.stringify(steps), req.user.sub]);

  res.status(201).json({ chainId, message: "Escalation chain created" });
});

async function triggerEscalationChain(eventType, payload, companyId) {
  const { rows: chains } = await db.query(
    "SELECT * FROM escalation_chains WHERE company_id=$1 AND trigger_event=$2 AND enabled=true",
    [companyId, eventType]
  );

  for (const chain of chains) {
    const steps = JSON.parse(chain.steps || "[]");
    const instanceId = uuidv4();

    await db.query(`
      INSERT INTO escalation_instances (id, chain_id, payload, current_step, status, triggered_at)
      VALUES ($1,$2,$3,0,'ACTIVE',NOW())
    `, [instanceId, chain.id, JSON.stringify(payload)]);

    if (steps[0]) await executeEscalationStep(instanceId, steps[0], payload);
  }
}

async function executeEscalationStep(instanceId, step, payload) {
  const timeout = step.waitMinutes || 120;

  if (step.channel === "email") await dispatchToAllWebhooks("notification.escalation", { ...payload, step, instanceId }, null);
  if (step.channel === "slack") { /* Slack notification */ }
  if (step.channel === "telegram") { /* Telegram notification */ }

  await redisClient.setEx(`escalation:${instanceId}`, timeout * 60, JSON.stringify({ instanceId, nextStep: step.nextStep, payload }));
}

// ─── NOTIFICATION PREFERENCES ─────────────────────────────────────
app.get("/notification-preferences", auth, async (req, res) => {
  const { rows } = await db.query("SELECT preferences FROM users WHERE id=$1", [req.user.sub]);
  res.json(rows[0]?.preferences?.notifications || getDefaultNotifPrefs());
});

app.put("/notification-preferences", auth, async (req, res) => {
  await db.query(`
    UPDATE users SET preferences = jsonb_set(COALESCE(preferences,'{}'), '{notifications}', $1::jsonb) WHERE id=$2
  `, [JSON.stringify(req.body), req.user.sub]);
  res.json({ message: "Notification preferences updated" });
});

function getDefaultNotifPrefs() {
  return {
    transfer_settled: { email: true, inApp: true, slack: false, telegram: false },
    transfer_flagged: { email: true, inApp: true, slack: true, telegram: true },
    kyb_status_change: { email: true, inApp: true, slack: false, telegram: false },
    balance_threshold: { email: true, inApp: true, slack: false, telegram: true },
    compliance_alert: { email: true, inApp: true, slack: true, telegram: true },
    new_device_login: { email: true, inApp: true, slack: false, telegram: false },
    regulatory_report: { email: true, inApp: false, slack: false, telegram: false },
    escrow_status_change: { email: true, inApp: true, slack: false, telegram: false },
  };
}

// ─── KAFKA CONSUMER ───────────────────────────────────────────────
async function startConsumer() {
  await consumer.connect();
  await consumer.subscribe({
    topics: [
      "transfer.settled", "transfer.flagged", "compliance.alert",
      "kyb.approved", "kyb.rejected", "escrow.released", "four_eyes.requested",
    ], fromBeginning: false
  });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      try {
        const payload = JSON.parse(message.value.toString());
        await dispatchToAllWebhooks(topic, payload, payload.companyId);
        await triggerEscalationChain(topic, payload, payload.companyId);

        // Slack dispatch
        const template = SLACK_TEMPLATES[topic];
        if (template) {
          const { rows: slackRows } = await db.query("SELECT * FROM slack_integrations WHERE company_id=$1 AND enabled=true", [payload.companyId]);
          for (const s of slackRows) {
            if (JSON.parse(s.events || "[]").includes(topic)) {
              await sendSlackMessage(s.webhook_url, template(payload));
            }
          }
        }
      } catch (err) { console.error("[WEBHOOK SVC]", err.message); }
    },
  });
}

startConsumer().catch(err => console.warn("Kafka not available:", err.message));

app.get("/health", (req, res) => res.json({ status: "ok", service: "webhook" }));
app.listen(process.env.PORT || 3011, () => console.log("Webhook Service on port 3011"));
module.exports = { app, deliverWebhook, dispatchToAllWebhooks, sendSlackMessage, sendTelegramAlert };
