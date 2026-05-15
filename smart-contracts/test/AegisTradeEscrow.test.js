const { expect } = require("chai");
const { ethers } = require("hardhat");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Deploy a minimal ERC-20 mock (no OpenZeppelin dependency needed in test layer).
 * Returns a contract with mint() and standard ERC-20 interface.
 */
async function deployMockERC20(deployer) {
  const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
  const token = await MockERC20.deploy("Mock USDC", "mUSDC", 6);
  await token.waitForDeployment();
  return token;
}

async function deployEscrow(feeRecipient, deployer) {
  // The constructor requires auditConfirmed = true
  const AegisTradeEscrow = await ethers.getContractFactory(
    "AegisTradeEscrow",
    deployer
  );
  const escrow = await AegisTradeEscrow.deploy(
    feeRecipient,
    true // AUDIT_CONFIRMED = true for tests
  );
  await escrow.waitForDeployment();
  return escrow;
}

// Signs an oracle fulfillment message and returns the raw bytes signature.
async function signFulfillment(signer, escrowId, conditionIndex, documentHash) {
  const messageHash = ethers.solidityPackedKeccak256(
    ["bytes32", "uint256", "bytes32"],
    [escrowId, conditionIndex, documentHash]
  );
  const ethSignedHash = ethers.hashMessage(ethers.getBytes(messageHash));
  return signer.signMessage(ethers.getBytes(messageHash));
}

// Signs a buyer release message for multi-sig escrows.
async function signRelease(signer, escrowId) {
  const messageHash = ethers.solidityPackedKeccak256(
    ["string", "bytes32"],
    ["RELEASE", escrowId]
  );
  return signer.signMessage(ethers.getBytes(messageHash));
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("AegisTradeEscrow", function () {
  let escrow, token;
  let deployer, buyer, seller, oracle, arbitrator, treasury, other;

  const PLATFORM_ADMIN  = ethers.id("PLATFORM_ADMIN");
  const ORACLE_ROLE     = ethers.id("ORACLE_ROLE");
  const ARBITRATOR_ROLE = ethers.id("ARBITRATOR_ROLE");
  const COMPLIANCE_ROLE = ethers.id("COMPLIANCE_ROLE");

  // ConditionType enum values (must match Solidity order)
  const ConditionType = { BILL_OF_LADING: 0, COMMERCIAL_INVOICE: 1, CUSTOMS_CLEARANCE: 3 };

  beforeEach(async function () {
    [deployer, buyer, seller, oracle, arbitrator, treasury, other] =
      await ethers.getSigners();

    token  = await deployMockERC20(deployer);
    escrow = await deployEscrow(treasury.address, deployer);

    // Grant roles
    await escrow.grantRole(ORACLE_ROLE,     oracle.address);
    await escrow.grantRole(ARBITRATOR_ROLE, arbitrator.address);
    await escrow.grantRole(COMPLIANCE_ROLE, deployer.address);

    // Approve token in escrow
    await escrow.approveStablecoin(await token.getAddress(), true);

    // Fund buyer
    await token.mint(buyer.address, ethers.parseUnits("100000", 6));
  });

  // ─── createEscrow ────────────────────────────────────────────────────────

  describe("createEscrow()", function () {
    it("creates an escrow and returns a non-zero ID", async function () {
      const tx = await escrow.connect(buyer).createEscrow(
        seller.address,
        await token.getAddress(),
        ethers.parseUnits("5000", 6),
        [ConditionType.BILL_OF_LADING],
        30,
        "TRD-001",
        ethers.ZeroHash,
        false
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (l) => l.fragment && l.fragment.name === "EscrowCreated"
      );
      expect(event).to.not.be.undefined;
      expect(event.args.escrowId).to.not.equal(ethers.ZeroHash);
    });

    it("reverts if stablecoin is not approved", async function () {
      await expect(
        escrow.connect(buyer).createEscrow(
          seller.address,
          other.address, // not approved
          ethers.parseUnits("5000", 6),
          [ConditionType.BILL_OF_LADING],
          30, "TRD-002", ethers.ZeroHash, false
        )
      ).to.be.revertedWith("Stablecoin not approved by VARA");
    });

    it("reverts if amount is below minimum", async function () {
      await expect(
        escrow.connect(buyer).createEscrow(
          seller.address, await token.getAddress(),
          ethers.parseUnits("500", 6), // below $1000 minimum
          [ConditionType.BILL_OF_LADING],
          30, "TRD-003", ethers.ZeroHash, false
        )
      ).to.be.revertedWith("Amount below minimum");
    });

    it("reverts if seller is the buyer", async function () {
      await expect(
        escrow.connect(buyer).createEscrow(
          buyer.address, await token.getAddress(),
          ethers.parseUnits("5000", 6),
          [ConditionType.BILL_OF_LADING],
          30, "TRD-004", ethers.ZeroHash, false
        )
      ).to.be.revertedWith("Invalid seller");
    });

    it("nonce increments produce unique escrow IDs for same buyer", async function () {
      const createOne = async (ref) => {
        const tx = await escrow.connect(buyer).createEscrow(
          seller.address, await token.getAddress(),
          ethers.parseUnits("5000", 6),
          [ConditionType.BILL_OF_LADING],
          30, ref, ethers.ZeroHash, false
        );
        const receipt = await tx.wait();
        return receipt.logs.find(l => l.fragment?.name === "EscrowCreated").args.escrowId;
      };
      const id1 = await createOne("REF-A");
      const id2 = await createOne("REF-B");
      expect(id1).to.not.equal(id2);
    });
  });

  // ─── fundEscrow ──────────────────────────────────────────────────────────

  describe("fundEscrow()", function () {
    let escrowId;
    const AMOUNT = ethers.parseUnits("5000", 6);

    beforeEach(async function () {
      const tx = await escrow.connect(buyer).createEscrow(
        seller.address, await token.getAddress(), AMOUNT,
        [ConditionType.BILL_OF_LADING], 30, "TRD-FUND", ethers.ZeroHash, false
      );
      const receipt = await tx.wait();
      escrowId = receipt.logs.find(l => l.fragment?.name === "EscrowCreated").args.escrowId;

      await token.connect(buyer).approve(await escrow.getAddress(), AMOUNT);
    });

    it("transfers tokens and sets status to FUNDED", async function () {
      await escrow.connect(buyer).fundEscrow(escrowId);
      const data = await escrow.getEscrow(escrowId);
      expect(data.status).to.equal(1); // FUNDED = 1
    });

    it("reverts if called by non-buyer", async function () {
      await expect(
        escrow.connect(seller).fundEscrow(escrowId)
      ).to.be.revertedWith("Only buyer can call this");
    });

    it("reverts if escrow already funded", async function () {
      await escrow.connect(buyer).fundEscrow(escrowId);
      await expect(
        escrow.connect(buyer).fundEscrow(escrowId)
      ).to.be.revertedWith("Escrow already funded");
    });
  });

  // ─── fulfillCondition ────────────────────────────────────────────────────

  describe("fulfillCondition()", function () {
    let escrowId;
    const AMOUNT = ethers.parseUnits("5000", 6);
    const docHash = ethers.keccak256(ethers.toUtf8Bytes("BL-DOCUMENT-HASH"));

    beforeEach(async function () {
      const tx = await escrow.connect(buyer).createEscrow(
        seller.address, await token.getAddress(), AMOUNT,
        [ConditionType.BILL_OF_LADING], 30, "TRD-COND", ethers.ZeroHash, false
      );
      const receipt = await tx.wait();
      escrowId = receipt.logs.find(l => l.fragment?.name === "EscrowCreated").args.escrowId;
      await token.connect(buyer).approve(await escrow.getAddress(), AMOUNT);
      await escrow.connect(buyer).fundEscrow(escrowId);
    });

    it("marks condition fulfilled when oracle provides valid signature", async function () {
      const sig = await signFulfillment(oracle, escrowId, 0, docHash);
      await escrow.connect(oracle).fulfillCondition(escrowId, 0, docHash, sig);
      const cond = await escrow.getCondition(escrowId, 0);
      expect(cond.fulfilled).to.be.true;
      expect(cond.documentHash).to.equal(docHash);
    });

    it("reverts if signature is from non-oracle signer", async function () {
      const sig = await signFulfillment(other, escrowId, 0, docHash); // other has no ORACLE_ROLE
      await expect(
        escrow.connect(oracle).fulfillCondition(escrowId, 0, docHash, sig)
      ).to.be.revertedWith("Invalid oracle signature");
    });

    it("reverts if condition already fulfilled", async function () {
      const sig = await signFulfillment(oracle, escrowId, 0, docHash);
      await escrow.connect(oracle).fulfillCondition(escrowId, 0, docHash, sig);
      const sig2 = await signFulfillment(oracle, escrowId, 0, docHash);
      await expect(
        escrow.connect(oracle).fulfillCondition(escrowId, 0, docHash, sig2)
      ).to.be.revertedWith("Condition already fulfilled");
    });

    it("reverts if called by non-oracle", async function () {
      const sig = await signFulfillment(oracle, escrowId, 0, docHash);
      await expect(
        escrow.connect(other).fulfillCondition(escrowId, 0, docHash, sig)
      ).to.be.reverted;
    });
  });

  // ─── releaseFunds ────────────────────────────────────────────────────────

  describe("releaseFunds()", function () {
    let escrowId;
    const AMOUNT = ethers.parseUnits("10000", 6);
    const docHash = ethers.keccak256(ethers.toUtf8Bytes("DOC"));

    async function createFundAndFulfill(multiSig = false) {
      const tx = await escrow.connect(buyer).createEscrow(
        seller.address, await token.getAddress(), AMOUNT,
        [ConditionType.BILL_OF_LADING], 30, "TRD-REL", ethers.ZeroHash, multiSig
      );
      const receipt = await tx.wait();
      const id = receipt.logs.find(l => l.fragment?.name === "EscrowCreated").args.escrowId;
      await token.connect(buyer).approve(await escrow.getAddress(), AMOUNT);
      await escrow.connect(buyer).fundEscrow(id);
      const sig = await signFulfillment(oracle, id, 0, docHash);
      await escrow.connect(oracle).fulfillCondition(id, 0, docHash, sig);
      return id;
    }

    it("releases net amount to seller and fee to treasury", async function () {
      const id = await createFundAndFulfill();
      const sellerBefore  = await token.balanceOf(seller.address);
      const treasuryBefore = await token.balanceOf(treasury.address);

      await escrow.connect(seller).releaseFunds(id, "0x");

      const fee = (AMOUNT * 15n) / 10000n;
      const net = AMOUNT - fee;
      expect(await token.balanceOf(seller.address)).to.equal(sellerBefore + net);
      expect(await token.balanceOf(treasury.address)).to.equal(treasuryBefore + fee);
    });

    it("reverts if not all conditions met", async function () {
      // Create with 2 conditions, only fulfill 1
      const tx = await escrow.connect(buyer).createEscrow(
        seller.address, await token.getAddress(), AMOUNT,
        [ConditionType.BILL_OF_LADING, ConditionType.COMMERCIAL_INVOICE],
        30, "TRD-PARTIAL", ethers.ZeroHash, false
      );
      const receipt = await tx.wait();
      const id = receipt.logs.find(l => l.fragment?.name === "EscrowCreated").args.escrowId;
      await token.connect(buyer).approve(await escrow.getAddress(), AMOUNT);
      await escrow.connect(buyer).fundEscrow(id);
      const sig = await signFulfillment(oracle, id, 0, docHash);
      await escrow.connect(oracle).fulfillCondition(id, 0, docHash, sig);
      await expect(escrow.connect(seller).releaseFunds(id, "0x"))
        .to.be.revertedWith("Not all conditions met");
    });

    it("multi-sig escrow: reverts without valid buyer signature", async function () {
      const id = await createFundAndFulfill(true);
      await expect(
        escrow.connect(seller).releaseFunds(id, "0x")
      ).to.be.reverted;
    });

    it("multi-sig escrow: releases with valid buyer signature", async function () {
      const id = await createFundAndFulfill(true);
      const buyerSig = await signRelease(buyer, id);
      await expect(
        escrow.connect(seller).releaseFunds(id, buyerSig)
      ).to.emit(escrow, "EscrowReleased");
    });
  });

  // ─── claimRefund ─────────────────────────────────────────────────────────

  describe("claimRefund()", function () {
    let escrowId;
    const AMOUNT = ethers.parseUnits("5000", 6);

    beforeEach(async function () {
      const tx = await escrow.connect(buyer).createEscrow(
        seller.address, await token.getAddress(), AMOUNT,
        [ConditionType.BILL_OF_LADING], 1, // 1 day expiry
        "TRD-REFUND", ethers.ZeroHash, false
      );
      const receipt = await tx.wait();
      escrowId = receipt.logs.find(l => l.fragment?.name === "EscrowCreated").args.escrowId;
      await token.connect(buyer).approve(await escrow.getAddress(), AMOUNT);
      await escrow.connect(buyer).fundEscrow(escrowId);
    });

    it("refunds buyer after expiry", async function () {
      // Time-travel past expiry
      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]); // +2 days
      await ethers.provider.send("evm_mine");
      const before = await token.balanceOf(buyer.address);
      await escrow.connect(buyer).claimRefund(escrowId);
      expect(await token.balanceOf(buyer.address)).to.equal(before + AMOUNT);
    });

    it("reverts if escrow not yet expired", async function () {
      await expect(
        escrow.connect(buyer).claimRefund(escrowId)
      ).to.be.revertedWith("Escrow not yet expired");
    });

    it("Fix 22 — reverts if conditions are already met (status == CONDITIONS_MET)", async function () {
      // Fulfill all conditions
      const docHash = ethers.keccak256(ethers.toUtf8Bytes("DOC"));
      const sig = await signFulfillment(oracle, escrowId, 0, docHash);
      await escrow.connect(oracle).fulfillCondition(escrowId, 0, docHash, sig);

      // Time-travel past expiry
      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");

      // Buyer should NOT be able to claim refund after conditions met
      await expect(
        escrow.connect(buyer).claimRefund(escrowId)
      ).to.be.revertedWith("Cannot refund");
    });
  });

  // ─── initiateDispute / resolveDispute / claimStaleDispute ─────────────

  describe("Dispute flow (Fix 14)", function () {
    let escrowId;
    const AMOUNT = ethers.parseUnits("5000", 6);

    beforeEach(async function () {
      const tx = await escrow.connect(buyer).createEscrow(
        seller.address, await token.getAddress(), AMOUNT,
        [ConditionType.BILL_OF_LADING], 30, "TRD-DISP", ethers.ZeroHash, false
      );
      const receipt = await tx.wait();
      escrowId = receipt.logs.find(l => l.fragment?.name === "EscrowCreated").args.escrowId;
      await token.connect(buyer).approve(await escrow.getAddress(), AMOUNT);
      await escrow.connect(buyer).fundEscrow(escrowId);
    });

    it("initiateDispute sets status to DISPUTED and emits deadline", async function () {
      const tx = await escrow.connect(buyer).initiateDispute(escrowId);
      const receipt = await tx.wait();
      const event = receipt.logs.find(l => l.fragment?.name === "DisputeInitiated");
      expect(event).to.not.be.undefined;
      expect(event.args.disputeDeadline).to.be.gt(0);

      const data = await escrow.getEscrow(escrowId);
      expect(data.status).to.equal(4); // DISPUTED = 4
    });

    it("resolveDispute — arbitrator can release to seller before deadline", async function () {
      await escrow.connect(buyer).initiateDispute(escrowId);
      const before = await token.balanceOf(seller.address);
      await escrow.connect(arbitrator).resolveDispute(escrowId, true);
      expect(await token.balanceOf(seller.address)).to.be.gt(before);
    });

    it("resolveDispute — arbitrator can refund buyer before deadline", async function () {
      await escrow.connect(buyer).initiateDispute(escrowId);
      const before = await token.balanceOf(buyer.address);
      await escrow.connect(arbitrator).resolveDispute(escrowId, false);
      expect(await token.balanceOf(buyer.address)).to.equal(before + AMOUNT);
    });

    it("resolveDispute — reverts after deadline", async function () {
      await escrow.connect(buyer).initiateDispute(escrowId);
      await ethers.provider.send("evm_increaseTime", [15 * 24 * 60 * 60]); // +15 days
      await ethers.provider.send("evm_mine");
      await expect(
        escrow.connect(arbitrator).resolveDispute(escrowId, true)
      ).to.be.revertedWith("Arbitration deadline has passed");
    });

    it("claimStaleDispute — buyer reclaims after deadline", async function () {
      await escrow.connect(buyer).initiateDispute(escrowId);
      await ethers.provider.send("evm_increaseTime", [15 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      const before = await token.balanceOf(buyer.address);
      await escrow.connect(buyer).claimStaleDispute(escrowId);
      expect(await token.balanceOf(buyer.address)).to.equal(before + AMOUNT);
    });

    it("claimStaleDispute — reverts if deadline has not passed", async function () {
      await escrow.connect(buyer).initiateDispute(escrowId);
      await expect(
        escrow.connect(buyer).claimStaleDispute(escrowId)
      ).to.be.revertedWith("Arbitration deadline not yet passed");
    });

    it("reverts if non-party tries to initiate dispute", async function () {
      await expect(
        escrow.connect(other).initiateDispute(escrowId)
      ).to.be.revertedWith("Not a party");
    });
  });

  // ─── Admin functions ─────────────────────────────────────────────────────

  describe("Admin: updateFeeRecipient() (Fix 51)", function () {
    it("updates fee recipient when called by PLATFORM_ADMIN", async function () {
      await escrow.updateFeeRecipient(other.address);
      expect(await escrow.feeRecipient()).to.equal(other.address);
    });

    it("reverts when passed the zero address", async function () {
      await expect(
        escrow.updateFeeRecipient(ethers.ZeroAddress)
      ).to.be.revertedWith("Zero address not permitted");
    });

    it("reverts when called by non-admin", async function () {
      await expect(
        escrow.connect(other).updateFeeRecipient(other.address)
      ).to.be.reverted;
    });
  });

  describe("Admin: emergencyPause() / unpause()", function () {
    it("blocks createEscrow when paused", async function () {
      await escrow.emergencyPause();
      await expect(
        escrow.connect(buyer).createEscrow(
          seller.address, await token.getAddress(),
          ethers.parseUnits("5000", 6),
          [ConditionType.BILL_OF_LADING], 30, "TRD-PAUSE", ethers.ZeroHash, false
        )
      ).to.be.reverted;
    });

    it("allows operations after unpause", async function () {
      await escrow.emergencyPause();
      await escrow.unpause();
      await expect(
        escrow.connect(buyer).createEscrow(
          seller.address, await token.getAddress(),
          ethers.parseUnits("5000", 6),
          [ConditionType.BILL_OF_LADING], 30, "TRD-RESUME", ethers.ZeroHash, false
        )
      ).to.not.be.reverted;
    });
  });
});
