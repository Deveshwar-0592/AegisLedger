import React, { useRef, useState, useEffect } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import styles from './MagneticButton.module.css';

interface MagneticButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  magneticRadius?: number;
  magneticForce?: number;
  showParticles?: boolean;
}

interface ActionParticle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  opacity: number;
  wobbleSpeed: number;
  wobbleAmount: number;
  life: number;
}

export const MagneticButton: React.FC<MagneticButtonProps> = ({ 
  children, 
  magneticRadius = 80, 
  magneticForce = 8, 
  showParticles = true,
  className = '',
  ...props 
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { disabledByContext } = useReducedMotion();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const [particles, setParticles] = useState<ActionParticle[]>([]);
  
  const particleIdCounter = useRef(0);
  const spawnIntervalRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Magnetic Effect
  useEffect(() => {
    if (disabledByContext) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current || !buttonRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distX = e.clientX - centerX;
      const distY = e.clientY - centerY;
      const distance = Math.sqrt(distX * distX + distY * distY);

      if (distance < magneticRadius) {
        const pull = (magneticRadius - distance) / magneticRadius;
        setPosition({
          x: (distX / distance) * magneticForce * pull,
          y: (distY / distance) * magneticForce * pull,
        });
      } else {
        setPosition({ x: 0, y: 0 });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [magneticRadius, magneticForce, disabledByContext]);

  // Particle Effect
  useEffect(() => {
    if (disabledByContext || !showParticles) return;

    if (isHovering) {
      spawnIntervalRef.current = window.setInterval(() => {
        if (!buttonRef.current) return;
        const width = buttonRef.current.offsetWidth;
        const colors = ['201, 168, 76', '240, 180, 41']; // accent gold, pale amber
        const isGold = Math.random() > 0.5;
        
        setParticles(prev => [
          ...prev, 
          {
            id: particleIdCounter.current++,
            x: Math.random() * width,
            y: 0, // spawn at top edge
            size: Math.random() * 3 + 2, // 2-5px
            color: colors[isGold ? 0 : 1],
            opacity: Math.random() * 0.4 + 0.6, // 0.6-1.0
            wobbleSpeed: Math.random() * 0.05 + 0.02,
            wobbleAmount: Math.random() * 4 + 2,
            life: 0 // 0 to 1
          }
        ]);
      }, 1000 / 8); // ~8 particles per second
    } else {
      if (spawnIntervalRef.current) clearInterval(spawnIntervalRef.current);
    }

    return () => {
      if (spawnIntervalRef.current) clearInterval(spawnIntervalRef.current);
    };
  }, [isHovering, disabledByContext, showParticles]);

  // Particle Animation Loop
  useEffect(() => {
    if (disabledByContext || !showParticles) return;

    let lastTime = performance.now();
    const animate = (time: number) => {
      const delta = (time - lastTime) / 1000;
      lastTime = time;

      setParticles(prev => 
        prev.map(p => ({
          ...p,
          y: p.y - 30 * delta, // drift upward ~30px per sec
          life: p.life + delta / 0.8 // 800ms lifespan
        })).filter(p => p.life < 1)
      );

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [disabledByContext, showParticles]);

  return (
    <div ref={containerRef} className={styles.magneticContainer} onMouseEnter={() => setIsHovering(true)} onMouseLeave={() => setIsHovering(false)}>
      <button
        ref={buttonRef}
        className={`btn-primary ${styles.magneticButton} ${className}`}
        style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
        {...props}
      >
        {children}
        
        {/* Particles */}
        {showParticles && !disabledByContext && particles.map(p => (
          <span
            key={p.id}
            className={styles.particle}
            style={{
              left: `${p.x + Math.sin(p.life * Math.PI * 2 * p.wobbleSpeed) * p.wobbleAmount}px`,
              top: `${p.y}px`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: `rgba(${p.color}, ${p.opacity * (1 - p.life)})`
            }}
          />
        ))}
      </button>
    </div>
  );
};
