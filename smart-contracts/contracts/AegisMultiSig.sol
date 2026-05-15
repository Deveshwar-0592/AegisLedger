// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * AegisLedger — Multi-Signature Transfer Authorization
 * Requires M-of-N cryptographic signatures from designated signers
 * before executing any transfer above the threshold.
 *
 * Fix 33: Inherits Ownable2Step for safe two-step ownership transfer.
 *   - Prevents ownership being permanently lost to a wrong address.
 *   - Adds recoveryAddress: a cold hardware wallet for emergency recovery
 *     held by a different keyholder than the deployer.
 *
 * Features:
 * - M-of-N signature threshold (configurable per company)
 * - Signer management (add/remove via governance)
 * - Time-locked execution (optional delay after quorum)
 * - Per-transaction metadata (reference ID, Travel Rule data)
 * - Emergency pause
 * - Two-step ownership transfer (Ownable2Step)
 * - Recovery address for emergency ownership handover
 */

import "@openzeppelin/contracts/access/Ownable2Step.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract AegisMultiSig is Ownable2Step {

    // ─── EVENTS ───────────────────────────────────────────────────
    event TransactionSubmitted(uint256 indexed txId, address indexed proposer, address to, uint256 amount, address token, string reference);
    event TransactionConfirmed(uint256 indexed txId, address indexed signer);
    event TransactionRevoked(uint256 indexed txId, address indexed signer);
    event TransactionExecuted(uint256 indexed txId, address indexed executor);
    event TransactionCancelled(uint256 indexed txId, string reason);
    event SignerAdded(address indexed signer);
    event SignerRemoved(address indexed signer);
    event ThresholdChanged(uint256 oldThreshold, uint256 newThreshold);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event RecoveryAddressSet(address indexed recoveryAddress);      // Fix 33
    event EmergencyOwnerRecovery(address indexed newOwner);         // Fix 33

    // ─── STATE ────────────────────────────────────────────────────
    struct Transaction {
        uint256 id;
        address proposer;
        address to;
        uint256 amount;
        address token;          // ERC-20 token address (address(0) = ETH)
        string  reference;      // AegisLedger TX reference ID
        string  travelRuleData; // Encrypted Travel Rule payload
        bytes32 dataHash;       // Hash of off-chain metadata
        uint256 confirmations;
        bool    executed;
        bool    cancelled;
        uint256 createdAt;
        uint256 executeAfter;   // Time-lock: earliest execution time
    }

    bool    public paused;
    uint256 public threshold;           // Minimum confirmations to execute
    uint256 public timeLockSeconds;     // Delay between quorum and execution (0 = immediate)
    uint256 public transactionCount;

    // Fix 33: Recovery address — must be a cold hardware wallet held by a
    // different keyholder than the deployer. Set at deployment and updateable
    // only by the owner (or recovery address after emergency).
    address public recoveryAddress;

    address[] public signers;
    mapping(address => bool)              public isSigner;
    mapping(uint256 => Transaction)       public transactions;
    mapping(uint256 => mapping(address => bool)) public confirmations;

    // ─── MODIFIERS ────────────────────────────────────────────────
    modifier onlySigner() { require(isSigner[msg.sender], "Not a signer"); _; }
    modifier notPaused()  { require(!paused, "Contract is paused"); _; }
    modifier txExists(uint256 txId) { require(txId < transactionCount, "Tx does not exist"); _; }
    modifier notExecuted(uint256 txId) { require(!transactions[txId].executed, "Already executed"); _; }
    modifier notCancelled(uint256 txId) { require(!transactions[txId].cancelled, "Already cancelled"); _; }

    // ─── CONSTRUCTOR ──────────────────────────────────────────────
    /**
     * @param _signers          Initial list of authorized signers (min 2)
     * @param _threshold        Minimum signatures required (min 2, max signers.length)
     * @param _timeLockSeconds  Delay between quorum and execution (0 = immediate)
     * @param _recoveryAddress  Fix 33: Cold hardware wallet for emergency recovery.
     *                          Must NOT be the same key as the deployer.
     */
    constructor(
        address[] memory _signers,
        uint256 _threshold,
        uint256 _timeLockSeconds,
        address _recoveryAddress
    ) Ownable2Step() {
        require(_signers.length >= 2, "Minimum 2 signers");
        require(_threshold >= 2 && _threshold <= _signers.length, "Invalid threshold");
        require(_recoveryAddress != address(0), "Recovery address cannot be zero"); // Fix 33

        threshold       = _threshold;
        timeLockSeconds = _timeLockSeconds;
        recoveryAddress = _recoveryAddress;
        emit RecoveryAddressSet(_recoveryAddress);

        for (uint256 i = 0; i < _signers.length; i++) {
            address s = _signers[i];
            require(s != address(0), "Invalid signer");
            require(!isSigner[s], "Duplicate signer");
            isSigner[s] = true;
            signers.push(s);
            emit SignerAdded(s);
        }
    }

    // ─── FIX 33: RECOVERY ─────────────────────────────────────────

    /**
     * @notice Set or update the emergency recovery address.
     * @dev Should be a cold hardware wallet held by a different keyholder.
     */
    function setRecoveryAddress(address _recovery) external onlyOwner {
        require(_recovery != address(0), "Zero address");
        recoveryAddress = _recovery;
        emit RecoveryAddressSet(_recovery);
    }

    /**
     * @notice Emergency ownership recovery — transfers ownership to the recovery address.
     * @dev Only callable by the recovery address itself. Use when deployer key is lost.
     */
    function emergencyOwnerRecovery() external {
        require(msg.sender == recoveryAddress, "Not recovery address");
        _transferOwnership(recoveryAddress);
        emit EmergencyOwnerRecovery(recoveryAddress);
    }

    // ─── SUBMIT TRANSACTION ───────────────────────────────────────
    function submitTransaction(
        address _to,
        uint256 _amount,
        address _token,
        string calldata _reference,
        string calldata _travelRuleData,
        bytes32 _dataHash
    ) external onlySigner notPaused returns (uint256 txId) {
        require(_to != address(0), "Invalid recipient");
        require(_amount > 0, "Amount must be > 0");

        txId = transactionCount++;
        transactions[txId] = Transaction({
            id:            txId,
            proposer:      msg.sender,
            to:            _to,
            amount:        _amount,
            token:         _token,
            reference:     _reference,
            travelRuleData:_travelRuleData,
            dataHash:      _dataHash,
            confirmations: 0,
            executed:      false,
            cancelled:     false,
            createdAt:     block.timestamp,
            executeAfter:  0
        });

        emit TransactionSubmitted(txId, msg.sender, _to, _amount, _token, _reference);
        // Auto-confirm by proposer
        _confirm(txId);
    }

    // ─── CONFIRM ──────────────────────────────────────────────────
    function confirmTransaction(uint256 txId)
        external onlySigner notPaused txExists(txId) notExecuted(txId) notCancelled(txId)
    {
        require(!confirmations[txId][msg.sender], "Already confirmed");
        _confirm(txId);
    }

    function _confirm(uint256 txId) internal {
        confirmations[txId][msg.sender] = true;
        transactions[txId].confirmations++;
        emit TransactionConfirmed(txId, msg.sender);

        // If threshold reached, set time-lock window
        if (transactions[txId].confirmations == threshold && timeLockSeconds > 0) {
            transactions[txId].executeAfter = block.timestamp + timeLockSeconds;
        }
    }

    // ─── REVOKE ───────────────────────────────────────────────────
    function revokeConfirmation(uint256 txId)
        external onlySigner txExists(txId) notExecuted(txId) notCancelled(txId)
    {
        require(confirmations[txId][msg.sender], "Not confirmed");
        require(transactions[txId].confirmations > 0, "No confirmations");
        confirmations[txId][msg.sender] = false;
        transactions[txId].confirmations--;
        emit TransactionRevoked(txId, msg.sender);
    }

    // ─── EXECUTE ──────────────────────────────────────────────────
    function executeTransaction(uint256 txId)
        external onlySigner notPaused txExists(txId) notExecuted(txId) notCancelled(txId)
    {
        Transaction storage t = transactions[txId];
        require(t.confirmations >= threshold, "Insufficient confirmations");
        require(t.executeAfter == 0 || block.timestamp >= t.executeAfter, "Time-lock not elapsed");

        t.executed = true;

        if (t.token == address(0)) {
            // Native ETH transfer
            require(address(this).balance >= t.amount, "Insufficient ETH balance");
            (bool success,) = t.to.call{value: t.amount}("");
            require(success, "ETH transfer failed");
        } else {
            // ERC-20 transfer
            bool success = IERC20(t.token).transfer(t.to, t.amount);
            require(success, "Token transfer failed");
        }

        emit TransactionExecuted(txId, msg.sender);
    }

    // ─── CANCEL ───────────────────────────────────────────────────
    function cancelTransaction(uint256 txId, string calldata reason)
        external txExists(txId) notExecuted(txId) notCancelled(txId)
    {
        Transaction storage t = transactions[txId];
        require(msg.sender == t.proposer || msg.sender == owner(), "Not proposer or owner");
        t.cancelled = true;
        emit TransactionCancelled(txId, reason);
    }

    // ─── SIGNER MANAGEMENT ────────────────────────────────────────
    function addSigner(address _signer) external onlyOwner {
        require(_signer != address(0), "Invalid address");
        require(!isSigner[_signer], "Already a signer");
        isSigner[_signer] = true;
        signers.push(_signer);
        emit SignerAdded(_signer);
    }

    function removeSigner(address _signer) external onlyOwner {
        require(isSigner[_signer], "Not a signer");
        require(signers.length - 1 >= threshold, "Would break threshold");
        isSigner[_signer] = false;
        for (uint256 i = 0; i < signers.length; i++) {
            if (signers[i] == _signer) {
                signers[i] = signers[signers.length - 1];
                signers.pop();
                break;
            }
        }
        emit SignerRemoved(_signer);
    }

    function changeThreshold(uint256 _threshold) external onlyOwner {
        require(_threshold >= 2 && _threshold <= signers.length, "Invalid threshold");
        emit ThresholdChanged(threshold, _threshold);
        threshold = _threshold;
    }

    // ─── PAUSE ────────────────────────────────────────────────────
    function pause()   external onlyOwner { paused = true;  emit Paused(msg.sender); }
    function unpause() external onlyOwner { paused = false; emit Unpaused(msg.sender); }

    // ─── VIEW FUNCTIONS ───────────────────────────────────────────
    function getTransaction(uint256 txId) external view returns (Transaction memory) {
        return transactions[txId];
    }

    function getSigners() external view returns (address[] memory) { return signers; }

    function getConfirmationCount(uint256 txId) external view returns (uint256) {
        return transactions[txId].confirmations;
    }

    function isConfirmedBy(uint256 txId, address signer) external view returns (bool) {
        return confirmations[txId][signer];
    }

    function isReadyToExecute(uint256 txId) external view returns (bool) {
        Transaction storage t = transactions[txId];
        return !t.executed && !t.cancelled
            && t.confirmations >= threshold
            && (t.executeAfter == 0 || block.timestamp >= t.executeAfter);
    }

    receive() external payable {}
}
