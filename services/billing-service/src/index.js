/**
 * AegisLedger - Billing & Monetisation Service
 * Features: Tiered subscription pricing, FX spread capture, float income,
 *           white-label config, data intelligence API, referral tracking
 */

const express   = require("express");
const { Pool }  = require("pg");
const { v4: uuidv4 } = require("uuid");
const jwt       = require("jsonwebtoken");
const helmet    = require("helmet");
const stripe    = process.env.STRIPE_SECRET_KEY ? require("stripe")(process.env.STRIPE_SECRET_KEY) : null;

const app = express();
app.use(express.json());
app.use(helmet());

const db   = new Pool({ connectionString: process.env.DATABASE_URL });
// Fix 17: undefined = PRODUCTION mode. Explicitly set MOCK_BILLING=true for local dev.
const MOCK = process.env.MOCK_BILLING === 'true';
console.log('[CONFIG] Integration modes:', { billing: MOCK ? 'MOCK' : 'PRODUCTION' });

const auth = (req, res, next) => {
  const token = req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try { req.user = jwt.verify(token, process.env.JWT_PUBLIC_KEY, { algorithms: ["RS256"] }); next(); }
  catch { res.status(401).json({ error: "Invalid token" }); }
};
const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: "Insufficient permissions" });

// ─── TIER DEFINITIONS ─────────────────────────────────────────────
const TIERS = {
  starter: {
    name: "Starter",
    monthlyFeeUsd: 0,
    txFeeRate: 0.0025,       // 0.25%
    dailyLimitUsd: 1_000_000,
    monthlyVolumeCapUsd: 10_000_000,
    features: ["basic_transfers","kyb","wallets","email_support"],
    makerCheckerThreshold: 100_000,
    apiRateLimit: 100,
    whiteLabelAllowed: false,
    dataApiAllowed: false,
    slaUptimePercent: 99.0,
  },
  growth: {
    name: "Growth",
    monthlyFeeUsd: 2500,
    txFeeRate: 0.0018,       // 0.18%
    dailyLimitUsd: 10_000_000,
    monthlyVolumeCapUsd: 100_000_000,
    features: ["basic_transfers","kyb","wallets","trade_finance","analytics","webhooks","slack","priority_support"],
    makerCheckerThreshold: 500_000,
    apiRateLimit: 1000,
    whiteLabelAllowed: false,
    dataApiAllowed: false,
    slaUptimePercent: 99.5,
  },
  enterprise: {
    name: "Enterprise",
    monthlyFeeUsd: 10000,
    txFeeRate: 0.0010,       // 0.10%
    dailyLimitUsd: 100_000_000,
    monthlyVolumeCapUsd: null,  // Unlimited
    features: ["all"],
    makerCheckerThreshold: 2_000_000,
    apiRateLimit: 10000,
    whiteLabelAllowed: true,
    dataApiAllowed: true,
    slaUptimePercent: 99.9,
    dedicatedAccountManager: true,
  },
};

// ─── SUBSCRIPTION MANAGEMENT ──────────────────────────────────────
app.get("/tiers", (req, res) => res.json(TIERS));

app.get("/subscription", auth, async (req, res) => {
  const { rows } = await db.query(
    "SELECT * FROM billing_subscriptions WHERE company_id=$1",
    [req.user.company]
  );
  if (!rows[0]) return res.json({ tier: "starter", ...TIERS.starter, active: false });
  const tier = TIERS[rows[0].tier] || TIERS.starter;
  res.json({ ...rows[0], ...tier });
});

app.post("/subscription/upgrade", auth, requireRole("admin","treasury"), async (req, res) => {
  const { tier, paymentMethodId } = req.body;
  if (!TIERS[tier]) return res.status(400).json({ error: "Invalid tier" });

  if (!MOCK && stripe && paymentMethodId) {
    const subscription = await stripe.subscriptions.create({
      customer: req.body.stripeCustomerId,
      items: [{ price: process.env[`STRIPE_PRICE_${tier.toUpperCase()}`] }],
      payment_behavior: "default_incomplete",
      expand: ["latest_invoice.payment_intent"],
    });
    await db.query(`
      INSERT INTO billing_subscriptions (company_id, tier, stripe_subscription_id, status, started_at, updated_at)
      VALUES ($1,$2,$3,'active',NOW(),NOW())
      ON CONFLICT (company_id) DO UPDATE SET tier=$2, stripe_subscription_id=$3, status='active', updated_at=NOW()
    `, [req.user.company, tier, subscription.id]);
    return res.json({ message: "Subscription upgraded", tier, clientSecret: subscription.latest_invoice.payment_intent.client_secret });
  }

  await db.query(`
    INSERT INTO billing_subscriptions (company_id, tier, status, started_at, updated_at)
    VALUES ($1,$2,'active',NOW(),NOW())
    ON CONFLICT (company_id) DO UPDATE SET tier=$2, status='active', updated_at=NOW()
  `, [req.user.company, tier]);

  await db.query("UPDATE companies SET billing_tier=$1 WHERE id=$2", [tier, req.user.company]);
  res.json({ message: "Subscription upgraded", tier, features: TIERS[tier].features });
});

// ─── FEATURE GATE MIDDLEWARE ──────────────────────────────────────
async function requireFeature(feature) {
  return async (req, res, next) => {
    const { rows } = await db.query("SELECT tier FROM billing_subscriptions WHERE company_id=$1", [req.user.company]);
    const tier = rows[0]?.tier || "starter";
    const tierDef = TIERS[tier];

    if (!tierDef.features.includes("all") && !tierDef.features.includes(feature)) {
      return res.status(403).json({
        error: `Feature '${feature}' requires Growth or Enterprise tier`,
        currentTier: tier,
        upgradeUrl: `${process.env.FRONTEND_URL}/billing/upgrade`,
      });
    }
    next();
  };
}

app.get("/features/check/:feature", auth, async (req, res) => {
  const { rows } = await db.query("SELECT tier FROM billing_subscriptions WHERE company_id=$1", [req.user.company]);
  const tier    = rows[0]?.tier || "starter";
  const tierDef = TIERS[tier];
  const allowed = tierDef.features.includes("all") || tierDef.features.includes(req.params.feature);
  res.json({ feature: req.params.feature, allowed, tier });
});

// ─── FX SPREAD CAPTURE ────────────────────────────────────────────
app.post("/fx-spread/record", auth, async (req, res) => {
  const { txId, corridor, midMarketRate, appliedRate, nominalAmount } = req.body;

  const spreadBps  = Math.abs(appliedRate - midMarketRate) / midMarketRate * 10000;
  const spreadUsd  = Math.abs(appliedRate - midMarketRate) * nominalAmount;

  await db.query(`
    INSERT INTO fx_spread_records (id, tx_id, corridor, mid_market_rate, applied_rate, spread_bps, spread_usd, nominal_amount, recorded_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
  `, [uuidv4(), txId, corridor, midMarketRate, appliedRate, spreadBps.toFixed(2), spreadUsd.toFixed(4), nominalAmount]);

  res.json({ txId, spreadBps: spreadBps.toFixed(2), spreadUsd: spreadUsd.toFixed(4) });
});

app.get("/fx-spread/summary", auth, requireRole("admin"), async (req, res) => {
  const { rows } = await db.query(`
    SELECT corridor, COUNT(*) as tx_count,
           SUM(spread_usd) as total_spread_revenue,
           AVG(spread_bps) as avg_spread_bps,
           SUM(nominal_amount) as total_volume
    FROM fx_spread_records
    WHERE recorded_at > NOW() - INTERVAL '30 days'
    GROUP BY corridor ORDER BY total_spread_revenue DESC
  `);
  res.json(rows);
});

// ─── FLOAT INCOME TRACKING ────────────────────────────────────────
app.post("/float/record", auth, async (req, res) => {
  const { assetKey, balance, yieldRateAnnual, periodHours } = req.body;
  const incomeUsd = balance * (yieldRateAnnual / 100) * (periodHours / 8760);

  await db.query(`
    INSERT INTO float_income_records (id, company_id, asset_key, balance, yield_rate, period_hours, income_usd, recorded_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
  `, [uuidv4(), req.user.company, assetKey, balance, yieldRateAnnual, periodHours, incomeUsd.toFixed(6)]);

  res.json({ incomeUsd: incomeUsd.toFixed(6), annualisedRate: `${yieldRateAnnual}%` });
});

app.get("/float/summary", auth, requireRole("admin"), async (req, res) => {
  const { rows } = await db.query(`
    SELECT asset_key, SUM(income_usd) as total_income, AVG(yield_rate) as avg_yield, AVG(balance) as avg_balance
    FROM float_income_records WHERE recorded_at > NOW() - INTERVAL '30 days'
    GROUP BY asset_key ORDER BY total_income DESC
  `);
  res.json(rows);
});

// ─── WHITE-LABEL CONFIGURATION ───────────────────────────────────
app.get("/whitelabel/config", auth, async (req, res) => {
  const { rows } = await db.query("SELECT * FROM whitelabel_configs WHERE company_id=$1", [req.user.company]);
  res.json(rows[0] || { configured: false });
});

app.put("/whitelabel/config", auth, requireRole("admin"), async (req, res) => {
  const { rows: sub } = await db.query("SELECT tier FROM billing_subscriptions WHERE company_id=$1", [req.user.company]);
  if (sub[0]?.tier !== "enterprise") return res.status(403).json({ error: "White-label requires Enterprise tier" });

  const { brandName, primaryColor, logoUrl, domain, customEmailDomain, hideAegisLedgerBranding } = req.body;

  await db.query(`
    INSERT INTO whitelabel_configs (company_id, brand_name, primary_color, logo_url, domain, custom_email_domain, hide_branding, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
    ON CONFLICT (company_id) DO UPDATE SET brand_name=$2, primary_color=$3, logo_url=$4, domain=$5, custom_email_domain=$6, hide_branding=$7, updated_at=NOW()
  `, [req.user.company, brandName, primaryColor, logoUrl, domain, customEmailDomain, hideAegisLedgerBranding || false]);

  res.json({ message: "White-label configuration saved", brandName, domain });
});

// ─── DATA INTELLIGENCE API ────────────────────────────────────────
app.get("/data-api/corridor-intelligence", auth, async (req, res) => {
  const { rows: sub } = await db.query("SELECT tier FROM billing_subscriptions WHERE company_id=$1", [req.user.company]);
  if (!["enterprise"].includes(sub[0]?.tier)) return res.status(403).json({ error: "Data API requires Enterprise tier" });

  const { rows } = await db.query(`
    SELECT
      originator_country || '_' || beneficiary_country as corridor,
      asset_key,
      DATE_TRUNC('week', created_at) as week,
      COUNT(*) as tx_count,
      SUM(amount) as volume,
      AVG(amount) as avg_tx_size,
      AVG(settlement_latency_ms) as avg_latency_ms
    FROM transfers
    WHERE created_at > NOW() - INTERVAL '90 days' AND status='settled'
    GROUP BY 1,2,3 ORDER BY 1,3
  `);

  res.json({
    dataPoints: rows.length,
    coverage: "90 days",
    corridors: [...new Set(rows.map(r => r.corridor))],
    data: rows,
    disclaimer: "Anonymised aggregate data. No individual transaction identities are disclosed.",
  });
});

// ─── REFERRAL TRACKING ────────────────────────────────────────────
app.post("/referrals/generate", auth, async (req, res) => {
  const code = "AEG-" + req.user.company.slice(0,4).toUpperCase() + "-" + require("crypto").randomBytes(3).toString("hex").toUpperCase();
  await db.query(`
    INSERT INTO referral_codes (id, company_id, code, reward_type, reward_value, created_at)
    VALUES ($1,$2,$3,'fee_discount',0.1,NOW()) ON CONFLICT DO NOTHING
  `, [uuidv4(), req.user.company, code]);
  res.json({ code, rewardType: "10% fee discount for referred company for 3 months", shareUrl: `${process.env.FRONTEND_URL}/signup?ref=${code}` });
});

app.get("/referrals", auth, async (req, res) => {
  const { rows } = await db.query(`
    SELECT rc.code, COUNT(r.id) as conversions, SUM(r.revenue_credited) as revenue_earned
    FROM referral_codes rc LEFT JOIN referrals r ON r.code=rc.code
    WHERE rc.company_id=$1 GROUP BY rc.code
  `, [req.user.company]);
  res.json(rows);
});

// ─── USAGE INVOICE GENERATION ─────────────────────────────────────
app.get("/invoices", auth, async (req, res) => {
  const { rows } = await db.query(`
    SELECT DATE_TRUNC('month', created_at) as month,
           SUM(platform_fee) as fee_total,
           COUNT(*) as tx_count,
           SUM(amount) as volume
    FROM transfers WHERE originator_company=$1 AND status='settled'
    GROUP BY 1 ORDER BY 1 DESC LIMIT 12
  `, [req.user.company]);

  const { rows: sub } = await db.query("SELECT tier, started_at FROM billing_subscriptions WHERE company_id=$1", [req.user.company]);
  const tier = TIERS[sub[0]?.tier || "starter"];

  const invoices = rows.map(r => ({
    month: r.month,
    subscriptionFee: tier.monthlyFeeUsd,
    transactionFees: parseFloat(r.fee_total || 0).toFixed(2),
    txCount: parseInt(r.tx_count),
    volume: parseFloat(r.volume || 0).toFixed(2),
    totalDue: (tier.monthlyFeeUsd + parseFloat(r.fee_total || 0)).toFixed(2),
  }));

  res.json(invoices);
});

// Fix 48: Stripe webhook handler — payment failures, cancellations, disputes
app.post("/webhook/stripe",
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers['stripe-signature'],
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('[STRIPE] Webhook verification failed:', err.message);
      return res.status(400).send('Webhook Error: ' + err.message);
    }

    try {
      switch (event.type) {
        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          await db.query(
            "UPDATE companies SET subscription_status='past_due' WHERE stripe_customer_id=$1",
            [invoice.customer]
          );
          console.log(`[STRIPE] Payment failed for customer ${invoice.customer}`);
          break;
        }
        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          await db.query(
            "UPDATE companies SET subscription_status='cancelled' WHERE stripe_customer_id=$1",
            [sub.customer]
          );
          await db.query(
            "UPDATE billing_subscriptions SET status='cancelled', updated_at=NOW() WHERE stripe_subscription_id=$1",
            [sub.id]
          );
          console.log(`[STRIPE] Subscription cancelled for customer ${sub.customer}`);
          break;
        }
        case 'charge.dispute.created': {
          const dispute = event.data.object;
          console.warn(`[STRIPE] Dispute created: ${dispute.id} for charge ${dispute.charge}`);
          // Notify ops team via Kafka
          await publishBillingEvent('billing.dispute_created', { disputeId: dispute.id, chargeId: dispute.charge, amount: dispute.amount });
          break;
        }
        default:
          console.log(`[STRIPE] Unhandled event type: ${event.type}`);
      }
    } catch (err) {
      console.error('[STRIPE] Error processing webhook event:', err);
      return res.status(500).json({ error: 'Processing failed' });
    }

    res.json({ received: true });
  }
);

async function publishBillingEvent(topic, payload) {
  console.log(`[KAFKA] ${topic}`, JSON.stringify(payload)); // Replace with real Kafka producer if needed
}

app.get("/health", (req, res) => res.json({ status: "ok", service: "billing" }));
app.listen(process.env.PORT || 3013, () => console.log("Billing Service on port 3013"));
module.exports = { app, TIERS, requireFeature };
