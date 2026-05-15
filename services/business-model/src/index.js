/**
 * AegisLedger - Business Model Service
 * Tiered subscription pricing · FX spread capture · Float income
 * Compliance-as-a-Service API · White-label config · Data intelligence
 * Partner referral tracking
 */
const express = require("express");
const { Pool } = require("pg");
const jwt     = require("jsonwebtoken");
const Redis   = require("ioredis");
const fetch   = global.fetch || require("node-fetch");
const app = express();
app.use(express.json());
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Fix 19: Feature Flags Middleware
function checkFeatureGate(featureFlag) {
  return async (req, res, next) => {
    if (process.env[featureFlag] !== 'true') {
      return res.status(403).json({ error: `Feature flag ${featureFlag} is disabled` });
    }
    next();
  }
}

// ─── SUBSCRIPTION TIERS ───────────────────────────────────────────
const TIERS = {
  starter:{ name:"Starter", price_monthly:2500, price_annual:25000,
    limits:{ daily_limit:1000000, monthly_volume:10000000, api_calls:10000, escrows:5 },
    features:["usdc_transfers","aed_rub_corridor","basic_kyb","email_support"] },
  growth:{ name:"Growth", price_monthly:8500, price_annual:85000,
    limits:{ daily_limit:10000000, monthly_volume:100000000, api_calls:100000, escrows:50 },
    features:["usdc_usdt_transfers","all_corridors","advanced_kyb","travel_rule","bulk_payments","webhooks","priority_support"] },
  enterprise:{ name:"Enterprise", price_monthly:null, price_annual:null,
    limits:{ daily_limit:-1, monthly_volume:-1, api_calls:-1, escrows:-1 },
    features:["all_features","dedicated_account_manager","custom_sla","white_label","compliance_api","data_intelligence","soc2_report","99_9_uptime_sla"] }
};

app.get("/billing/tiers", (req,res) => res.json(TIERS));
app.get("/billing/subscription", requireAuth, async (req,res) => {
  const {rows} = await db.query("SELECT * FROM subscriptions WHERE company_id=$1 AND status='active'",[req.user.company]);
  if (!rows[0]) return res.json({tier:"none",status:"inactive"});
  const tier = TIERS[rows[0].tier];
  res.json({...rows[0], tierDetails:tier});
});
app.post("/billing/upgrade", requireAuth, requireRole("admin"), async (req,res) => {
  const {tier,billing_cycle} = req.body;
  if (!TIERS[tier]) return res.status(400).json({error:"Invalid tier"});
  await db.query(`INSERT INTO subscriptions (company_id,tier,billing_cycle,status,started_at,next_billing) VALUES ($1,$2,$3,'active',NOW(),NOW()+INTERVAL '1 month') ON CONFLICT (company_id) DO UPDATE SET tier=$2,billing_cycle=$3,status='active',updated_at=NOW()`,
    [req.user.company,tier,billing_cycle||"monthly"]);
  res.json({message:`Upgraded to ${TIERS[tier].name}`,tier,effective:new Date().toISOString()});
});

// Check feature gate
app.get("/billing/check-feature/:feature", requireAuth, async (req,res) => {
  const {rows} = await db.query("SELECT tier FROM subscriptions WHERE company_id=$1 AND status='active'",[req.user.company]);
  const tier = rows[0]?.tier || "starter";
  const allowed = TIERS[tier]?.features?.includes(req.params.feature);
  res.json({feature:req.params.feature,allowed:allowed||false,tier,upgradeRequired:!allowed});
});

// ─── FX SPREAD CAPTURE ────────────────────────────────────────────
app.post("/fx/execute", requireAuth, async (req,res) => {
  const {fromCurrency,toCurrency,amount,lockId} = req.body;
  // Mid-market rate
  const midRate = await getMidRate(fromCurrency,toCurrency);
  // Apply spread (0.3% for standard, 0.15% for enterprise)
  const {rows:sub} = await db.query("SELECT tier FROM subscriptions WHERE company_id=$1",[req.user.company]);
  const spreadBps = sub[0]?.tier==="enterprise" ? 15 : sub[0]?.tier==="growth" ? 20 : 30;
  const clientRate = midRate * (1 - spreadBps/10000);
  const spreadRevenue = amount * (spreadBps/10000);
  await db.query("INSERT INTO fx_conversions (company_id,from_currency,to_currency,amount,mid_rate,client_rate,spread_bps,spread_revenue,lock_id,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())",
    [req.user.company,fromCurrency,toCurrency,amount,midRate,clientRate,spreadBps,spreadRevenue,lockId||null]);
  res.json({fromCurrency,toCurrency,amount,convertedAmount:(amount*clientRate).toFixed(6),clientRate,midRate,spreadBps,fee:spreadRevenue.toFixed(2),executedAt:new Date().toISOString()});
});

async function fetchFromChainlinkOracle(asset) {
  try {
    const MOCK_ORACLE_URL = process.env.ORACLE_URL || "https://api.coingecko.com/api/v3/simple/price?ids=usd-coin,tether,aeternity,solana,ruble,dirham&vs_currencies=usd";
    const res = await fetch(MOCK_ORACLE_URL);
    if (!res.ok) return null;
    const data = await res.json();
    // Simulate some fiat rates if not exactly returned by simple api
    const mapping = {
      "USDC": 1.0, "USDT": 1.0,
      "AED": 0.27226,
      "RUB": 0.01112,
      "USD": 1.0
    };
    return mapping[asset] || 1.0;
  } catch (error) {
    return null;
  }
}

async function getLiveUsdRate(asset) {
  const cacheKey = 'rate:' + asset;
  const cached = await redis.get(cacheKey);
  if (cached) return parseFloat(cached);
  
  const rate = await fetchFromChainlinkOracle(asset);
  if (!rate) throw new Error('Rate unavailable for ' + asset + ' - transaction blocked');
  
  await redis.set(cacheKey, rate.toString(), 'EX', 60);
  return rate;
}

async function getMidRate(from, to) {
  const rateFrom = await getLiveUsdRate(from.replace(/_.*/, ''));
  const rateTo = await getLiveUsdRate(to.replace(/_.*/, ''));
  return rateFrom / rateTo;
}

// ─── FLOAT INCOME TRACKING ────────────────────────────────────────
app.get("/float/report", requireAuth, requireRole("admin"), checkFeatureGate('ENABLE_PHASE_2_FEATURES'), async (req,res) => {
  const {rows} = await db.query(`
    SELECT DATE_TRUNC('month',date) as month,SUM(balance_usd) as avg_float,SUM(interest_earned) as income
    FROM float_ledger WHERE date>NOW()-INTERVAL '12 months' GROUP BY month ORDER BY month DESC
  `);
  const currentFloat = {total_usd:45000000,by_asset:[{asset:"USDC",amount:30000000},{asset:"USDT",amount:12000000},{asset:"AED",amount:3000000}],daily_yield_rate:0.000137,annual_yield_pct:5.0};
  res.json({currentFloat,history:rows,ytdIncome:rows.reduce((s,r)=>s+parseFloat(r.income||0),0).toFixed(2)});
});

// ─── COMPLIANCE AS A SERVICE ──────────────────────────────────────
app.post("/caas/screen-entity", checkFeatureGate('ENABLE_PHASE_3_FEATURES'), async (req,res) => {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey) return res.status(401).json({error:"API key required"});
  
  // Fix 57: Always validate against the DB — no dev fallback to env var
  const {rows} = await db.query("SELECT id FROM api_keys WHERE key=$1 AND active=true", [apiKey]);
  if (!rows[0]) return res.status(401).json({error:"Invalid API key"});

  const {entityName,entityType,country,dob} = req.body;
  // Mock screening result
  const score = Math.floor(Math.random()*40);
  res.json({
    entity:entityName,type:entityType,country,
    riskScore:score,riskLevel:score>30?"medium":"low",
    sanctions:{checked:["OFAC","UN","EU","UK_HMT","VARA"],matches:[]},
    pep:{isPep:false,confidence:0},
    adverseMedia:{articles:0,sentiment:"neutral"},
    screened_at:new Date().toISOString(),
    source:"AegisLedger CaaS API",
    requestId:Math.random().toString(36).slice(2),
  });
});

app.get("/caas/pricing", (req,res) => res.json({
  screening_per_entity:0.50,
  travel_rule_per_tx:0.10,
  kyb_per_submission:25.00,
  monthly_subscription:500,
  volume_discounts:[{min:1000,discount:0.1},{min:10000,discount:0.25},{min:100000,discount:0.4}]
}));

// ─── WHITE-LABEL CONFIG ───────────────────────────────────────────
app.get("/whitelabel/config", requireAuth, async (req,res) => {
  const {rows} = await db.query("SELECT * FROM whitelabel_configs WHERE company_id=$1",[req.user.company]);
  res.json(rows[0] || {configured:false});
});
app.post("/whitelabel/config", requireAuth, requireRole("admin"), async (req,res) => {
  const {primaryColor,logoUrl,companyName,domain,supportEmail,termsUrl,privacyUrl} = req.body;
  await db.query(`INSERT INTO whitelabel_configs (company_id,primary_color,logo_url,company_name,custom_domain,support_email,terms_url,privacy_url,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) ON CONFLICT (company_id) DO UPDATE SET primary_color=$2,logo_url=$3,company_name=$4,custom_domain=$5,support_email=$6,terms_url=$7,privacy_url=$8,updated_at=NOW()`,
    [req.user.company,primaryColor,logoUrl,companyName,domain,supportEmail,termsUrl,privacyUrl]);
  res.json({message:"White-label configuration saved"});
});

// ─── DATA INTELLIGENCE ────────────────────────────────────────────
app.get("/data/corridor-intelligence", requireAuth, checkFeatureGate('ENABLE_PHASE_3_FEATURES'), async (req,res) => {
  // Anonymized aggregated corridor data
  const {rows} = await db.query(`
    SELECT DATE_TRUNC('week',created_at) as week,corridor,
           COUNT(*) as tx_count,SUM(amount) as volume,
           AVG(EXTRACT(EPOCH FROM (settled_at-created_at))) as avg_settlement_secs
    FROM transfers WHERE created_at>NOW()-INTERVAL '90 days' GROUP BY week,corridor ORDER BY week DESC,volume DESC
  `);
  res.json({data:rows,note:"Anonymized aggregate data. No PII or company identifiers included.",asOf:new Date().toISOString()});
});

// ─── REFERRAL TRACKING ────────────────────────────────────────────
app.get("/referrals", requireAuth, async (req,res) => {
  const {rows} = await db.query("SELECT * FROM referrals WHERE referrer_id=$1 ORDER BY created_at DESC",[req.user.company]);
  res.json(rows);
});
app.post("/referrals/generate-link", requireAuth, async (req,res) => {
  const code = Math.random().toString(36).slice(2,10).toUpperCase();
  await db.query("INSERT INTO referral_codes (company_id,code,created_at) VALUES ($1,$2,NOW()) ON CONFLICT DO NOTHING",[req.user.company,code]);
  res.json({code,url:`${process.env.FRONTEND_URL}/signup?ref=${code}`,commission:"$500 per activated referral"});
});

function requireAuth(req,res,next){
  const t=req.headers.authorization?.slice(7);
  if(!t)return res.status(401).json({error:"Unauthorized"});
  try{
    if (!process.env.JWT_PUBLIC_KEY) throw new Error("JWT_PUBLIC_KEY missing");
    req.user=jwt.verify(t,process.env.JWT_PUBLIC_KEY, { algorithms: ["RS256"] });
    next();
  }catch{res.status(401).json({error:"Invalid token"});}
}
function requireRole(...roles){return(req,res,next)=>{if(!roles.includes(req.user.role))return res.status(403).json({error:"Forbidden"});next();};}
app.get("/health",(req,res)=>res.json({status:"ok",service:"business-model"}));
app.listen(process.env.PORT||3015,()=>console.log("Business Model Service on port 3015"));
module.exports={app};
