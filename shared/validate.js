// Fix 15: Shared Zod validation middleware factory
// Import this in any service:
//   const { validateBody, schemas } = require('../../../shared/validate');
//
// Usage:  app.post('/transfers', auth, validateBody(schemas.transfer), handler)

const { z } = require('zod');

function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten(),
      });
    }
    req.body = result.data; // sanitized and type-coerced data only
    next();
  };
}

// ─── SHARED SCHEMAS ───────────────────────────────────────────────
const schemas = {

  // wallet-service: POST /transfers
  transfer: z.object({
    fromCompanyId:  z.string().uuid(),
    toCompanyId:    z.string().uuid(),
    assetKey:       z.enum(['USDC_ETH', 'USDT_POLY', 'AE_COIN', 'USDC_SOL']),
    amount:         z.number().positive(),
    memo:           z.string().max(500).optional(),
    tradeId:        z.string().uuid().optional(),
  }),

  // wallet-service: POST /wallets/provision
  walletProvision: z.object({
    companyId:   z.string().uuid(),
    companyName: z.string().min(2).max(200),
  }),

  // identity-service: POST /kyb/submit
  kybSubmit: z.object({
    companyName:        z.string().min(2).max(300),
    registrationNumber: z.string().min(3).max(100),
    jurisdiction:       z.enum(['RU', 'AE', 'GB', 'US', 'DE', 'FR', 'SG', 'HK']),
    annualRevenue:      z.number().nonnegative(),
    directors: z.array(z.object({
      firstName:   z.string().min(1),
      lastName:    z.string().min(1),
      nationality: z.string().length(2),
      dob:         z.string().optional(),
    })).min(1),
    ubos: z.array(z.object({
      firstName:    z.string().min(1),
      lastName:     z.string().min(1),
      ownershipPct: z.number().min(0).max(100),
    })).min(1),
    documents: z.array(z.string()).optional(),
  }),

  // compliance-engine: POST /aml-rules/evaluate
  amlEvaluate: z.object({
    transaction: z.object({
      amount:          z.number().nonnegative(),
      currency:        z.enum(['USDC', 'USDT', 'AE_COIN', 'USDC_SOL']).optional(),
      transactionType: z.string().optional(),
      sender: z.object({
        country:   z.string().length(2).optional(),
        riskScore: z.number().min(0).max(100).optional(),
        companyId: z.string().optional(),
      }).optional(),
      receiver: z.object({
        country:   z.string().length(2).optional(),
        riskScore: z.number().min(0).max(100).optional(),
        companyId: z.string().optional(),
      }).optional(),
    }),
  }),

  // fiat-service: POST /onramp
  onramp: z.object({
    corridorKey:              z.enum(['RUB_USDC', 'RUB_USDT', 'AED_USDC', 'AED_AECOIN', 'USD_USDC']),
    fiatAmount:               z.number().positive(),
    destinationWalletAddress: z.string().min(10).max(100).optional(),
    quoteId:                  z.string().uuid().optional(),
  }),

  // fiat-service: POST /offramp
  offramp: z.object({
    corridorKey:            z.enum(['RUB_USDC', 'RUB_USDT', 'AED_USDC', 'AED_AECOIN', 'USD_USDC']),
    cryptoAmount:           z.number().positive(),
    quoteId:                z.string().uuid().optional(),
    destinationBankAccount: z.object({
      accountNumber: z.string().min(5),
      bankName:      z.string().min(2),
      iban:          z.string().optional(),
      swiftCode:     z.string().optional(),
    }),
  }),

  // trading-service: POST /recurring
  recurringPayment: z.object({
    name:             z.string().min(1).max(200),
    amount:           z.number().positive(),
    assetKey:         z.string(),
    beneficiaryAddress: z.string().min(10),
    frequency:        z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'quarterly']),
    startDate:        z.string().datetime(),
    endDate:          z.string().datetime().optional(),
    reference:        z.string().max(500).optional(),
    requiresApproval: z.boolean().optional(),
  }),

  // trading-service: POST /fx/lock-rate
  fxLockRate: z.object({
    fromCurrency: z.string().length(3),
    toCurrency:   z.string(),
    amount:       z.number().positive(),
  }),
};

module.exports = { validateBody, schemas };
