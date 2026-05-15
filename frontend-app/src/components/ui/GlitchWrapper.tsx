import React from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import styles from './GlitchWrapper.module.css';

interface GlitchWrapperProps {
  children: React.ReactNode;
  active?: boolean;
  className?: string;
}

export const GlitchWrapper: React.FC<GlitchWrapperProps> = ({ 
  children, 
  active = false,
  className = ''
}) => {
  const { disabledByContext } = useReducedMotion();
  
  const glitchClass = active && !disabledByContext ? styles.glitchActive : '';

  return (
    <div className={`${styles.glitchContainer} ${glitchClass} ${className}`}>
      {children}
    </div>
  );
};
