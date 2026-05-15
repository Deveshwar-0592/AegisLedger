# AegisLedger — Smart Contract Audit Status

> This file is the authoritative audit gate. `AUDIT_CONFIRMED=true` must NOT
> be injected into any CI/CD pipeline until **all** items in this document are
> marked ✅ and the audit report PDF is linked below.

---

## Status: 🔴 PENDING — Mainnet Deployment Locked

| Field               | Value                              |
|---------------------|------------------------------------|
| **Status**          | Pre-audit (Testnet only)           |
| **Audit Firm**      | [To Be Determined]                 |
| **Engagement Start**| [Not yet started]                  |
| **Report Published**| [Not yet published]                |
| **Report Link**     | [Pending]                          |
| **Scope Complete**  | No                                 |
| `AUDIT_CONFIRMED`   | **false** (must remain false until below gates pass) |

---

## Contracts in Scope

All four contracts must be audited together. They are interdependent:
`AegisBoLNFT` tokens are locked into `AegisTradeEscrow` via `lockInEscrow()`.
`AegisMultiSig` governs high-value transfer authorization.
`AegisTrancheEscrow` is used for multi-milestone commodity trade deals.

| Contract File                  | Lines | Key Risk Areas                                     | Audit Status |
|-------------------------------|-------|----------------------------------------------------|--------------|
| `contracts/AegisTradeEscrow.sol`  | ~435  | ECDSA verification, multi-sig release, claimRefund logic, dispute deadline, reentrancy | 🔴 Pending |
| `contracts/AegisTrancheEscrow.sol`| ~275  | Sequential tranche ordering, uint256 underflow guards, dispute resolution path | 🔴 Pending |
| `contracts/AegisBoLNFT.sol`       | ~195  | ERC1155 inheritance, KYB gating, escrow lock/redeem atomicity | 🔴 Pending |
| `contracts/AegisMultiSig.sol`     | ~297  | Ownable2Step two-step transfer, recovery address trust model, time-lock bypass | 🔴 Pending |
| `scripts/deploy.js`               | ~90   | Treasury multisig address validation, AUDIT_CONFIRMED gate | 🔴 Pending |

---

## Audit Gate Checklist

Mainnet deployment (`network.name === 'mainnet'` or `'polygon'`) is **hard-blocked** in
`scripts/deploy.js` until every item below is checked off:

### Pre-Audit Requirements
- [ ] All contracts compile cleanly with `npx hardhat compile` (no warnings)
- [ ] All Hardhat test suites pass: `npx hardhat test` — 100% of critical paths
- [ ] Coverage report generated: all critical functions ≥ 70% branch coverage
- [ ] `TREASURY_MULTISIG_ADDRESS` is a verified Gnosis Safe address (not an EOA)
- [ ] `DEPLOYER_PRIVATE_KEY` is **absent** from all `.env*` files (pre-commit hook enforced)
- [ ] `ORACLE_KMS_KEY_ID` is provisioned in AWS KMS (ORACLE_PRIVATE_KEY removed)

### During Audit
- [ ] Audit firm has access to full Git history (not just the final commit)
- [ ] Audit firm has received the threat model document
- [ ] All audit queries/questions answered within 48 hours
- [ ] Interim findings reviewed and addressed before final report

### Post-Audit (before setting `AUDIT_CONFIRMED=true`)
- [ ] Audit firm has published the final report (PDF link in this file)
- [ ] All **Critical** and **High** severity findings are resolved and re-tested
- [ ] All **Medium** severity findings are resolved or have accepted mitigations
- [ ] Re-audit (or fix verification) completed for any resolved Critical/High items
- [ ] A named internal engineer has signed off on every finding's resolution
- [ ] `AUDIT_CONFIRMED=true` injected into CI/CD secrets vault (never `.env`)

---

## Per-Contract Security Notes

### AegisTradeEscrow.sol
- **Fix 4**: ECDSA signature verification on `fulfillCondition()` — signer must hold `ORACLE_ROLE`
- **Fix 5**: `isMultiSig` flag wired into `releaseFunds()` via buyer signature verification
- **Fix 10**: Escrow IDs use `keccak256(msg.sender, nonce, tradeReference)` — no `block.timestamp`
- **Fix 13**: Audit placeholder comment removed; mainnet deploy guard active in `deploy.js`
- **Fix 14**: `disputeDeadline` set to 14 days; `claimStaleDispute()` callable after deadline
- **Fix 22**: `claimRefund()` requires `status == FUNDED` — prevents refund after conditions met
- **Fix 51**: `feeRecipient` initialised to `TREASURY_MULTISIG_ADDRESS`, rotatable via `updateFeeRecipient()`

### AegisTrancheEscrow.sol
- **Fix 34**: Sequential tranche enforcement — loop bound `i < trancheIndex` (avoids uint256 underflow at index 0)
- **Note**: `releaseTranche()` caller restricted to buyer or arbitrator — seller cannot self-release

### AegisBoLNFT.sol
- **Fix 32**: Inherits OZ `ERC1155` + `AccessControl` — provides `safeTransferFrom`, `safeBatchTransferFrom`, `supportsInterface`
- **KYB Gate**: `endorseBoL()` and `mintBoL()` require `approvedEntities[address] == true`
- **Escrow Lock**: `lockInEscrow()` transfers token to escrow contract; `escrowContract` field set atomically

### AegisMultiSig.sol
- **Fix 33**: Inherits `Ownable2Step` — ownership transfer is two-step (no accidental loss)
- **Recovery Address**: Must be a cold hardware wallet held by a **different keyholder** than the deployer
- **Emergency Recovery**: `emergencyOwnerRecovery()` callable only by the `recoveryAddress` itself
- **Time-lock**: `timeLockSeconds` enforced between quorum reached and `executeTransaction()` window

---

## Known Pre-Audit Gaps (to be resolved before engagement)

1. **No formal threat model document** — required by most Tier-1 audit firms
2. **Oracle trust model** — `ORACLE_ROLE` controls `fulfillCondition()`; key management must be documented
3. **`AegisTrancheEscrow` has no AccessControl** — relies on plain `owner` variable; consider migrating to OZ `AccessControl` before audit
4. **No on-chain upgrade mechanism** — contracts are not upgradeable; re-deployment strategy must be documented
5. **ERC1155 `lockInEscrow` approval flow** — requires `setApprovalForAll` to be called by consignee before the escrow role can transfer; document the expected transaction sequence for integrators

---

## Audit Firm Selection Criteria

Preferred firms for DeFi/trade-finance contract audits (no endorsement implied):
- Trail of Bits
- OpenZeppelin (Forta audit team)
- Halborn
- Certik (for broad coverage)
- Sherlock (for contest-style coverage)

Minimum requirements:
- Prior experience auditing ERC1155 or trade-finance contracts
- Deliverable: machine-readable JSON findings + PDF report
- Timeline: minimum 3-week engagement for this scope

---

*Last updated: 2026-05-15 | Updated by: Automated (AegisLedger v4 implementation)*
*To unlock mainnet: resolve all checklist items above, then set `AUDIT_CONFIRMED=true` in CI/CD secrets only.*
