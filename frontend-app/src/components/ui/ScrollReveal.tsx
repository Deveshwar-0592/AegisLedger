import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import styles from './ScrollReveal.module.css';

interface ScrollRevealProps {
  children: React.ReactNode;
  isHeading?: boolean;
  className?: string;
}

export const ScrollReveal: React.FC<ScrollRevealProps> = ({ children, isHeading = false, className = '' }) => {
  const { disabledByContext } = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [hasRevealed, setHasRevealed] = useState(false);

  useEffect(() => {
    if (disabledByContext) {
      setHasRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasRevealed(true);
          if (ref.current) {
            observer.unobserve(ref.current);
          }
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [disabledByContext]);

  return (
    <div
      ref={ref}
      className={`
        ${styles.revealContainer} 
        ${hasRevealed ? styles.revealed : ''} 
        ${isHeading ? styles.heading : ''} 
        ${className}
      `}
    >
      {children}
      {isHeading && <div className={styles.underline} />}
    </div>
  );
};
