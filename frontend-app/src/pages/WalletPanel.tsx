import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, TrendingUp, TrendingDown, ArrowRightLeft, Download, Wifi, WifiOff } from 'lucide-react';
import { NumberCounter } from '../components/ui/NumberCounter';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useWebSockets } from '../hooks/useWebSockets';

export const WalletPanel: React.FC = () => {
  const assets = [
    { symbol: 'USDC', balance: 4500200, usdPrice: 0.9998, change24h: -0.01, isStablecoin: true },
    { symbol: 'USDT', balance: 1200000, usdPrice: 1.001, change24h: 0.05, isStablecoin: true },
    { symbol: 'AE_COIN', balance: 850000, usdPrice: 0.272, change24h: 2.4, isStablecoin: false, liquidityUsd: 450000 },
    { symbol: 'ETH', balance: 14.5, usdPrice: 3400.20, change24h: -1.2, isStablecoin: false }
  ];

  const recentActivity = [
    { id: 'ACT-1', type: 'Deposit', amount: 500000, asset: 'USDC', date: '2026-05-15 10:00' },
    { id: 'ACT-2', type: 'Withdrawal', amount: 100000, asset: 'USDT', date: '2026-05-14 14:30' },
    { id: 'ACT-3', type: 'Swap', amount: 25000, asset: 'AE_COIN', date: '2026-05-12 09:15' },
  ];

  // Live FX rates from WebSocket
  const { fxRates, connectionState } = useWebSockets();

  const depeggedAssets = assets.filter(a => a.isStablecoin && Math.abs(1 - a.usdPrice) > 0.005);

  const containerVariants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
  const itemVariants = { hidden: { opacity: 0, y: 15 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

  return (
    <div style={{ transform: 'translateZ(0)' }}>
      <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Treasury Wallet</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Manage your institutional balances and liquidity.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn-primary" style={{ backgroundColor: 'transparent', border: '1px solid var(--border-divider)', color: 'var(--text-primary)' }}>
            <ArrowRightLeft size={16} style={{ display: 'inline', marginRight: '0.5rem', verticalAlign: 'text-bottom' }} />
            Swap Assets
          </button>
          <button className="btn-primary">
            <Download size={16} style={{ display: 'inline', marginRight: '0.5rem', verticalAlign: 'text-bottom' }} />
            Deposit Funds
          </button>
        </div>
      </header>

      {/* Live FX Ticker */}
      <div className="surface-card" style={{ marginBottom: '2rem', padding: '1rem 1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
            LIVE FX RATES
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
            {connectionState.status === 'connected'
              ? <><Wifi size={12} style={{ color: 'var(--status-green)' }} /><span style={{ color: 'var(--status-green)' }}>LIVE</span></>
              : <><WifiOff size={12} style={{ color: 'var(--text-muted)' }} /><span style={{ color: 'var(--text-muted)' }}>OFFLINE</span></>
            }
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
          {fxRates.map((fx) => (
            <motion.div
              key={fx.pair}
              animate={{ opacity: [0.7, 1], scale: [0.99, 1] }}
              transition={{ duration: 0.3 }}
              style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-divider)' }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: '0.4rem' }}>{fx.pair}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                {fx.rate.toFixed(5)}
              </div>
              <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: fx.change24h >= 0 ? 'var(--status-green)' : 'var(--status-red)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                {fx.change24h >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {fx.change24h >= 0 ? '+' : ''}{fx.change24h.toFixed(3)}%
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {depeggedAssets.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          style={{ backgroundColor: 'rgba(139, 32, 32, 0.1)', border: '1px solid var(--status-red)', borderRadius: '8px', padding: '1rem 1.5rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', color: '#f87171' }}
        >
          <AlertTriangle size={20} style={{ marginRight: '1rem' }} />
          <div>
            <span style={{ fontWeight: 600 }}>Depeg Warning:</span> {depeggedAssets.map(a => a.symbol).join(', ')} deviating from $1.00 peg. Trading may be restricted.
          </div>
        </motion.div>
      )}

      <motion.div variants={containerVariants} initial="hidden" animate="show" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {assets.map((asset, idx) => (
          <motion.div key={idx} variants={itemVariants} className="surface-card hover-lift" style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{asset.symbol}</div>
              <div style={{ display: 'flex', alignItems: 'center', color: asset.change24h >= 0 ? 'var(--status-green)' : 'var(--status-red)', fontSize: '0.85rem' }}>
                {asset.change24h >= 0 ? <TrendingUp size={14} style={{ marginRight: '0.25rem' }} /> : <TrendingDown size={14} style={{ marginRight: '0.25rem' }} />}
                {Math.abs(asset.change24h)}%
              </div>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              <NumberCounter value={asset.balance} format="number" />
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              ≈ <NumberCounter value={asset.balance * asset.usdPrice} format="currency" currency="USD" />
            </div>
            {asset.symbol === 'AE_COIN' && (
              <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-divider)', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>ADX Liquidity</span>
                <span style={{ color: asset.liquidityUsd! > 100000 ? 'var(--status-green)' : 'var(--status-amber)' }}>
                  <NumberCounter value={asset.liquidityUsd!} format="currency" currency="USD" />
                </span>
              </div>
            )}
          </motion.div>
        ))}
      </motion.div>

      <div className="surface-card">
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>Recent Wallet Activity</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-divider)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <th style={{ padding: '1rem 0', fontWeight: 500 }}>ID</th>
                <th style={{ padding: '1rem 0', fontWeight: 500 }}>Type</th>
                <th style={{ padding: '1rem 0', fontWeight: 500 }}>Asset</th>
                <th style={{ padding: '1rem 0', fontWeight: 500, textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '1rem 0', fontWeight: 500, textAlign: 'right' }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentActivity.map((act) => (
                <tr key={act.id} style={{ borderBottom: '1px solid var(--border-divider)', transition: 'background-color 0.2s' }} className="hover-row">
                  <td style={{ padding: '1rem 0', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{act.id}</td>
                  <td style={{ padding: '1rem 0' }}><StatusBadge status={act.type === 'Deposit' ? 'COMPLETED' : 'PENDING'} /> {act.type}</td>
                  <td style={{ padding: '1rem 0', fontWeight: 600 }}>{act.asset}</td>
                  <td style={{ padding: '1rem 0', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {act.type === 'Withdrawal' ? '-' : '+'}<NumberCounter value={act.amount} format="number" />
                  </td>
                  <td style={{ padding: '1rem 0', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{act.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <style>{`.hover-row:hover { background-color: rgba(201, 168, 76, 0.05); }`}</style>
    </div>
  );
};
