import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, Circle, Clock, AlertTriangle, ShieldCheck,
  DollarSign, FileCheck, Truck, Gavel
} from 'lucide-react';
import { StatusBadge } from '../components/ui/StatusBadge';
import styles from './EscrowManager.module.css';

// --- Types ---
type EscrowStatus = 'CREATED' | 'FUNDED' | 'CONDITIONS_MET' | 'RELEASED' | 'DISPUTED' | 'REFUNDED' | 'FROZEN';

interface Condition {
  type: string;
  fulfilled: boolean;
  fulfilledAt?: string;
  documentHash?: string;
}

interface Escrow {
  id: string;
  tradeReference: string;
  buyer: string;
  seller: string;
  amount: number;
  assetKey: string;
  status: EscrowStatus;
  conditions: Condition[];
  createdAt: string;
  expiryDate: string;
  isMultiSig: boolean;
  signaturesCollected?: number;
  requiredSignatures?: number;
}

// --- Mock Data ---
const MOCK_ESCROWS: Escrow[] = [
  {
    id: '0xA4F8...B21C',
    tradeReference: 'INV-2024-UAE-RU-00441',
    buyer: 'Moskva Import Group',
    seller: 'Dubai Gulf Traders LLC',
    amount: 2_450_000,
    assetKey: 'USDC_ETH',
    status: 'CONDITIONS_MET',
    conditions: [
      { type: 'BILL_OF_LADING', fulfilled: true, fulfilledAt: '2024-05-14T09:22:00Z', documentHash: '0x3a1f...' },
      { type: 'COMMERCIAL_INVOICE', fulfilled: true, fulfilledAt: '2024-05-14T10:05:00Z', documentHash: '0x8c7d...' },
      { type: 'CUSTOMS_CLEARANCE', fulfilled: true, fulfilledAt: '2024-05-15T06:30:00Z', documentHash: '0x1a4e...' },
      { type: 'QUALITY_INSPECTION', fulfilled: false },
    ],
    createdAt: '2024-05-10T12:00:00Z',
    expiryDate: '2024-08-10T12:00:00Z',
    isMultiSig: true,
    signaturesCollected: 1,
    requiredSignatures: 2,
  },
  {
    id: '0xC72D...A09E',
    tradeReference: 'INV-2024-UAE-SG-00308',
    buyer: 'Singapore Capital Corp',
    seller: 'Abu Dhabi Energy Ltd',
    amount: 8_100_000,
    assetKey: 'USDT_POLY',
    status: 'FUNDED',
    conditions: [
      { type: 'BILL_OF_LADING', fulfilled: false },
      { type: 'PORT_AUTHORITY_SIGN', fulfilled: false },
      { type: 'PACKING_LIST', fulfilled: false },
    ],
    createdAt: '2024-05-13T08:00:00Z',
    expiryDate: '2024-08-13T08:00:00Z',
    isMultiSig: false,
  },
  {
    id: '0xF11B...3D8A',
    tradeReference: 'INV-2024-RU-UAE-00112',
    buyer: 'Novatek Trading',
    seller: 'Emirates Resources',
    amount: 450_000,
    assetKey: 'AE_COIN',
    status: 'RELEASED',
    conditions: [
      { type: 'BILL_OF_LADING', fulfilled: true },
      { type: 'COMMERCIAL_INVOICE', fulfilled: true },
    ],
    createdAt: '2024-04-22T08:00:00Z',
    expiryDate: '2024-07-22T08:00:00Z',
    isMultiSig: false,
  },
];

const LIFECYCLE_STEPS: { key: EscrowStatus; label: string; icon: React.FC<any> }[] = [
  { key: 'CREATED', label: 'Created', icon: Circle },
  { key: 'FUNDED', label: 'Funded', icon: DollarSign },
  { key: 'CONDITIONS_MET', label: 'Docs Verified', icon: FileCheck },
  { key: 'RELEASED', label: 'Released', icon: ShieldCheck },
];

const STATUS_STEP_INDEX: Record<EscrowStatus, number> = {
  CREATED: 0,
  FUNDED: 1,
  CONDITIONS_MET: 2,
  RELEASED: 3,
  DISPUTED: 2,
  REFUNDED: 1,
  FROZEN: 1,
};

const CONDITION_ICONS: Record<string, React.FC<any>> = {
  BILL_OF_LADING: Truck,
  COMMERCIAL_INVOICE: FileCheck,
  PACKING_LIST: FileCheck,
  CUSTOMS_CLEARANCE: ShieldCheck,
  PORT_AUTHORITY_SIGN: ShieldCheck,
  QUALITY_INSPECTION: Gavel,
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

// --- Component ---
export const EscrowManager: React.FC = () => {
  const [selected, setSelected] = useState<Escrow | null>(MOCK_ESCROWS[0]);

  const stepIndex = selected ? STATUS_STEP_INDEX[selected.status] : 0;

  return (
    <div className={styles.container}>
      <div>
        <h1 className={styles.pageTitle}>Escrow Manager</h1>
        <p className={styles.pageSubtitle}>Real-time trade settlement lifecycle via AegisTradeEscrow.sol</p>
      </div>

      <div className={styles.grid}>
        {/* Left: Escrow List */}
        <div className={styles.leftPanel}>
          {MOCK_ESCROWS.map(e => (
            <button
              key={e.id}
              onClick={() => setSelected(e)}
              className={`${styles.escrowItem} ${selected?.id === e.id ? styles.escrowItemActive : styles.escrowItemInactive}`}
            >
              <div className={styles.itemTop}>
                <span className={styles.itemRef}>{e.tradeReference}</span>
                <StatusBadge status={e.status} />
              </div>
              <div className={styles.itemAmount}>{fmt(e.amount)}</div>
              <div className={styles.itemDesc}>{e.assetKey} · {e.seller.slice(0, 22)}...</div>
            </button>
          ))}
        </div>

        {/* Right: Detail Panel */}
        <div className={styles.rightPanel}>
          <AnimatePresence mode="wait">
            {selected && (
              <motion.div
                key={selected.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={styles.detailCard}
              >
                {/* Header */}
                <div className={styles.detailHeader}>
                  <div>
                    <p className={styles.headerRefLabel}>{selected.id}</p>
                    <h2 className={styles.headerRefValue}>{selected.tradeReference}</h2>
                    <p className={styles.headerParties}>{selected.buyer} → {selected.seller}</p>
                  </div>
                  <div>
                    <div className={styles.headerAmount}>{fmt(selected.amount)}</div>
                    <div className={styles.headerAsset}>{selected.assetKey}</div>
                  </div>
                </div>

                {/* Lifecycle Progress */}
                <div className={styles.sectionBlock}>
                  <h3 className={styles.sectionTitle}>SETTLEMENT LIFECYCLE</h3>
                  <div className={styles.lifecycleSteps}>
                    {LIFECYCLE_STEPS.map((step, idx) => {
                      const Icon = step.icon;
                      const isActive = idx === stepIndex;
                      const isPast = idx < stepIndex;
                      
                      let circleClass = styles.statusCircleFuture;
                      let labelClass = styles.stepLabelFuture;
                      if (isActive) {
                        circleClass = styles.statusCircleActive;
                        labelClass = styles.stepLabelActive;
                      } else if (isPast) {
                        circleClass = styles.statusCirclePast;
                        labelClass = styles.stepLabelPast;
                      }

                      return (
                        <React.Fragment key={step.key}>
                          <div className={styles.stepContainer}>
                            <div className={`${styles.statusCircle} ${circleClass}`}>
                              <Icon size={16} />
                            </div>
                            <span className={`${styles.stepLabel} ${labelClass}`}>
                              {step.label}
                            </span>
                          </div>
                          {idx < LIFECYCLE_STEPS.length - 1 && (
                            <div className={`${styles.statusLine} ${isPast ? styles.statusLinePast : styles.statusLineFuture}`} />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                {/* Conditions */}
                <div className={styles.sectionBlock}>
                  <h3 className={styles.sectionTitle}>TRADE CONDITIONS</h3>
                  <div className={styles.conditionsList}>
                    {selected.conditions.map((cond, idx) => {
                      const Icon = CONDITION_ICONS[cond.type] || FileCheck;
                      return (
                        <div key={idx} className={`${styles.conditionRow} ${cond.fulfilled ? styles.conditionRowFulfilled : styles.conditionRowPending}`}>
                          <Icon size={16} className={cond.fulfilled ? styles.iconSuccess : styles.iconPending} />
                          <div className={styles.conditionTextContainer}>
                            <div className={`${styles.conditionType} ${cond.fulfilled ? styles.conditionTypeFulfilled : styles.conditionTypePending}`}>
                              {cond.type.replace(/_/g, ' ')}
                            </div>
                            {cond.fulfilled && cond.fulfilledAt && (
                              <div className={styles.conditionMeta}>
                                Verified {new Date(cond.fulfilledAt).toLocaleString()} · <span className={styles.conditionHash}>{cond.documentHash}</span>
                              </div>
                            )}
                          </div>
                          {cond.fulfilled
                            ? <CheckCircle2 size={16} className={styles.iconSuccess} />
                            : <Clock size={16} className={`${styles.iconAlert} ${styles.animatePulse}`} />
                          }
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Multi-Sig Status */}
                {selected.isMultiSig && (
                  <div className={styles.sectionBlock}>
                    <h3 className={styles.sectionTitle}>MULTI-SIG RELEASE</h3>
                    <div className={styles.multiSigRow}>
                      <div className={styles.progressBarBg}>
                        <div
                          className={styles.progressBarFill}
                          style={{ width: `${((selected.signaturesCollected ?? 0) / (selected.requiredSignatures ?? 1)) * 100}%` }}
                        />
                      </div>
                      <span className={styles.multiSigLabel}>
                        {selected.signaturesCollected}/{selected.requiredSignatures} signers
                      </span>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                {selected.status === 'CONDITIONS_MET' && (
                  <div className={styles.actionRow}>
                    <button className={styles.primaryBtn}>
                      <ShieldCheck size={16} />
                      <span>SIGN RELEASE</span>
                    </button>
                    <button className={styles.dangerBtn}>
                      <AlertTriangle size={16} />
                      <span>INITIATE DISPUTE</span>
                    </button>
                  </div>
                )}
                {selected.status === 'RELEASED' && (
                  <div className={styles.actionRow}>
                    <CheckCircle2 size={18} className={styles.iconSuccess} />
                    <span className={styles.successText}>Settlement complete. Funds transferred to seller vault.</span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
