import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import styles from './DataStreamOverlay.module.css';

interface DataStreamOverlayProps {
  isOpen: boolean;
  onClose?: () => void;
  title?: string;
}

export const DataStreamOverlay: React.FC<DataStreamOverlayProps> = ({ isOpen, onClose, title = "PROCESSING DATA STREAM..." }) => {
  const { disabledByContext } = useReducedMotion();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const content = (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.scanlines} />
      <div className={styles.content} onClick={e => e.stopPropagation()}>
        {!disabledByContext && <div className={styles.matrixBg} />}
        <div className={styles.dialog}>
          <div className={styles.title}>{title}</div>
          <div className={styles.progressContainer}>
            <div className={styles.progressBar} />
          </div>
          <div className={styles.hexCode}>
            0x{Math.floor(Math.random() * 16777215).toString(16).toUpperCase()} ... AWAITING PACKETS ...
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};
