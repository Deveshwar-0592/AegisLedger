import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SendHorizontal, Search, CheckCircle, XCircle } from 'lucide-react';
import { NumberCounter } from '../components/ui/NumberCounter';
import { CinematicHeader } from '../components/ui/CinematicHeader';
import { GlassCard } from '../components/ui/GlassCard';
import { MagneticButton } from '../components/ui/MagneticButton';
import { ScrollReveal } from '../components/ui/ScrollReveal';
import { DataStreamOverlay } from '../components/ui/DataStreamOverlay';
import { TypingIndicator } from '../components/ui/TypingIndicator';
import { GlitchWrapper } from '../components/ui/GlitchWrapper';
import { useSoundDesign } from '../hooks/useSoundDesign';

export const TransferModule: React.FC = () => {
  const { playSound } = useSoundDesign();
  const [view, setView] = useState<'initiator' | 'checker'>('initiator');
  const [amount, setAmount] = useState('');
  const [asset, setAsset] = useState('USDC');
  const [recipient, setRecipient] = useState('');
  const [memo, setMemo] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);

  // Mock pending approvals
  const [pendingApprovals, setPendingApprovals] = useState([
    { id: 'TRX-REQ-1092', amount: 850000, asset: 'AED', recipient: 'Emirates Logistics', initiator: 'j.doe@acme.com', date: '2 hours ago' },
    { id: 'TRX-REQ-1093', amount: 1500000, asset: 'USDC', recipient: 'Marina Trade', initiator: 'm.smith@acme.com', date: '10 mins ago' },
  ]);
  const [rejectedId, setRejectedId] = useState<string | null>(null);

  const handleSubmit = () => {
    playSound('click');
    setIsProcessing(true);
    setTimeout(() => {
      playSound('success');
      setIsProcessing(false);
      setAmount('');
      setRecipient('');
      setMemo('');
      // Optional: Add to pending
      setView('checker');
    }, 4500);
  };

  const handleApprove = (id: string) => {
    playSound('click');
    setShowOverlay(true);
    setTimeout(() => {
      playSound('success');
      setShowOverlay(false);
      setPendingApprovals(prev => prev.filter(req => req.id !== id));
    }, 5000);
  };

  const handleReject = (id: string) => {
    playSound('error');
    setRejectedId(id);
    setTimeout(() => {
      setPendingApprovals(prev => prev.filter(r => r.id !== id));
      setRejectedId(null);
    }, 400);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ transform: 'translateZ(0)' }}
    >
      <DataStreamOverlay 
        isOpen={showOverlay} 
        title="EXECUTING SMART CONTRACT" 
      />

      <ScrollReveal>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
          <div style={{ flex: 1 }}>
            <CinematicHeader title="Cross-Border Transfers" subtitle="Initiate and approve high-value institutional settlements." type="transfers" />
          </div>
          <div style={{ display: 'flex', backgroundColor: 'var(--bg-elevated)', borderRadius: '6px', padding: '0.25rem', border: '1px solid var(--border-divider)', marginLeft: '1rem', marginTop: '0.5rem' }}>
            <button 
              onClick={() => { playSound('click'); setView('initiator'); }}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                fontWeight: 500,
                backgroundColor: view === 'initiator' ? 'var(--accent-gold)' : 'transparent',
                color: view === 'initiator' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                transition: 'all 0.2s ease',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Initiate Transfer
            </button>
            <button 
              onClick={() => { playSound('click'); setView('checker'); }}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                fontWeight: 500,
                backgroundColor: view === 'checker' ? 'var(--accent-gold)' : 'transparent',
                color: view === 'checker' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                transition: 'all 0.2s ease',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Pending Approvals
              <span style={{ marginLeft: '0.5rem', backgroundColor: view === 'checker' ? 'var(--bg-primary)' : 'var(--accent-gold)', color: view === 'checker' ? 'var(--accent-gold)' : 'var(--bg-primary)', padding: '0.1rem 0.4rem', borderRadius: '12px', fontSize: '0.75rem' }}>
                {pendingApprovals.length}
              </span>
            </button>
          </div>
        </div>
      </ScrollReveal>

      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <AnimatePresence mode="wait">
          {view === 'initiator' ? (
            <motion.div
              key="initiator"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <ScrollReveal>
                <GlassCard elevated>
                  {isProcessing ? (
                    <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                      <TypingIndicator
                        isLoading={true}
                        messages={[
                          "Validating liquidity pools...",
                          "Generating cryptographic signature...",
                          "Broadcasting to Aegis network...",
                          "Awaiting consensus confirmation..."
                        ]}
                      >
                        <div />
                      </TypingIndicator>
                    </div>
                  ) : (
                    <>
                      <h2 style={{ fontSize: '1.1rem', marginBottom: '2rem', display: 'flex', alignItems: 'center' }}>
                        <SendHorizontal style={{ marginRight: '0.75rem' }} color="var(--accent-gold)" /> 
                        New Transfer Request
                      </h2>

                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Transfer Amount</label>
                          <input 
                            type="number" 
                            placeholder="0.00" 
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            style={{ 
                              width: '100%',
                              fontSize: '1.5rem', 
                              padding: '1rem',
                              backgroundColor: 'rgba(0, 0, 0, 0.2)',
                              border: '1px solid var(--border-divider)',
                              borderRadius: '6px',
                              color: 'var(--text-primary)',
                              fontFamily: 'var(--font-mono)'
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Asset</label>
                          <select 
                            value={asset}
                            onChange={(e) => setAsset(e.target.value)}
                            style={{ 
                              width: '100%',
                              fontSize: '1.5rem', 
                              padding: '1rem', 
                              appearance: 'none',
                              backgroundColor: 'rgba(0, 0, 0, 0.2)',
                              border: '1px solid var(--border-divider)',
                              borderRadius: '6px',
                              color: 'var(--text-primary)',
                              fontFamily: 'var(--font-mono)'
                            }}
                          >
                            <option value="USDC">USDC</option>
                            <option value="USDT">USDT</option>
                            <option value="AE_COIN">AE_COIN</option>
                            <option value="AED">AED (Fiat)</option>
                          </select>
                        </div>
                      </div>

                      <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recipient Counterparty lookup</label>
                        <div style={{ position: 'relative' }}>
                          <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                          <input 
                            type="text" 
                            placeholder="Search by Company Name or Wallet Address..." 
                            value={recipient}
                            onChange={(e) => setRecipient(e.target.value)}
                            style={{ 
                              width: '100%',
                              padding: '1rem 1rem 1rem 3rem',
                              backgroundColor: 'rgba(0, 0, 0, 0.2)',
                              border: '1px solid var(--border-divider)',
                              borderRadius: '6px',
                              color: 'var(--text-primary)',
                              fontFamily: 'var(--font-mono)'
                            }}
                          />
                        </div>
                      </div>

                      <div style={{ marginBottom: '2.5rem' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Transfer Memo / Invoice Ref</label>
                        <input 
                          type="text" 
                          placeholder="e.g. INV-2026-05-992" 
                          value={memo}
                          onChange={(e) => setMemo(e.target.value)}
                          style={{ 
                            width: '100%',
                            padding: '1rem',
                            backgroundColor: 'rgba(0, 0, 0, 0.2)',
                            border: '1px solid var(--border-divider)',
                            borderRadius: '6px',
                            color: 'var(--text-primary)',
                            fontFamily: 'var(--font-mono)'
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1.5rem', borderTop: '1px solid var(--border-divider)' }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          Transfers over <span style={{ color: 'var(--text-primary)' }}>$500,000</span> require Checker approval.
                        </div>
                        <MagneticButton onClick={handleSubmit} style={{ padding: '0.75rem 2rem' }}>
                          Submit for Approval
                        </MagneticButton>
                      </div>
                    </>
                  )}
                </GlassCard>
              </ScrollReveal>
            </motion.div>
          ) : (
            <motion.div
              key="checker"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <h2 style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>Maker-Checker Queue</h2>
              {pendingApprovals.map(req => (
                <ScrollReveal key={req.id}>
                  <GlitchWrapper active={rejectedId === req.id}>
                    <GlassCard style={{ marginBottom: '1rem', padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--accent-gold)' }}>{req.id}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Requested: {req.date}</div>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '1.5rem' }}>
                      <div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recipient</div>
                        <div style={{ fontWeight: 500 }}>{req.recipient}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                          <NumberCounter value={req.amount} format="number" /> <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>{req.asset}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-divider)' }}>
                      <MagneticButton 
                        onClick={() => handleApprove(req.id)}
                        style={{ flex: 1, backgroundColor: 'rgba(26, 122, 74, 0.15)', color: '#4ade80', borderColor: 'var(--status-green)' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <CheckCircle size={18} style={{ marginRight: '0.5rem' }} /> Approve & Execute
                        </div>
                      </MagneticButton>
                      <MagneticButton 
                        onClick={() => handleReject(req.id)}
                        style={{ flex: 1, backgroundColor: 'rgba(139, 32, 32, 0.15)', color: '#f87171', borderColor: 'var(--status-red)' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <XCircle size={18} style={{ marginRight: '0.5rem' }} /> Reject
                        </div>
                      </MagneticButton>
                    </div>
                  </GlassCard>
                </GlitchWrapper>
              </ScrollReveal>
            ))}
              {pendingApprovals.length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                  No pending approvals.
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
