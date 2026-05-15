import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  SendHorizontal, 
  ShieldCheck, 
  Wallet, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  Bell,
  UserCheck,
  Lock
} from 'lucide-react';
import { AnimatedLogo } from './ui/AnimatedLogo';
import styles from './GlobalNavigation.module.css';
import { useSoundDesign } from '../hooks/useSoundDesign';

export const GlobalNavigation: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { playSound } = useSoundDesign();

  const navItems = [
    { name: 'Overview',   path: '/',           icon: LayoutDashboard },
    { name: 'Transfers',  path: '/transfers',   icon: SendHorizontal, hasNotification: true },
    { name: 'Wallet',     path: '/wallet',      icon: Wallet },
    { name: 'Compliance', path: '/compliance',  icon: ShieldCheck, hasNotification: true },
    { name: 'Escrow',     path: '/escrow',      icon: Lock },
    { name: 'KYB Setup',  path: '/kyb',         icon: UserCheck },
    { name: 'Settings',   path: '/settings',    icon: Settings },
  ];

  return (
    <nav className={styles.sidebar} style={{ width: collapsed ? '64px' : '240px' }}>
      <div className={styles.textureOverlay} />
      
      <div className={styles.content}>
        <div style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', minHeight: '80px' }}>
          {collapsed ? (
            <div style={{ transform: 'scale(0.8)' }}>
              <AnimatedLogo size="small" rotating={true} />
            </div>
          ) : (
            <AnimatedLogo size="large" rotating={true} />
          )}
        </div>

        <div style={{ flex: 1, padding: '1rem 0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              onClick={() => playSound('click')}
              className={({ isActive }) => 
                `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
              }
              style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}
            >
              <item.icon size={20} className={styles.icon} />
              {!collapsed && <span style={{ marginLeft: '1rem', fontWeight: 500 }}>{item.name}</span>}
              {!collapsed && item.hasNotification && <div className={styles.notificationDot} />}
            </NavLink>
          ))}
        </div>

        <div style={{ padding: '1.5rem', borderTop: '1px solid var(--border-divider)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', marginBottom: collapsed ? 0 : '1rem' }}>
            <div style={{ position: 'relative' }}>
              <Bell size={20} color="var(--text-secondary)" style={{ cursor: 'pointer' }} onClick={() => playSound('click')} />
              {collapsed && <div className={styles.notificationDot} style={{ right: '-4px', top: '0', transform: 'none', width: '6px', height: '6px' }} />}
            </div>
            {!collapsed && <div className={styles.notificationDot} style={{ position: 'relative', right: 0, transform: 'none' }} />}
          </div>
          
          {!collapsed && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Acme Corp Treasury</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>ADMIN</span>
            </div>
          )}
        </div>
      </div>

      <button 
        className={styles.collapseBtn}
        onClick={() => {
          setCollapsed(!collapsed);
          playSound('click');
        }}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </nav>
  );
};
