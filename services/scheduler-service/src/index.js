/**
 * AegisLedger - Scheduler Service
 * Recurring payments · Approval matrix · Bulk CSV upload
 * Transfer templates · Cancellation window · FX rate lock
 * KYB renewal reminders · Document expiry alerts
 */

// Fix 2: Crash-fast if JWT_PUBLIC_KEY is missing — no dev_secret fallback allowed
if (!process.env.JWT_PUBLIC_KEY) {
  console.error('FATAL: JWT_PUBLIC_KEY environment variable is not set.');
  process.exit(1);
}
const express   = require("express");
const { Pool }  = require("pg");
const jwt       = require("jsonwebtoken");
const cron      = require("node-cron");
const csv       = require("csv-parser");
const multer    = require("multer");
const stream    = require("stream");
const { Kafka } = require("kafkajs");
const Redis = require("ioredis");
const app = express();
const redis = new Redis(process.env.REDIS_URL);
app.use(express.json());
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10*1024*1024 } });

// Kafka producer for publishing scheduled events
const kafka = new Kafka({ clientId:"scheduler", brokers:(process.env.KAFKA_BROKERS||"localhost:9092").split(",") });
const producer = kafka.producer();
producer.connect().catch(err=>console.warn("Kafka unavailable:",err.message));

async function publish(topic, payload) {
  try { await producer.send({topic,messages:[{value:JSON.stringify(payload)}]}); }
  catch { console.log(`[SCHEDULER] ${topic}:`,JSON.stringify(payload)); }
}


// Redis SET NX PX provides automatic TTL expiry as a crash recovery mechanism
// — if the process dies mid-job the lock expires naturally
async function withLock(redisClient, lockKey, ttlMs, fn) {
  const acquired = await redisClient.set(lockKey, '1', 'NX', 'PX', ttlMs);
  if (!acquired) {
    console.log('Skipped job ' + lockKey + ' — another instance holds the lock');
    return;
  }
  try {
    await fn();
  } finally {
    await redisClient.del(lockKey);
  }
}

// ─── RECURRING PAYMENTS ───────────────────────────────────────────
app.get("/recurring", requireAuth, async (req,res) => {
  const {rows} = await db.query("SELECT * FROM recurring_payments WHERE company_id=$1 AND active=true ORDER BY created_at DESC", [req.user.company]);
  res.json(rows);
});
app.post("/recurring", requireAuth, requireRole("admin","treasury"), async (req,res) => {
  const {name,amount,asset,beneficiary,schedule,start_date,end_date,reference} = req.body;
  // schedule: "weekly" | "monthly" | "quarterly" | cron expression
  const {rows} = await db.query(`INSERT INTO recurring_payments (company_id,name,amount,asset,beneficiary_company,schedule,start_date,end_date,reference,active,created_by,created_at,next_run) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,NOW(),$11) RETURNING *`,
    [req.user.company,name,amount,asset,beneficiary,schedule,start_date,end_date||null,reference,req.user.sub,calcNextRun(schedule,start_date)]);
  res.status(201).json(rows[0]);
});
app.patch("/recurring/:id/pause", requireAuth, requireRole("admin","treasury"), async (req,res) => {
  await db.query("UPDATE recurring_payments SET active=false WHERE id=$1 AND company_id=$2",[req.params.id,req.user.company]);
  res.json({message:"Recurring payment paused"});
});
app.delete("/recurring/:id", requireAuth, requireRole("admin","treasury"), async (req,res) => {
  await db.query("DELETE FROM recurring_payments WHERE id=$1 AND company_id=$2",[req.params.id,req.user.company]);
  res.json({message:"Recurring payment deleted"});
});

function calcNextRun(schedule, startDate) {
  const now = new Date();
  const d = new Date(Math.max(now,new Date(startDate)));
  if (schedule==="weekly") { d.setDate(d.getDate()+7); return d; }
  if (schedule==="monthly") { d.setMonth(d.getMonth()+1); return d; }
  if (schedule==="quarterly") { d.setMonth(d.getMonth()+3); return d; }
  return d;
}

// Run due recurring payments every 5 minutes
cron.schedule("*/5 * * * *", () => withLock(redis, 'lock:recurring-payments', 4 * 60 * 1000, async () => {
  const {rows} = await db.query("SELECT * FROM recurring_payments WHERE active=true AND next_run<=NOW()");
  for (const rp of rows) {
    await publish("transfer.recurring_due", { recurringId:rp.id, companyId:rp.company_id, amount:rp.amount, asset:rp.asset, beneficiary:rp.beneficiary_company, reference:rp.reference });
    const next = calcNextRun(rp.schedule, new Date());
    if (rp.end_date && next > new Date(rp.end_date)) {
      await db.query("UPDATE recurring_payments SET active=false WHERE id=$1",[rp.id]);
    } else {
      await db.query("UPDATE recurring_payments SET next_run=$1,last_run=NOW() WHERE id=$2",[next,rp.id]);
    }
  }
}));

// ─── APPROVAL MATRIX ─────────────────────────────────────────────
app.get("/approval-matrix", requireAuth, async (req,res) => {
  const {rows} = await db.query("SELECT * FROM approval_matrices WHERE company_id=$1 ORDER BY threshold ASC",[req.user.company]);
  res.json(rows.length ? rows : getDefaultApprovalMatrix());
});
app.post("/approval-matrix", requireAuth, requireRole("admin"), async (req,res) => {
  const {rules} = req.body; // [{threshold,required_approvers,required_roles}]
  await db.query("DELETE FROM approval_matrices WHERE company_id=$1",[req.user.company]);
  for (const rule of rules) {
    await db.query("INSERT INTO approval_matrices (company_id,threshold,required_approvers,required_roles,created_at) VALUES ($1,$2,$3,$4,NOW())",
      [req.user.company,rule.threshold,rule.required_approvers,JSON.stringify(rule.required_roles||["treasury"])]);
  }
  res.json({message:"Approval matrix saved"});
});

function getDefaultApprovalMatrix() {
  return [
    {threshold:0,required_approvers:1,required_roles:["treasury"]},
    {threshold:100000,required_approvers:2,required_roles:["treasury"]},
    {threshold:500000,required_approvers:2,required_roles:["treasury","compliance"]},
    {threshold:5000000,required_approvers:3,required_roles:["treasury","compliance","admin"]},
  ];
}

// ─── BULK PAYMENT UPLOAD ──────────────────────────────────────────
app.post("/bulk-payments/upload", requireAuth, requireRole("admin","treasury"), upload.single("file"), async (req,res) => {
  if (!req.file) return res.status(400).json({error:"No file uploaded"});
  const rows = [];
  const errors = [];
  const parser = csv();
  const readable = stream.Readable.from(req.file.buffer.toString());
  await new Promise((resolve,reject) => {
    readable.pipe(parser)
      .on("data", row => {
        if (!row.beneficiary || !row.amount || !row.asset) {
          errors.push({row:rows.length+1,error:"Missing required fields: beneficiary, amount, asset"});
        } else if (isNaN(parseFloat(row.amount))) {
          errors.push({row:rows.length+1,error:"Invalid amount"});
        } else {
          rows.push({beneficiary:row.beneficiary,amount:parseFloat(row.amount),asset:row.asset,reference:row.reference||"",memo:row.memo||""});
        }
      })
      .on("end",resolve).on("error",reject);
  });
  if (errors.length > 0 && errors.length === rows.length + errors.length) {
    return res.status(400).json({error:"All rows invalid",errors});
  }
  const batchId = `BATCH-${Date.now()}`;
  await db.query("INSERT INTO bulk_payment_batches (id,company_id,total_rows,error_rows,status,created_by,created_at) VALUES ($1,$2,$3,$4,'pending',$5,NOW())",
    [batchId,req.user.company,rows.length,errors.length,req.user.sub]);
  for (const row of rows) {
    await db.query("INSERT INTO bulk_payment_rows (batch_id,beneficiary,amount,asset,reference,memo,status) VALUES ($1,$2,$3,$4,$5,$6,'pending')",
      [batchId,row.beneficiary,row.amount,row.asset,row.reference,row.memo]);
  }
  res.json({batchId,validRows:rows.length,errorRows:errors.length,errors,status:"pending",message:"Upload successful. Preview below.",preview:rows.slice(0,5)});
});
app.post("/bulk-payments/:batchId/execute", requireAuth, requireRole("admin","treasury"), async (req,res) => {
  const {rows:batch} = await db.query("SELECT * FROM bulk_payment_batches WHERE id=$1 AND company_id=$2",[req.params.batchId,req.user.company]);
  if (!batch[0]) return res.status(404).json({error:"Batch not found"});
  await db.query("UPDATE bulk_payment_batches SET status='processing' WHERE id=$1",[req.params.batchId]);
  await publish("transfer.bulk_execute",{batchId:req.params.batchId,companyId:req.user.company,initiatedBy:req.user.sub});
  res.json({message:"Batch execution started",batchId:req.params.batchId});
});
app.get("/bulk-payments", requireAuth, async (req,res) => {
  const {rows} = await db.query("SELECT * FROM bulk_payment_batches WHERE company_id=$1 ORDER BY created_at DESC LIMIT 20",[req.user.company]);
  res.json(rows);
});

// ─── TRANSFER TEMPLATES ───────────────────────────────────────────
app.get("/templates", requireAuth, async (req,res) => {
  const {rows} = await db.query("SELECT * FROM transfer_templates WHERE company_id=$1 ORDER BY name",[req.user.company]);
  res.json(rows);
});
app.post("/templates", requireAuth, requireRole("admin","treasury"), async (req,res) => {
  const {name,description,beneficiary,amount,asset,memo} = req.body;
  const {rows} = await db.query("INSERT INTO transfer_templates (company_id,name,description,beneficiary,amount,asset,memo,created_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING *",
    [req.user.company,name,description,beneficiary,amount||null,asset,memo||"",req.user.sub]);
  res.status(201).json(rows[0]);
});
app.delete("/templates/:id", requireAuth, requireRole("admin","treasury"), async (req,res) => {
  await db.query("DELETE FROM transfer_templates WHERE id=$1 AND company_id=$2",[req.params.id,req.user.company]);
  res.json({message:"Template deleted"});
});

// ─── CANCELLATION WINDOW ─────────────────────────────────────────
app.post("/transfers/:txId/cancel", requireAuth, async (req,res) => {
  const {rows} = await db.query("SELECT * FROM transfers WHERE id=$1 AND originator_company=$2",[req.params.txId,req.user.company]);
  if (!rows[0]) return res.status(404).json({error:"Transfer not found"});
  const tx = rows[0];
  const { rows: policy } = await db.query("SELECT * FROM session_policies WHERE company_id=$1",[req.user.company]);
  const cancellationWindowMins = policy[0]?.cancellation_window_minutes || 5;
  const age = (Date.now() - new Date(tx.created_at).getTime()) / 60000;
  if (age > cancellationWindowMins) return res.status(400).json({error:`Cancellation window of ${cancellationWindowMins} minutes has passed`});
  if (!["pending","submitted"].includes(tx.status)) return res.status(400).json({error:`Cannot cancel transfer in status: ${tx.status}`});
  await db.query("UPDATE transfers SET status='cancelled',cancelled_at=NOW(),cancelled_by=$1 WHERE id=$2",[req.user.sub,req.params.txId]);
  res.json({message:"Transfer cancelled successfully"});
});

// ─── FX RATE LOCK ─────────────────────────────────────────────────
app.post("/fx-lock", requireAuth, async (req,res) => {
  const {fromCurrency,toCurrency,amount} = req.body;
  const rate = getMockRate(fromCurrency,toCurrency);
  const lockId = `LOCK-${Date.now()}`;
  const expiresAt = new Date(Date.now() + 15*60*1000);
  await db.query("INSERT INTO fx_locks (id,company_id,from_currency,to_currency,rate,amount,expires_at,used,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,false,NOW())",
    [lockId,req.user.company,fromCurrency,toCurrency,rate,amount,expiresAt]);
  res.json({lockId,rate,amount,lockedAmount:(amount/rate).toFixed(6),expiresAt,expiresInSeconds:900});
});
app.get("/fx-lock/:lockId", async (req,res) => {
  const {rows} = await db.query("SELECT * FROM fx_locks WHERE id=$1",[req.params.lockId]);
  if (!rows[0]) return res.status(404).json({error:"Lock not found"});
  const remaining = Math.max(0, Math.floor((new Date(rows[0].expires_at)-Date.now())/1000));
  res.json({...rows[0],remainingSeconds:remaining,expired:remaining===0});
});

function getMockRate(from,to) {
  const rates = {RUB_USDC:0.01112,AED_USDC:0.27226,USD_USDC:1.0,USDC_RUB:89.9,USDC_AED:3.673};
  return rates[`${from}_${to}`] || rates[`${to}_${from}`] ? 1/(rates[`${to}_${from}`]||1) : 1;
}

// ─── KYB RENEWAL REMINDERS ────────────────────────────────────────
cron.schedule("0 8 * * *", () => withLock(redis, 'lock:kyb-renewal', 23 * 60 * 60 * 1000, async () => {
  const {rows} = await db.query(`
    SELECT c.*,u.email FROM companies c JOIN users u ON u.company_id=c.id AND u.role='admin'
    WHERE c.kyb_renewal_date IS NOT NULL AND c.kyb_renewal_date - NOW() < INTERVAL '60 days' AND c.kyb_status='approved'
  `);
  for (const co of rows) {
    const days = Math.floor((new Date(co.kyb_renewal_date)-Date.now())/(86400000));
    await publish("kyb.renewal_reminder",{email:co.email,companyName:co.name,daysRemaining:days,renewalDate:co.kyb_renewal_date});
  }
  console.log(`[CRON] Sent ${rows.length} KYB renewal reminders`);
}));

// Document expiry alerts
cron.schedule("0 9 * * *", () => withLock(redis, 'lock:doc-expiry', 23 * 60 * 60 * 1000, async () => {
  const {rows} = await db.query(`
    SELECT kd.*,u.email,c.name as company_name FROM kyb_documents kd
    JOIN companies c ON c.id=kd.company_id JOIN users u ON u.company_id=c.id AND u.role='admin'
    WHERE kd.expiry_date IS NOT NULL AND kd.expiry_date - NOW() < INTERVAL '30 days'
  `);
  for (const doc of rows) {
    const days = Math.floor((new Date(doc.expiry_date)-Date.now())/(86400000));
    await publish("kyb.document_expiring",{email:doc.email,companyName:doc.company_name,documentType:doc.document_type,daysRemaining:days,expiryDate:doc.expiry_date});
  }
}));

// Fix 2: RS256 verification — no JWT_SECRET fallback
function requireAuth(req,res,next){const t=req.headers.authorization?.slice(7);if(!t)return res.status(401).json({error:"Unauthorized"});try{req.user=jwt.verify(t,process.env.JWT_PUBLIC_KEY,{algorithms:["RS256"]});next();}catch{res.status(401).json({error:"Invalid token"});}}
function requireRole(...roles){return(req,res,next)=>{if(!roles.includes(req.user.role))return res.status(403).json({error:"Forbidden"});next();};}
app.get("/health",(req,res)=>res.json({status:"ok",service:"scheduler"}));
app.listen(process.env.PORT||3011,()=>console.log("Scheduler Service on port 3011"));
module.exports={app};
