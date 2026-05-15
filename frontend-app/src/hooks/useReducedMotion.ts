import { useState, useEffect } from 'react';

export function useReducedMotion() {
  const [shouldReduceMotion, setShouldReduceMotion] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Check for user setting in localStorage first, else fallback to OS preference
    const checkMotion = () => {
      const userOverride = localStorage.getItem('aegis_reduce_motion');
      if (userOverride === 'true') return true;
      if (userOverride === 'false') return false;
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    };

    const checkMobile = () => {
      return window.matchMedia('(hover: none) and (pointer: coarse)').matches || window.innerWidth < 768;
    };

    setShouldReduceMotion(checkMotion());
    setIsMobile(checkMobile());

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const hoverQuery = window.matchMedia('(hover: none) and (pointer: coarse)');
    const resizeHandler = () => setIsMobile(checkMobile());

    const motionListener = () => setShouldReduceMotion(checkMotion());
    const hoverListener = () => setIsMobile(checkMobile());

    motionQuery.addEventListener('change', motionListener);
    hoverQuery.addEventListener('change', hoverListener);
    window.addEventListener('resize', resizeHandler);

    return () => {
      motionQuery.removeEventListener('change', motionListener);
      hoverQuery.removeEventListener('change', hoverListener);
      window.removeEventListener('resize', resizeHandler);
    };
  }, []);

  return { shouldReduceMotion, isMobile, disabledByContext: shouldReduceMotion || isMobile };
}
