import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import styles from './CommandPalette.module.css';

const COMMANDS = [
  { id: 'dashboard', label: 'Go to Dashboard', path: '/' },
  { id: 'transfers', label: 'Go to Transfers', path: '/transfers' },
  { id: 'compliance', label: 'Go to Compliance', path: '/compliance' },
  { id: 'escrow', label: 'Go to Escrow', path: '/escrow' },
  { id: 'wallet', label: 'Go to Wallet', path: '/wallet' },
  { id: 'initiate', label: 'Initiate Transfer', action: 'INITIATE_TRANSFER' },
  { id: 'receipt', label: 'Download Receipt', action: 'DOWNLOAD_RECEIPT' },
  { id: 'audit', label: 'View Audit Log', action: 'VIEW_AUDIT' },
  { id: 'settings', label: 'Open Settings', path: '/settings' },
];

export const CommandPalette: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const filteredCommands = COMMANDS.filter(cmd => cmd.label.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleExecute = (cmd: typeof COMMANDS[0]) => {
    setIsOpen(false);
    if (cmd.path) {
      navigate(cmd.path);
    } else {
      console.log('Action executed:', cmd.action);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        handleExecute(filteredCommands[selectedIndex]);
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className={styles.backdrop} onClick={() => setIsOpen(false)}>
          <motion.div 
            className={styles.palette}
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.scanlines} />
            <input 
              ref={inputRef}
              className={styles.input}
              placeholder="> Type a command or search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <div className={styles.results}>
              {filteredCommands.map((cmd, idx) => (
                <div 
                  key={cmd.id} 
                  className={`${styles.resultItem} ${idx === selectedIndex ? styles.selected : ''}`}
                  onClick={() => handleExecute(cmd)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <span className={styles.label}>{cmd.label}</span>
                  <span className={styles.shortcut}>⏎</span>
                </div>
              ))}
              {filteredCommands.length === 0 && (
                <div className={styles.noResults}>No matching commands found.</div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
