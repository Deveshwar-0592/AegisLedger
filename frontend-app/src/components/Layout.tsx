import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { GlobalNavigation } from './GlobalNavigation';
import { AmbientBackground } from './AmbientBackground';
import { CustomCursor } from './CustomCursor/CustomCursor';
import { CommandPalette } from './CommandPalette/CommandPalette';

export const Layout: React.FC = () => {
  const location = useLocation();

  return (
    <div style={{ display: 'flex', minHeight: '100vh', position: 'relative' }}>
      <CustomCursor />
      <CommandPalette />
      <AmbientBackground />
      <GlobalNavigation />
      
      <main style={{ 
        flex: 1, 
        padding: '2rem 3rem',
        position: 'relative',
        zIndex: 1,
        height: '100vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        // 3D Parallax setup
        perspective: '1000px',
        transformStyle: 'preserve-3d'
      }}>
        <div style={{ maxWidth: '1440px', margin: '0 auto' }}>
          <AnimatePresence mode="wait">
            <Outlet key={location.pathname} />
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};
