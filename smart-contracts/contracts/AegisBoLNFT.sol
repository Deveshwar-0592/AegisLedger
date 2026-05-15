// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * AegisLedger — Bill of Lading NFT (ERC-1155)
 * Tokenises trade finance documents as transferable NFTs on ADX chain.
 *
 * Fix 32: Rewritten to inherit from OpenZeppelin ERC1155 + AccessControl.
 *   - Provides safeTransferFrom, safeBatchTransferFrom, supportsInterface
 *   - External wallets, custodians, and marketplaces can now integrate fully
 *   - All custom BoL logic is preserved: BillOfLading struct, endorseBoL(),
 *     lockInEscrow(), redeemBoL(), endorsement chain, IPFS hash storage,
 *     trade reference fields, and KYB entity gating.
 */

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract AegisBoLNFT is ERC1155, AccessControl {

    // ─── ROLES ────────────────────────────────────────────────────
    bytes32 public constant MINTER_ROLE     = keccak256("MINTER_ROLE");
    bytes32 public constant ESCROW_ROLE     = keccak256("ESCROW_ROLE");
    bytes32 public constant APPROVER_ROLE   = keccak256("APPROVER_ROLE");

    // ─── EVENTS ───────────────────────────────────────────────────
    event BoLMinted(uint256 indexed tokenId, address indexed shipper, string tradeReference, string ipfsHash);
    event BoLTransferred(uint256 indexed tokenId, address indexed from, address indexed to, string endorsementNote);
    event BoLRedeemed(uint256 indexed tokenId, address indexed redeemer, uint256 timestamp);
    event BoLEscrowed(uint256 indexed tokenId, address indexed escrowContract);
    event EntityApproved(address indexed entity, bool approved);

    // ─── STRUCTS ──────────────────────────────────────────────────
    struct BillOfLading {
        uint256 id;
        string  tradeReference;         // e.g. "TRD-2024-RUB-AED-0047"
        string  ipfsHash;               // IPFS CID of encrypted BoL PDF
        string  productDescription;     // e.g. "Crude Oil 50,000 MT"
        string  portOfLoading;
        string  portOfDischarge;
        string  vesselName;
        address shipper;
        address consignee;
        address notifyParty;
        uint256 mintedAt;
        uint256 shipmentDate;
        bool    redeemed;
        address redeemedBy;
        address escrowContract;         // Non-zero when locked in escrow
    }

    // ─── STATE ────────────────────────────────────────────────────
    uint256 public nextTokenId;

    mapping(uint256 => BillOfLading) public bolData;
    mapping(uint256 => address[])    public endorsementChain;   // Full transfer history
    mapping(address => bool)         public approvedEntities;   // KYB-approved entities only

    // ─── CONSTRUCTOR ──────────────────────────────────────────────
    constructor(string memory uri_) ERC1155(uri_) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE,        msg.sender);
        _grantRole(APPROVER_ROLE,      msg.sender);
        approvedEntities[msg.sender] = true;
    }

    // ─── ENTITY MANAGEMENT ────────────────────────────────────────
    function setEntityApproved(address entity, bool approved) external onlyRole(APPROVER_ROLE) {
        approvedEntities[entity] = approved;
        emit EntityApproved(entity, approved);
    }

    function setEntitiesBatch(address[] calldata entities, bool approved) external onlyRole(APPROVER_ROLE) {
        for (uint i = 0; i < entities.length; i++) {
            approvedEntities[entities[i]] = approved;
            emit EntityApproved(entities[i], approved);
        }
    }

    // ─── MINT BoL ─────────────────────────────────────────────────
    /**
     * @notice Mint a new Bill of Lading NFT (amount=1 for non-fungible semantics)
     * @dev Only MINTER_ROLE can call. Consignee must be KYB-approved.
     */
    function mintBoL(
        address to,
        uint256 tokenId,
        string calldata tradeReference,
        string calldata ipfsHash,
        string calldata productDescription,
        string calldata portOfLoading,
        string calldata portOfDischarge,
        string calldata vesselName,
        address consignee,
        address notifyParty,
        uint256 shipmentDate
    ) external onlyRole(MINTER_ROLE) {
        require(consignee != address(0), "Invalid consignee");
        require(approvedEntities[consignee], "Consignee not KYB approved");
        require(bolData[tokenId].mintedAt == 0, "Token ID already minted");

        bolData[tokenId] = BillOfLading({
            id:                 tokenId,
            tradeReference:     tradeReference,
            ipfsHash:           ipfsHash,
            productDescription: productDescription,
            portOfLoading:      portOfLoading,
            portOfDischarge:    portOfDischarge,
            vesselName:         vesselName,
            shipper:            msg.sender,
            consignee:          consignee,
            notifyParty:        notifyParty,
            mintedAt:           block.timestamp,
            shipmentDate:       shipmentDate,
            redeemed:           false,
            redeemedBy:         address(0),
            escrowContract:     address(0)
        });

        endorsementChain[tokenId].push(msg.sender);
        _mint(to, tokenId, 1, "");

        emit BoLMinted(tokenId, msg.sender, tradeReference, ipfsHash);
        nextTokenId = tokenId >= nextTokenId ? tokenId + 1 : nextTokenId;
    }

    // ─── ENDORSE / TRANSFER ───────────────────────────────────────
    /**
     * @notice Endorse (transfer) a BoL to a new KYB-approved holder
     * @dev Updates the endorsement chain and consignee field.
     */
    function endorseBoL(uint256 tokenId, address newHolder, string calldata endorsementNote) external {
        require(balanceOf(msg.sender, tokenId) == 1, "Not the holder");
        require(!bolData[tokenId].redeemed, "BoL already redeemed");
        require(approvedEntities[newHolder], "New holder not KYB approved");
        require(bolData[tokenId].escrowContract == address(0), "BoL is in escrow");

        safeTransferFrom(msg.sender, newHolder, tokenId, 1, "");
        bolData[tokenId].consignee = newHolder;
        endorsementChain[tokenId].push(newHolder);

        emit BoLTransferred(tokenId, msg.sender, newHolder, endorsementNote);
    }

    // ─── ESCROW LOCK ──────────────────────────────────────────────
    /**
     * @notice Lock a BoL into an escrow contract (only ESCROW_ROLE)
     * @dev Transfers the token to the escrow contract address.
     */
    function lockInEscrow(uint256 tokenId, address escrowContract) external onlyRole(ESCROW_ROLE) {
        require(balanceOf(msg.sender, tokenId) == 1 || isApprovedForAll(bolData[tokenId].consignee, msg.sender),
            "Not holder or approved escrow");
        require(bolData[tokenId].escrowContract == address(0), "Already escrowed");

        bolData[tokenId].escrowContract = escrowContract;
        safeTransferFrom(bolData[tokenId].consignee, escrowContract, tokenId, 1, "");
        emit BoLEscrowed(tokenId, escrowContract);
    }

    // ─── REDEEM ───────────────────────────────────────────────────
    /**
     * @notice Redeem (burn) a BoL — marks it as delivered and consumed
     */
    function redeemBoL(uint256 tokenId) external {
        require(balanceOf(msg.sender, tokenId) == 1, "Not the holder");
        require(!bolData[tokenId].redeemed, "Already redeemed");

        bolData[tokenId].redeemed   = true;
        bolData[tokenId].redeemedBy = msg.sender;

        _burn(msg.sender, tokenId, 1);
        emit BoLRedeemed(tokenId, msg.sender, block.timestamp);
    }

    // ─── VIEW FUNCTIONS ───────────────────────────────────────────
    function getBoL(uint256 tokenId) external view returns (BillOfLading memory) {
        return bolData[tokenId];
    }

    function getEndorsementChain(uint256 tokenId) external view returns (address[] memory) {
        return endorsementChain[tokenId];
    }

    // ─── ERC165 OVERRIDE ──────────────────────────────────────────
    /**
     * @dev Fix 32: supportsInterface must resolve both ERC1155 and AccessControl.
     *      Without this override the contract won't compile — both bases define it.
     */
    function supportsInterface(bytes4 interfaceId)
        public view override(ERC1155, AccessControl) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
