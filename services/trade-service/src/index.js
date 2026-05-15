/**
 * AegisLedger - Trade Finance & Escrow Service
 * Handles: Smart contract escrow creation, document upload triggers,
 *          condition fulfillment via oracle, ERP webhook integration
 */

const express = require("express");
const { ethers } = require("ethers");
const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const helmet = require("helmet");
const { KMSClient, SignCommand } = require("@aws-sdk/client-kms");

const app = express();
app.use(express.json());
app.use(helmet());

const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true } });

// ─── BLOCKCHAIN SETUP ─────────────────────────────────────────────
const MOCK_BLOCKCHAIN = process.env.MOCK_BLOCKCHAIN !== "false";

const ESCROW_ABI = [
  "function createEscrow(address seller, address stablecoin, uint256 amount, uint8[] conditions, uint256 expiryDays, string tradeRef, bytes32 kycHash) returns (bytes32)",
  "function fundEscrow(bytes32 escrowId)",
  "function fulfillCondition(bytes32 escrowId, uint256 conditionIndex, bytes32 documentHash, bytes signature)",
  "function releaseFunds(bytes32 escrowId)",
  "function getEscrow(bytes32 escrowId) view returns (address,address,uint256,uint8,uint256,uint256,uint256)",
  "event EscrowCreated(bytes32 indexed escrowId, address buyer, address seller, uint256 amount, address stablecoin)",
  "event EscrowReleased(bytes32 indexed escrowId, address seller, uint256 netAmount, uint256 fee)",
  "event ConditionFulfilled(bytes32 indexed escrowId, uint8 conditionType, bytes32 documentHash, uint256 timestamp)",
];

// Condition type enum matching the Solidity contract
const CONDITION_TYPES = {
  BILL_OF_LADING:     0,
  COMMERCIAL_INVOICE: 1,
  PACKING_LIST:       2,
  CUSTOMS_CLEARANCE:  3,
  PORT_AUTHORITY_SIGN:4,
  QUALITY_INSPECTION: 5,
};

let provider, escrowContract, txRelayer;

async function initBlockchain() {
  if (MOCK_BLOCKCHAIN) {
    console.log("[MOCK] Blockchain connection mocked");
    return;
  }

  // Fix 49: Crash-fast if RELAYER_PRIVATE_KEY is missing in non-mock mode.
  // A zero/dummy key here would silently sign transactions with a known private key.
  if (!process.env.RELAYER_PRIVATE_KEY) {
    console.error('FATAL: RELAYER_PRIVATE_KEY is not set and MOCK_BLOCKCHAIN is not true.');
    console.error('Set RELAYER_PRIVATE_KEY to the gas-relayer wallet private key, or set MOCK_BLOCKCHAIN=true for local dev.');
    process.exit(1);
  }

  provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);
  // Use a separate relayer wallet just for gas (not the oracle identity)
  txRelayer = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, provider);
  escrowContract = new ethers.Contract(process.env.ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, txRelayer);
  console.log("Blockchain connected:", await provider.getNetwork());
}

initBlockchain();

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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/tiff"];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ─── ROUTES ───────────────────────────────────────────────────────

/**
 * POST /escrows - Create new trade escrow
 */
app.post("/escrows", authenticate, async (req, res) => {
  const {
    sellerCompanyId, stablecoin, amount, conditions,
    expiryDays, tradeReference, productDescription,
  } = req.body;

  try {
    const escrowId = uuidv4();
    let contractEscrowId = null;

    if (MOCK_BLOCKCHAIN) {
      contractEscrowId = "0x" + Buffer.from(escrowId.replace(/-/g, ""), "hex").toString("hex").slice(0, 64).padEnd(64, "0");
    } else {
      // Get buyer and seller wallet addresses
      const { rows: buyerRows }  = await db.query("SELECT address FROM wallet_addresses WHERE company_id=$1 AND asset_key=$2", [req.user.company, stablecoin]);
      const { rows: sellerRows } = await db.query("SELECT address FROM wallet_addresses WHERE company_id=$1 AND asset_key=$2", [sellerCompanyId, stablecoin]);

      const STABLECOIN_ADDRESSES = {
        USDC_ETH:  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        USDT_POLY: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
      };

      const conditionTypes = conditions.map(c => CONDITION_TYPES[c] ?? 0);
      const kycHash = ethers.keccak256(ethers.toUtf8Bytes(req.user.company));
      const amountParsed = ethers.parseUnits(amount.toString(), 6);

      const tx = await escrowContract.createEscrow(
        sellerRows[0].address,
        STABLECOIN_ADDRESSES[stablecoin],
        amountParsed,
        conditionTypes,
        expiryDays || 90,
        tradeReference,
        kycHash
      );
      const receipt = await tx.wait();
      const event   = receipt.logs.find(l => l.fragment?.name === "EscrowCreated");
      contractEscrowId = event?.args?.escrowId;
    }

    await db.query(`
      INSERT INTO trade_escrows
        (id, smart_contract_id, buyer_company, seller_company, asset_key, amount,
         platform_fee, status, conditions, trade_reference, product_description,
         expiry_date, contract_address, network, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'CREATED',$8,$9,$10,
              NOW() + INTERVAL '${expiryDays || 90} days',$11,$12,NOW())
    `, [
      escrowId, contractEscrowId, req.user.company, sellerCompanyId,
      stablecoin, amount, (amount * 0.0015).toFixed(2),
      JSON.stringify(conditions.map(c => ({ type: c, fulfilled: false }))),
      tradeReference, productDescription,
      process.env.ESCROW_CONTRACT_ADDRESS || "0xMOCK",
      stablecoin.includes("POLY") ? "Polygon" : "Ethereum",
    ]);

    // Notify seller via Kafka
    await publishEvent("escrow.created", { escrowId, buyerCompany: req.user.company, sellerCompanyId, amount, stablecoin });

    res.json({ escrowId, contractEscrowId, status: "CREATED" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Escrow creation failed" });
  }
});

/**
 * POST /escrows/:id/documents - Upload trade document
 * Triggers OCR extraction and oracle submission
 */
app.post("/escrows/:id/documents", authenticate, upload.single("document"), async (req, res) => {
  const { id } = req.params;
  const { conditionType } = req.body;

  try {
    const { rows } = await db.query("SELECT * FROM trade_escrows WHERE id=$1", [id]);
    if (!rows[0]) return res.status(404).json({ error: "Escrow not found" });

    // Hash the document for on-chain anchoring
    const crypto = require("crypto");
    const documentHash = "0x" + crypto.createHash("sha256").update(req.file.buffer).digest("hex");

    // Trigger OCR pipeline (async)
    await publishEvent("document.uploaded", {
      escrowId: id,
      conditionType,
      documentHash,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
    });

    // In production, S3 upload would happen here
    const s3Key = `escrows/${id}/${conditionType}_${Date.now()}.pdf`;

    await db.query(`
      UPDATE trade_escrows
      SET conditions = jsonb_set(
        conditions,
        '{0,documentHash}',
        to_jsonb($1::text)
      )
      WHERE id=$2
    `, [documentHash, id]);

    res.json({
      documentHash,
      s3Key,
      status: "PROCESSING",
      message: "Document uploaded. OCR extraction and oracle verification in progress.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Document upload failed" });
  }
});

/**
 * POST /escrows/:id/fulfill - Oracle marks condition as fulfilled
 */
app.post("/escrows/:id/fulfill", authenticate, async (req, res) => {
  const { id } = req.params;
  const { conditionIndex, documentHash } = req.body;

  try {
    const { rows } = await db.query("SELECT * FROM trade_escrows WHERE id=$1", [id]);
    const escrow = rows[0];
    if (!escrow) return res.status(404).json({ error: "Escrow not found" });

    if (!MOCK_BLOCKCHAIN) {
      const crypto = require("crypto");
      
      // Hash the payload for the smart contract ECDSA verify: keccak256(abi.encodePacked(escrowId, conditionIndex, documentHash))
      // For simplicity in the Node side, we replicate the exact message hash:
      const messageHash = ethers.solidityPackedKeccak256(
        ["bytes32", "uint256", "bytes32"],
        [escrow.smart_contract_id, conditionIndex, documentHash]
      );
      
      const digest = crypto.createHash("sha256").update(ethers.getBytes(messageHash)).digest();

      const kms = new KMSClient({ region: process.env.AWS_REGION || "us-east-1" });
      const command = new SignCommand({
        KeyId: process.env.KMS_ORACLE_KEY_ID,
        Message: digest,
        MessageType: "DIGEST",
        SigningAlgorithm: "ECDSA_SHA_256"
      });
      
      const kmsResponse = await kms.send(command);
      const signature = "0x" + Buffer.from(kmsResponse.Signature).toString("hex");

      await escrowContract.fulfillCondition(escrow.smart_contract_id, conditionIndex, documentHash, signature);
    }

    const conditions = JSON.parse(escrow.conditions);
    conditions[conditionIndex].fulfilled    = true;
    conditions[conditionIndex].fulfilledAt  = new Date().toISOString();
    conditions[conditionIndex].documentHash = documentHash;

    const allMet  = conditions.every(c => c.fulfilled);
    const newStatus = allMet ? "CONDITIONS_MET" : "FUNDED";

    await db.query("UPDATE trade_escrows SET conditions=$1, status=$2 WHERE id=$3",
      [JSON.stringify(conditions), newStatus, id]);

    if (allMet) {
      await publishEvent("escrow.conditions_met", { escrowId: id });
    }

    res.json({ escrowId: id, conditionIndex, status: newStatus, allConditionsMet: allMet });
  } catch (err) {
    res.status(500).json({ error: "Condition fulfillment failed" });
  }
});

/**
 * GET /escrows - List escrows for current company
 */
app.get("/escrows", authenticate, async (req, res) => {
  const { rows } = await db.query(`
    SELECT e.*, bc.name as buyer_name, sc.name as seller_name
    FROM trade_escrows e
    JOIN companies bc ON bc.id = e.buyer_company
    JOIN companies sc ON sc.id = e.seller_company
    WHERE e.buyer_company=$1 OR e.seller_company=$1
    ORDER BY e.created_at DESC
    LIMIT 50
  `, [req.user.company]);
  res.json(rows);
});

/**
 * POST /erp/webhook - Receive ERP reconciliation events (SAP/Oracle)
 */
app.post("/erp/webhook", async (req, res) => {
  const signature = req.headers["x-webhook-signature"];
  // Validate HMAC signature from ERP system
  const crypto = require("crypto");
  const expected = crypto.createHmac("sha256", process.env.ERP_WEBHOOK_SECRET)
    .update(JSON.stringify(req.body)).digest("hex");

  if (signature !== expected) return res.status(401).json({ error: "Invalid signature" });

  const { eventType, invoiceId, amount, currency, companyId } = req.body;

  await publishEvent("erp.event", { eventType, invoiceId, amount, currency, companyId });
  res.json({ received: true });
});

async function publishEvent(topic, payload) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[KAFKA MOCK] ${topic}:`, JSON.stringify(payload));
    return;
  }
  // Real Kafka producer
}

app.get("/health", (req, res) => res.json({ status: "ok", service: "trade", mockBlockchain: MOCK_BLOCKCHAIN }));

app.listen(process.env.PORT || 3004, () => console.log("Trade Service running on port 3004"));
module.exports = app;
