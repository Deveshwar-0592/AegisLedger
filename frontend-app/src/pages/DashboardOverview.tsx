import React, { useMemo, useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { NumberCounter } from '../components/ui/NumberCounter';
import { StatusBadge, type StatusType } from '../components/ui/StatusBadge';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { VirtualTable } from '../components/ui/VirtualTable';
import { CinematicHeader } from '../components/ui/CinematicHeader';
import { GlassCard } from '../components/ui/GlassCard';
import { ScrollReveal } from '../components/ui/ScrollReveal';
import { SkeletonScreen } from '../components/ui/SkeletonScreen';
import { useReducedMotion } from '../hooks/useReducedMotion';

// Parallax tilt wrapper
const TiltCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const { disabledByContext } = useReducedMotion();
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabledByContext || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const multiplier = 10;
    const calcX = -((y - rect.height / 2) / rect.height) * multiplier;
    const calcY = ((x - rect.width / 2) / rect.width) * multiplier;
    
    setRotateX(calcX);
    setRotateY(calcY);
  };

  const handleMouseLeave = () => {
    setRotateX(0);
    setRotateY(0);
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
        transition: rotateX === 0 && rotateY === 0 ? 'transform 0.5s ease-out' : 'none',
        willChange: 'transform',
        height: '100%'
      }}
      className={className}
    >
      <GlassCard elevated style={{ height: '100%', padding: 0 }}>
        {children}
      </GlassCard>
    </div>
  );
};

export const DashboardOverview: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  const metrics = [
    { label: 'Total Settled (30d)', value: 14502000, format: 'currency', currency: 'USD' },
    { label: 'Pending Approvals', value: 12, format: 'number' },
    { label: 'Active Escrows', value: 34, format: 'number' },
    { label: 'AML Alerts', value: 2, format: 'number' },
  ];

  const volumeData = [
    { name: 'May 01', USD: 400000, AED: 240000 },
    { name: 'May 05', USD: 300000, AED: 139000 },
    { name: 'May 10', USD: 200000, AED: 980000 },
    { name: 'May 15', USD: 278000, AED: 390000 },
    { name: 'May 20', USD: 189000, AED: 480000 },
    { name: 'May 25', USD: 239000, AED: 380000 },
    { name: 'May 30', USD: 349000, AED: 430000 },
  ];

  const transactions = useMemo(() => {
    const data = [];
    const counterparties = ['Emirates Logistics', 'Marina Trade Co.', 'Kowloon Shipping', 'Thames Heavy Ind.', 'Lyon Freight'];
    const assets = ['AED', 'USDC', 'USDT', 'USDC'];
    const statuses = ['COMPLETED', 'PENDING', 'COMPLETED', 'DISPUTED', 'FAILED'];
    
    for (let i = 0; i < 200; i++) {
      data.push({
        id: `TRX-${9938 - i}-GLB`,
        date: `2026-05-${Math.max(1, 15 - Math.floor(i/10))} 14:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`,
        counterparty: counterparties[i % counterparties.length],
        amount: Math.floor(Math.random() * 1000000) + 10000,
        asset: assets[i % assets.length],
        status: statuses[i % statuses.length]
      });
    }
    return data;
  }, []);

  const columns = [
    {
      header: 'Counterparty / Ref',
      key: 'counterparty',
      render: (item: any) => (
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 500, marginBottom: '0.25rem' }}>{item.counterparty}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{item.id}</div>
        </div>
      )
    },
    {
      header: 'Amount / Status',
      key: 'amount',
      align: 'right' as const,
      render: (item: any) => (
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, fontFamily: 'var(--font-mono)', marginBottom: '0.25rem' }}>
            {new Intl.NumberFormat('en-US').format(item.amount)} {item.asset}
          </div>
          <StatusBadge status={item.status as StatusType} />
        </div>
      )
    }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ transform: 'translateZ(0)' }}
    >
      <ScrollReveal>
        <CinematicHeader title="Treasury Dashboard" subtitle="Welcome back. Here is your platform overview." type="dashboard" />
      </ScrollReveal>

      {isLoading ? (
        <div style={{ display: 'grid', gap: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
            <SkeletonScreen type="card" count={4} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
            <SkeletonScreen type="card" />
            <SkeletonScreen type="table" />
          </div>
        </div>
      ) : (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1.5rem',
            marginBottom: '2rem'
          }}>
            {metrics.map((m, idx) => (
              <ScrollReveal key={idx} className="h-full">
                <TiltCard>
                  <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {m.label}
                  </h3>
                  <div style={{ fontSize: '2rem', fontWeight: 700 }}>
                    <NumberCounter value={m.value} format={m.format as any} currency={m.currency} />
                  </div>
                </TiltCard>
              </ScrollReveal>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
            <ScrollReveal className="h-full">
              <TiltCard>
                <h2 style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>Settlement Volume</h2>
                <div style={{ height: '300px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={volumeData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorUSD" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--accent-gold)" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="var(--accent-gold)" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorAED" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8a6d2f" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#8a6d2f" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="name" stroke="var(--border-divider)" tick={{ fill: 'var(--text-secondary)' }} />
                      <YAxis stroke="var(--border-divider)" tick={{ fill: 'var(--text-secondary)' }} />
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-divider)" vertical={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-divider)' }}
                        itemStyle={{ color: 'var(--text-primary)' }}
                      />
                      <Area type="monotone" dataKey="USD" stroke="var(--accent-gold)" fillOpacity={1} fill="url(#colorUSD)" />
                      <Area type="monotone" dataKey="AED" stroke="#8a6d2f" fillOpacity={1} fill="url(#colorAED)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </TiltCard>
            </ScrollReveal>

            <ScrollReveal className="h-full">
              <TiltCard>
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2 style={{ fontSize: '1.1rem' }}>Recent Transactions</h2>
                    <button style={{ color: 'var(--accent-gold)', fontSize: '0.85rem', background: 'none', border: 'none', cursor: 'pointer' }}>View All</button>
                  </div>
                  
                  <div style={{ flex: 1 }}>
                    <VirtualTable 
                      data={transactions} 
                      columns={columns} 
                      rowHeight={70} 
                      containerHeight="300px" 
                    />
                  </div>
                </div>
              </TiltCard>
            </ScrollReveal>
          </div>
        </>
      )}
    </motion.div>
  );
};
