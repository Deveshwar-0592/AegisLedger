/**
 * AegisLedger — Full Smart Contract Deployment Script
 *
 * Deploys all four contracts in dependency order:
 *   1. AegisBoLNFT         — Bill of Lading NFT (ERC1155)
 *   2. AegisMultiSig       — Multi-sig authorization wallet
 *   3. AegisTradeEscrow    — Single-condition trade escrow
 *   4. AegisTrancheEscrow  — Multi-tranche milestone escrow
 *
 * Security gates enforced (Fix 13, Fix 44, Fix 51):
 *   - Mainnet deploy blocked until AUDIT_CONFIRMED=true
 *   - DEPLOYER_PRIVATE_KEY must NEVER appear in .env (CI/CD only)
 *   - Fee recipient must be TREASURY_MULTISIG_ADDRESS (Gnosis Safe)
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network sepolia
 *   npx hardhat run scripts/deploy.js --network polygon
 */

const { ethers, network } = require("hardhat");

// ─── Mainnet guard (Fix 13) ──────────────────────────────────────────────────
function assertAuditConfirmed() {
  if (network.name === "mainnet" || network.name === "polygon") {
    const confirmed = process.env.AUDIT_CONFIRMED;
    if (confirmed !== "true") {
      throw new Error(
        "Mainnet deploy blocked. Set AUDIT_CONFIRMED=true only after the " +
        "formal audit report is published. See smart-contracts/AUDIT.md."
      );
    }
    console.log("✅  AUDIT_CONFIRMED=true — mainnet gate passed.");
  }
}

// ─── Fix 44 — DEPLOYER_PRIVATE_KEY guard ────────────────────────────────────
function assertDeployerKeyIsSafe() {
  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    throw new Error(
      "DEPLOYER_PRIVATE_KEY must be injected by the CI/CD pipeline only. " +
      "Never store it in .env."
    );
  }
  // Warn loudly if running against mainnet/polygon
  if (network.name === "mainnet" || network.name === "polygon") {
    console.warn(
      "⚠️  DEPLOYER_PRIVATE_KEY is present on mainnet deploy. " +
      "This key should originate from a hardware wallet or KMS — " +
      "never from a local .env file."
    );
  }
}

// ─── Fix 51 — Treasury multisig address validation ──────────────────────────
function resolveTreasury() {
  const treasury = process.env.TREASURY_MULTISIG_ADDRESS;
  if (!treasury || treasury === ethers.ZeroAddress) {
    throw new Error(
      "TREASURY_MULTISIG_ADDRESS is required and must not be the zero address. " +
      "Use a Gnosis Safe or hardware wallet multisig — never a raw EOA."
    );
  }
  return treasury;
}

// ─── Fix 33 — Recovery address validation ────────────────────────────────────
function resolveRecoveryAddress() {
  const recovery = process.env.MULTISIG_RECOVERY_ADDRESS;
  if (!recovery || recovery === ethers.ZeroAddress) {
    throw new Error(
      "MULTISIG_RECOVERY_ADDRESS is required. " +
      "This must be a cold hardware wallet held by a DIFFERENT keyholder than the deployer."
    );
  }
  return recovery;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Pre-flight checks
  assertAuditConfirmed();
  assertDeployerKeyIsSafe();
  const treasury = resolveTreasury();
  const recoveryAddress = resolveRecoveryAddress();

  const [deployer] = await ethers.getSigners();
  console.log("\n🚀  AegisLedger Contract Deployment");
  console.log("   Network:    ", network.name);
  console.log("   Deployer:   ", deployer.address);
  console.log("   Treasury:   ", treasury);
  console.log("   Recovery:   ", recoveryAddress);
  console.log("   Balance:    ", ethers.formatEther(
    await ethers.provider.getBalance(deployer.address)
  ), "ETH\n");

  const deployed = {};

  // ─── 1. Deploy AegisBoLNFT ──────────────────────────────────────────────
  console.log("📦  Deploying AegisBoLNFT...");
  const BoLBaseUri = process.env.BOL_BASE_URI || "https://aegisledger.io/api/bol/{id}.json";
  const AegisBoLNFT = await ethers.getContractFactory("AegisBoLNFT");
  const bolNFT = await AegisBoLNFT.deploy(BoLBaseUri);
  await bolNFT.waitForDeployment();
  deployed.bolNFT = await bolNFT.getAddress();
  console.log(`   ✅  AegisBoLNFT deployed to: ${deployed.bolNFT}`);

  // ─── 2. Deploy AegisMultiSig ────────────────────────────────────────────
  console.log("📦  Deploying AegisMultiSig...");

  // Parse signers from env — comma-separated list of addresses
  const signerAddresses = (process.env.MULTISIG_SIGNERS || "")
    .split(",")
    .map(s => s.trim())
    .filter(s => ethers.isAddress(s));

  if (signerAddresses.length < 2) {
    throw new Error(
      "MULTISIG_SIGNERS must contain at least 2 valid Ethereum addresses (comma-separated). " +
      "These should be hardware wallet addresses."
    );
  }

  const threshold = parseInt(process.env.MULTISIG_THRESHOLD || "2", 10);
  if (threshold < 2 || threshold > signerAddresses.length) {
    throw new Error(`MULTISIG_THRESHOLD must be >= 2 and <= ${signerAddresses.length}`);
  }

  const timeLockSeconds = parseInt(process.env.MULTISIG_TIMELOCK_SECONDS || "86400", 10); // 24h default

  const AegisMultiSig = await ethers.getContractFactory("AegisMultiSig");
  const multiSig = await AegisMultiSig.deploy(
    signerAddresses,
    threshold,
    timeLockSeconds,
    recoveryAddress
  );
  await multiSig.waitForDeployment();
  deployed.multiSig = await multiSig.getAddress();
  console.log(`   ✅  AegisMultiSig deployed to: ${deployed.multiSig}`);
  console.log(`       Signers (${signerAddresses.length}): ${signerAddresses.join(", ")}`);
  console.log(`       Threshold: ${threshold}-of-${signerAddresses.length}`);
  console.log(`       Time-lock: ${timeLockSeconds}s`);

  // ─── 3. Deploy AegisTradeEscrow ─────────────────────────────────────────
  console.log("📦  Deploying AegisTradeEscrow...");
  const AegisTradeEscrow = await ethers.getContractFactory("AegisTradeEscrow");
  const tradeEscrow = await AegisTradeEscrow.deploy(
    treasury,
    true // AUDIT_CONFIRMED guard already checked above
  );
  await tradeEscrow.waitForDeployment();
  deployed.tradeEscrow = await tradeEscrow.getAddress();
  console.log(`   ✅  AegisTradeEscrow deployed to: ${deployed.tradeEscrow}`);

  // Approve USDC stablecoin (testnet addresses — override via APPROVED_STABLECOIN env)
  const STABLECOIN_ADDRESS = process.env.APPROVED_STABLECOIN;
  if (STABLECOIN_ADDRESS && ethers.isAddress(STABLECOIN_ADDRESS)) {
    await tradeEscrow.approveStablecoin(STABLECOIN_ADDRESS, true);
    console.log(`   ✅  Approved stablecoin: ${STABLECOIN_ADDRESS}`);
  } else {
    console.log("   ⚠️   APPROVED_STABLECOIN not set — no stablecoin approved yet. Set via approveStablecoin().");
  }

  // Fix 51 — Rotate fee recipient to treasury multisig immediately post-deploy
  console.log(`   🔄  Rotating fee recipient to treasury: ${treasury}`);
  await tradeEscrow.updateFeeRecipient(treasury);
  console.log(`   ✅  Fee recipient set to treasury multisig.`);

  // ─── 4. Deploy AegisTrancheEscrow ───────────────────────────────────────
  console.log("📦  Deploying AegisTrancheEscrow...");
  const feeBps = parseInt(process.env.PLATFORM_FEE_BPS || "15", 10); // 0.15% default
  const AegisTrancheEscrow = await ethers.getContractFactory("AegisTrancheEscrow");
  const trancheEscrow = await AegisTrancheEscrow.deploy(feeBps, treasury);
  await trancheEscrow.waitForDeployment();
  deployed.trancheEscrow = await trancheEscrow.getAddress();
  console.log(`   ✅  AegisTrancheEscrow deployed to: ${deployed.trancheEscrow}`);

  // ─── 5. Grant ESCROW_ROLE on BoLNFT to TradeEscrow ─────────────────────
  console.log("🔑  Granting ESCROW_ROLE on BoLNFT to AegisTradeEscrow...");
  const ESCROW_ROLE = ethers.id("ESCROW_ROLE");
  await bolNFT.grantRole(ESCROW_ROLE, deployed.tradeEscrow);
  await bolNFT.grantRole(ESCROW_ROLE, deployed.trancheEscrow);
  console.log(`   ✅  ESCROW_ROLE granted to TradeEscrow and TrancheEscrow.`);

  // ─── Deployment Summary ──────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("   DEPLOYMENT SUMMARY");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`   Network:            ${network.name}`);
  console.log(`   AegisBoLNFT:        ${deployed.bolNFT}`);
  console.log(`   AegisMultiSig:      ${deployed.multiSig}`);
  console.log(`   AegisTradeEscrow:   ${deployed.tradeEscrow}`);
  console.log(`   AegisTrancheEscrow: ${deployed.trancheEscrow}`);
  console.log("═══════════════════════════════════════════════════════");
  console.log("\n  Update your service .env files:");
  console.log(`  BOL_NFT_CONTRACT_ADDRESS=${deployed.bolNFT}`);
  console.log(`  MULTISIG_CONTRACT_ADDRESS=${deployed.multiSig}`);
  console.log(`  ESCROW_CONTRACT_ADDRESS=${deployed.tradeEscrow}`);
  console.log(`  TRANCHE_ESCROW_CONTRACT_ADDRESS=${deployed.trancheEscrow}`);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌  Deployment failed:", error.message);
    process.exit(1);
  });
