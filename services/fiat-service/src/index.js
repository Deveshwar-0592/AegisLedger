/**
 * AegisLedger - Fiat Liquidity Service
 * Handles: RUB/AED fiat on-ramp and off-ramp via OpenPayd,
 *          exchange rate fetching, ramp request lifecycle
 */

const express = require("express");
const axios   = require("axios");
const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const Redis = require("ioredis");

const app = express();
app.use(express.json());
app.use(helmet());
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const db   = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true } });
// Fix 17: undefined = PRODUCTION mode. Explicitly set MOCK_OPENPAYD=true for local dev.
const MOCK = process.env.MOCK_OPENPAYD === 'true';
console.log('[CONFIG] Integration modes:', { openpayd: MOCK ? 'MOCK' : 'PRODUCTION' });

// Fix 47: Crash-fast if OPENPAYD_WEBHOOK_SECRET is missing in non-mock mode
// In MOCK mode the webhook endpoint is rarely called, but we still require it
// to prevent accidental deployment without the secret.
if (!process.env.OPENPAYD_WEBHOOK_SECRET) {
  console.error('FATAL: OPENPAYD_WEBHOOK_SECRET is not set. Set it in .env or docker-compose.');
  process.exit(1);
}

// ─── SUPPORTED CORRIDORS ──────────────────────────────────────────
// Each corridor maps fiat -> stablecoin or stablecoin -> fiat
const CORRIDORS = {
  "RUB_USDC": { fiat: "RUB", crypto: "USDC_ETH",  minFiat: 100000,   maxFiat: 500000000  },
  "RUB_USDT": { fiat: "RUB", crypto: "USDT_POLY", minFiat: 100000,   maxFiat: 500000000  },
  "AED_USDC": { fiat: "AED", crypto: "USDC_ETH",  minFiat: 1000,     maxFiat: 50000000   },
  "AED_AECOIN":{ fiat: "AED", crypto: "AE_COIN",  minFiat: 1000,     maxFiat: 50000000   },
  "USD_USDC": { fiat: "USD", crypto: "USDC_ETH",  minFiat: 500,      maxFiat: 50000000   },
};

// ─── OPENPAYD CLIENT (mocked) ─────────────────────────────────────
class OpenPaydClient {
  constructor() {
    this.baseUrl = "https://api.openpayd.com/v2";
    this.apiKey  = process.env.OPENPAYD_API_KEY;
  }

  async getExchangeRate(fromCurrency, toCurrency) {
    if (MOCK) {
      const mockRates = {
        "RUB_USD": 0.01112, "RUB_USDC": 0.01112,
        "AED_USD": 0.27230, "AED_USDC": 0.27230,
        "USD_USDC": 1.0000, "USDC_AED": 3.6720,
        "USDC_RUB": 89.930,
      };
      return { rate: mockRates[`${fromCurrency}_${toCurrency}`] || 1.0, timestamp: new Date().toISOString() };
    }
    const resp = await axios.get(`${this.baseUrl}/rates?from=${fromCurrency}&to=${toCurrency}`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } });
    return resp.data;
  }

  async initiatePayment(params) {
    if (MOCK) {
      return {
        paymentId:   `OPYD-${uuidv4().slice(0, 12).toUpperCase()}`,
        status:      "PENDING",
        bankDetails: {
          bankName:      "OpenPayd Virtual Bank",
          accountNumber: "GB29OPYD12345698765432",
          sortCode:      "12-34-56",
          reference:     params.reference,
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
    }
    const resp = await axios.post(`${this.baseUrl}/payments`, params,
      { headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" } });
    return resp.data;
  }

  async getPaymentStatus(paymentId) {
    if (MOCK) {
      return { paymentId, status: "COMPLETED", confirmedAt: new Date().toISOString() };
    }
    const resp = await axios.get(`${this.baseUrl}/payments/${paymentId}`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } });
    return resp.data;
  }
}

const openpayd = new OpenPaydClient();

// ─── MIDDLEWARE ───────────────────────────────────────────────────
function authenticate(req, res, next) {
  const token = req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = jwt.verify(token, process.env.JWT_PUBLIC_KEY, { algorithms: ["RS256"] });
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

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

// ─── ROUTES ───────────────────────────────────────────────────────

// Fix 15: Zod validation middleware
const { validateBody, schemas } = require('../../../shared/validate');

/**
 * GET /rates - Get live exchange rates for all corridors
 */
app.get("/rates", authenticate, async (req, res) => {
  const rates = {};
  for (const [key, corridor] of Object.entries(CORRIDORS)) {
    const cryptoSymbol = corridor.crypto.split("_")[0];
    const r = await openpayd.getExchangeRate(corridor.fiat, cryptoSymbol);
    rates[key] = { ...r, corridor };
  }
  res.json(rates);
});

/**
 * POST /quote - Generate a settlement quote with 15-min expiry
 */
app.post("/quote", authenticate, async (req, res) => {
  const { corridorKey, amount, direction } = req.body;
  const corridor = CORRIDORS[corridorKey];
  if (!corridor) return res.status(400).json({ error: "Unsupported corridor" });

  try {
    const cryptoSymbol = corridor.crypto.split("_")[0];
    const from = direction === 'ON_RAMP' ? corridor.fiat : cryptoSymbol;
    const to = direction === 'ON_RAMP' ? cryptoSymbol : corridor.fiat;
    
    const { rate } = await openpayd.getExchangeRate(from, to);
    const quoteId = uuidv4();
    const quote = { id: quoteId, rate, generatedAt: Date.now(), corridorKey, direction };
    
    await redis.setEx(`fiat_quote:${quoteId}`, 900, JSON.stringify(quote));
    
    res.json({
      quoteId,
      rate,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate quote" });
  }
});

/**
 * POST /onramp - Initiate fiat -> stablecoin conversion
 * Company sends fiat, receives stablecoin to their vault
 */
app.post("/onramp", authenticate, requireProduction, validateBody(schemas.onramp), async (req, res) => {
  const { corridorKey, fiatAmount, destinationWalletAddress, quoteId } = req.body;

  const corridor = CORRIDORS[corridorKey];
  if (!corridor) return res.status(400).json({ error: "Unsupported corridor" });
  if (fiatAmount < corridor.minFiat) return res.status(400).json({ error: `Minimum is ${corridor.minFiat} ${corridor.fiat}` });
  if (fiatAmount > corridor.maxFiat) return res.status(400).json({ error: `Maximum is ${corridor.maxFiat} ${corridor.fiat}` });

  let rate;
  try {
    if (quoteId) {
      const cachedQuote = await redis.get(`fiat_quote:${quoteId}`);
      if (!cachedQuote) {
        return res.status(409).json({ error: 'Settlement quote has expired. Please request a fresh quote.' });
      }
      const quote = JSON.parse(cachedQuote);
      if (Date.now() - quote.generatedAt > 15 * 60 * 1000) {
        return res.status(409).json({ error: 'Settlement quote has expired. Please request a fresh quote.' });
      }
      rate = quote.rate;
    } else {
      const resp = await openpayd.getExchangeRate(corridor.fiat, corridor.crypto.split("_")[0]);
      rate = resp.rate;
    }

    const estimatedCrypto = (fiatAmount * rate * 0.9985).toFixed(6); // 0.15% platform fee

    const rampId    = uuidv4();
    const reference = `AEG-ONRAMP-${rampId.slice(0, 8).toUpperCase()}`;

    const payment = await openpayd.initiatePayment({
      amount: fiatAmount, currency: corridor.fiat,
      destinationCurrency: corridor.crypto.split("_")[0],
      reference, companyId: req.user.company,
    });

    await db.query(`
      INSERT INTO fiat_ramp_requests
        (id, company_id, direction, fiat_currency, fiat_amount, crypto_asset,
         crypto_amount, exchange_rate, status, provider_ref, initiated_by, created_at)
      VALUES ($1,$2,'ON_RAMP',$3,$4,$5,$6,$7,'PENDING',$8,$9,NOW())
    `, [rampId, req.user.company, corridor.fiat, fiatAmount, corridor.crypto,
        estimatedCrypto, rate, payment.paymentId, req.user.sub]);

    res.json({
      rampId,
      status: "PENDING",
      estimatedCryptoAmount: estimatedCrypto,
      exchangeRate: rate,
      bankDetails: payment.bankDetails,
      expiresAt: payment.expiresAt,
      instructions: `Transfer ${fiatAmount} ${corridor.fiat} to the bank details above with reference ${reference}.`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "On-ramp initiation failed" });
  }
});

/**
 * POST /offramp - Initiate stablecoin -> fiat conversion
 * Company sends stablecoin from vault, receives fiat to bank
 */
app.post("/offramp", authenticate, requireProduction, validateBody(schemas.offramp), async (req, res) => {
  const { corridorKey, cryptoAmount, destinationBankAccount, quoteId } = req.body;

  const corridor = CORRIDORS[corridorKey];
  if (!corridor) return res.status(400).json({ error: "Unsupported corridor" });

  let rate;
  try {
    const cryptoSymbol = corridor.crypto.split("_")[0];
    
    if (quoteId) {
      const cachedQuote = await redis.get(`fiat_quote:${quoteId}`);
      if (!cachedQuote) {
        return res.status(409).json({ error: 'Settlement quote has expired. Please request a fresh quote.' });
      }
      const quote = JSON.parse(cachedQuote);
      if (Date.now() - quote.generatedAt > 15 * 60 * 1000) {
        return res.status(409).json({ error: 'Settlement quote has expired. Please request a fresh quote.' });
      }
      rate = quote.rate;
    } else {
      const resp = await openpayd.getExchangeRate(cryptoSymbol, corridor.fiat);
      rate = resp.rate;
    }
    
    const estimatedFiat = (cryptoAmount * rate * 0.9985).toFixed(2);

    const rampId = uuidv4();

    await db.query(`
      INSERT INTO fiat_ramp_requests
        (id, company_id, direction, fiat_currency, fiat_amount, crypto_asset,
         crypto_amount, exchange_rate, status, initiated_by, created_at)
      VALUES ($1,$2,'OFF_RAMP',$3,$4,$5,$6,$7,'PENDING',$8,NOW())
    `, [rampId, req.user.company, corridor.fiat, estimatedFiat, corridor.crypto,
        cryptoAmount, rate, req.user.sub]);

    // Trigger wallet service to move stablecoin to OpenPayd settlement wallet
    await publishEvent("offramp.initiated", {
      rampId, companyId: req.user.company,
      cryptoAmount, cryptoAsset: corridor.crypto,
      estimatedFiat, fiatCurrency: corridor.fiat,
      destinationBankAccount,
    });

    res.json({
      rampId, status: "PENDING",
      estimatedFiatAmount: `${estimatedFiat} ${corridor.fiat}`,
      exchangeRate: rate,
      processingTime: "1-2 business days",
    });
  } catch (err) {
    res.status(500).json({ error: "Off-ramp initiation failed" });
  }
});

/**
 * GET /ramps - List ramp requests for current company
 */
app.get("/ramps", authenticate, async (req, res) => {
  const { rows } = await db.query(
    "SELECT * FROM fiat_ramp_requests WHERE company_id=$1 ORDER BY created_at DESC LIMIT 50",
    [req.user.company]
  );
  res.json(rows);
});

/**
 * POST /webhook/openpayd - Receive OpenPayd payment confirmation
 * Fix 47: HMAC-SHA256 signature verification — no fallback secret allowed.
 */
app.post("/webhook/openpayd",
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['x-openpayd-signature'];
    if (!sig) return res.status(401).json({ error: 'Missing signature' });

    // Fix 47: Use env secret only — no dev-secret fallback
    const expected = require('crypto')
      .createHmac('sha256', process.env.OPENPAYD_WEBHOOK_SECRET)
      .update(req.body)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    let sigBuffer, expectedBuffer;
    try {
      sigBuffer      = Buffer.from(sig,      'hex');
      expectedBuffer = Buffer.from(expected, 'hex');
    } catch {
      return res.status(401).json({ error: 'Invalid signature format' });
    }
    if (sigBuffer.length !== expectedBuffer.length ||
        !require('crypto').timingSafeEqual(sigBuffer, expectedBuffer)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const event = JSON.parse(req.body);
    const { paymentId, status, amount, currency } = event;

    if (status === "COMPLETED") {
      await db.query(
        "UPDATE fiat_ramp_requests SET status='COMPLETED', completed_at=NOW() WHERE provider_ref=$1",
        [paymentId]
      );
      await publishEvent("onramp.completed", { paymentId, amount, currency });
    }
    res.json({ received: true });
  }
);

async function publishEvent(topic, payload) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[KAFKA MOCK] ${topic}:`, JSON.stringify(payload));
    return;
  }
}

app.get("/health", (req, res) => res.json({ status: "ok", service: "fiat", mock: MOCK }));

app.listen(process.env.PORT || 3005, () => console.log("Fiat Liquidity Service running on port 3005"));
module.exports = app;
