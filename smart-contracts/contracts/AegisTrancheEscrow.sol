// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * AegisLedger — Partial Release Tranche Escrow
 * Releases funds in configurable tranches as each milestone is fulfilled.
 *
 * Example: $10M crude oil deal
 *   Tranche 1 (30%): Released on Bill of Lading confirmation
 *   Tranche 2 (40%): Released on arrival at port + quality inspection
 *   Tranche 3 (30%): Released on customs clearance + final settlement
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract AegisTrancheEscrow {

    // ─── EVENTS ──────────────────────────────────────────────────
    event EscrowCreated(uint256 indexed escrowId, address buyer, address seller, uint256 totalAmount, uint256 trancheCount);
    event TrancheReleased(uint256 indexed escrowId, uint256 trancheIndex, uint256 amount, bytes32 conditionHash);
    event EscrowDisputed(uint256 indexed escrowId, address disputedBy, string reason);
    event DisputeResolved(uint256 indexed escrowId, address resolver, bool releasedToSeller);
    event EscrowCancelled(uint256 indexed escrowId, string reason);
    event FundsRefunded(uint256 indexed escrowId, address buyer, uint256 amount);

    // ─── TYPES ────────────────────────────────────────────────────
    enum EscrowStatus { Active, PartiallyReleased, Completed, Disputed, Cancelled }
    enum TrancheStatus { Locked, Released, Refunded }

    struct Tranche {
        uint256 index;
        uint256 amount;             // Amount to release in this tranche
        uint256 percentage;         // % of total (basis points, e.g. 3000 = 30%)
        string  conditionDescription;
        bytes32 conditionHash;      // keccak256 of expected oracle data
        TrancheStatus status;
        uint256 releasedAt;
        address releasedBy;
    }

    struct Escrow {
        uint256 id;
        address buyer;
        address seller;
        address token;
        uint256 totalAmount;
        uint256 releasedAmount;
        string  tradeReference;
        string  productDescription;
        EscrowStatus status;
        uint256 createdAt;
        uint256 expiresAt;
        address arbitrator;
        bool    disputed;
        uint256 trancheCount;
    }

    // ─── STATE ────────────────────────────────────────────────────
    address public owner;
    uint256 public escrowCount;
    uint256 public platformFeeBps;  // Platform fee in basis points (e.g. 15 = 0.15%)
    address public feeRecipient;

    mapping(uint256 => Escrow)             public escrows;
    mapping(uint256 => Tranche[])          public tranches;
    mapping(address => bool)               public approvedArbitrators;

    modifier onlyOwner()  { require(msg.sender == owner, "Not owner"); _; }
    modifier escrowExists(uint256 id) { require(id < escrowCount, "Escrow not found"); _; }

    constructor(uint256 _feeBps, address _feeRecipient) {
        owner = msg.sender;
        platformFeeBps = _feeBps;
        feeRecipient   = _feeRecipient;
        approvedArbitrators[msg.sender] = true;
    }

    // ─── CREATE ESCROW ────────────────────────────────────────────
    function createTranchEscrow(
        address seller,
        address token,
        uint256 totalAmount,
        string calldata tradeReference,
        string calldata productDescription,
        uint256 durationDays,
        address arbitrator,
        string[] calldata conditionDescriptions,
        uint256[] calldata tranchePercentages,
        bytes32[] calldata conditionHashes
    ) external returns (uint256 escrowId) {
        require(seller != address(0) && seller != msg.sender, "Invalid seller");
        require(conditionDescriptions.length == tranchePercentages.length, "Array length mismatch");
        require(conditionDescriptions.length == conditionHashes.length, "Array length mismatch");
        require(conditionDescriptions.length >= 1 && conditionDescriptions.length <= 10, "1-10 tranches");

        // Validate percentages sum to 10000 (100%)
        uint256 totalBps;
        for (uint i = 0; i < tranchePercentages.length; i++) totalBps += tranchePercentages[i];
        require(totalBps == 10000, "Percentages must sum to 100%");

        // Collect tokens from buyer
        uint256 fee = (totalAmount * platformFeeBps) / 10000;
        uint256 netAmount = totalAmount - fee;
        require(IERC20(token).transferFrom(msg.sender, address(this), totalAmount), "Token transfer failed");
        if (fee > 0) require(IERC20(token).transfer(feeRecipient, fee), "Fee transfer failed");

        escrowId = escrowCount++;
        escrows[escrowId] = Escrow({
            id:                 escrowId,
            buyer:              msg.sender,
            seller:             seller,
            token:              token,
            totalAmount:        netAmount,
            releasedAmount:     0,
            tradeReference:     tradeReference,
            productDescription: productDescription,
            status:             EscrowStatus.Active,
            createdAt:          block.timestamp,
            expiresAt:          block.timestamp + (durationDays * 1 days),
            arbitrator:         arbitrator,
            disputed:           false,
            trancheCount:       conditionDescriptions.length
        });

        // Create tranches
        for (uint i = 0; i < conditionDescriptions.length; i++) {
            uint256 trancheAmount = (netAmount * tranchePercentages[i]) / 10000;
            tranches[escrowId].push(Tranche({
                index:                i,
                amount:               trancheAmount,
                percentage:           tranchePercentages[i],
                conditionDescription: conditionDescriptions[i],
                conditionHash:        conditionHashes[i],
                status:               TrancheStatus.Locked,
                releasedAt:           0,
                releasedBy:           address(0)
            }));
        }

        emit EscrowCreated(escrowId, msg.sender, seller, netAmount, conditionDescriptions.length);
    }

    // ─── RELEASE TRANCHE ──────────────────────────────────────────
    /**
     * @notice Release a specific tranche to the seller.
     * @dev Fix 34: Sequential order enforced. Tranche N cannot be released
     *      until all tranches 0..(N-1) have been released.
     *      Loop bound is i < trancheIndex — avoids uint256 underflow at 0.
     * @param conditionData The actual oracle/document data that satisfies the condition.
     *                      Its keccak256 hash must match the stored conditionHash.
     */
    function releaseTranche(uint256 escrowId, uint256 trancheIndex, bytes calldata conditionData)
        external escrowExists(escrowId)
    {
        Escrow storage e = escrows[escrowId];
        require(e.status == EscrowStatus.Active || e.status == EscrowStatus.PartiallyReleased, "Escrow not active");
        require(!e.disputed, "Escrow is disputed");
        require(block.timestamp <= e.expiresAt, "Escrow expired");
        require(trancheIndex < e.trancheCount, "Invalid tranche index");

        // Fix 34: Enforce sequential release — all prior tranches must be released first
        if (trancheIndex > 0) {
            for (uint256 i = 0; i < trancheIndex; i++) {
                require(
                    tranches[escrowId][i].status == TrancheStatus.Released,
                    "Prior tranche must be released first"
                );
            }
        }

        Tranche storage t = tranches[escrowId][trancheIndex];
        require(t.status == TrancheStatus.Locked, "Tranche not locked");

        // Verify condition proof
        require(keccak256(conditionData) == t.conditionHash, "Condition not satisfied");

        // Only buyer or escrow arbitrator can release
        require(msg.sender == e.buyer || msg.sender == e.arbitrator, "Not authorised to release");

        // Release funds to seller
        t.status      = TrancheStatus.Released;
        t.releasedAt  = block.timestamp;
        t.releasedBy  = msg.sender;
        e.releasedAmount += t.amount;

        require(IERC20(e.token).transfer(e.seller, t.amount), "Release transfer failed");

        // Update escrow status
        if (e.releasedAmount >= e.totalAmount) {
            e.status = EscrowStatus.Completed;
        } else {
            e.status = EscrowStatus.PartiallyReleased;
        }

        emit TrancheReleased(escrowId, trancheIndex, t.amount, t.conditionHash);
    }

    // ─── DISPUTE ──────────────────────────────────────────────────
    function initiateDispute(uint256 escrowId, string calldata reason)
        external escrowExists(escrowId)
    {
        Escrow storage e = escrows[escrowId];
        require(msg.sender == e.buyer || msg.sender == e.seller, "Not party to escrow");
        require(e.status == EscrowStatus.Active || e.status == EscrowStatus.PartiallyReleased, "Cannot dispute");
        require(!e.disputed, "Already disputed");

        e.disputed = true;
        e.status   = EscrowStatus.Disputed;
        emit EscrowDisputed(escrowId, msg.sender, reason);
    }

    function resolveDispute(uint256 escrowId, bool releaseToSeller)
        external escrowExists(escrowId)
    {
        Escrow storage e = escrows[escrowId];
        require(msg.sender == e.arbitrator || msg.sender == owner, "Not arbitrator");
        require(e.status == EscrowStatus.Disputed, "Not disputed");

        uint256 remaining = e.totalAmount - e.releasedAmount;
        e.disputed = false;

        if (releaseToSeller) {
            e.status = EscrowStatus.Completed;
            require(IERC20(e.token).transfer(e.seller, remaining), "Transfer failed");
        } else {
            e.status = EscrowStatus.Cancelled;
            require(IERC20(e.token).transfer(e.buyer, remaining), "Refund failed");
            emit FundsRefunded(escrowId, e.buyer, remaining);
        }

        emit DisputeResolved(escrowId, msg.sender, releaseToSeller);
    }

    // ─── EXPIRY REFUND ────────────────────────────────────────────
    function refundExpired(uint256 escrowId) external escrowExists(escrowId) {
        Escrow storage e = escrows[escrowId];
        require(msg.sender == e.buyer, "Only buyer");
        require(block.timestamp > e.expiresAt, "Not expired");
        require(e.status == EscrowStatus.Active || e.status == EscrowStatus.PartiallyReleased, "Cannot refund");

        uint256 remaining = e.totalAmount - e.releasedAmount;
        e.status = EscrowStatus.Cancelled;
        require(IERC20(e.token).transfer(e.buyer, remaining), "Refund failed");
        emit FundsRefunded(escrowId, e.buyer, remaining);
    }

    // ─── ADMIN ────────────────────────────────────────────────────
    function setFee(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 200, "Max 2%");
        platformFeeBps = _feeBps;
    }

    function setArbitrator(address arb, bool approved) external onlyOwner {
        approvedArbitrators[arb] = approved;
    }

    // ─── VIEW ─────────────────────────────────────────────────────
    function getTranches(uint256 escrowId) external view returns (Tranche[] memory) {
        return tranches[escrowId];
    }

    function getEscrowProgress(uint256 escrowId) external view returns (
        uint256 totalAmount, uint256 releasedAmount, uint256 lockedAmount, uint256 releasedPct
    ) {
        Escrow storage e = escrows[escrowId];
        totalAmount    = e.totalAmount;
        releasedAmount = e.releasedAmount;
        lockedAmount   = totalAmount - releasedAmount;
        releasedPct    = totalAmount > 0 ? (releasedAmount * 10000) / totalAmount : 0;
    }
}
