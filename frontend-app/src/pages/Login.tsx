import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatedLogo } from '../components/ui/AnimatedLogo';
import { MagneticButton } from '../components/ui/MagneticButton';
import { TypingIndicator } from '../components/ui/TypingIndicator';
import { useReducedMotion } from '../hooks/useReducedMotion';
import styles from './Login.module.css';
import { useSoundDesign } from '../hooks/useSoundDesign';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { playSound } = useSoundDesign();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const { disabledByContext } = useReducedMotion();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    playSound('success');
    setIsAuthenticating(true);

    setTimeout(() => {
      navigate('/');
    }, 4500);
  };

  if (isAuthenticating) {
    return (
      <div className={styles.authScreen}>
        <AnimatedLogo size="large" rotating />
        <div style={{ marginTop: '2rem' }}>
          <TypingIndicator
            isLoading={true}
            messages={[
              "Verifying biometric signature...",
              "Establishing secure TLS connection...",
              "Authenticating via HSM enclave..."
            ]}
          >
            <div />
          </TypingIndicator>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.loginContainer}>
      {/* Dynamic Background */}
      {!disabledByContext && (
        <div className={styles.bgAnimation}>
          <div className={styles.blob1} />
          <div className={styles.blob2} />
        </div>
      )}
      
      <div className={styles.loginCard}>
        <div className={styles.logoWrapper}>
          <AnimatedLogo size="large" />
        </div>
        
        <form onSubmit={handleLogin} className={styles.form}>
          <div className={styles.inputGroup}>
            <label>Institution ID</label>
            <input type="text" placeholder="e.g. ACME-CORP-901" required />
          </div>
          
          <div className={styles.inputGroup}>
            <label>Operator Key</label>
            <input type="password" placeholder="••••••••••••" required />
          </div>
          
          <MagneticButton type="submit" className={styles.submitBtn}>
            AUTHENTICATE
          </MagneticButton>
        </form>
        
        <div className={styles.footer}>
          Authorized Personnel Only. Monitored by AegisLedger Security.
        </div>
      </div>
    </div>
  );
};
