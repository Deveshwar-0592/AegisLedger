import React from 'react';
import { useNumberMorph } from '../../hooks/useNumberMorph';
import styles from './NumberCounter.module.css';

interface NumberCounterProps {
  value: number;
  format?: 'currency' | 'number' | 'percent';
  currency?: string;
  className?: string;
}

export const NumberCounter: React.FC<NumberCounterProps> = ({ 
  value, 
  format = 'number',
  currency = 'USD',
  className = ''
}) => {
  const { displayValue, colorStatus } = useNumberMorph(value);

  const formattedValue = React.useMemo(() => {
    if (format === 'currency') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }).format(displayValue);
    }
    
    if (format === 'percent') {
      return `${displayValue.toFixed(2)}%`;
    }

    return new Intl.NumberFormat('en-US').format(Math.round(displayValue));
  }, [displayValue, format, currency]);

  return (
    <span 
      className={`${styles.counter} ${styles[colorStatus]} ${className}`}
    >
      {formattedValue}
    </span>
  );
};

