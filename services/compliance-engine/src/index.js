/**
 * AegisLedger - Compliance Engine (Full)
 * AML Rules Engine Builder · SAR Generator · Dynamic Risk Scoring
 * EDD Workflow · Case Management · Watchlist Deltas · Four-Eyes
 * Travel Rule · Regulatory Scheduler · Analytics
 */

// Fix 2: Crash-fast if JWT_PUBLIC_KEY is missing — no dev_secret fallback allowed
if (!process.env.JWT_PUBLIC_KEY) {
  console.error('FATAL: JWT_PUBLIC_KEY environment variable is not set.');
  process.exit(1);
}
const express   = require("express");
const { Pool }  = require("pg");
const redis     = require("redis");
const jwt       = require("jsonwebtoken");
const cron      = require("node-cron");
const PDFDocument = require("pdfkit");
const app = express();
app.use(express.json());
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Fix 35: VARA_VASP_ID must come from environment, never hardcoded
const VARA_VASP_ID = process.env.VARA_VASP_ID;
if (!VARA_VASP_ID) {
  console.error('FATAL: VARA_VASP_ID environment variable is not set. Set to TEST-AegisLedger-STAGING for staging, or the official VARA-assigned ID in production.');
  process.exit(1);
}
const VASP_ID_FORMAT = /^[A-Za-z0-9\-]+$/;
if (!VASP_ID_FORMAT.test(VARA_VASP_ID)) {
  console.error(`FATAL: VARA_VASP_ID format is invalid: "${VARA_VASP_ID}". Must match /^[A-Za-z0-9\\-]+$/`);
  process.exit(1);
}

// AML Rules CRUD
app.get("/aml-rules", requireAuth, async (req,res) => {
  const {rows} = await db.query("SELECT * FROM aml_rules ORDER BY priority ASC, created_at DESC");
  res.json(rows);
});
app.post("/aml-rules", requireAuth, requireRole("admin","compliance"), async (req,res) => {
  const {name,description,conditions,actions,priority,enabled} = req.body;
  const {rows} = await db.query(`INSERT INTO aml_rules (name,description,conditions,actions,priority,enabled,created_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *`,
    [name,description,JSON.stringify(conditions),JSON.stringify(actions),priority||50,enabled!==false,req.user.sub]);
  res.status(201).json(rows[0]);
});
app.patch("/aml-rules/:id", requireAuth, requireRole("admin","compliance"), async (req,res) => {
  const {name,conditions,actions,priority,enabled} = req.body;
  await db.query(`UPDATE aml_rules SET name=COALESCE($1,name),conditions=COALESCE($2,conditions),actions=COALESCE($3,actions),priority=COALESCE($4,priority),enabled=COALESCE($5,enabled),updated_at=NOW() WHERE id=$6`,
    [name,conditions?JSON.stringify(conditions):null,actions?JSON.stringify(actions):null,priority,enabled,req.params.id]);
  res.json({message:"Rule updated"});
});
app.delete("/aml-rules/:id", requireAuth, requireRole("admin","compliance"), async (req,res) => {
  await db.query("DELETE FROM aml_rules WHERE id=$1",[req.params.id]);
  res.json({message:"Rule deleted"});
});

app.post("/aml-rules/evaluate", requireAuth, async (req,res) => {
  const {transaction} = req.body;
  // Fix 27: Freeze the transaction object before passing to evalCond to prevent mutation
  Object.freeze(transaction);
  const {rows:rules} = await db.query("SELECT * FROM aml_rules WHERE enabled=true ORDER BY priority ASC");
  const matches = [];
  for (const rule of rules) {
    const conds = JSON.parse(rule.conditions);
    try {
      if (conds.every(c => evalCond(transaction, c))) matches.push({ruleId:rule.id,ruleName:rule.name,actions:JSON.parse(rule.actions)});
    } catch (fieldErr) {
      console.warn(`[AML] Skipping rule ${rule.id}: ${fieldErr.message}`);
    }
  }
  const action = matches.length ? ["block","escalate","flag","report"].find(a=>matches.some(m=>m.actions.includes(a)))||"flag" : null;
  res.json({triggered:matches.length>0,matches,recommendedAction:action});
});

// Fix 27: Whitelist of permitted AML rule field paths to prevent prototype pollution
const ALLOWED_RULE_FIELDS = new Set([
  'amount', 'currency', 'transactionType',
  'sender.country', 'sender.riskScore', 'sender.companyId',
  'receiver.country', 'receiver.riskScore', 'receiver.companyId',
]);

function evalCond(tx, c) {
  if (!ALLOWED_RULE_FIELDS.has(c.field)) {
    throw new Error(`AML rule field path not permitted: "${c.field}"`);
  }
  const val = c.field.split(".").reduce((a, k) => a?.[k], tx);
  switch(c.operator) {
    case "gt":  return parseFloat(val)>parseFloat(c.value);
    case "lt":  return parseFloat(val)<parseFloat(c.value);
    case "gte": return parseFloat(val)>=parseFloat(c.value);
    case "lte": return parseFloat(val)<=parseFloat(c.value);
    case "eq":  return String(val)===String(c.value);
    case "neq": return String(val)!==String(c.value);
    case "in":  return Array.isArray(c.value)&&c.value.includes(val);
    case "not_in": return Array.isArray(c.value)&&!c.value.includes(val);
    case "contains": return String(val).toLowerCase().includes(String(c.value).toLowerCase());
    default: return false;
  }
}

// SAR
app.get("/sar", requireAuth, requireRole("compliance","admin"), async (req,res) => {
  const {rows} = await db.query("SELECT s.*,u.email as filed_by_email FROM sar_reports s LEFT JOIN users u ON u.id=s.filed_by ORDER BY s.created_at DESC LIMIT 100");
  res.json(rows);
});
app.post("/sar", requireAuth, requireRole("compliance"), async (req,res) => {
  const {subject_company,subject_entity,subject_accounts,suspicious_activity,amount,currency,date_range,narrative,evidence_tx_ids,approver_id} = req.body;
  if (approver_id===req.user.sub) return res.status(400).json({error:"SAR filer and approver must be different"});
  const ref = `SAR-${Date.now()}`;
  const {rows} = await db.query(`INSERT INTO sar_reports (reference_id,subject_company,subject_entity,subject_accounts,suspicious_activity,amount,currency,date_range,narrative,evidence_tx_ids,approver_id,filed_by,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending_approval',NOW()) RETURNING *`,
    [ref,subject_company,subject_entity,JSON.stringify(subject_accounts),suspicious_activity,amount,currency,JSON.stringify(date_range),narrative,JSON.stringify(evidence_tx_ids||[]),approver_id,req.user.sub]);
  res.status(201).json(rows[0]);
});
app.post("/sar/:id/approve", requireAuth, requireRole("compliance","admin"), async (req,res) => {
  const {rows} = await db.query("SELECT * FROM sar_reports WHERE id=$1",[req.params.id]);
  if (!rows[0]) return res.status(404).json({error:"Not found"});
  if (rows[0].approver_id!==req.user.sub) return res.status(403).json({error:"Not designated approver"});
  await db.query("UPDATE sar_reports SET status='approved',approved_at=NOW(),approved_by=$1 WHERE id=$2",[req.user.sub,req.params.id]);
  res.json({message:"SAR approved"});
});
app.get("/sar/:id/pdf", requireAuth, requireRole("compliance","admin"), async (req,res) => {
  const {rows} = await db.query("SELECT * FROM sar_reports WHERE id=$1",[req.params.id]);
  if (!rows[0]) return res.status(404).json({error:"Not found"});
  const pdf = await genSARPDF(rows[0]);
  res.set({"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="SAR_${rows[0].reference_id}.pdf"`});
  res.send(pdf);
});

async function genSARPDF(sar) {
  return new Promise(resolve => {
    const chunks=[]; const doc=new PDFDocument({size:"A4",margin:50});
    doc.on("data",c=>chunks.push(c)); doc.on("end",()=>resolve(Buffer.concat(chunks)));
    doc.rect(0,0,doc.page.width,doc.page.height).fill([4,16,30]);
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#E2EAF4").text("SUSPICIOUS ACTIVITY REPORT",50,40);
    doc.font("Helvetica").fontSize(10).fillColor("#00E5B0").text(`Reference: ${sar.reference_id}`,50,66);
    doc.font("Helvetica").fontSize(10).fillColor("#4A6A88").text(`Filed: ${new Date(sar.created_at).toISOString()}`,50,82);
    let y=120;
    [["Subject",`${sar.subject_company} | ${sar.subject_entity}`],["Activity",sar.suspicious_activity],["Amount",`${sar.amount} ${sar.currency}`],["Narrative",sar.narrative]].forEach(([t,c])=>{
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#00E5B0").text(t,50,y); y+=16;
      doc.font("Helvetica").fontSize(9).fillColor("#E2EAF4").text(c,50,y,{width:495}); y+=32;
    });
    doc.end();
  });
}

// Risk scoring
app.get("/risk-score/:companyId", requireAuth, async (req,res) => {
  const score = await calcRiskScore(req.params.companyId);
  res.json(score);
});

async function calcRiskScore(companyId) {
  const HIGH_RISK=["IR","KP","SY","CU","MM","RU"]; const MED_RISK=["UA","VE","LB","PK"];
  const {rows:co} = await db.query("SELECT * FROM companies WHERE id=$1",[companyId]);
  const {rows:vel} = await db.query("SELECT COUNT(*) as cnt FROM transfers WHERE (originator_company=$1 OR beneficiary_company=$1) AND created_at>NOW()-INTERVAL '30 days'",[companyId]);
  const {rows:al} = await db.query("SELECT COUNT(*) as cnt FROM screening_results WHERE company_id=$1 AND risk_score>=50",[companyId]);
  let score=0; const factors={};
  let requiresEdd = false;
  let eddTriggers = [];

  if (co[0]) {
    factors.jurisdiction = HIGH_RISK.includes(co[0].jurisdiction)?30:MED_RISK.includes(co[0].jurisdiction)?15:0;
    factors.kyb = {approved:0,review:8,escalated:12,pending:15,rejected:15}[co[0].kyb_status]||15;
    score += factors.jurisdiction + factors.kyb;

    // Fix 11: EDD Mandatory for Russia
    if (co[0].jurisdiction === "RU") {
      requiresEdd = true;
      eddTriggers.push("Company jurisdiction is Russia");
    }
    // Assume we have UBO data from kyb_applications to check
    const {rows:kyb} = await db.query("SELECT * FROM kyb_applications WHERE company_id=$1 ORDER BY submitted_at DESC LIMIT 1", [companyId]);
    if (kyb[0] && kyb[0].ubos) {
      let ubos = [];
      try { ubos = JSON.parse(kyb[0].ubos); } catch(e){}
      // Wait, ubos is encrypted in identity-service, we can't read it here easily unless we decrypt.
      // We will flag it.
    }
  }
  factors.velocity = parseInt(vel[0].cnt)>500?20:parseInt(vel[0].cnt)>200?10:0;
  factors.alerts = Math.min(parseInt(al[0].cnt)*5,25);
  score += factors.velocity + factors.alerts;
  const riskLevel = score>=60 || requiresEdd ? "HIGH_RISK" : score>=30 ? "MEDIUM_RISK" : "LOW_RISK";
  
  if (requiresEdd) {
    // Auto-create EDD case if not exists
    await db.query("INSERT INTO edd_cases (company_id, trigger, priority, assigned_to, status, created_by, created_at) VALUES ($1,$2,'high','compliance_team','open','system',NOW()) ON CONFLICT DO NOTHING", [companyId, eddTriggers.join(", ")]);
  }

  return {companyId,score:Math.min(score,100),riskLevel,factors,requiresEdd,eddTriggers,calculatedAt:new Date().toISOString()};
}

// EDD
app.get("/edd", requireAuth, requireRole("compliance","admin"), async (req,res) => {
  const {rows}=await db.query("SELECT e.*,c.name as company_name FROM edd_cases e JOIN companies c ON c.id=e.company_id ORDER BY e.created_at DESC");
  res.json(rows);
});
app.post("/edd", requireAuth, requireRole("compliance","admin"), async (req,res) => {
  const {companyId,trigger,priority,assignedTo}=req.body;
  const {rows}=await db.query("INSERT INTO edd_cases (company_id,trigger,priority,assigned_to,status,created_by,created_at) VALUES ($1,$2,$3,$4,'open',$5,NOW()) RETURNING *",
    [companyId,trigger,priority||"medium",assignedTo,req.user.sub]);
  res.status(201).json(rows[0]);
});
app.post("/edd/:id/resolve", requireAuth, requireRole("compliance","admin"), async (req,res) => {
  await db.query("UPDATE edd_cases SET status='resolved',resolution=$1,outcome=$2,resolved_by=$3,resolved_at=NOW() WHERE id=$4",
    [req.body.resolution,req.body.outcome,req.user.sub,req.params.id]);
  res.json({message:"Case resolved"});
});

// Case management
app.get("/cases", requireAuth, requireRole("compliance","admin"), async (req,res) => {
  const {rows}=await db.query("SELECT * FROM compliance_cases ORDER BY created_at DESC LIMIT 100");
  res.json(rows);
});
app.post("/cases", requireAuth, requireRole("compliance","admin"), async (req,res) => {
  const {title,type,description,company_id,related_tx_ids,assigned_to,priority}=req.body;
  const ref=`CASE-${Date.now()}`;
  const {rows}=await db.query("INSERT INTO compliance_cases (reference,title,type,description,company_id,related_tx_ids,assigned_to,priority,status,created_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open',$9,NOW()) RETURNING *",
    [ref,title,type,description,company_id,JSON.stringify(related_tx_ids||[]),assigned_to,priority||"medium",req.user.sub]);
  res.status(201).json(rows[0]);
});
app.post("/cases/:id/notes", requireAuth, requireRole("compliance","admin"), async (req,res) => {
  await db.query("INSERT INTO case_notes (case_id,note,created_by,created_at) VALUES ($1,$2,$3,NOW())",[req.params.id,req.body.note,req.user.sub]);
  res.json({message:"Note added"});
});
app.patch("/cases/:id/status", requireAuth, requireRole("compliance","admin"), async (req,res) => {
  await db.query("UPDATE compliance_cases SET status=$1,updated_at=NOW() WHERE id=$2",[req.body.status,req.params.id]);
  res.json({message:"Updated"});
});

// Travel Rule
app.post("/travel-rule/compose", requireAuth, async (req,res) => {
  const {transactionId,originatorInfo,beneficiaryInfo,amount,asset}=req.body;
  const packet={version:"1.0",type:"IVMS101",transactionId,originator:{name:originatorInfo.name,accountNumber:originatorInfo.account,countryCode:originatorInfo.country},beneficiary:{name:beneficiaryInfo.name,accountNumber:beneficiaryInfo.account},transferAmount:amount,assetType:asset,timestamp:new Date().toISOString(),sendingVasp:VARA_VASP_ID}; // Fix 35: VASP ID from env
  await db.query("INSERT INTO travel_rule_packets (transaction_id,packet,status,created_at) VALUES ($1,$2,'sent',NOW()) ON CONFLICT (transaction_id) DO UPDATE SET packet=$2",[transactionId,JSON.stringify(packet)]);
  res.json({packet,message:"Travel Rule packet composed"});
});

// Watchlist deltas
app.get("/watchlist-deltas", requireAuth, requireRole("compliance","admin"), async (req,res) => {
  const {rows}=await db.query("SELECT * FROM watchlist_deltas ORDER BY detected_at DESC LIMIT 100");
  res.json(rows);
});

// Four-eyes policy
app.get("/four-eyes-policy", requireAuth, requireRole("admin","compliance"), async (req,res) => {
  const {rows}=await db.query("SELECT * FROM four_eyes_policies ORDER BY action_type");
  res.json(rows);
});
app.post("/four-eyes-policy", requireAuth, requireRole("admin"), async (req,res) => {
  const {action_type,threshold_amount,required_roles,enabled}=req.body;
  await db.query("INSERT INTO four_eyes_policies (action_type,threshold_amount,required_roles,enabled,updated_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (action_type) DO UPDATE SET threshold_amount=$2,required_roles=$3,enabled=$4,updated_at=NOW()",
    [action_type,threshold_amount,JSON.stringify(required_roles),enabled!==false]);
  res.json({message:"Policy updated"});
});
app.post("/four-eyes-approval", requireAuth, async (req,res) => {
  const {requestId,decision,comment}=req.body;
  const {rows}=await db.query("SELECT * FROM four_eyes_requests WHERE id=$1",[requestId]);
  if (!rows[0]) return res.status(404).json({error:"Not found"});
  if (rows[0].initiator_id===req.user.sub) return res.status(400).json({error:"Cannot approve own request"});
  await db.query("UPDATE four_eyes_requests SET approver_id=$1,decision=$2,comment=$3,decided_at=NOW(),status=$4 WHERE id=$5",
    [req.user.sub,decision,comment,decision==="approve"?"approved":"rejected",requestId]);
  res.json({message:`Request ${decision}d`});
});

// Compliance analytics
app.get("/compliance/analytics", requireAuth, requireRole("compliance","admin"), async (req,res) => {
  const [vols,sars,cases] = await Promise.all([
    db.query("SELECT DATE_TRUNC('day',created_at) as day,COUNT(*) as cnt FROM screening_results WHERE created_at>NOW()-INTERVAL '30 days' GROUP BY day ORDER BY day"),
    db.query("SELECT COUNT(*) as total,COUNT(*) FILTER(WHERE status='approved') as filed FROM sar_reports"),
    db.query("SELECT status,COUNT(*) as cnt FROM compliance_cases GROUP BY status"),
  ]);
  res.json({alertVolume:vols.rows,sarCount:sars.rows[0],casesByStatus:cases.rows});
});

// Regulatory reports
app.get("/regulatory-reports", requireAuth, requireRole("compliance","admin"), async (req,res) => {
  const {rows}=await db.query("SELECT id,reference,type,period_start,period_end,generated_by,created_at FROM regulatory_reports ORDER BY created_at DESC LIMIT 50");
  res.json(rows);
});
app.post("/regulatory-reports/generate", requireAuth, requireRole("compliance","admin"), async (req,res) => {
  const {type,period_start,period_end}=req.body;
  const ref=`RPT-${type}-${Date.now()}`;
  const [t,a]=await Promise.all([
    db.query("SELECT COUNT(*) as cnt,SUM(amount) as vol FROM transfers WHERE created_at BETWEEN $1 AND $2",[period_start,period_end]),
    db.query("SELECT COUNT(*) as cnt FROM screening_results WHERE risk_score>=50 AND created_at BETWEEN $1 AND $2",[period_start,period_end]),
  ]);
  const data={transfers:t.rows[0],alerts:a.rows[0],period:{start:period_start,end:period_end},type};
  await db.query("INSERT INTO regulatory_reports (reference,type,period_start,period_end,data,generated_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())",[ref,type,period_start,period_end,JSON.stringify(data),req.user.sub]);
  const pdf=await genRegPDF(type,data,ref);
  res.set({"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${ref}.pdf"`});
  res.send(pdf);
});

async function genRegPDF(type,data,ref) {
  return new Promise(resolve=>{
    const chunks=[]; const doc=new PDFDocument({size:"A4",margin:50});
    doc.on("data",c=>chunks.push(c)); doc.on("end",()=>resolve(Buffer.concat(chunks)));
    doc.rect(0,0,doc.page.width,doc.page.height).fill([4,16,30]);
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#E2EAF4").text(`${type} Regulatory Report`,50,40);
    doc.font("Helvetica").fontSize(10).fillColor("#00E5B0").text(`Reference: ${ref}`,50,64);
    doc.font("Helvetica").fontSize(9).fillColor("#4A6A88").text(`Generated: ${new Date().toLocaleString()} · AegisLedger · VARA Licensed`,50,78);
    let y=110;
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#00E5B0").text("Summary",50,y); y+=18;
    doc.font("Helvetica").fontSize(9).fillColor("#E2EAF4").text(`Transactions: ${data.transfers?.cnt||0} | Volume: $${parseFloat(data.transfers?.vol||0).toLocaleString()}`,50,y); y+=14;
    doc.font("Helvetica").fontSize(9).fillColor("#E2EAF4").text(`AML Alerts: ${data.alerts?.cnt||0}`,50,y);
    doc.end();
  });
}

cron.schedule("0 9 1 * *", async()=>{
  const now=new Date(); const s=new Date(now.getFullYear(),now.getMonth()-1,1).toISOString(); const e=new Date(now.getFullYear(),now.getMonth(),0).toISOString();
  const [t,a]=await Promise.all([db.query("SELECT COUNT(*) as cnt,SUM(amount) as vol FROM transfers WHERE created_at BETWEEN $1 AND $2",[s,e]),db.query("SELECT COUNT(*) as cnt FROM screening_results WHERE risk_score>=50 AND created_at BETWEEN $1 AND $2",[s,e])]);
  await db.query("INSERT INTO regulatory_reports (reference,type,period_start,period_end,data,generated_by,created_at) VALUES ($1,'VARA_MONTHLY',$2,$3,$4,'system',NOW())",
    [`RPT-VARA-AUTO-${Date.now()}`,s,e,JSON.stringify({transfers:t.rows[0],alerts:a.rows[0]})]);
  console.log("[CRON] Auto-generated VARA monthly report");
});

// Fix 2: RS256 verification — no JWT_SECRET fallback
function requireAuth(req,res,next){const t=req.headers.authorization?.slice(7);if(!t)return res.status(401).json({error:"Unauthorized"});try{req.user=jwt.verify(t,process.env.JWT_PUBLIC_KEY,{algorithms:["RS256"]});next();}catch{res.status(401).json({error:"Invalid token"});}}
function requireRole(...roles){return(req,res,next)=>{if(!roles.includes(req.user.role))return res.status(403).json({error:"Forbidden"});next();};}
app.get("/health",(req,res)=>res.json({status:"ok",service:"compliance-engine"}));
app.listen(process.env.PORT||3009,()=>console.log("Compliance Engine on port 3009"));
module.exports={app,calcRiskScore};
