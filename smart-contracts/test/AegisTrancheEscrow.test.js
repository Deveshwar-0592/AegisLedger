const { expect } = require("chai");
const { ethers } = require("hardhat");

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function deployMockERC20(deployer) {
  const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
  const token = await MockERC20.deploy("Mock USDT", "mUSDT", 6);
  await token.waitForDeployment();
  return token;
}

async function deployTranche(feeBps, feeRecipient, deployer) {
  const AegisTrancheEscrow = await ethers.getContractFactory(
    "AegisTrancheEscrow",
    deployer
  );
  const contract = await AegisTrancheEscrow.deploy(feeBps, feeRecipient);
  await contract.waitForDeployment();
  return contract;
}

/**
 * Creates and funds a tranche escrow with N equal tranches.
 * @param {*} escrow  - contract instance
 * @param {*} buyer   - signer
 * @param {*} seller  - signer
 * @param {*} token   - ERC20 contract
 * @param {number} trancheCount - number of tranches (1–10)
 * @param {string} ref - trade reference string
 * @returns escrowId (BigInt)
 */
async function createAndFundEscrow(escrow, buyer, seller, token, arbitrator, trancheCount, ref) {
  const totalAmount = ethers.parseUnits("10000", 6);
  const percentageEach = Math.floor(10000 / trancheCount);
  const percentages = Array(trancheCount).fill(percentageEach);
  // Fix rounding: last tranche absorbs remainder
  const remainder = 10000 - percentageEach * trancheCount;
  percentages[trancheCount - 1] += remainder;

  const descriptions = Array.from({ length: trancheCount }, (_, i) => `Condition ${i}`);
  const hashes = descriptions.map((_, i) =>
    ethers.keccak256(ethers.toUtf8Bytes(`condition-data-${i}`))
  );

  await token.connect(buyer).approve(await escrow.getAddress(), totalAmount + totalAmount); // generous approval

  const tx = await escrow.connect(buyer).createTranchEscrow(
    seller.address,
    await token.getAddress(),
    totalAmount,
    ref,
    "Crude Oil 50000 MT",
    30,
    arbitrator.address,
    descriptions,
    percentages,
    hashes
  );
  const receipt = await tx.wait();
  const event = receipt.logs.find(l => l.fragment?.name === "EscrowCreated");
  return event.args.escrowId;
}

/** Returns the preimage bytes that satisfy conditionHash for tranche i */
function conditionData(i) {
  return ethers.toUtf8Bytes(`condition-data-${i}`);
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("AegisTrancheEscrow", function () {
  let escrow, token;
  let deployer, buyer, seller, arbitrator, treasury, other;

  beforeEach(async function () {
    [deployer, buyer, seller, arbitrator, treasury, other] =
      await ethers.getSigners();

    token  = await deployMockERC20(deployer);
    escrow = await deployTranche(15, treasury.address, deployer); // 0.15% fee

    await token.mint(buyer.address, ethers.parseUnits("500000", 6));
  });

  // ─── createTranchEscrow ────────────────────────────────────────────────

  describe("createTranchEscrow()", function () {
    it("creates a 3-tranche escrow and emits EscrowCreated", async function () {
      const id = await createAndFundEscrow(escrow, buyer, seller, token, arbitrator, 3, "TRC-001");
      expect(id).to.not.equal(0n);
    });

    it("reverts if percentages do not sum to 10000", async function () {
      const totalAmount = ethers.parseUnits("10000", 6);
      await token.connect(buyer).approve(await escrow.getAddress(), totalAmount);
      await expect(
        escrow.connect(buyer).createTranchEscrow(
          seller.address, await token.getAddress(), totalAmount,
          "TRC-BAD", "Test", 30, arbitrator.address,
          ["C1", "C2"],
          [3000, 3000], // sums to 6000, not 10000
          [ethers.ZeroHash, ethers.ZeroHash]
        )
      ).to.be.revertedWith("Percentages must sum to 100%");
    });

    it("reverts if seller is the buyer", async function () {
      const totalAmount = ethers.parseUnits("10000", 6);
      await token.connect(buyer).approve(await escrow.getAddress(), totalAmount);
      await expect(
        escrow.connect(buyer).createTranchEscrow(
          buyer.address, await token.getAddress(), totalAmount,
          "TRC-SELF", "Test", 30, arbitrator.address,
          ["C1"], [10000], [ethers.ZeroHash]
        )
      ).to.be.revertedWith("Invalid seller");
    });

    it("reverts if more than 10 tranches", async function () {
      const totalAmount = ethers.parseUnits("10000", 6);
      await token.connect(buyer).approve(await escrow.getAddress(), totalAmount);
      const n = 11;
      const descs = Array(n).fill("C");
      const pcts  = Array(n).fill(909); // intentionally wrong sum, but length check fires first
      const hashes = Array(n).fill(ethers.ZeroHash);
      await expect(
        escrow.connect(buyer).createTranchEscrow(
          seller.address, await token.getAddress(), totalAmount,
          "TRC-LARGE", "Test", 30, arbitrator.address,
          descs, pcts, hashes
        )
      ).to.be.revertedWith("1-10 tranches");
    });
  });

  // ─── releaseTranche — sequential ordering (Fix 34) ────────────────────

  describe("releaseTranche() — Fix 34: Sequential Enforcement", function () {
    let id;

    beforeEach(async function () {
      id = await createAndFundEscrow(
        escrow, buyer, seller, token, arbitrator, 3, "TRC-SEQ"
      );
    });

    it("releases tranche 0 successfully", async function () {
      const sellerBefore = await token.balanceOf(seller.address);
      await escrow.connect(buyer).releaseTranche(id, 0, conditionData(0));
      expect(await token.balanceOf(seller.address)).to.be.gt(sellerBefore);
    });

    it("releases tranches 0 → 1 → 2 in order", async function () {
      await escrow.connect(buyer).releaseTranche(id, 0, conditionData(0));
      await escrow.connect(buyer).releaseTranche(id, 1, conditionData(1));
      await escrow.connect(buyer).releaseTranche(id, 2, conditionData(2));

      const progress = await escrow.getEscrowProgress(id);
      // releasedPct should be 10000 (100%)
      expect(progress.releasedPct).to.equal(10000n);
    });

    it("Fix 34 — reverts if tranche 1 is released before tranche 0", async function () {
      await expect(
        escrow.connect(buyer).releaseTranche(id, 1, conditionData(1))
      ).to.be.revertedWith("Prior tranche must be released first");
    });

    it("Fix 34 — reverts if tranche 2 is released before tranche 1", async function () {
      await escrow.connect(buyer).releaseTranche(id, 0, conditionData(0));
      await expect(
        escrow.connect(buyer).releaseTranche(id, 2, conditionData(2))
      ).to.be.revertedWith("Prior tranche must be released first");
    });

    it("reverts if condition data does not match stored hash", async function () {
      await expect(
        escrow.connect(buyer).releaseTranche(
          id, 0, ethers.toUtf8Bytes("wrong-data")
        )
      ).to.be.revertedWith("Condition not satisfied");
    });

    it("reverts if tranche already released", async function () {
      await escrow.connect(buyer).releaseTranche(id, 0, conditionData(0));
      await expect(
        escrow.connect(buyer).releaseTranche(id, 0, conditionData(0))
      ).to.be.revertedWith("Tranche not locked");
    });

    it("arbitrator can release tranches", async function () {
      const before = await token.balanceOf(seller.address);
      await escrow.connect(arbitrator).releaseTranche(id, 0, conditionData(0));
      expect(await token.balanceOf(seller.address)).to.be.gt(before);
    });

    it("reverts if called by seller (not authorized)", async function () {
      await expect(
        escrow.connect(seller).releaseTranche(id, 0, conditionData(0))
      ).to.be.revertedWith("Not authorised to release");
    });

    it("single-tranche escrow: tranche 0 has no prior check", async function () {
      const singleId = await createAndFundEscrow(
        escrow, buyer, seller, token, arbitrator, 1, "TRC-SINGLE"
      );
      await expect(
        escrow.connect(buyer).releaseTranche(singleId, 0, conditionData(0))
      ).to.not.be.reverted;
    });
  });

  // ─── Dispute flow ──────────────────────────────────────────────────────

  describe("Dispute flow", function () {
    let id;

    beforeEach(async function () {
      id = await createAndFundEscrow(
        escrow, buyer, seller, token, arbitrator, 2, "TRC-DISP"
      );
    });

    it("buyer can initiate dispute", async function () {
      await expect(
        escrow.connect(buyer).initiateDispute(id, "Quality mismatch")
      ).to.emit(escrow, "EscrowDisputed");
    });

    it("seller can initiate dispute", async function () {
      await expect(
        escrow.connect(seller).initiateDispute(id, "Payment delay")
      ).to.emit(escrow, "EscrowDisputed");
    });

    it("other party cannot initiate dispute", async function () {
      await expect(
        escrow.connect(other).initiateDispute(id, "Not a party")
      ).to.be.revertedWith("Not party to escrow");
    });

    it("arbitrator resolves in favor of seller", async function () {
      await escrow.connect(buyer).initiateDispute(id, "Dispute");
      const before = await token.balanceOf(seller.address);
      await escrow.connect(arbitrator).resolveDispute(id, true);
      expect(await token.balanceOf(seller.address)).to.be.gt(before);
    });

    it("arbitrator resolves in favor of buyer (refund)", async function () {
      await escrow.connect(buyer).initiateDispute(id, "Dispute");
      const before = await token.balanceOf(buyer.address);
      await escrow.connect(arbitrator).resolveDispute(id, false);
      expect(await token.balanceOf(buyer.address)).to.be.gt(before);
    });
  });

  // ─── Expiry refund ─────────────────────────────────────────────────────

  describe("refundExpired()", function () {
    it("refunds buyer after escrow expires", async function () {
      const id = await createAndFundEscrow(
        escrow, buyer, seller, token, arbitrator, 1, "TRC-EXP"
      );
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]); // +31 days
      await ethers.provider.send("evm_mine");

      const before = await token.balanceOf(buyer.address);
      await escrow.connect(buyer).refundExpired(id);
      expect(await token.balanceOf(buyer.address)).to.be.gt(before);
    });

    it("reverts if escrow has not expired", async function () {
      const id = await createAndFundEscrow(
        escrow, buyer, seller, token, arbitrator, 1, "TRC-NOTEXP"
      );
      await expect(
        escrow.connect(buyer).refundExpired(id)
      ).to.be.revertedWith("Not expired");
    });
  });

  // ─── getEscrowProgress ────────────────────────────────────────────────

  describe("getEscrowProgress()", function () {
    it("reports 0% released initially and 50% after first of 2 tranches", async function () {
      const id = await createAndFundEscrow(
        escrow, buyer, seller, token, arbitrator, 2, "TRC-PROG"
      );
      const before = await escrow.getEscrowProgress(id);
      expect(before.releasedPct).to.equal(0n);

      await escrow.connect(buyer).releaseTranche(id, 0, conditionData(0));
      const after = await escrow.getEscrowProgress(id);
      // 50% ± rounding for fee deduction
      expect(after.releasedPct).to.be.closeTo(5000n, 10n);
    });
  });
});
