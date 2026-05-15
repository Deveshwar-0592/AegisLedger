// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title AegisLedger Trade Escrow Contract
 * @notice Handles conditional stablecoin escrow for B2B trade settlement.
 *         Replicates Letter of Credit mechanics on-chain.
 *         Supports: USDC (Ethereum), USDT (Polygon), AE Coin (ADX)
 *
 * @dev Security: OpenZeppelin AccessControl, ReentrancyGuard, Pausable
 *      @notice This contract has not yet been audited.
 *      Mainnet deployment is locked until a formal audit is complete.
 *      See AUDIT.md for status.
 *      VARA Compliant: Only accepts fully-collateralized stablecoins
 */
contract AegisTradeEscrow is AccessControl, ReentrancyGuard, Pausable {
    using ECDSA for bytes32;

    // ─── ROLES ───────────────────────────────────────────────────
    bytes32 public constant PLATFORM_ADMIN  = keccak256("PLATFORM_ADMIN");
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");
    bytes32 public constant ORACLE_ROLE     = keccak256("ORACLE_ROLE");    // Document verification oracle
    bytes32 public constant ARBITRATOR_ROLE = keccak256("ARBITRATOR_ROLE"); // Fix 14: Dispute arbitrator

    // ─── ENUMS ───────────────────────────────────────────────────
    enum EscrowStatus {
        CREATED,
        FUNDED,
        CONDITIONS_MET,
        RELEASED,
        DISPUTED,
        REFUNDED,
        FROZEN        // Compliance freeze
    }

    enum ConditionType {
        BILL_OF_LADING,
        COMMERCIAL_INVOICE,
        PACKING_LIST,
        CUSTOMS_CLEARANCE,
        PORT_AUTHORITY_SIGN,
        QUALITY_INSPECTION
    }

    // ─── STRUCTS ─────────────────────────────────────────────────
    struct TradeCondition {
        ConditionType conditionType;
        bytes32 documentHash;     // SHA-256 of the expected document (set at escrow creation)
        bool fulfilled;
        uint256 fulfilledAt;
        address fulfilledBy;
    }

    struct Escrow {
        bytes32 escrowId;
        address buyer;            // Russian importer wallet
        address seller;           // UAE exporter wallet
        address stablecoin;       // USDC / USDT / AE Coin contract address
        uint256 amount;           // Amount locked in escrow
        uint256 platformFee;      // AegisLedger fee (basis points)
        EscrowStatus status;
        TradeCondition[] conditions;
        uint256 createdAt;
        uint256 fundedAt;
        uint256 expiryTimestamp;  // Auto-refund if expired
        uint256 disputeDeadline;  // Fix 14: Arbitration must resolve before this timestamp
        string tradeReference;    // External trade ID
        bytes32 kycHash;          // Hash of verified KYB data (for audit)
        bool isMultiSig;          // Requires multiple signers for release
        address logisticsProvider; // Fix 4
        uint256 requiredSignatures; // Fix 5
    }

    // ─── STATE ───────────────────────────────────────────────────
    mapping(bytes32 => Escrow) public escrows;
    mapping(address => bool) public approvedStablecoins; // VARA: only approved assets

    struct EscrowSignatureData {
        uint256 count;
        mapping(address => bool) hasSigned;
    }
    mapping(bytes32 => EscrowSignatureData) public escrowSignatures; // Fix 5

    uint256 public platformFeeBps = 15;   // 0.15% default fee
    address public feeRecipient;
    uint256 public minEscrowAmount = 1000 * 1e6; // $1,000 minimum
    uint256 public maxEscrowDuration = 180 days;
    mapping(address => uint256) public nonces;
    bool public auditConfirmed;

    // ─── EVENTS ──────────────────────────────────────────────────
    event EscrowCreated(bytes32 indexed escrowId, address buyer, address seller, uint256 amount, address stablecoin);
    event EscrowFunded(bytes32 indexed escrowId, uint256 amount, uint256 timestamp);
    event ConditionFulfilled(bytes32 indexed escrowId, ConditionType conditionType, bytes32 documentHash, uint256 timestamp);
    event EscrowReleased(bytes32 indexed escrowId, address seller, uint256 netAmount, uint256 fee);
    event EscrowRefunded(bytes32 indexed escrowId, address buyer, uint256 amount, string reason);
    event EscrowFrozen(bytes32 indexed escrowId, address frozenBy, string reason);
    event EscrowDisputed(bytes32 indexed escrowId, address initiatedBy);
    event DisputeInitiated(bytes32 indexed escrowId, address initiatedBy, uint256 disputeDeadline);  // Fix 14
    event DisputeResolved(bytes32 indexed escrowId, bool releasedToSeller, address arbitrator);      // Fix 14
    event StaleDisputeClaimed(bytes32 indexed escrowId, address claimedBy);                          // Fix 14
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);           // Fix 51
    event SignatureCollected(bytes32 indexed escrowId, address signer);                              // Fix 5
    event ThresholdReached(bytes32 indexed escrowId);                                                // Fix 5

    // ─── CONSTRUCTOR ─────────────────────────────────────────────
    constructor(address _feeRecipient, bool _auditConfirmed) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PLATFORM_ADMIN, msg.sender);
        feeRecipient = _feeRecipient;
        auditConfirmed = _auditConfirmed;
        require(auditConfirmed, "AUDIT_CONFIRMED must be true for deployment");
    }

    // ─── MODIFIERS ───────────────────────────────────────────────
    modifier escrowExists(bytes32 escrowId) {
        require(escrows[escrowId].createdAt > 0, "Escrow does not exist");
        _;
    }

    modifier onlyBuyer(bytes32 escrowId) {
        require(escrows[escrowId].buyer == msg.sender, "Only buyer can call this");
        _;
    }

    modifier notExpired(bytes32 escrowId) {
        require(block.timestamp <= escrows[escrowId].expiryTimestamp, "Escrow has expired");
        _;
    }

    // ─── CORE FUNCTIONS ──────────────────────────────────────────

    /**
     * @notice Create a new trade escrow (Buyer initiates)
     * @param seller UAE exporter address
     * @param stablecoin Address of approved stablecoin contract
     * @param amount Amount to escrow (in token's native decimals)
     * @param conditions Array of required trade conditions
     * @param expiryDays Number of days until auto-refund
     * @param tradeReference External trade/invoice reference number
     * @param kycHash Hash of verified KYB data for audit trail
     */
    function createEscrow(
        address seller,
        address stablecoin,
        uint256 amount,
        ConditionType[] calldata conditions,
        uint256 expiryDays,
        string calldata tradeReference,
        bytes32 kycHash,
        bool isMultiSig,
        address logisticsProvider,
        uint256 requiredSignatures
    ) external whenNotPaused returns (bytes32) {
        require(approvedStablecoins[stablecoin], "Stablecoin not approved by VARA");
        require(amount >= minEscrowAmount, "Amount below minimum");
        require(seller != address(0) && seller != msg.sender, "Invalid seller");
        require(conditions.length > 0 && conditions.length <= 6, "Invalid conditions count");
        require(expiryDays >= 1 && expiryDays <= 180, "Invalid expiry");

        bytes32 escrowId = keccak256(abi.encodePacked(
            msg.sender, nonces[msg.sender], tradeReference
        ));
        nonces[msg.sender]++;
        require(escrows[escrowId].createdAt == 0, "Escrow ID collision");

        uint256 fee = (amount * platformFeeBps) / 10000;

        Escrow storage e = escrows[escrowId];
        e.escrowId = escrowId;
        e.buyer = msg.sender;
        e.seller = seller;
        e.stablecoin = stablecoin;
        e.amount = amount;
        e.platformFee = fee;
        e.status = EscrowStatus.CREATED;
        e.createdAt = block.timestamp;
        e.expiryTimestamp = block.timestamp + (expiryDays * 1 days);
        e.tradeReference = tradeReference;
        e.kycHash = kycHash;
        e.isMultiSig = isMultiSig;
        e.logisticsProvider = logisticsProvider;
        if (isMultiSig) {
            require(requiredSignatures > 0, "Invalid signature threshold");
            e.requiredSignatures = requiredSignatures;
        }

        // Add conditions (document hashes set via fulfillCondition)
        for (uint i = 0; i < conditions.length; i++) {
            e.conditions.push(TradeCondition({
                conditionType: conditions[i],
                documentHash: bytes32(0),
                fulfilled: false,
                fulfilledAt: 0,
                fulfilledBy: address(0)
            }));
        }

        emit EscrowCreated(escrowId, msg.sender, seller, amount, stablecoin);
        return escrowId;
    }

    /**
     * @notice Fund the escrow — transfers stablecoin from buyer to contract
     * @dev Requires prior ERC20 approval of this contract
     */
    function fundEscrow(bytes32 escrowId)
        external nonReentrant whenNotPaused escrowExists(escrowId) onlyBuyer(escrowId)
    {
        Escrow storage e = escrows[escrowId];
        require(e.status == EscrowStatus.CREATED, "Escrow already funded");

        IERC20(e.stablecoin).transferFrom(msg.sender, address(this), e.amount);

        e.status = EscrowStatus.FUNDED;
        e.fundedAt = block.timestamp;

        emit EscrowFunded(escrowId, e.amount, block.timestamp);
    }

    /**
     * @notice Oracle submits proof of document fulfillment
     * @param escrowId Target escrow
     * @param conditionIndex Index of condition to mark fulfilled
     * @param documentHash SHA-256 hash of the verified trade document
     * @param documentSignature Cryptographic signature from logistics provider
     *
     * @dev Only authorized Oracle role (document verification service) can call this.
     *      In production, Chainlink oracle or Aegis's own oracle service submits this.
     */
    function fulfillCondition(
        bytes32 escrowId,
        uint256 conditionIndex,
        bytes32 documentHash,
        bytes calldata documentSignature
    ) external onlyRole(ORACLE_ROLE) escrowExists(escrowId) nonReentrant {
        Escrow storage e = escrows[escrowId];
        require(e.status == EscrowStatus.FUNDED, "Escrow not funded");
        require(conditionIndex < e.conditions.length, "Invalid condition index");
        require(!e.conditions[conditionIndex].fulfilled, "Condition already fulfilled");
        require(documentHash != bytes32(0), "Invalid document hash");

        bytes32 messageHash = keccak256(abi.encodePacked(escrowId, conditionIndex, documentHash));
        bytes32 ethSignedMessageHash = ECDSA.toEthSignedMessageHash(messageHash);
        address signer = ECDSA.recover(ethSignedMessageHash, documentSignature);
        require(signer == e.logisticsProvider, "Invalid logistics provider signature"); // Fix 4

        e.conditions[conditionIndex].fulfilled = true;
        e.conditions[conditionIndex].documentHash = documentHash;
        e.conditions[conditionIndex].fulfilledAt = block.timestamp;
        e.conditions[conditionIndex].fulfilledBy = signer;

        emit ConditionFulfilled(escrowId, e.conditions[conditionIndex].conditionType, documentHash, block.timestamp);

        // Check if all conditions are now met
        if (_allConditionsMet(escrowId)) {
            e.status = EscrowStatus.CONDITIONS_MET;
        }
    }

    /**
     * @notice Sign release for multi-sig escrows
     * @dev Fix 5: Authorized signers sign the release. Emits ThresholdReached if requirement met.
     */
    function signRelease(bytes32 escrowId)
        external nonReentrant whenNotPaused escrowExists(escrowId)
    {
        Escrow storage e = escrows[escrowId];
        require(e.status == EscrowStatus.CONDITIONS_MET, "Conditions not met");
        require(e.isMultiSig, "Not a multi-sig escrow");
        require(msg.sender == e.buyer || hasRole(PLATFORM_ADMIN, msg.sender), "Unauthorized signer");
        require(!escrowSignatures[escrowId].hasSigned[msg.sender], "Already signed");

        escrowSignatures[escrowId].hasSigned[msg.sender] = true;
        escrowSignatures[escrowId].count++;

        emit SignatureCollected(escrowId, msg.sender);

        if (escrowSignatures[escrowId].count == e.requiredSignatures) {
            emit ThresholdReached(escrowId);
        }
    }

    /**
     * @notice Release funds to seller once all conditions are met
     * @dev Can be called by seller or platform admin after all conditions fulfilled
     */
    function releaseFunds(bytes32 escrowId)
        external nonReentrant whenNotPaused escrowExists(escrowId)
    {
        Escrow storage e = escrows[escrowId];
        require(e.status == EscrowStatus.CONDITIONS_MET, "Not all conditions met");
        require(msg.sender == e.seller || hasRole(PLATFORM_ADMIN, msg.sender), "Unauthorized release");

        if (e.isMultiSig) {
            require(escrowSignatures[escrowId].count >= e.requiredSignatures, "Insufficient signatures for multi-sig release"); // Fix 5
        }

        e.status = EscrowStatus.RELEASED;

        uint256 netAmount = e.amount - e.platformFee;

        // Transfer net amount to seller
        IERC20(e.stablecoin).transfer(e.seller, netAmount);

        // Transfer fee to AegisLedger
        if (e.platformFee > 0) {
            IERC20(e.stablecoin).transfer(feeRecipient, e.platformFee);
        }

        emit EscrowReleased(escrowId, e.seller, netAmount, e.platformFee);
    }

    /**
     * @notice Refund buyer if conditions not met before expiry
     */
    function claimRefund(bytes32 escrowId)
        external nonReentrant whenNotPaused escrowExists(escrowId) onlyBuyer(escrowId)
    {
        Escrow storage e = escrows[escrowId];
        require(e.status == EscrowStatus.FUNDED, "Cannot refund");
        require(block.timestamp > e.expiryTimestamp, "Escrow not yet expired");

        e.status = EscrowStatus.REFUNDED;
        IERC20(e.stablecoin).transfer(e.buyer, e.amount);

        emit EscrowRefunded(escrowId, e.buyer, e.amount, "EXPIRED");
    }

    /**
     * @notice Compliance freeze — halts all operations on this escrow
     * @dev Called by compliance officer during AML investigation
     */
    function freezeEscrow(bytes32 escrowId, string calldata reason)
        external onlyRole(COMPLIANCE_ROLE) escrowExists(escrowId)
    {
        escrows[escrowId].status = EscrowStatus.FROZEN;
        emit EscrowFrozen(escrowId, msg.sender, reason);
    }

    /**
     * @notice Initiate dispute — triggers off-chain arbitration with a 14-day deadline
     * @dev Fix 14: Sets disputeDeadline = block.timestamp + 14 days.
     *      Funds are locked during arbitration window.
     */
    function initiateDispute(bytes32 escrowId)
        external escrowExists(escrowId)
    {
        Escrow storage e = escrows[escrowId];
        require(msg.sender == e.buyer || msg.sender == e.seller, "Not a party");
        require(e.status == EscrowStatus.FUNDED || e.status == EscrowStatus.CONDITIONS_MET, "Cannot dispute");

        e.status = EscrowStatus.DISPUTED;
        e.disputeDeadline = block.timestamp + 14 days; // Fix 14: Arbitration window
        emit DisputeInitiated(escrowId, msg.sender, e.disputeDeadline);
        emit EscrowDisputed(escrowId, msg.sender);
    }

    /**
     * @notice Arbitrator resolves a disputed escrow before the deadline
     * @dev Fix 14: Only ARBITRATOR_ROLE can call this. Reverts if deadline has passed.
     * @param escrowId The disputed escrow
     * @param releaseToSeller If true, funds go to seller. If false, buyer is refunded.
     */
    function resolveDispute(bytes32 escrowId, bool releaseToSeller)
        external onlyRole(ARBITRATOR_ROLE) escrowExists(escrowId) nonReentrant
    {
        Escrow storage e = escrows[escrowId];
        require(e.status == EscrowStatus.DISPUTED, "Not in dispute");
        require(block.timestamp <= e.disputeDeadline, "Arbitration deadline has passed"); // Fix 14

        if (releaseToSeller) {
            e.status = EscrowStatus.RELEASED;
            uint256 netAmount = e.amount - e.platformFee;
            IERC20(e.stablecoin).transfer(e.seller, netAmount);
            if (e.platformFee > 0) {
                IERC20(e.stablecoin).transfer(feeRecipient, e.platformFee);
            }
            emit EscrowReleased(escrowId, e.seller, netAmount, e.platformFee);
        } else {
            e.status = EscrowStatus.REFUNDED;
            IERC20(e.stablecoin).transfer(e.buyer, e.amount);
            emit EscrowRefunded(escrowId, e.buyer, e.amount, "ARBITRATION_REFUND");
        }
        emit DisputeResolved(escrowId, releaseToSeller, msg.sender); // Fix 14
    }

    /**
     * @notice Claim a stale dispute — returns funds to buyer if arbitration deadline has passed
     * @dev Fix 14: Callable by either party after disputeDeadline expires.
     *      Prevents indefinitely frozen funds when arbitrator fails to act.
     */
    function claimStaleDispute(bytes32 escrowId)
        external escrowExists(escrowId) nonReentrant
    {
        Escrow storage e = escrows[escrowId];
        require(e.status == EscrowStatus.DISPUTED, "Not in disputed state");
        require(block.timestamp > e.disputeDeadline, "Arbitration deadline not yet passed"); // Fix 14
        require(msg.sender == e.buyer || msg.sender == e.seller, "Not a party");

        e.status = EscrowStatus.REFUNDED;
        IERC20(e.stablecoin).transfer(e.buyer, e.amount);
        emit EscrowRefunded(escrowId, e.buyer, e.amount, "STALE_DISPUTE_CLAIMED");
        emit StaleDisputeClaimed(escrowId, msg.sender); // Fix 14
    }

    // ─── VIEW FUNCTIONS ──────────────────────────────────────────

    function getEscrow(bytes32 escrowId) external view returns (
        address buyer, address seller, uint256 amount, EscrowStatus status,
        uint256 conditionCount, uint256 fulfilledCount, uint256 expiryTimestamp
    ) {
        Escrow storage e = escrows[escrowId];
        uint256 fulfilled = 0;
        for (uint i = 0; i < e.conditions.length; i++) {
            if (e.conditions[i].fulfilled) fulfilled++;
        }
        return (e.buyer, e.seller, e.amount, e.status, e.conditions.length, fulfilled, e.expiryTimestamp);
    }

    function getCondition(bytes32 escrowId, uint256 index) external view returns (
        ConditionType conditionType, bytes32 documentHash, bool fulfilled, uint256 fulfilledAt
    ) {
        TradeCondition storage c = escrows[escrowId].conditions[index];
        return (c.conditionType, c.documentHash, c.fulfilled, c.fulfilledAt);
    }

    // ─── INTERNAL ────────────────────────────────────────────────

    function _allConditionsMet(bytes32 escrowId) internal view returns (bool) {
        Escrow storage e = escrows[escrowId];
        for (uint i = 0; i < e.conditions.length; i++) {
            if (!e.conditions[i].fulfilled) return false;
        }
        return true;
    }

    // ─── ADMIN ───────────────────────────────────────────────────

    function approveStablecoin(address token, bool approved) external onlyRole(PLATFORM_ADMIN) {
        approvedStablecoins[token] = approved;
    }

    function updatePlatformFee(uint256 newFeeBps) external onlyRole(PLATFORM_ADMIN) {
        require(newFeeBps <= 100, "Max fee is 1%"); // VARA compliance
        platformFeeBps = newFeeBps;
    }

    /**
     * @notice Update the fee recipient address.
     * @dev Fix 51: Allows rotating the fee recipient from the deployer EOA to a
     *      treasury multi-sig (Gnosis Safe or hardware wallet) post-deployment.
     *      Never pass an EOA — always use a multi-sig contract address.
     * @param newRecipient New fee recipient — must be non-zero.
     */
    function updateFeeRecipient(address newRecipient) external onlyRole(PLATFORM_ADMIN) {
        require(newRecipient != address(0), "Zero address not permitted");
        emit FeeRecipientUpdated(feeRecipient, newRecipient); // Fix 51
        feeRecipient = newRecipient;
    }

    function emergencyPause() external onlyRole(PLATFORM_ADMIN) { _pause(); }
    function unpause() external onlyRole(PLATFORM_ADMIN) { _unpause(); }
}
