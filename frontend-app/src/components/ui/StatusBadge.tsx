import React from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import styles from './StatusBadge.module.css';

export type StatusType =
  | 'PENDING' | 'COMPLETED' | 'FAILED' | 'DISPUTED'
  | 'CREATED' | 'FUNDED' | 'CONDITIONS_MET' | 'RELEASED' | 'REFUNDED' | 'FROZEN'
  | string;

interface StatusBadgeProps {
  status: StatusType;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const { disabledByContext } = useReducedMotion();

  const getClassName = () => {
    switch (status) {
      case 'PENDING':
      case 'CREATED':
      case 'FUNDED':
        return styles.pending;
      case 'COMPLETED':
      case 'RELEASED':
      case 'CONDITIONS_MET':
        return `${styles.completed} ${!disabledByContext ? styles.holographic : ''}`;
      case 'FAILED':
      case 'FROZEN':
        return `${styles.failed} ${!disabledByContext ? styles.glitch : ''}`;
      case 'DISPUTED':
        return styles.disputed;
      case 'REFUNDED':
        return styles.refunded;
      default:
        return '';
    }
  };

  return (
    <span 
      className={`${styles.badge} ${getClassName()}`}
      data-text={status}
    >
      {status}
    </span>
  );
};

