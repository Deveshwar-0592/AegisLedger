import React, { useEffect, useRef } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  opacity: number;
  origVx: number;
  origVy: number;
}

export const AmbientBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { disabledByContext } = useReducedMotion();
  const mouseRef = useRef({ x: -1000, y: -1000 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let particles: Particle[] = [];
    const NUM_PARTICLES = 120;
    const CONNECT_DIST = 120;
    const MOUSE_RADIUS = 150;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', resize);
    resize();

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    
    // Listen for mousemove to repel particles
    if (!disabledByContext) {
      window.addEventListener('mousemove', onMouseMove);
    }

    // Initialize particles
    for (let i = 0; i < NUM_PARTICLES; i++) {
      const isGold = Math.random() > 0.5;
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        origVx: 0,
        origVy: 0,
        radius: Math.random() * 1.5 + 1,
        color: isGold ? '201, 168, 76' : '180, 200, 255', // gold or pale blue-white
        opacity: Math.random() * 0.25 + 0.15
      });
    }

    particles.forEach(p => {
      p.origVx = p.vx;
      p.origVy = p.vy;
    });

    let lastTime = 0;
    const fpsInterval = 1000 / 30; // 30 FPS

    const draw = (time: number) => {
      animationFrameId = requestAnimationFrame(draw);

      if (disabledByContext) {
        // Just draw static background
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, '#0a0e1a');
        gradient.addColorStop(1, '#0f1626');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
      }

      const elapsed = time - lastTime;
      if (elapsed < fpsInterval) return;
      lastTime = time - (elapsed % fpsInterval);

      // Clear canvas
      ctx.fillStyle = '#0a0e1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Update and draw particles
      ctx.lineWidth = 1;
      
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        
        // Mouse repulsion
        const dx = mouseRef.current.x - p.x;
        const dy = mouseRef.current.y - p.y;
        const distToMouse = Math.sqrt(dx * dx + dy * dy);

        if (distToMouse < MOUSE_RADIUS) {
          const force = (MOUSE_RADIUS - distToMouse) / MOUSE_RADIUS;
          const pushX = (dx / distToMouse) * force * -2;
          const pushY = (dy / distToMouse) * force * -2;
          
          p.x += pushX;
          p.y += pushY;
        } else {
          // Drift back to original path
          p.x += p.origVx;
          p.y += p.origVy;
        }

        // Wrap around
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        // Draw particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color}, ${p.opacity})`;
        ctx.fill();

        // Connect nearby
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const cDx = p.x - p2.x;
          const cDy = p.y - p2.y;
          const dist = Math.sqrt(cDx * cDx + cDy * cDy);

          if (dist < CONNECT_DIST) {
            const connectOpacity = (1 - dist / CONNECT_DIST) * 0.1;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(201, 168, 76, ${connectOpacity})`;
            ctx.stroke();
          }
        }
      }
    };

    animationFrameId = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, [disabledByContext]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: -1,
        pointerEvents: 'none'
      }}
    />
  );
};
