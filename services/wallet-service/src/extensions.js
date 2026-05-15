/**
 * Wallet Service Extensions
 * Address book · Balance alerts · Sweep rules · Portfolio allocation
 * Yield panel · Hot/warm/cold tiering · Multi-chain · Health score
 * Staking rewards · Cash flow forecast integration
 */
const { Pool } = require("pg");
const db = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = function registerWalletExtensions(app, requireAuth, requireRole) {

  // Address book
  app.get("/address-book", requireAuth, async (req,res) => {
    const {rows} = await db.query("SELECT * FROM address_book WHERE company_id=$1 ORDER BY name",[req.user.company]);
    res.json(rows);
  });
  app.post("/address-book", requireAuth, requireRole("admin","treasury"), async (req,res) => {
    const {name,address,network,companyId,tags} = req.body;
    const {rows} = await db.query("INSERT INTO address_book (company_id,name,address,network,beneficiary_company_id,tags,created_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *",
      [req.user.company,name,address,network,companyId||null,JSON.stringify(tags||[]),req.user.sub]);
    res.status(201).json(rows[0]);
  });
  app.delete("/address-book/:id", requireAuth, requireRole("admin","treasury"), async (req,res) => {
    await db.query("DELETE FROM address_book WHERE id=$1 AND company_id=$2",[req.params.id,req.user.company]);
    res.json({message:"Address removed"});
  });

  // Balance alerts
  app.get("/balance-alerts", requireAuth, async (req,res) => {
    const {rows} = await db.query("SELECT * FROM balance_alerts WHERE company_id=$1",[req.user.company]);
    res.json(rows);
  });
  app.post("/balance-alerts", requireAuth, requireRole("admin","treasury"), async (req,res) => {
    const {walletId,asset,alertType,threshold,notifyEmails} = req.body;
    const {rows} = await db.query("INSERT INTO balance_alerts (company_id,wallet_id,asset,alert_type,threshold,notify_emails,enabled,created_at) VALUES ($1,$2,$3,$4,$5,$6,true,NOW()) RETURNING *",
      [req.user.company,walletId,asset,alertType,threshold,JSON.stringify(notifyEmails||[])]);
    res.status(201).json(rows[0]);
  });

  // Sweep rules
  app.get("/sweep-rules", requireAuth, async (req,res) => {
    const {rows} = await db.query("SELECT * FROM sweep_rules WHERE company_id=$1",[req.user.company]);
    res.json(rows);
  });
  app.post("/sweep-rules", requireAuth, requireRole("admin","treasury"), async (req,res) => {
    const {sourceWalletId,targetWalletId,asset,thresholdAmount,keepBalance,enabled} = req.body;
    const {rows} = await db.query("INSERT INTO sweep_rules (company_id,source_wallet_id,target_wallet_id,asset,threshold_amount,keep_balance,enabled,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *",
      [req.user.company,sourceWalletId,targetWalletId,asset,thresholdAmount,keepBalance||0,enabled!==false]);
    res.status(201).json(rows[0]);
  });

  // Wallet health score
  app.get("/wallet-health", requireAuth, async (req,res) => {
    const {rows:wallets} = await db.query("SELECT * FROM wallets WHERE company_id=$1",[req.user.company]);
    const {rows:transfers} = await db.query("SELECT beneficiary_company,SUM(amount) as exposure FROM transfers WHERE originator_company=$1 AND created_at>NOW()-INTERVAL '30 days' GROUP BY beneficiary_company ORDER BY exposure DESC LIMIT 5",[req.user.company]);
    const totalBalance = wallets.reduce((s,w)=>s+parseFloat(w.balance_usd||0),0);
    const chainDiversity = new Set(wallets.map(w=>w.network)).size;
    const maxSingleCounterparty = parseFloat(transfers[0]?.exposure||0);
    const concentrationRisk = totalBalance>0 ? (maxSingleCounterparty/totalBalance*100).toFixed(1) : 0;
    const score = Math.max(0,100 - (concentrationRisk>50?30:concentrationRisk>25?15:0) - (chainDiversity<2?20:chainDiversity<3?10:0));
    res.json({score:Math.round(score),rating:score>=80?"healthy":score>=60?"fair":"at-risk",factors:{chainDiversity,concentrationRisk:parseFloat(concentrationRisk),walletCount:wallets.length},topCounterparties:transfers,calculatedAt:new Date().toISOString()});
  });

  // Hot/warm/cold tiering
  app.get("/wallet-tiers", requireAuth, async (req,res) => {
    const {rows} = await db.query("SELECT * FROM wallet_tier_configs WHERE company_id=$1",[req.user.company]);
    res.json(rows[0] || {hot_pct:20,warm_pct:30,cold_pct:50});
  });
  app.post("/wallet-tiers", requireAuth, requireRole("admin","treasury"), async (req,res) => {
    const {hot_pct,warm_pct,cold_pct} = req.body;
    if (hot_pct+warm_pct+cold_pct !== 100) return res.status(400).json({error:"Percentages must sum to 100"});
    await db.query("INSERT INTO wallet_tier_configs (company_id,hot_pct,warm_pct,cold_pct,updated_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (company_id) DO UPDATE SET hot_pct=$2,warm_pct=$3,cold_pct=$4,updated_at=NOW()",
      [req.user.company,hot_pct,warm_pct,cold_pct]);
    res.json({message:"Tier allocation updated"});
  });

  // Yield opportunities
  app.get("/yield-opportunities", requireAuth, async (req,res) => {
    res.json([
      {protocol:"Aave V3",asset:"USDC",network:"polygon",apy:4.82,risk:"low",tvl:1200000000,audited:true,link:"https://aave.com"},
      {protocol:"Compound V3",asset:"USDC",network:"ethereum",apy:3.91,risk:"low",tvl:890000000,audited:true,link:"https://compound.finance"},
      {protocol:"Curve Finance",asset:"USDC/USDT",network:"polygon",apy:5.14,risk:"low-medium",tvl:450000000,audited:true,link:"https://curve.fi"},
      {protocol:"Morpho Blue",asset:"USDC",network:"ethereum",apy:6.20,risk:"medium",tvl:320000000,audited:true,link:"https://morpho.org"},
      {protocol:"ADX Staking",asset:"AE_COIN",network:"adx",apy:8.50,risk:"medium",tvl:180000000,audited:true,link:"https://adx.ae"},
    ]);
  });

  // Staking rewards tracker
  app.get("/staking-rewards", requireAuth, async (req,res) => {
    const {rows} = await db.query("SELECT * FROM staking_positions WHERE company_id=$1 ORDER BY created_at DESC",[req.user.company]);
    res.json({positions:rows,totalRewardsEarned:rows.reduce((s,p)=>s+parseFloat(p.rewards_earned||0),0).toFixed(6)});
  });
};
