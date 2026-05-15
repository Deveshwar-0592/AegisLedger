import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, Circle, Clock, AlertTriangle, ShieldCheck,
  DollarSign, FileCheck, Truck, Gavel
} from 'lucide-react';
import { StatusBadge } from '../components/ui/StatusBadge';

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
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-mono text-neon-blue mb-1">Escrow Manager</h1>
        <p className="text-gray-400 text-sm">Real-time trade settlement lifecycle via AegisTradeEscrow.sol</p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Left: Escrow List */}
        <div className="col-span-4 space-y-3">
          {MOCK_ESCROWS.map(e => (
            <button
              key={e.id}
              onClick={() => setSelected(e)}
              className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                selected?.id === e.id
                  ? 'border-neon-blue bg-neon-blue/5 shadow-[0_0_20px_rgba(0,240,255,0.1)]'
                  : 'border-gray-800 bg-dark-card hover:border-gray-600'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="font-mono text-xs text-gray-400 truncate">{e.tradeReference}</span>
                <StatusBadge status={e.status} />
              </div>
              <div className="text-lg font-bold text-white">{fmt(e.amount)}</div>
              <div className="text-xs text-gray-500 mt-1">{e.assetKey} · {e.seller.slice(0, 22)}...</div>
            </button>
          ))}
        </div>

        {/* Right: Detail Panel */}
        <div className="col-span-8">
          <AnimatePresence mode="wait">
            {selected && (
              <motion.div
                key={selected.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-dark-card border border-gray-800 rounded-xl overflow-hidden"
              >
                {/* Header */}
                <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                  <div>
                    <p className="text-xs text-gray-500 font-mono mb-1">{selected.id}</p>
                    <h2 className="text-xl font-bold text-white">{selected.tradeReference}</h2>
                    <p className="text-sm text-gray-400 mt-1">{selected.buyer} → {selected.seller}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-mono font-bold text-neon-blue">{fmt(selected.amount)}</div>
                    <div className="text-xs text-gray-500 font-mono">{selected.assetKey}</div>
                  </div>
                </div>

                {/* Lifecycle Progress */}
                <div className="p-6 border-b border-gray-800">
                  <h3 className="text-xs text-gray-500 font-mono mb-6">SETTLEMENT LIFECYCLE</h3>
                  <div className="flex items-center">
                    {LIFECYCLE_STEPS.map((step, idx) => {
                      const Icon = step.icon;
                      const isActive = idx === stepIndex;
                      const isPast = idx < stepIndex;
                      return (
                        <React.Fragment key={step.key}>
                          <div className="flex flex-col items-center">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${
                              isActive ? 'border-neon-blue bg-neon-blue/10 text-neon-blue shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                              : isPast ? 'border-neon-purple bg-neon-purple/20 text-neon-purple'
                              : 'border-gray-700 text-gray-600'
                            }`}>
                              <Icon size={16} />
                            </div>
                            <span className={`text-xs font-mono mt-2 ${isActive ? 'text-neon-blue' : isPast ? 'text-gray-400' : 'text-gray-600'}`}>
                              {step.label}
                            </span>
                          </div>
                          {idx < LIFECYCLE_STEPS.length - 1 && (
                            <div className={`flex-1 h-0.5 mx-2 transition-all duration-500 ${isPast ? 'bg-neon-purple' : 'bg-gray-800'}`} />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                {/* Conditions */}
                <div className="p-6 border-b border-gray-800">
                  <h3 className="text-xs text-gray-500 font-mono mb-4">TRADE CONDITIONS</h3>
                  <div className="space-y-3">
                    {selected.conditions.map((cond, idx) => {
                      const Icon = CONDITION_ICONS[cond.type] || FileCheck;
                      return (
                        <div key={idx} className={`flex items-center space-x-4 p-3 rounded-lg border ${cond.fulfilled ? 'border-green-900/50 bg-green-900/10' : 'border-gray-800 bg-black/30'}`}>
                          <Icon size={16} className={cond.fulfilled ? 'text-green-400' : 'text-gray-600'} />
                          <div className="flex-1">
                            <div className={`text-sm font-mono ${cond.fulfilled ? 'text-white' : 'text-gray-500'}`}>
                              {cond.type.replace(/_/g, ' ')}
                            </div>
                            {cond.fulfilled && cond.fulfilledAt && (
                              <div className="text-xs text-gray-500 mt-0.5">
                                Verified {new Date(cond.fulfilledAt).toLocaleString()} · <span className="text-gray-600 font-mono">{cond.documentHash}</span>
                              </div>
                            )}
                          </div>
                          {cond.fulfilled
                            ? <CheckCircle2 size={16} className="text-green-400" />
                            : <Clock size={16} className="text-yellow-600 animate-pulse" />
                          }
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Multi-Sig Status */}
                {selected.isMultiSig && (
                  <div className="p-6 border-b border-gray-800">
                    <h3 className="text-xs text-gray-500 font-mono mb-3">MULTI-SIG RELEASE</h3>
                    <div className="flex items-center space-x-3">
                      <div className="flex-1 bg-gray-800 rounded-full h-2">
                        <div
                          className="h-2 rounded-full bg-neon-blue transition-all duration-1000"
                          style={{ width: `${((selected.signaturesCollected ?? 0) / (selected.requiredSignatures ?? 1)) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-mono text-neon-blue">
                        {selected.signaturesCollected}/{selected.requiredSignatures} signers
                      </span>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                {selected.status === 'CONDITIONS_MET' && (
                  <div className="p-6 flex space-x-3">
                    <button className="px-6 py-2.5 bg-neon-blue text-black font-bold font-mono text-sm rounded-lg hover:bg-white transition-colors shadow-[0_0_15px_rgba(0,240,255,0.3)] flex items-center space-x-2">
                      <ShieldCheck size={16} />
                      <span>SIGN RELEASE</span>
                    </button>
                    <button className="px-6 py-2.5 border border-red-700 text-red-400 font-mono text-sm rounded-lg hover:bg-red-900/20 transition-colors flex items-center space-x-2">
                      <AlertTriangle size={16} />
                      <span>INITIATE DISPUTE</span>
                    </button>
                  </div>
                )}
                {selected.status === 'RELEASED' && (
                  <div className="p-6 flex items-center space-x-2 text-green-400">
                    <CheckCircle2 size={18} />
                    <span className="font-mono text-sm">Settlement complete. Funds transferred to seller vault.</span>
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
