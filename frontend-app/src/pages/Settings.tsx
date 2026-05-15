import React, { useEffect, useState } from 'react';
import { CinematicHeader } from '../components/ui/CinematicHeader';
import { GlassCard } from '../components/ui/GlassCard';
import { MagneticButton } from '../components/ui/MagneticButton';
import { ScrollReveal } from '../components/ui/ScrollReveal';

export const Settings: React.FC = () => {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [sessionDuration, setSessionDuration] = useState(0);
  const [lastActive, setLastActive] = useState<Date>(new Date());

  useEffect(() => {
    const savedMotion = localStorage.getItem('aegis-reduced-motion');
    if (savedMotion) setReducedMotion(savedMotion === 'true');

    const savedSound = localStorage.getItem('aegis-sound-enabled');
    if (savedSound) setSoundEnabled(savedSound === 'true');

    const handleActivity = () => setLastActive(new Date());
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    
    const interval = setInterval(() => {
      setSessionDuration(prev => prev + 1);
    }, 1000);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      clearInterval(interval);
    };
  }, []);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const toggleMotion = () => {
    const newVal = !reducedMotion;
    setReducedMotion(newVal);
    localStorage.setItem('aegis-reduced-motion', String(newVal));
    window.dispatchEvent(new Event('storage')); // Trigger hook updates
  };

  const toggleSound = () => {
    const newVal = !soundEnabled;
    setSoundEnabled(newVal);
    localStorage.setItem('aegis-sound-enabled', String(newVal));
    window.dispatchEvent(new Event('storage'));
  };

  return (
    <div>
      <ScrollReveal>
        <CinematicHeader title="Settings & Preferences" type="dashboard" subtitle="Configure platform interface and accessibility" />
      </ScrollReveal>

      <div style={{ display: 'grid', gap: '2rem' }}>
        <ScrollReveal>
          <GlassCard>
            <h2 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Interface Options</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Reduce Motion</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    Disables complex animations, particle effects, and holographic foils. Recommended for improved performance on older devices or for accessibility.
                  </p>
                </div>
                <MagneticButton onClick={toggleMotion} style={{ minWidth: '120px' }} showParticles={!reducedMotion}>
                  {reducedMotion ? 'ENABLED' : 'DISABLED'}
                </MagneticButton>
              </div>

              <div style={{ height: '1px', backgroundColor: 'var(--border-divider)' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Sound Design</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    Enable synthetic audio feedback for interactions, notifications, and critical alerts.
                  </p>
                </div>
                <MagneticButton onClick={toggleSound} style={{ minWidth: '120px' }}>
                  {soundEnabled ? 'ENABLED' : 'DISABLED'}
                </MagneticButton>
              </div>
            </div>
          </GlassCard>
        </ScrollReveal>

        <ScrollReveal>
          <GlassCard>
            <h2 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Session Activity Monitor</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <div>
                <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Session Duration</h3>
                <div style={{ fontSize: '2rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent-gold)' }}>
                  {formatDuration(sessionDuration)}
                </div>
              </div>
              <div>
                <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Interaction</h3>
                <div style={{ fontSize: '1.25rem', fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--text-primary)' }}>
                  {lastActive.toLocaleTimeString()}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {Math.floor((new Date().getTime() - lastActive.getTime()) / 1000)}s ago
                </div>
              </div>
            </div>
          </GlassCard>
        </ScrollReveal>
      </div>
    </div>
  );
};
