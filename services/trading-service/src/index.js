/**
 * AegisLedger - Trading & Payment Orchestration Service
 * Features: Recurring payments, bulk CSV upload, transfer templates,
 *           FX rate lock, multi-sig authorization, address book,
 *           balance alerts, sweep rules, portfolio allocation
 */

const express = require("express");
const cron = require("node-cron");
const csv = require("csv-parser");
const { Readable } = require("stream");
const { Pool } = require("pg");
const redis = require("redis");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const { Kafka } = require("kafkajs");
const multer = require("multer");

const app = express();
app.use(express.json());
app.use(helmet());

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redisClient = redis.createClient({ url: process.env.REDIS_URL });
redisClient.connect().catch(console.error);

const kafka = new Kafka({ clientId: "trading-service", brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(",") });
const producer = kafka.producer();
producer.connect().catch(err => console.warn("Kafka:", err.message));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const auth = (req, res, next) => {
  const token = req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try { req.user = jwt.verify(token, process.env.JWT_PUBLIC_KEY, { algorithms: ["RS256"] }); next(); }
  catch { res.status(401).json({ error: "Invalid token" }); }
};

// Fix 12: PRODUCTION_MODE Gate for Regulatory Compliance
function requireProduction(req, res, next) {
  if (process.env.PRODUCTION_MODE !== 'true') {
    return res.status(503).json({
      error: 'Platform is operating in restricted mode pending regulatory approval.',
      code: 'REGULATORY_PENDING'
    });
  }
  next();
}

async function publish(topic, payload) {
  try { await producer.send({ topic, messages: [{ value: JSON.stringify({ ...payload, _ts: new Date().toISOString() }) }] }); }
  catch { console.log(`[KAFKA] ${topic}`, payload); }
}

// ─── ADDRESS BOOK ─────────────────────────────────────────────────
app.get("/address-book", auth, async (req, res) => {
  const { rows } = await db.query(
    "SELECT * FROM address_book WHERE company_id=$1 ORDER BY nickname ASC",
    [req.user.company]
  );
  res.json(rows);
});

app.post("/address-book", auth, async (req, res) => {
  const { nickname, walletAddress, assetKey, beneficiaryCompanyId, notes, tags } = req.body;
  if (!nickname || !walletAddress) return res.status(400).json({ error: "nickname and walletAddress required" });

  const entryId = uuidv4();
  await db.query(`
    INSERT INTO address_book (id, company_id, nickname, wallet_address, asset_key, beneficiary_company_id, notes, tags, kyb_verified, created_by, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,$9,NOW())
  `, [entryId, req.user.company, nickname, walletAddress, assetKey, beneficiaryCompanyId, notes, JSON.stringify(tags || []), req.user.sub]);

  res.status(201).json({ entryId, nickname, walletAddress });
});

app.delete("/address-book/:id", auth, async (req, res) => {
  await db.query("DELETE FROM address_book WHERE id=$1 AND company_id=$2", [req.params.id, req.user.company]);
  res.json({ message: "Address removed" });
});

// ─── TRANSFER TEMPLATES ───────────────────────────────────────────
app.get("/templates", auth, async (req, res) => {
  const { rows } = await db.query("SELECT * FROM transfer_templates WHERE company_id=$1 ORDER BY name", [req.user.company]);
  res.json(rows);
});

app.post("/templates", auth, async (req, res) => {
  const { name, description, defaultAmount, assetKey, beneficiaryAddress, beneficiaryCompanyId, reference } = req.body;
  const templateId = uuidv4();
  await db.query(`
    INSERT INTO transfer_templates (id, company_id, name, description, default_amount, asset_key, beneficiary_address, beneficiary_company_id, reference, created_by, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
  `, [templateId, req.user.company, name, description, defaultAmount, assetKey, beneficiaryAddress, beneficiaryCompanyId, reference, req.user.sub]);
  res.status(201).json({ templateId, name });
});

// ─── RECURRING PAYMENTS ───────────────────────────────────────────
app.get("/recurring", auth, async (req, res) => {
  const { rows } = await db.query("SELECT * FROM recurring_payments WHERE company_id=$1 ORDER BY next_execution", [req.user.company]);
  res.json(rows);
});

app.post("/recurring", auth, async (req, res) => {
  const { name, amount, assetKey, beneficiaryAddress, frequency, startDate, endDate, reference, requiresApproval } = req.body;
  const validFrequencies = ["daily", "weekly", "biweekly", "monthly", "quarterly"];
  if (!validFrequencies.includes(frequency)) return res.status(400).json({ error: "Invalid frequency" });

  const paymentId = uuidv4();
  const nextExec = computeNextExecution(frequency, new Date(startDate));

  await db.query(`
    INSERT INTO recurring_payments (id, company_id, name, amount, asset_key, beneficiary_address, frequency, start_date, end_date, next_execution, reference, requires_approval, status, created_by, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active',$13,NOW())
  `, [paymentId, req.user.company, name, amount, assetKey, beneficiaryAddress, frequency, startDate, endDate || null, nextExec, reference, requiresApproval || false, req.user.sub]);

  res.status(201).json({ paymentId, name, nextExecution: nextExec });
});

app.patch("/recurring/:id/pause", auth, async (req, res) => {
  await db.query("UPDATE recurring_payments SET status='paused' WHERE id=$1 AND company_id=$2", [req.params.id, req.user.company]);
  res.json({ message: "Recurring payment paused" });
});

function computeNextExecution(frequency, from = new Date()) {
  const d = new Date(from);
  if (frequency === "daily") d.setDate(d.getDate() + 1);
  if (frequency === "weekly") d.setDate(d.getDate() + 7);
  if (frequency === "biweekly") d.setDate(d.getDate() + 14);
  if (frequency === "monthly") d.setMonth(d.getMonth() + 1);
  if (frequency === "quarterly") d.setMonth(d.getMonth() + 3);
  return d;
}

const consumer = kafka.consumer({ groupId: 'trading-service-group' });
consumer.connect().then(() => {
  consumer.subscribe({ topic: 'transfer.recurring_due' });
  consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const payload = JSON.parse(message.value.toString());
        await executeRecurringPayment(payload);
      } catch (err) {
        console.error("Error processing recurring payment", err);
      }
    }
  });
}).catch(console.error);

async function executeRecurringPayment(payload) {
  // payload from scheduler-service: { recurringId, companyId, amount, asset, beneficiary, reference }
  // We need to fetch the requires_approval flag from our DB, or assume we publish execute.
  const { rows } = await db.query("SELECT * FROM recurring_payments WHERE id=$1", [payload.recurringId]);
  const rp = rows[0];
  if (!rp) return;

  if (rp.requires_approval) {
    await publish("recurring_payment.approval_needed", { paymentId: rp.id, companyId: rp.company_id, amount: rp.amount, assetKey: rp.asset_key });
  } else {
    await publish("transfer.execute", { recurringPaymentId: rp.id, companyId: rp.company_id, amount: rp.amount, assetKey: rp.asset_key, beneficiaryAddress: rp.beneficiary_address, reference: rp.reference });
  }
}

// ─── BULK CSV PAYMENT UPLOAD ──────────────────────────────────────
app.post("/transfers/bulk", auth, requireProduction, upload.single("csvFile"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "CSV file required" });

  const rows = [];
  const errors = [];
  let lineNum = 1;

  await new Promise((resolve, reject) => {
    Readable.from(req.file.buffer.toString())
      .pipe(csv())
      .on("data", (row) => {
        lineNum++;
        const { beneficiary_address, amount, asset_key, reference, beneficiary_name } = row;
        if (!beneficiary_address || !amount || !asset_key) {
          errors.push({ line: lineNum, error: "Missing required fields: beneficiary_address, amount, asset_key" });
          return;
        }
        if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
          errors.push({ line: lineNum, error: `Invalid amount: ${amount}` });
          return;
        }
        rows.push({ beneficiary_address, amount: parseFloat(amount), asset_key, reference, beneficiary_name });
      })
      .on("end", resolve)
      .on("error", reject);
  });

  if (errors.length > rows.length / 2) return res.status(400).json({ error: "Too many validation errors", errors });

  const batchId = uuidv4();
  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);

  await db.query(`
    INSERT INTO bulk_payment_batches (id, company_id, total_amount, payment_count, error_count, status, created_by, created_at)
    VALUES ($1,$2,$3,$4,$5,'pending',$6,NOW())
  `, [batchId, req.user.company, totalAmount, rows.length, errors.length, req.user.sub]);

  for (const row of rows) {
    await db.query(`
      INSERT INTO bulk_payment_items (id, batch_id, beneficiary_address, amount, asset_key, reference, beneficiary_name, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')
    `, [uuidv4(), batchId, row.beneficiary_address, row.amount, row.asset_key, row.reference, row.beneficiary_name]);
  }

  res.status(202).json({ batchId, totalPayments: rows.length, totalAmount, validationErrors: errors, status: "pending_approval" });
});

app.post("/transfers/bulk/:batchId/approve", auth, requireProduction, async (req, res) => {
  await db.query("UPDATE bulk_payment_batches SET status='processing', approved_by=$1, approved_at=NOW() WHERE id=$2",
    [req.user.sub, req.params.batchId]);
  await publish("bulk_payment.execute", { batchId: req.params.batchId, approvedBy: req.user.sub });
  res.json({ message: "Batch approved for execution", batchId: req.params.batchId });
});

// ─── FX RATE LOCK ─────────────────────────────────────────────────
app.post("/fx/lock-rate", auth, async (req, res) => {
  const { fromCurrency, toCurrency, amount } = req.body;
  const lockId = uuidv4();
  const rate = await fetchCurrentRate(fromCurrency, toCurrency);
  const lockedAt = new Date();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await redisClient.setEx(`fx:lock:${lockId}`, 900, JSON.stringify({ lockId, fromCurrency, toCurrency, rate, amount, lockedAt: lockedAt.toISOString(), expiresAt: expiresAt.toISOString(), companyId: req.user.company }));

  res.json({ lockId, rate, fromCurrency, toCurrency, amount, convertedAmount: (amount * rate).toFixed(6), lockedAt, expiresAt, warning: "Rate guaranteed for 15 minutes. Include lockId in transfer to honour this rate." });
});

app.get("/fx/lock/:lockId", auth, async (req, res) => {
  const data = await redisClient.get(`fx:lock:${req.params.lockId}`);
  if (!data) return res.status(404).json({ error: "Rate lock expired or not found" });
  const lock = JSON.parse(data);
  const ttl = await redisClient.ttl(`fx:lock:${req.params.lockId}`);
  res.json({ ...lock, secondsRemaining: ttl });
});

async function fetchCurrentRate(from, to) {
  const MOCK_RATES = { "RUB_USDC": 0.01112, "AED_USDC": 0.27230, "USD_USDC": 1.0000, "EUR_USDC": 1.0850 };
  return MOCK_RATES[`${from}_${to}`] || 1.0;
}

// ─── MULTI-SIG AUTHORIZATION ──────────────────────────────────────
app.post("/transfers/multisig/initiate", auth, requireProduction, async (req, res) => {
  const { amount, assetKey, beneficiaryAddress, reference, requiredSigners, minSignatures } = req.body;
  const txId = uuidv4();

  await db.query(`
    INSERT INTO multisig_transactions (id, company_id, amount, asset_key, beneficiary_address, reference, required_signers, min_signatures, signatures_collected, status, initiated_by, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,'awaiting_signatures',$9,NOW())
  `, [txId, req.user.company, amount, assetKey, beneficiaryAddress, reference, JSON.stringify(requiredSigners), minSignatures, req.user.sub]);

  for (const signerId of requiredSigners) {
    await publish("multisig.signature_required", { txId, signerId, amount, assetKey, reference });
  }

  res.status(201).json({ txId, status: "awaiting_signatures", requiredSigners, minSignatures });
});

app.post("/transfers/multisig/:txId/sign", auth, requireProduction, async (req, res) => {
  const { rows } = await db.query("SELECT * FROM multisig_transactions WHERE id=$1", [req.params.txId]);
  if (!rows[0]) return res.status(404).json({ error: "Transaction not found" });

  const tx = rows[0];
  const signers = JSON.parse(tx.required_signers || "[]");
  if (!signers.includes(req.user.sub)) return res.status(403).json({ error: "You are not an authorized signer for this transaction" });

  const sigs = JSON.parse(tx.collected_signatures || "[]");
  if (sigs.includes(req.user.sub)) return res.status(400).json({ error: "You have already signed this transaction" });

  sigs.push(req.user.sub);
  const collected = sigs.length;
  const status = collected >= tx.min_signatures ? "ready_to_execute" : "awaiting_signatures";

  await db.query("UPDATE multisig_transactions SET collected_signatures=$1, signatures_collected=$2, status=$3 WHERE id=$4",
    [JSON.stringify(sigs), collected, status, req.params.txId]);

  await db.query("INSERT INTO audit_logs (user_id,action,ip_address,details,created_at) VALUES ($1,'MULTISIG_SIGNED',$2,$3,NOW())",
    [req.user.sub, req.ip, JSON.stringify({ txId: req.params.txId, signaturesCollected: collected, required: tx.min_signatures })]);

  if (status === "ready_to_execute") {
    await publish("transfer.execute", { multisigTxId: req.params.txId, companyId: req.user.company, amount: tx.amount, assetKey: tx.asset_key, beneficiaryAddress: tx.beneficiary_address });
  }

  res.json({ txId: req.params.txId, signaturesCollected: collected, required: tx.min_signatures, status });
});

// ─── BALANCE ALERTS ───────────────────────────────────────────────
app.get("/balance-alerts", auth, async (req, res) => {
  const { rows } = await db.query("SELECT * FROM balance_alerts WHERE company_id=$1", [req.user.company]);
  res.json(rows);
});

app.post("/balance-alerts", auth, async (req, res) => {
  const { assetKey, condition, threshold, notifyChannels } = req.body;
  const alertId = uuidv4();
  await db.query(`
    INSERT INTO balance_alerts (id, company_id, asset_key, condition, threshold, notify_channels, enabled, created_by, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,true,$7,NOW())
  `, [alertId, req.user.company, assetKey, condition, threshold, JSON.stringify(notifyChannels || ["email", "inapp"]), req.user.sub]);
  res.status(201).json({ alertId, message: "Balance alert created" });
});

// ─── SWEEP RULES ──────────────────────────────────────────────────
app.post("/sweep-rules", auth, async (req, res) => {
  const { assetKey, triggerBalance, targetBalance, destinationAddress, destinationType } = req.body;
  const ruleId = uuidv4();
  await db.query(`
    INSERT INTO sweep_rules (id, company_id, asset_key, trigger_balance, target_balance, destination_address, destination_type, enabled, created_by, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,NOW())
  `, [ruleId, req.user.company, assetKey, triggerBalance, targetBalance, destinationAddress, destinationType || "cold_wallet", req.user.sub]);
  res.status(201).json({ ruleId, message: "Sweep rule created" });
});

// Cron: check balance alerts and sweep rules every minute
cron.schedule("* * * * *", async () => {
  const { rows: alerts } = await db.query("SELECT ba.*, wb.balance FROM balance_alerts ba JOIN wallet_balances wb ON wb.company_id=ba.company_id AND wb.asset_key=ba.asset_key WHERE ba.enabled=true");
  for (const alert of alerts) {
    const triggered = alert.condition === "below" ? parseFloat(alert.balance) < parseFloat(alert.threshold)
      : parseFloat(alert.balance) > parseFloat(alert.threshold);
    if (triggered) {
      const cooldownKey = `alert:cooldown:${alert.id}`;
      const oncooldown = await redisClient.get(cooldownKey);
      if (!oncooldown) {
        await publish("balance.alert_triggered", { alertId: alert.id, companyId: alert.company_id, assetKey: alert.asset_key, balance: alert.balance, threshold: alert.threshold, condition: alert.condition });
        await redisClient.setEx(cooldownKey, 3600, "1");
      }
    }
  }
});

app.get("/health", (req, res) => res.json({ status: "ok", service: "trading" }));
app.listen(process.env.PORT || 3014, () => console.log("Trading Service on port 3014"));
module.exports = app;
