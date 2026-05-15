const { expect } = require("chai");
const { ethers } = require("hardhat");

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function deployBoL(deployer) {
  const AegisBoLNFT = await ethers.getContractFactory("AegisBoLNFT", deployer);
  const nft = await AegisBoLNFT.deploy("https://aegisledger.io/api/bol/{id}.json");
  await nft.waitForDeployment();
  return nft;
}

// Minimal valid BillOfLading call params — expands to full param list for mintBoL()
function bolParams(overrides = {}) {
  return {
    tradeReference:     overrides.tradeReference     ?? "TRD-2024-RUB-AED-0047",
    ipfsHash:           overrides.ipfsHash           ?? "QmExampleHash",
    productDescription: overrides.productDescription ?? "Crude Oil 50000 MT",
    portOfLoading:      overrides.portOfLoading      ?? "Novorossiysk",
    portOfDischarge:    overrides.portOfDischarge    ?? "Jebel Ali",
    vesselName:         overrides.vesselName         ?? "MV AegisStar",
    shipmentDate:       overrides.shipmentDate       ?? Math.floor(Date.now() / 1000) + 86400,
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("AegisBoLNFT (Fix 32 — OZ ERC1155 + AccessControl)", function () {
  let nft;
  let deployer, shipper, consignee, escrowAddr, other;

  const MINTER_ROLE   = ethers.id("MINTER_ROLE");
  const ESCROW_ROLE   = ethers.id("ESCROW_ROLE");
  const APPROVER_ROLE = ethers.id("APPROVER_ROLE");

  beforeEach(async function () {
    [deployer, shipper, consignee, escrowAddr, other] = await ethers.getSigners();
    nft = await deployBoL(deployer);

    // Approve entities (KYB gate)
    await nft.setEntityApproved(shipper.address,    true);
    await nft.setEntityApproved(consignee.address,  true);
    await nft.setEntityApproved(escrowAddr.address, true);
    await nft.setEntityApproved(other.address,      false);

    // Grant minter role to shipper
    await nft.grantRole(MINTER_ROLE, shipper.address);
    // Grant escrow role to escrowAddr
    await nft.grantRole(ESCROW_ROLE, escrowAddr.address);
  });

  // ─── ERC1155 interface ───────────────────────────────────────────────────

  describe("supportsInterface() — Fix 32 OZ base", function () {
    it("supports ERC1155 interface (0xd9b67a26)", async function () {
      expect(await nft.supportsInterface("0xd9b67a26")).to.be.true;
    });
    it("supports ERC165 interface (0x01ffc9a7)", async function () {
      expect(await nft.supportsInterface("0x01ffc9a7")).to.be.true;
    });
    it("supports AccessControl interface (0x7965db0b)", async function () {
      expect(await nft.supportsInterface("0x7965db0b")).to.be.true;
    });
    it("returns false for unsupported interface", async function () {
      expect(await nft.supportsInterface("0xdeadbeef")).to.be.false;
    });
  });

  // ─── mintBoL ─────────────────────────────────────────────────────────────

  describe("mintBoL()", function () {
    it("mints a BoL token to the consignee and records data", async function () {
      const p = bolParams();
      await nft.connect(shipper).mintBoL(
        consignee.address, 1n, p.tradeReference, p.ipfsHash,
        p.productDescription, p.portOfLoading, p.portOfDischarge,
        p.vesselName, consignee.address, other.address, p.shipmentDate
      );
      expect(await nft.balanceOf(consignee.address, 1n)).to.equal(1n);
      const data = await nft.getBoL(1n);
      expect(data.tradeReference).to.equal(p.tradeReference);
      expect(data.redeemed).to.be.false;
    });

    it("reverts if caller lacks MINTER_ROLE", async function () {
      const p = bolParams();
      await expect(
        nft.connect(other).mintBoL(
          consignee.address, 1n, p.tradeReference, p.ipfsHash,
          p.productDescription, p.portOfLoading, p.portOfDischarge,
          p.vesselName, consignee.address, other.address, p.shipmentDate
        )
      ).to.be.reverted;
    });

    it("reverts if consignee is not KYB-approved", async function () {
      const p = bolParams();
      // 'other' entity is not approved
      await expect(
        nft.connect(shipper).mintBoL(
          other.address, 2n, p.tradeReference, p.ipfsHash,
          p.productDescription, p.portOfLoading, p.portOfDischarge,
          p.vesselName, other.address, consignee.address, p.shipmentDate
        )
      ).to.be.revertedWith("Consignee not KYB approved");
    });

    it("reverts if token ID already minted", async function () {
      const p = bolParams();
      await nft.connect(shipper).mintBoL(
        consignee.address, 5n, p.tradeReference, p.ipfsHash,
        p.productDescription, p.portOfLoading, p.portOfDischarge,
        p.vesselName, consignee.address, deployer.address, p.shipmentDate
      );
      await expect(
        nft.connect(shipper).mintBoL(
          consignee.address, 5n, "DUPLICATE", p.ipfsHash,
          p.productDescription, p.portOfLoading, p.portOfDischarge,
          p.vesselName, consignee.address, deployer.address, p.shipmentDate
        )
      ).to.be.revertedWith("Token ID already minted");
    });

    it("records shipper in endorsement chain on mint", async function () {
      const p = bolParams();
      await nft.connect(shipper).mintBoL(
        consignee.address, 10n, p.tradeReference, p.ipfsHash,
        p.productDescription, p.portOfLoading, p.portOfDischarge,
        p.vesselName, consignee.address, deployer.address, p.shipmentDate
      );
      const chain = await nft.getEndorsementChain(10n);
      expect(chain.length).to.equal(1);
      expect(chain[0]).to.equal(shipper.address);
    });
  });

  // ─── endorseBoL ──────────────────────────────────────────────────────────

  describe("endorseBoL()", function () {
    const TOKEN_ID = 20n;

    beforeEach(async function () {
      const p = bolParams();
      await nft.connect(shipper).mintBoL(
        consignee.address, TOKEN_ID, p.tradeReference, p.ipfsHash,
        p.productDescription, p.portOfLoading, p.portOfDischarge,
        p.vesselName, consignee.address, deployer.address, p.shipmentDate
      );
    });

    it("transfers token to new KYB-approved holder and updates chain", async function () {
      // deployer is KYB approved by default (approved in constructor)
      await nft.setEntityApproved(deployer.address, true);
      await nft.connect(consignee).endorseBoL(TOKEN_ID, deployer.address, "Trade consignment note");

      expect(await nft.balanceOf(consignee.address, TOKEN_ID)).to.equal(0n);
      expect(await nft.balanceOf(deployer.address, TOKEN_ID)).to.equal(1n);

      const chain = await nft.getEndorsementChain(TOKEN_ID);
      expect(chain[chain.length - 1]).to.equal(deployer.address);
    });

    it("reverts if new holder is not KYB-approved", async function () {
      // other is not approved
      await expect(
        nft.connect(consignee).endorseBoL(TOKEN_ID, other.address, "Note")
      ).to.be.revertedWith("New holder not KYB approved");
    });

    it("reverts if caller does not hold the token", async function () {
      await nft.setEntityApproved(deployer.address, true);
      await expect(
        nft.connect(shipper).endorseBoL(TOKEN_ID, deployer.address, "Note")
      ).to.be.revertedWith("Not the holder");
    });

    it("reverts if BoL is locked in escrow", async function () {
      // Lock it first
      await nft.connect(consignee).setApprovalForAll(escrowAddr.address, true);
      await nft.connect(escrowAddr).lockInEscrow(TOKEN_ID, escrowAddr.address);

      await nft.setEntityApproved(deployer.address, true);
      await expect(
        nft.connect(escrowAddr).endorseBoL(TOKEN_ID, deployer.address, "Note")
      ).to.be.revertedWith("BoL is in escrow");
    });
  });

  // ─── lockInEscrow ────────────────────────────────────────────────────────

  describe("lockInEscrow()", function () {
    const TOKEN_ID = 30n;

    beforeEach(async function () {
      const p = bolParams();
      await nft.connect(shipper).mintBoL(
        consignee.address, TOKEN_ID, p.tradeReference, p.ipfsHash,
        p.productDescription, p.portOfLoading, p.portOfDischarge,
        p.vesselName, consignee.address, deployer.address, p.shipmentDate
      );
      // Consignee must approve escrowAddr to transfer on their behalf
      await nft.connect(consignee).setApprovalForAll(escrowAddr.address, true);
    });

    it("transfers token to escrow contract and sets escrowContract field", async function () {
      await nft.connect(escrowAddr).lockInEscrow(TOKEN_ID, escrowAddr.address);
      expect(await nft.balanceOf(escrowAddr.address, TOKEN_ID)).to.equal(1n);
      const data = await nft.getBoL(TOKEN_ID);
      expect(data.escrowContract).to.equal(escrowAddr.address);
    });

    it("reverts if already escrowed", async function () {
      await nft.connect(escrowAddr).lockInEscrow(TOKEN_ID, escrowAddr.address);
      await expect(
        nft.connect(escrowAddr).lockInEscrow(TOKEN_ID, escrowAddr.address)
      ).to.be.revertedWith("Already escrowed");
    });

    it("reverts if caller lacks ESCROW_ROLE", async function () {
      await expect(
        nft.connect(other).lockInEscrow(TOKEN_ID, other.address)
      ).to.be.reverted;
    });
  });

  // ─── redeemBoL ───────────────────────────────────────────────────────────

  describe("redeemBoL()", function () {
    const TOKEN_ID = 40n;

    beforeEach(async function () {
      const p = bolParams();
      await nft.connect(shipper).mintBoL(
        consignee.address, TOKEN_ID, p.tradeReference, p.ipfsHash,
        p.productDescription, p.portOfLoading, p.portOfDischarge,
        p.vesselName, consignee.address, deployer.address, p.shipmentDate
      );
    });

    it("burns the token and marks BoL as redeemed", async function () {
      await nft.connect(consignee).redeemBoL(TOKEN_ID);
      expect(await nft.balanceOf(consignee.address, TOKEN_ID)).to.equal(0n);
      const data = await nft.getBoL(TOKEN_ID);
      expect(data.redeemed).to.be.true;
      expect(data.redeemedBy).to.equal(consignee.address);
    });

    it("reverts if caller does not hold the token", async function () {
      await expect(
        nft.connect(shipper).redeemBoL(TOKEN_ID)
      ).to.be.revertedWith("Not the holder");
    });

    it("reverts if already redeemed", async function () {
      await nft.connect(consignee).redeemBoL(TOKEN_ID);
      await expect(
        nft.connect(consignee).redeemBoL(TOKEN_ID)
      ).to.be.reverted;
    });
  });

  // ─── Entity management ────────────────────────────────────────────────────

  describe("Entity management (APPROVER_ROLE)", function () {
    it("setEntitiesBatch approves multiple entities at once", async function () {
      const [,, addr1, addr2] = await ethers.getSigners();
      await nft.setEntitiesBatch([addr1.address, addr2.address], true);
      expect(await nft.approvedEntities(addr1.address)).to.be.true;
      expect(await nft.approvedEntities(addr2.address)).to.be.true;
    });

    it("reverts if caller lacks APPROVER_ROLE", async function () {
      await expect(
        nft.connect(other).setEntityApproved(other.address, true)
      ).to.be.reverted;
    });
  });

  // ─── ERC1155 safeTransferFrom (OZ base) ──────────────────────────────────

  describe("safeTransferFrom() — provided by OZ ERC1155 base (Fix 32)", function () {
    const TOKEN_ID = 50n;

    beforeEach(async function () {
      const p = bolParams();
      await nft.connect(shipper).mintBoL(
        consignee.address, TOKEN_ID, p.tradeReference, p.ipfsHash,
        p.productDescription, p.portOfLoading, p.portOfDischarge,
        p.vesselName, consignee.address, deployer.address, p.shipmentDate
      );
    });

    it("allows holder to safeTransferFrom via OZ base", async function () {
      await nft.setEntityApproved(deployer.address, true);
      await nft.connect(consignee).safeTransferFrom(
        consignee.address, deployer.address, TOKEN_ID, 1n, "0x"
      );
      expect(await nft.balanceOf(deployer.address, TOKEN_ID)).to.equal(1n);
    });
  });
});
