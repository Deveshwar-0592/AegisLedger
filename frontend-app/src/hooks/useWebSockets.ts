import { useEffect, useRef, useCallback, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────

export interface FxRate {
  pair: string;
  rate: number;
  change24h: number;
  timestamp: string;
}

export interface AuditLogEntry {
  id: string;
  eventType: string;
  userId: string;
  companyId: string;
  details: Record<string, unknown>;
  ipAddress: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface WsConnectionState {
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastPing: string | null;
}

// ─── Mock Simulators (for dev without live WebSocket server) ──────

const MOCK_FX_RATES: FxRate[] = [
  { pair: 'AED/USDC', rate: 0.27226, change24h: 0.02, timestamp: new Date().toISOString() },
  { pair: 'RUB/USDC', rate: 0.01112, change24h: -0.15, timestamp: new Date().toISOString() },
  { pair: 'EUR/USDC', rate: 1.08500, change24h: 0.08, timestamp: new Date().toISOString() },
  { pair: 'GBP/USDC', rate: 1.26400, change24h: -0.05, timestamp: new Date().toISOString() },
];

const MOCK_AUDIT_EVENTS: Pick<AuditLogEntry, 'eventType' | 'userId' | 'details' | 'severity'>[] = [
  { eventType: 'TRANSFER_SUBMITTED', userId: 'usr_001', details: { amount: 250000, asset: 'USDC_ETH' }, severity: 'info' },
  { eventType: 'MAKER_CHECKER_REQUIRED', userId: 'usr_002', details: { amount: 1500000, asset: 'USDT_POLY' }, severity: 'warning' },
  { eventType: 'LOGIN_NEW_DEVICE', userId: 'usr_003', details: { ip: '85.104.22.1', country: 'RU' }, severity: 'warning' },
  { eventType: 'COMPLIANCE_ALERT', userId: 'sys', details: { alertType: 'OFAC_HIT', entity: 'Blacklisted Corp' }, severity: 'critical' },
  { eventType: 'ESCROW_FUNDED', userId: 'usr_004', details: { escrowId: '0xA4F8...B21C', amount: 2450000 }, severity: 'info' },
  { eventType: 'KYB_APPROVED', userId: 'sys', details: { companyId: 'cmp_088', tier: 'growth' }, severity: 'info' },
];

// ─── Main Hook ────────────────────────────────────────────────────

interface UseWebSocketsOptions {
  wsUrl?: string;
  mock?: boolean;
  onAuditLog?: (entry: AuditLogEntry) => void;
  onFxUpdate?: (rates: FxRate[]) => void;
}

export function useWebSockets(options: UseWebSocketsOptions = {}) {
  const {
    wsUrl = import.meta.env.VITE_WS_URL || 'wss://api.aegisledger.io/ws',
    mock = import.meta.env.VITE_MOCK_WS !== 'false',
    onAuditLog,
    onFxUpdate,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mockTimers = useRef<ReturnType<typeof setInterval>[]>([]);

  const [connectionState, setConnectionState] = useState<WsConnectionState>({
    status: 'disconnected',
    lastPing: null,
  });

  const [fxRates, setFxRates] = useState<FxRate[]>(MOCK_FX_RATES);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // Dispatch FX update
  const handleFxUpdate = useCallback((rates: FxRate[]) => {
    setFxRates(rates);
    onFxUpdate?.(rates);
  }, [onFxUpdate]);

  // Dispatch audit log
  const handleAuditLog = useCallback((entry: AuditLogEntry) => {
    setAuditLogs(prev => [entry, ...prev].slice(0, 100)); // keep last 100
    onAuditLog?.(entry);
  }, [onAuditLog]);

  // ── Mock Mode ─────────────────────────────────────────────────
  const startMockSimulation = useCallback(() => {
    setConnectionState({ status: 'connected', lastPing: new Date().toISOString() });

    // FX rate ticker: update every 3 seconds with slight random drift
    const fxInterval = setInterval(() => {
      setFxRates(prev => prev.map(rate => ({
        ...rate,
        rate: +(rate.rate * (1 + (Math.random() - 0.5) * 0.001)).toFixed(5),
        change24h: +(rate.change24h + (Math.random() - 0.5) * 0.02).toFixed(3),
        timestamp: new Date().toISOString(),
      })));
    }, 3000);
    mockTimers.current.push(fxInterval);

    // Audit log ticker: new event every 8 seconds
    const auditInterval = setInterval(() => {
      const template = MOCK_AUDIT_EVENTS[Math.floor(Math.random() * MOCK_AUDIT_EVENTS.length)];
      const entry: AuditLogEntry = {
        id: `evt_${Date.now()}`,
        eventType: template.eventType,
        userId: template.userId,
        companyId: `cmp_${Math.floor(Math.random() * 100).toString().padStart(3, '0')}`,
        details: template.details,
        ipAddress: `${Math.floor(Math.random() * 200) + 50}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        timestamp: new Date().toISOString(),
        severity: template.severity,
      };
      handleAuditLog(entry);
    }, 8000);
    mockTimers.current.push(auditInterval);

    // Ping every 30s
    const pingInterval = setInterval(() => {
      setConnectionState(prev => ({ ...prev, lastPing: new Date().toISOString() }));
    }, 30000);
    mockTimers.current.push(pingInterval);
  }, [handleAuditLog]);

  // ── Real WebSocket Mode ────────────────────────────────────────
  const connect = useCallback(() => {
    if (mock) {
      startMockSimulation();
      return;
    }

    setConnectionState({ status: 'connecting', lastPing: null });

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionState({ status: 'connected', lastPing: new Date().toISOString() });
        // Subscribe to channels
        ws.send(JSON.stringify({ action: 'subscribe', channels: ['fx_rates', 'audit_log'] }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.channel === 'fx_rates') handleFxUpdate(msg.data);
          if (msg.channel === 'audit_log') handleAuditLog(msg.data);
          if (msg.type === 'pong') {
            setConnectionState(prev => ({ ...prev, lastPing: new Date().toISOString() }));
          }
        } catch {
          console.warn('[WS] Failed to parse message:', event.data);
        }
      };

      ws.onerror = () => setConnectionState(prev => ({ ...prev, status: 'error' }));

      ws.onclose = () => {
        setConnectionState({ status: 'disconnected', lastPing: null });
        // Auto-reconnect after 5s
        reconnectTimer.current = setTimeout(() => connect(), 5000);
      };
    } catch {
      setConnectionState({ status: 'error', lastPing: null });
    }
  }, [mock, wsUrl, startMockSimulation, handleFxUpdate, handleAuditLog]);

  // Cleanup
  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    mockTimers.current.forEach(t => clearInterval(t));
    mockTimers.current = [];
    setConnectionState({ status: 'disconnected', lastPing: null });
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    connectionState,
    fxRates,
    auditLogs,
    disconnect,
    reconnect: connect,
  };
}
