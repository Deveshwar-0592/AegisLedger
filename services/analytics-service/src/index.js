/**
 * AegisLedger - Analytics Service
 * Customizable dashboards · Transaction drill-down · P&L by corridor
 * Regulatory reporting center · Custom report builder · Geo heatmap
 * Counterparty exposure · Settlement latency benchmarking · Fee revenue MRR
 */

// Fix 2: Crash-fast if JWT_PUBLIC_KEY is missing — no dev_secret fallback allowed
if (!process.env.JWT_PUBLIC_KEY) {
  console.error('FATAL: JWT_PUBLIC_KEY environment variable is not set.');
  process.exit(1);
}

const express   = require("express");
const { Pool }  = require("pg");
const jwt       = require("jsonwebtoken");
const app = express();
app.use(express.json());
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Fix 45: Dashboard config scoped to user_id — no IDOR possible (user can only read/write their own config)
app.get("/dashboard-config", requireAuth, async (req,res) => {
  const {rows} = await db.query("SELECT config FROM dashboard_configs WHERE user_id=$1", [req.user.sub]);
  res.json(rows[0]?.config || getDefaultDashboardConfig());
});
app.post("/dashboard-config", requireAuth, async (req,res) => {
  await db.query(`INSERT INTO dashboard_configs (user_id,config,updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (user_id) DO UPDATE SET config=$2,updated_at=NOW()`,
    [req.user.sub, JSON.stringify(req.body.config)]);
  res.json({ message: "Dashboard config saved" });
});

function getDefaultDashboardConfig() {
  return { widgets: [
    { id:"volume_chart", type:"line_chart", title:"Settlement Volume", position:{x:0,y:0,w:8,h:4} },
    { id:"tx_count", type:"stat_card", title:"Transactions Today", position:{x:8,y:0,w:2,h:2} },
    { id:"active_escrows", type:"stat_card", title:"Active Escrows", position:{x:10,y:0,w:2,h:2} },
    { id:"corridor_heatmap", type:"geo_heatmap", title:"Transaction Origins", position:{x:0,y:4,w:6,h:4} },
    { id:"top_counterparties", type:"bar_chart", title:"Top Counterparties", position:{x:6,y:4,w:6,h:4} },
    { id:"fee_revenue", type:"stat_card", title:"Fee Revenue (30d)", position:{x:8,y:2,w:4,h:2} },
    { id:"aml_alerts", type:"list", title:"Recent AML Alerts", position:{x:0,y:8,w:12,h:3} },
  ]};
}

// Fix 46: Transaction analytics drill-down — non-admin users can ONLY see their own company's data.
// The ?companyId query param is IGNORED for non-admin; admins may optionally filter by any company.
app.get("/analytics/transactions", requireAuth, async (req,res) => {
  const isAdmin = req.user.role === 'admin';
  const { asset, from, to, groupBy = "day" } = req.query;

  // Fix 46: Enforce company isolation. Admin can optionally filter; regular users are always scoped.
  const requestedCompanyId = isAdmin ? (req.query.companyId || null) : req.user.company;

  const conditions = []; const params = [];
  if (requestedCompanyId) {
    conditions.push(`(originator_company=$${params.push(requestedCompanyId)} OR beneficiary_company=$${params.length})`);
  }
  if (asset)    { conditions.push(`asset_key=$${params.push(asset)}`); }
  if (from)     { conditions.push(`created_at>=$${params.push(from)}`); }
  if (to)       { conditions.push(`created_at<=$${params.push(to)}`); }

  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const trunc = ["hour","day","week","month"].includes(groupBy) ? groupBy : "day";
  const {rows} = await db.query(`
    SELECT DATE_TRUNC('${trunc}',created_at) as period, COUNT(*) as count,
           SUM(amount) as volume, AVG(amount) as avg_amount,
           AVG(EXTRACT(EPOCH FROM (settled_at-created_at))) as avg_settlement_secs
    FROM transfers ${where} GROUP BY period ORDER BY period DESC LIMIT 200
  `, params);
  res.json(rows);
});

// Fix 46: P&L by corridor — non-admin restricted to their own company
app.get("/analytics/pnl", requireAuth, requireRole("admin","treasury"), async (req,res) => {
  const isAdmin = req.user.role === 'admin';
  const companyFilter = isAdmin ? '' : 'AND (originator_company=$1 OR beneficiary_company=$1)';
  const params = isAdmin ? [] : [req.user.company];
  const {rows} = await db.query(`
    SELECT corridor,
           COUNT(*) as transactions,
           SUM(amount) as gross_volume,
           SUM(platform_fee) as fee_revenue,
           SUM(fx_gain_loss) as fx_pnl,
           SUM(platform_fee) + SUM(COALESCE(fx_gain_loss,0)) as total_pnl
    FROM transfers WHERE settled_at IS NOT NULL ${companyFilter}
    GROUP BY corridor ORDER BY total_pnl DESC
  `, params);
  res.json(rows);
});

// Fix 46: Geo heatmap — non-admin restricted to their own company's outgoing transactions
app.get("/analytics/heatmap", requireAuth, async (req,res) => {
  const isAdmin = req.user.role === 'admin';
  const companyFilter = isAdmin ? '' : 'AND t.originator_company=$1';
  const params = isAdmin ? [] : [req.user.company];
  const {rows} = await db.query(`
    SELECT c.jurisdiction as country, COUNT(*) as tx_count, SUM(t.amount) as volume
    FROM transfers t JOIN companies c ON c.id=t.originator_company
    WHERE t.created_at > NOW()-INTERVAL '30 days' ${companyFilter}
    GROUP BY c.jurisdiction ORDER BY tx_count DESC LIMIT 50
  `, params);
  res.json(rows);
});

// Counterparty exposure report — already scoped to req.user.company correctly
app.get("/analytics/counterparty-exposure", requireAuth, requireRole("admin","treasury","compliance"), async (req,res) => {
  const {rows} = await db.query(`
    SELECT c.name as counterparty, c.jurisdiction,
           COUNT(*) as transactions,
           SUM(t.amount) as total_exposure,
           MAX(t.amount) as largest_single,
           MAX(t.created_at) as last_transaction,
           AVG(sr.risk_score) as avg_risk_score
    FROM transfers t
    JOIN companies c ON c.id = CASE WHEN t.originator_company=$1 THEN t.beneficiary_company ELSE t.originator_company END
    LEFT JOIN screening_results sr ON sr.company_id=c.id
    WHERE t.originator_company=$1 OR t.beneficiary_company=$1
    GROUP BY c.id,c.name,c.jurisdiction ORDER BY total_exposure DESC LIMIT 50
  `, [req.user.company]);
  res.json(rows);
});

// Settlement latency — already handles admin vs non-admin correctly
app.get("/analytics/latency", requireAuth, async (req,res) => {
  const isAdmin = req.user.role === 'admin';
  const {rows} = await db.query(`
    SELECT
      AVG(EXTRACT(EPOCH FROM (settled_at-created_at))) as avg_secs,
      MIN(EXTRACT(EPOCH FROM (settled_at-created_at))) as min_secs,
      MAX(EXTRACT(EPOCH FROM (settled_at-created_at))) as max_secs,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (settled_at-created_at))) as median_secs,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (settled_at-created_at))) as p95_secs,
      COUNT(*) as sample_size
    FROM transfers WHERE settled_at IS NOT NULL AND created_at > NOW()-INTERVAL '30 days'
    AND ($1::boolean OR originator_company=$2 OR beneficiary_company=$2)
  `, [isAdmin, req.user.company]);
  const swift_baseline = 172800;
  const result = rows[0];
  res.json({
    ...result,
    swift_baseline_secs: swift_baseline,
    improvement_factor: result.avg_secs > 0 ? (swift_baseline / parseFloat(result.avg_secs)).toFixed(1) : "N/A",
    platform: "AegisLedger",
    comparison: [
      { provider: "AegisLedger", avg_secs: parseFloat(result.avg_secs||18), label: "~18 seconds" },
      { provider: "SWIFT", avg_secs: 172800, label: "1-3 business days" },
      { provider: "Wire Transfer", avg_secs: 86400, label: "Same day (best case)" },
      { provider: "RippleNet", avg_secs: 30, label: "~30 seconds" },
    ]
  });
});

// Fee revenue and MRR — already handles admin vs non-admin correctly
app.get("/analytics/fee-revenue", requireAuth, requireRole("admin","treasury"), async (req,res) => {
  const isAdmin = req.user.role === 'admin';
  const [monthly, byType, topCompanies] = await Promise.all([
    db.query(`SELECT DATE_TRUNC('month',created_at) as month, SUM(platform_fee) as revenue, COUNT(*) as txns FROM transfers WHERE settled_at IS NOT NULL AND ($1::boolean OR originator_company=$2) GROUP BY month ORDER BY month DESC LIMIT 12`, [isAdmin, req.user.company]),
    db.query(`SELECT fee_type, SUM(amount) as total FROM fee_ledger WHERE ($1::boolean OR company_id=$2) GROUP BY fee_type`, [isAdmin, req.user.company]),
    isAdmin ? db.query(`SELECT c.name, SUM(t.platform_fee) as fees_paid FROM transfers t JOIN companies c ON c.id=t.originator_company GROUP BY c.id,c.name ORDER BY fees_paid DESC LIMIT 10`) : { rows: [] },
  ]);
  res.json({ monthly: monthly.rows, byType: byType.rows, topCompanies: topCompanies.rows });
});

// Custom report builder — already scoped to company_id correctly
app.get("/custom-reports", requireAuth, async (req,res) => {
  const {rows} = await db.query("SELECT id,name,description,created_at FROM custom_reports WHERE company_id=$1 ORDER BY created_at DESC", [req.user.company]);
  res.json(rows);
});
app.post("/custom-reports", requireAuth, requireRole("admin","compliance","treasury"), async (req,res) => {
  const {name,description,fields,filters,groupBy,orderBy,schedule} = req.body;
  const {rows} = await db.query(`INSERT INTO custom_reports (company_id,name,description,fields,filters,group_by,order_by,schedule,created_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING *`,
    [req.user.company,name,description,JSON.stringify(fields),JSON.stringify(filters||[]),groupBy,orderBy,schedule,req.user.sub]);
  res.status(201).json(rows[0]);
});
app.post("/custom-reports/:id/run", requireAuth, async (req,res) => {
  const {rows:report} = await db.query("SELECT * FROM custom_reports WHERE id=$1 AND company_id=$2",[req.params.id,req.user.company]);
  if (!report[0]) return res.status(404).json({error:"Report not found"});
  // Safe field whitelist to prevent SQL injection
  const ALLOWED_FIELDS = ["id","amount","corridor","asset_key","status","created_at","settled_at","platform_fee","originator_company","beneficiary_company"];
  const fields = JSON.parse(report[0].fields).filter(f=>ALLOWED_FIELDS.includes(f));
  if (!fields.length) return res.status(400).json({error:"No valid fields"});
  const {rows:data} = await db.query(`SELECT ${fields.join(",")} FROM transfers WHERE (originator_company=$1 OR beneficiary_company=$1) ORDER BY created_at DESC LIMIT 1000`, [req.user.company]);
  res.json({report:report[0].name,rows:data,count:data.length,executedAt:new Date().toISOString()});
});

// Fix 2: RS256 verification — no JWT_SECRET fallback
function requireAuth(req,res,next){const t=req.headers.authorization?.slice(7);if(!t)return res.status(401).json({error:"Unauthorized"});try{req.user=jwt.verify(t,process.env.JWT_PUBLIC_KEY,{algorithms:["RS256"]});next();}catch{res.status(401).json({error:"Invalid token"});}}
function requireRole(...roles){return(req,res,next)=>{if(!roles.includes(req.user.role))return res.status(403).json({error:"Forbidden"});next();};}
app.get("/health",(req,res)=>res.json({status:"ok",service:"analytics"}));
app.listen(process.env.PORT||3010,()=>console.log("Analytics Service on port 3010"));
module.exports={app};
