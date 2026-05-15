import React from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import styles from './SkeletonScreen.module.css';

interface SkeletonScreenProps {
  type?: 'card' | 'table' | 'text';
  count?: number;
  className?: string;
}

export const SkeletonScreen: React.FC<SkeletonScreenProps> = ({ type = 'text', count = 1, className = '' }) => {
  const { disabledByContext } = useReducedMotion();

  const renderItem = (idx: number) => {
    switch (type) {
      case 'card':
        return (
          <div key={idx} className={`${styles.skeletonBase} ${styles.skeletonCard} ${className}`}>
            {!disabledByContext && <div className={styles.scanner} />}
          </div>
        );
      case 'table':
        return (
          <div key={idx} className={`${styles.skeletonBase} ${styles.skeletonRow} ${className}`}>
            <div className={styles.skeletonCell} style={{ width: '20%' }} />
            <div className={styles.skeletonCell} style={{ width: '40%' }} />
            <div className={styles.skeletonCell} style={{ width: '15%' }} />
            <div className={styles.skeletonCell} style={{ width: '25%' }} />
            {!disabledByContext && <div className={styles.scanner} />}
          </div>
        );
      case 'text':
      default:
        return (
          <div key={idx} className={`${styles.skeletonBase} ${styles.skeletonText} ${className}`}>
            {!disabledByContext && <div className={styles.scanner} />}
          </div>
        );
    }
  };

  return (
    <div className={styles.container}>
      {Array.from({ length: count }).map((_, i) => renderItem(i))}
    </div>
  );
};
