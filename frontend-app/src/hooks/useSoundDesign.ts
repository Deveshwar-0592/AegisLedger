import { useEffect, useRef, useState, useCallback } from 'react';

type SoundType = 'click' | 'success' | 'error' | 'notify' | 'stream_start' | 'stream_stop';

export function useSoundDesign() {
  const [isEnabled, setIsEnabled] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamOscRef = useRef<OscillatorNode | null>(null);
  const streamGainRef = useRef<GainNode | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('aegis_sound_enabled');
    if (saved === 'true') {
      setIsEnabled(true);
    }

    const handleVisibilityChange = () => {
      if (!audioCtxRef.current) return;
      if (document.hidden) {
        if (audioCtxRef.current.state === 'running') {
          audioCtxRef.current.suspend();
        }
      } else {
        if (audioCtxRef.current.state === 'suspended' && isEnabled) {
          audioCtxRef.current.resume();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    };
  }, [isEnabled]);

  const toggleSound = useCallback((enable: boolean) => {
    setIsEnabled(enable);
    localStorage.setItem('aegis_sound_enabled', String(enable));
    if (enable && !audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    } else if (!enable && audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  }, []);

  const initCtx = useCallback(() => {
    if (!isEnabled) return null;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, [isEnabled]);

  const playSound = useCallback((type: SoundType) => {
    const ctx = initCtx();
    if (!ctx) return;

    const t = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.08; // Master gain set to 0.08 max
    masterGain.connect(ctx.destination);

    const playTone = (freq: number, type: OscillatorType, start: number, dur: number, attack: number, decay: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(1, start + attack);
      gain.gain.setValueAtTime(1, start + dur - decay);
      gain.gain.linearRampToValueAtTime(0, start + dur);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(start);
      osc.stop(start + dur);
    };

    switch (type) {
      case 'click':
        // Short soft tick at 800Hz, 40ms fast decay
        playTone(800, 'sine', t, 0.04, 0.005, 0.03);
        break;
      case 'success':
        // Two-note ascending 600Hz -> 900Hz, 80ms each
        playTone(600, 'sine', t, 0.08, 0.02, 0.02);
        playTone(900, 'sine', t + 0.1, 0.08, 0.02, 0.02);
        break;
      case 'error':
        // Short descending 400Hz -> 280Hz with buzz (square)
        playTone(400, 'square', t, 0.15, 0.01, 0.05);
        playTone(280, 'square', t + 0.15, 0.15, 0.01, 0.05);
        break;
      case 'notify':
        // Soft chime at 1000Hz, long tail 400ms
        playTone(1000, 'sine', t, 0.4, 0.02, 0.38);
        break;
      case 'stream_start':
        // Low continuous electronic hum at 60Hz that rises
        if (streamOscRef.current) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(60, t);
        osc.frequency.linearRampToValueAtTime(120, t + 1.5); // Rise in pitch
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.5, t + 0.1);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(t);
        streamOscRef.current = osc;
        streamGainRef.current = gain;
        break;
      case 'stream_stop':
        if (streamOscRef.current && streamGainRef.current) {
          const stopTime = ctx.currentTime;
          streamGainRef.current.gain.linearRampToValueAtTime(0, stopTime + 0.05);
          streamOscRef.current.stop(stopTime + 0.05);
          streamOscRef.current = null;
          streamGainRef.current = null;
        }
        break;
    }
  }, [initCtx, isEnabled]);

  return { isEnabled, toggleSound, playSound };
}
