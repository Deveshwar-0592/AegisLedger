import { useState, useEffect, useRef } from 'react';
import { useReducedMotion } from './useReducedMotion';

export const useNumberMorph = (value: number, duration: number = 800) => {
  const { disabledByContext } = useReducedMotion();
  const [displayValue, setDisplayValue] = useState(value);
  const [colorStatus, setColorStatus] = useState<'neutral' | 'increase' | 'decrease'>('neutral');
  const previousValue = useRef(value);

  useEffect(() => {
    if (value === previousValue.current) return;

    if (disabledByContext) {
      setDisplayValue(value);
      setColorStatus(value > previousValue.current ? 'increase' : 'decrease');
      const timer = setTimeout(() => setColorStatus('neutral'), duration);
      previousValue.current = value;
      return () => clearTimeout(timer);
    }

    const startValue = previousValue.current;
    const endValue = value;
    const isIncrease = endValue > startValue;
    
    setColorStatus(isIncrease ? 'increase' : 'decrease');

    let startTime: number | null = null;
    let animationFrame: number;

    const easeOutExpo = (t: number): number => {
      return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    };

    const animate = (time: number) => {
      if (startTime === null) startTime = time;
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      const easedProgress = easeOutExpo(progress);
      const currentVal = startValue + (endValue - startValue) * easedProgress;
      
      setDisplayValue(currentVal);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endValue);
        setTimeout(() => setColorStatus('neutral'), 200);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    previousValue.current = endValue;

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [value, duration, disabledByContext]);

  return { displayValue, colorStatus };
};
