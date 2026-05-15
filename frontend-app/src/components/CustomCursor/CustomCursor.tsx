import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import styles from './CustomCursor.module.css';

export const CustomCursor: React.FC = () => {
  const { disabledByContext } = useReducedMotion();
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(0);
  
  const [isHovering, setIsHovering] = useState(false);
  const [isClicking, setIsClicking] = useState(false);
  const [isInput, setIsInput] = useState(false);
  
  // Real mouse pos
  const mouse = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  // Delayed ring pos
  const ring = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

  useEffect(() => {
    if (disabledByContext) {
      document.body.classList.remove('custom-cursor-active');
      return;
    }
    
    document.body.classList.add('custom-cursor-active');

    const onMouseMove = (e: MouseEvent) => {
      mouse.current.x = e.clientX;
      mouse.current.y = e.clientY;
      
      // Update dot immediately
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(calc(${e.clientX}px - 50%), calc(${e.clientY}px - 50%), 0)`;
      }

      // Check what we are hovering
      const target = e.target as HTMLElement;
      if (!target) return;
      
      const isClickable = target.closest('a, button, [role="button"], tr[style*="cursor: pointer"], tr[onClick]');
      setIsHovering(!!isClickable);

      const isTextInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      setIsInput(!!isTextInput);
    };

    const onMouseDown = () => setIsClicking(true);
    const onMouseUp = () => {
      setIsClicking(false);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);

    // Animation loop for ring
    const animate = () => {
      // Smooth interpolation for the ring
      ring.current.x += (mouse.current.x - ring.current.x) * 0.2;
      ring.current.y += (mouse.current.y - ring.current.y) * 0.2;

      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(calc(${ring.current.x}px - 50%), calc(${ring.current.y}px - 50%), 0)`;
      }

      requestRef.current = requestAnimationFrame(animate);
    };
    requestRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      cancelAnimationFrame(requestRef.current);
      document.body.classList.remove('custom-cursor-active');
    };
  }, [disabledByContext]);

  if (disabledByContext) return null;

  return (
    <div className={`${isHovering ? styles.hovered : ''} ${isClicking ? styles.clicked : ''} ${isInput ? styles.input : ''}`}>
      <div ref={dotRef} className={styles.cursorDot} />
      <div ref={ringRef} className={styles.cursorRing} />
    </div>
  );
};
