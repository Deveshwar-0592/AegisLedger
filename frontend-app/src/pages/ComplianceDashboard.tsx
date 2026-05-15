import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, ShieldCheck, FileSearch, WifiOff, Radio } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { VirtualTable } from '../components/ui/VirtualTable';
import { GlitchWrapper } from '../components/ui/GlitchWrapper';
import { useWebSockets } from '../hooks/useWebSockets';

const SEVERITY_STYLE: Record<string, { bg: string; color: string }> = {
  critical: { bg: 'rgba(139, 32, 32, 0.25)', color: '#f87171' },
  warning:  { bg: 'rgba(122, 92, 26, 0.25)',  color: '#fbbf24' },
  info:     { bg: 'rgba(26, 122, 74, 0.25)',  color: '#4ade80' },
  HIGH:     { bg: 'rgba(139, 32, 32, 0.2)',   color: '#f87171' },
  MEDIUM:   { bg: 'rgba(122, 92, 26, 0.2)',   color: '#fbbf24' },
  LOW:      { bg: 'rgba(26, 122, 74, 0.2)',   color: '#4ade80' },
};

export const ComplianceDashboard: React.FC = () => {
  // Live audit log from WebSocket
  const { auditLogs, connectionState } = useWebSockets();
  const [glitchActive, setGlitchActive] = React.useState(false);

  const riskDistribution = [
    { name: 'Low Risk (0-30)', count: 420 },
    { name: 'Med Risk (31-70)', count: 85 },
    { name: 'High Risk (71-100)', count: 12 },
  ];

  const recentAlerts = useMemo(() => {
    const alerts = [];
    const types = ['Sanctions Match (Partial)', 'Velocity Limit Exceeded', 'Unusual IP Location', 'KYB Renewal Due', 'High-Risk Jurisdiction'];
    const entities = ['OAO Alpha Trade', 'Beta Logistics', 'Gamma Corp', 'Delta Shipping', 'Epsilon Holdings'];
    for (let i = 0; i < 500; i++) {
      const isHigh = i % 15 === 0;
      const isMed = i % 7 === 0;
      alerts.push({
        id: `ALT-${99100 - i}`,
        severity: isHigh ? 'HIGH' : isMed ? 'MEDIUM' : 'LOW',
        type: types[i % types.length],
        entity: entities[i % entities.length],
        tx: i % 3 === 0 ? `TRX-88${i}` : 'N/A',
        status: isHigh ? (i % 2 === 0 ? 'PENDING_REVIEW' : 'FROZEN') : 'CLEARED'
      });
    }
    return alerts;
  }, []);

  const highAlertCount = recentAlerts.filter(a => a.severity === 'HIGH').length;

  React.useEffect(() => {
    if (highAlertCount > 0) {
      const interval = setInterval(() => {
        setGlitchActive(true);
        setTimeout(() => setGlitchActive(false), 300);
      }, 5000 + Math.random() * 5000);
      return () => clearInterval(interval);
    }
  }, [highAlertCount]);

  const columns = [
    {
      header: 'Alert ID', key: 'id', width: '15%',
      render: (item: any) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{item.id}</span>
    },
    {
      header: 'Severity', key: 'severity', width: '15%',
      render: (item: any) => {
        const s = SEVERITY_STYLE[item.severity] || SEVERITY_STYLE.LOW;
        return <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: s.bg, color: s.color }}>{item.severity}</span>;
      }
    },
    {
      header: 'Type', key: 'type', width: '25%',
      render: (item: any) => <span style={{ fontSize: '0.9rem' }}>{item.type}</span>
    },
    {
      header: 'Entity / TxRef', key: 'entity', width: '25%',
      render: (item: any) => (
        <div>
          <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{item.entity}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--accent-gold)', cursor: 'pointer' }}>{item.tx}</div>
        </div>
      )
    },
    {
      header: 'Status / Action', key: 'status', width: '20%', align: 'right' as const,
      render: (item: any) => (
        <button className="btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
          {item.status === 'PENDING_REVIEW' ? 'Review Now' : item.status}
        </button>
      )
    }
  ];

  return (
    <div style={{ transform: 'translateZ(0)' }}>
      <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Compliance &amp; AML Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Real-time risk monitoring and regulatory reporting status.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid var(--border-divider)', fontSize: '0.8rem' }}>
          {connectionState.status === 'connected'
            ? <><Radio size={14} style={{ color: 'var(--status-green)' }} /><span style={{ color: 'var(--status-green)' }}>LIVE AUDIT FEED</span></>
            : <><WifiOff size={14} style={{ color: 'var(--text-muted)' }} /><span style={{ color: 'var(--text-muted)' }}>CONNECTING...</span></>
          }
        </div>
      </header>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="surface-card">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
            <ShieldCheck size={20} color="var(--status-green)" style={{ marginRight: '0.75rem' }} />
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Sanctions Screening</h3>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>Operational</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Last updated: 14 mins ago (OFAC, EU, UN)</div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="surface-card">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
            <FileSearch size={20} color="var(--accent-gold)" style={{ marginRight: '0.75rem' }} />
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>VARA Reporting</h3>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>Compliant</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Next automated filing: May 31, 2026</div>
        </motion.div>

        <GlitchWrapper active={glitchActive}>
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="surface-card" style={{ borderLeft: '3px solid var(--status-red)' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
              <ShieldAlert size={20} color="var(--status-red)" style={{ marginRight: '0.75rem' }} />
              <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Active High-Risk Alerts</h3>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--status-red)' }}>{highAlertCount} Pending</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Requires immediate Compliance Officer action</div>
          </motion.div>
        </GlitchWrapper>
      </div>

      {/* Charts + Alert Table */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem', marginBottom: '2rem' }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="surface-card">
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>Risk Score Distribution</h2>
          <div style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskDistribution} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-divider)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--border-divider)" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <YAxis stroke="var(--border-divider)" tick={{ fill: 'var(--text-secondary)' }} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-divider)' }} itemStyle={{ color: 'var(--text-primary)' }} />
                <Bar dataKey="count" fill="var(--accent-gold)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="surface-card">
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>AML Alert Feed</h2>
          <VirtualTable data={recentAlerts} columns={columns} rowHeight={70} containerHeight="400px" />
        </motion.div>
      </div>

      {/* Live WebSocket Audit Log */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="surface-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem' }}>Live Audit Log</h2>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {auditLogs.length} events captured
          </span>
        </div>
        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
          <AnimatePresence initial={false}>
            {auditLogs.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 0', fontSize: '0.9rem' }}>
                Waiting for live events...
              </div>
            )}
            {auditLogs.map((log) => {
              const s = SEVERITY_STYLE[log.severity] || SEVERITY_STYLE.info;
              return (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25 }}
                  style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 0', borderBottom: '1px solid var(--border-divider)' }}
                >
                  <span style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, backgroundColor: s.bg, color: s.color, minWidth: '60px', textAlign: 'center', textTransform: 'uppercase' }}>
                    {log.severity}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-gold)', minWidth: '200px' }}>
                    {log.eventType}
                  </span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {JSON.stringify(log.details)}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};
