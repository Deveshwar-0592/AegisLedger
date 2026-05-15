import React, { useState, useEffect } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import styles from './TypingIndicator.module.css';

interface TypingIndicatorProps {
  isLoading: boolean;
  messages: string[];
  children: React.ReactNode;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ isLoading, messages, children }) => {
  const { disabledByContext } = useReducedMotion();
  const [msgIndex, setMsgIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [showContent, setShowContent] = useState(!isLoading);

  useEffect(() => {
    if (!isLoading) {
      // Fade in content
      const timer = setTimeout(() => setShowContent(true), 50);
      return () => clearTimeout(timer);
    } else {
      setShowContent(false);
      setCharIndex(0);
    }
  }, [isLoading]);

  useEffect(() => {
    if (!isLoading) return;
    if (disabledByContext) return; 

    const currentMsg = messages[msgIndex];
    if (charIndex < currentMsg.length) {
      const timer = setTimeout(() => {
        setCharIndex(prev => prev + 1);
      }, 40);
      return () => clearTimeout(timer);
    } else {
      const typingDuration = currentMsg.length * 40;
      const waitTime = Math.max(1000, 3000 - typingDuration);
      
      const timer = setTimeout(() => {
        setMsgIndex((prev) => (prev + 1) % messages.length);
        setCharIndex(0);
      }, waitTime);
      return () => clearTimeout(timer);
    }
  }, [charIndex, isLoading, msgIndex, messages, disabledByContext]);

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        {disabledByContext ? (
          <div className={styles.text}>{messages[0]}...</div>
        ) : (
          <div className={styles.text}>
            {'> '}
            {messages[msgIndex].substring(0, charIndex)}
            <span className={styles.cursor}>_</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`${styles.contentContainer} ${showContent ? styles.visible : ''}`}>
      {children}
    </div>
  );
};
