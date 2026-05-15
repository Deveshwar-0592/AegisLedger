const { expect } = require("chai");
const { ethers } = require("hardhat");

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function deployMockERC20(deployer) {
  const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
  const token = await MockERC20.deploy("Mock Token", "MTK", 18);
  await token.waitForDeployment();
  return token;
}

async function deployMultiSig(signers, threshold, timeLockSeconds, recoveryAddress, deployer) {
  const AegisMultiSig = await ethers.getContractFactory("AegisMultiSig", deployer);
  const ms = await AegisMultiSig.deploy(
    signers.map(s => s.address),
    threshold,
    timeLockSeconds,
    recoveryAddress
  );
  await ms.waitForDeployment();
  return ms;
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("AegisMultiSig (Fix 33 — Ownable2Step + Recovery)", function () {
  let ms, token;
  let deployer, signer1, signer2, signer3, recovery, recipient, other;

  beforeEach(async function () {
    [deployer, signer1, signer2, signer3, recovery, recipient, other] =
      await ethers.getSigners();

    token = await deployMockERC20(deployer);

    // 2-of-3 multisig, no time-lock, recovery address set
    ms = await deployMultiSig(
      [signer1, signer2, signer3],
      2,
      0, // no time-lock
      recovery.address,
      deployer
    );

    // Fund the multisig with ERC-20 tokens
    await token.mint(await ms.getAddress(), ethers.parseEther("1000"));
  });

  // ─── Constructor ────────────────────────────────────────────────────────

  describe("constructor()", function () {
    it("sets threshold and signer count correctly", async function () {
      expect(await ms.threshold()).to.equal(2n);
      const signers = await ms.getSigners();
      expect(signers.length).to.equal(3);
    });

    it("sets recovery address", async function () {
      expect(await ms.recoveryAddress()).to.equal(recovery.address);
    });

    it("reverts if fewer than 2 signers", async function () {
      const AegisMultiSig = await ethers.getContractFactory("AegisMultiSig");
      await expect(
        AegisMultiSig.deploy([signer1.address], 1, 0, recovery.address)
      ).to.be.revertedWith("Minimum 2 signers");
    });

    it("reverts if threshold less than 2", async function () {
      const AegisMultiSig = await ethers.getContractFactory("AegisMultiSig");
      await expect(
        AegisMultiSig.deploy(
          [signer1.address, signer2.address], 1, 0, recovery.address
        )
      ).to.be.revertedWith("Invalid threshold");
    });

    it("reverts if recovery address is zero", async function () {
      const AegisMultiSig = await ethers.getContractFactory("AegisMultiSig");
      await expect(
        AegisMultiSig.deploy(
          [signer1.address, signer2.address], 2, 0, ethers.ZeroAddress
        )
      ).to.be.revertedWith("Recovery address cannot be zero");
    });
  });

  // ─── submitTransaction ───────────────────────────────────────────────────

  describe("submitTransaction()", function () {
    it("submits a transaction and auto-confirms for proposer", async function () {
      const tx = await ms.connect(signer1).submitTransaction(
        recipient.address,
        ethers.parseEther("10"),
        await token.getAddress(),
        "TX-001",
        "",
        ethers.ZeroHash
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(l => l.fragment?.name === "TransactionSubmitted");
      expect(event).to.not.be.undefined;
      const txId = event.args.txId;

      // Auto-confirmed by proposer = 1 confirmation
      expect(await ms.getConfirmationCount(txId)).to.equal(1n);
    });

    it("reverts if called by non-signer", async function () {
      await expect(
        ms.connect(other).submitTransaction(
          recipient.address, ethers.parseEther("10"),
          await token.getAddress(), "TX-FAIL", "", ethers.ZeroHash
        )
      ).to.be.revertedWith("Not a signer");
    });

    it("reverts if amount is zero", async function () {
      await expect(
        ms.connect(signer1).submitTransaction(
          recipient.address, 0n,
          await token.getAddress(), "TX-ZERO", "", ethers.ZeroHash
        )
      ).to.be.revertedWith("Amount must be > 0");
    });
  });

  // ─── confirmTransaction / executeTransaction ─────────────────────────────

  describe("confirmTransaction() + executeTransaction()", function () {
    let txId;

    beforeEach(async function () {
      const tx = await ms.connect(signer1).submitTransaction(
        recipient.address,
        ethers.parseEther("10"),
        await token.getAddress(),
        "TX-EXEC",
        "",
        ethers.ZeroHash
      );
      const receipt = await tx.wait();
      txId = receipt.logs.find(l => l.fragment?.name === "TransactionSubmitted").args.txId;
    });

    it("executes after reaching threshold (2 of 3)", async function () {
      await ms.connect(signer2).confirmTransaction(txId); // 2nd confirmation → threshold reached

      const before = await token.balanceOf(recipient.address);
      await ms.connect(signer1).executeTransaction(txId);
      const after = await token.balanceOf(recipient.address);
      expect(after - before).to.equal(ethers.parseEther("10"));
    });

    it("reverts if executed before threshold", async function () {
      // Only 1 confirmation (proposer) — need 2
      await expect(
        ms.connect(signer1).executeTransaction(txId)
      ).to.be.revertedWith("Insufficient confirmations");
    });

    it("reverts if double-confirming", async function () {
      await expect(
        ms.connect(signer1).confirmTransaction(txId)
      ).to.be.revertedWith("Already confirmed");
    });

    it("reverts if executed twice", async function () {
      await ms.connect(signer2).confirmTransaction(txId);
      await ms.connect(signer1).executeTransaction(txId);
      await expect(
        ms.connect(signer1).executeTransaction(txId)
      ).to.be.revertedWith("Already executed");
    });
  });

  // ─── revokeConfirmation ──────────────────────────────────────────────────

  describe("revokeConfirmation()", function () {
    let txId;

    beforeEach(async function () {
      const tx = await ms.connect(signer1).submitTransaction(
        recipient.address, ethers.parseEther("5"),
        await token.getAddress(), "TX-REV", "", ethers.ZeroHash
      );
      const receipt = await tx.wait();
      txId = receipt.logs.find(l => l.fragment?.name === "TransactionSubmitted").args.txId;
    });

    it("allows a signer to revoke their confirmation", async function () {
      await ms.connect(signer1).revokeConfirmation(txId);
      expect(await ms.getConfirmationCount(txId)).to.equal(0n);
    });

    it("reverts if signer never confirmed", async function () {
      await expect(
        ms.connect(signer2).revokeConfirmation(txId)
      ).to.be.revertedWith("Not confirmed");
    });
  });

  // ─── cancelTransaction ────────────────────────────────────────────────────

  describe("cancelTransaction()", function () {
    let txId;

    beforeEach(async function () {
      const tx = await ms.connect(signer1).submitTransaction(
        recipient.address, ethers.parseEther("5"),
        await token.getAddress(), "TX-CANCEL", "", ethers.ZeroHash
      );
      const receipt = await tx.wait();
      txId = receipt.logs.find(l => l.fragment?.name === "TransactionSubmitted").args.txId;
    });

    it("proposer can cancel their own transaction", async function () {
      await expect(
        ms.connect(signer1).cancelTransaction(txId, "Changed mind")
      ).to.emit(ms, "TransactionCancelled");
    });

    it("owner can cancel any transaction", async function () {
      // deployer is the owner (Ownable2Step constructor)
      await expect(
        ms.connect(deployer).cancelTransaction(txId, "Admin cancel")
      ).to.emit(ms, "TransactionCancelled");
    });

    it("non-proposer non-owner cannot cancel", async function () {
      await expect(
        ms.connect(signer2).cancelTransaction(txId, "Unauthorized")
      ).to.be.revertedWith("Not proposer or owner");
    });
  });

  // ─── Time-lock ────────────────────────────────────────────────────────────

  describe("Time-lock enforcement", function () {
    let timedMs, txId;

    beforeEach(async function () {
      // Deploy with 1-hour time-lock
      timedMs = await deployMultiSig(
        [signer1, signer2, signer3], 2, 3600, recovery.address, deployer
      );
      await token.mint(await timedMs.getAddress(), ethers.parseEther("100"));

      const tx = await timedMs.connect(signer1).submitTransaction(
        recipient.address, ethers.parseEther("5"),
        await token.getAddress(), "TX-TIMED", "", ethers.ZeroHash
      );
      const receipt = await tx.wait();
      txId = receipt.logs.find(l => l.fragment?.name === "TransactionSubmitted").args.txId;
      await timedMs.connect(signer2).confirmTransaction(txId); // threshold reached
    });

    it("reverts if time-lock has not elapsed", async function () {
      await expect(
        timedMs.connect(signer1).executeTransaction(txId)
      ).to.be.revertedWith("Time-lock not elapsed");
    });

    it("executes after time-lock elapses", async function () {
      await ethers.provider.send("evm_increaseTime", [3601]); // +1hr+1s
      await ethers.provider.send("evm_mine");
      await expect(
        timedMs.connect(signer1).executeTransaction(txId)
      ).to.emit(timedMs, "TransactionExecuted");
    });
  });

  // ─── Signer management ────────────────────────────────────────────────────

  describe("Signer management (onlyOwner)", function () {
    it("owner can add a new signer", async function () {
      await ms.connect(deployer).addSigner(other.address);
      expect(await ms.isSigner(other.address)).to.be.true;
    });

    it("owner can remove a signer (if threshold still met)", async function () {
      // 3 signers, threshold 2 — removing one leaves 2 which still meets threshold
      await ms.connect(deployer).removeSigner(signer3.address);
      expect(await ms.isSigner(signer3.address)).to.be.false;
    });

    it("reverts removal if it would break threshold", async function () {
      // Remove down to 2 signers
      await ms.connect(deployer).removeSigner(signer3.address);
      // Now 2 signers, threshold 2 — removing another would leave 1 < 2
      await expect(
        ms.connect(deployer).removeSigner(signer2.address)
      ).to.be.revertedWith("Would break threshold");
    });

    it("non-owner cannot add signer", async function () {
      await expect(
        ms.connect(other).addSigner(other.address)
      ).to.be.reverted;
    });
  });

  // ─── Pause ────────────────────────────────────────────────────────────────

  describe("pause() / unpause()", function () {
    it("owner can pause contract", async function () {
      await ms.connect(deployer).pause();
      expect(await ms.paused()).to.be.true;
    });

    it("blocks submitTransaction when paused", async function () {
      await ms.connect(deployer).pause();
      await expect(
        ms.connect(signer1).submitTransaction(
          recipient.address, ethers.parseEther("1"),
          await token.getAddress(), "TX-PAUSED", "", ethers.ZeroHash
        )
      ).to.be.revertedWith("Contract is paused");
    });

    it("resumes after unpause", async function () {
      await ms.connect(deployer).pause();
      await ms.connect(deployer).unpause();
      await expect(
        ms.connect(signer1).submitTransaction(
          recipient.address, ethers.parseEther("1"),
          await token.getAddress(), "TX-RESUMED", "", ethers.ZeroHash
        )
      ).to.not.be.reverted;
    });
  });

  // ─── Fix 33 — Recovery + Ownable2Step ────────────────────────────────────

  describe("Fix 33 — Ownable2Step + Emergency Recovery", function () {
    it("owner can update recoveryAddress", async function () {
      await ms.connect(deployer).setRecoveryAddress(other.address);
      expect(await ms.recoveryAddress()).to.equal(other.address);
    });

    it("reverts setRecoveryAddress to zero address", async function () {
      await expect(
        ms.connect(deployer).setRecoveryAddress(ethers.ZeroAddress)
      ).to.be.revertedWith("Zero address");
    });

    it("recoveryAddress can call emergencyOwnerRecovery to claim ownership", async function () {
      await ms.connect(recovery).emergencyOwnerRecovery();
      expect(await ms.owner()).to.equal(recovery.address);
    });

    it("non-recovery address cannot call emergencyOwnerRecovery", async function () {
      await expect(
        ms.connect(other).emergencyOwnerRecovery()
      ).to.be.revertedWith("Not recovery address");
    });

    it("Ownable2Step: transferOwnership requires acceptance", async function () {
      // Initiate transfer to 'other'
      await ms.connect(deployer).transferOwnership(other.address);
      // Owner has not changed yet — two-step pending
      expect(await ms.owner()).to.equal(deployer.address);
      expect(await ms.pendingOwner()).to.equal(other.address);

      // 'other' must accept
      await ms.connect(other).acceptOwnership();
      expect(await ms.owner()).to.equal(other.address);
    });

    it("Ownable2Step: wrong address cannot accept ownership", async function () {
      await ms.connect(deployer).transferOwnership(other.address);
      await expect(
        ms.connect(signer1).acceptOwnership()
      ).to.be.reverted;
    });
  });

  // ─── isReadyToExecute ─────────────────────────────────────────────────────

  describe("isReadyToExecute()", function () {
    it("returns false before threshold, true after", async function () {
      const tx = await ms.connect(signer1).submitTransaction(
        recipient.address, ethers.parseEther("1"),
        await token.getAddress(), "TX-READY", "", ethers.ZeroHash
      );
      const receipt = await tx.wait();
      const txId = receipt.logs.find(l => l.fragment?.name === "TransactionSubmitted").args.txId;

      expect(await ms.isReadyToExecute(txId)).to.be.false;
      await ms.connect(signer2).confirmTransaction(txId);
      expect(await ms.isReadyToExecute(txId)).to.be.true;
    });
  });
});
