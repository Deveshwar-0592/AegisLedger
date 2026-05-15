import React from 'react';
import styles from './CinematicHeader.module.css';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface CinematicHeaderProps {
  title: string;
  subtitle?: string;
  type: 'dashboard' | 'transfers' | 'compliance' | 'escrow' | 'wallet' | 'settings';
  rightContent?: React.ReactNode;
}

export const CinematicHeader: React.FC<CinematicHeaderProps> = ({ title, subtitle, type, rightContent }) => {
  const { disabledByContext } = useReducedMotion();

  const getBackground = () => {
    if (disabledByContext) {
      return <div className={styles.staticBg} />;
    }
    
    switch (type) {
      case 'dashboard':
        return <div className={styles.dashboardBg} />;
      case 'transfers':
        return (
          <div className={styles.transfersBg}>
            <div className={styles.flowLine} style={{ top: '20%', animationDelay: '0s' }} />
            <div className={styles.flowLine} style={{ top: '50%', animationDelay: '2s' }} />
            <div className={styles.flowLine} style={{ top: '80%', animationDelay: '4s' }} />
          </div>
        );
      case 'compliance':
        return <div className={styles.complianceBg} />;
      case 'escrow':
        return <div className={styles.escrowBg} />;
      case 'wallet':
        return (
          <div className={styles.walletBg}>
            <div className={styles.wave} />
            <div className={styles.wave2} />
          </div>
        );
      default:
        return <div className={styles.staticBg} />;
    }
  };

  return (
    <div className={styles.headerContainer}>
      {getBackground()}
      <div className={styles.content}>
        <div>
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
        </div>
        {rightContent && <div className={styles.rightContent}>{rightContent}</div>}
      </div>
    </div>
  );
};
