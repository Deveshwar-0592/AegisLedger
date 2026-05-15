import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import styles from './AnimatedLogo.module.css';

interface AnimatedLogoProps {
  size?: 'small' | 'large';
  rotating?: boolean;
}

export const AnimatedLogo: React.FC<AnimatedLogoProps> = ({ size = 'small', rotating = false }) => {
  const { disabledByContext } = useReducedMotion();
  const svgRef = useRef<SVGSVGElement>(null);
  const requestRef = useRef<number>(0);
  const rotation = useRef(0);
  const [isVisible, setIsVisible] = useState(true);

  // Check visibility for pausing rotation
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Handle rotation
  useEffect(() => {
    if (disabledByContext || !rotating || !isVisible) {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      return;
    }

    let lastTime = performance.now();
    const animate = (time: number) => {
      const delta = (time - lastTime) / 1000; // seconds
      lastTime = time;
      
      // 0.5 degrees per second
      rotation.current = (rotation.current + 0.5 * delta) % 360;
      
      if (svgRef.current) {
        svgRef.current.style.transform = `rotate(${rotation.current}deg)`;
      }

      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [rotating, isVisible, disabledByContext]);

  const dim = size === 'large' ? 48 : 32;

  return (
    <div className={styles.logoContainer}>
      <svg 
        ref={svgRef}
        width={dim} 
        height={dim} 
        viewBox="0 0 40 40" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        <path 
          className={disabledByContext ? styles.markFillStatic : styles.mark}
          pathLength="100"
          d="M20 2L36 10V26L20 38L4 26V10L20 2Z" 
        />
        {!disabledByContext && (
          <path 
            className={styles.markFill}
            d="M20 2L36 10V26L20 38L4 26V10L20 2Z" 
          />
        )}
      </svg>
      {size === 'large' ? (
        <div style={{ textAlign: 'left' }}>
          <div className={styles.text} style={{ fontSize: '1.75rem' }}>AegisLedger</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '4px' }}>
            Institutional B2B Settlement Gateway
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'left' }}>
          <div className={styles.text}>AegisLedger</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
            B2B Settlement
          </div>
        </div>
      )}
    </div>
  );
};
