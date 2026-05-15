/**
 * AegisLedger - WebSocket Service
 * Provides real-time:
 *   - AED/USDC and RUB/USDC rate feed (Chainlink oracle mock, 5s updates)
 *   - Transaction status change notifications per company
 *   - KYB status push notifications
 *   - AML alert push notifications
 *   - In-app notification delivery
 *
 * Clients authenticate via one-time Redis ws-ticket (Fix 39).
 * Subscriptions are per-company based on ticket claims.
 */

const { WebSocketServer } = require("ws");
const http   = require("http");
const redis  = require("redis");
// Fix 39: jwt is NOT used here — authentication is handled via Redis ws-ticket only
const axios  = require("axios");

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "websocket", clients: wss.clients.size }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server });

// Redis subscriber for cross-service events
const redisSub = redis.createClient({ url: process.env.REDIS_URL });
redisSub.connect().catch(console.error);

// Store connected clients: Map<ws, { userId, companyId, role, subscriptions }>
const clients = new Map();

// ─── RATE FEED ────────────────────────────────────────────────────
// Simulates Chainlink oracle feed with realistic micro-fluctuations
const rates = {
  AED_USDC: 3.6721,
  RUB_USDC: 0.01112,
  USD_USDC: 1.0000,
};

function fluctuate(base, bps = 8) {
  const delta = base * (bps / 10000) * (Math.random() * 2 - 1);
  return Math.max(0, parseFloat((base + delta).toFixed(6)));
}

function buildRateFeed() {
  rates.AED_USDC = fluctuate(rates.AED_USDC, 6);
  rates.RUB_USDC = fluctuate(rates.RUB_USDC, 10);
  return {
    type: "rate_update",
    timestamp: new Date().toISOString(),
    rates: {
      AED_USDC: { rate: rates.AED_USDC, change24h: "+0.033%" },
      RUB_USDC: { rate: rates.RUB_USDC, change24h: "-0.121%" },
      USD_USDC: { rate: rates.USD_USDC, change24h: "0.000%" },
      USDC_AED: { rate: parseFloat((1 / rates.AED_USDC).toFixed(6)), change24h: "-0.033%" },
      USDC_RUB: { rate: parseFloat((1 / rates.RUB_USDC).toFixed(2)), change24h: "+0.121%" },
    },
    source: "Chainlink Oracle",
    blockNumber: Math.floor(Date.now() / 5000),
  };
}

// Broadcast rate feed to all authenticated clients every 5 seconds
setInterval(() => {
  const msg = JSON.stringify(buildRateFeed());
  for (const [ws, meta] of clients.entries()) {
    if (ws.readyState === 1 && meta.subscriptions.includes("rates")) {
      ws.send(msg);
    }
  }
}, 5000);

// ─── CONNECTION HANDLING ──────────────────────────────────────────
wss.on("connection", async (ws, req) => {
  // Fix 39: Authenticate via one-time Redis ticket (NOT raw JWT in URL).
  // Client must first call POST /api/v1/auth/ws-ticket (auth-service) to obtain a ticket,
  // then connect with: ws://host/ws/?ticket=<ticket>
  const url    = new URL(req.url, "ws://localhost");
  const ticket = url.searchParams.get("ticket");

  if (!ticket) {
    ws.close(4001, "Missing ws-ticket. Call POST /api/v1/auth/ws-ticket first.");
    return;
  }

  let user;
  try {
    // GETDEL atomically reads and removes the ticket — single use, replay-safe
    const ticketKey  = `ws-ticket:${ticket}`;
    const ticketData = await redisSub.getDel(ticketKey);
    if (!ticketData) {
      ws.close(1008, "Invalid or expired ws-ticket");
      return;
    }
    user = JSON.parse(ticketData); // { sub, company, role, iat }
  } catch (err) {
    console.error("[WS] Ticket validation error:", err.message);
    ws.close(1011, "Internal error during authentication");
    return;
  }

  // Register client
  clients.set(ws, {
    userId:        user.sub,
    companyId:     user.company,
    role:          user.role,
    subscriptions: ["rates", "notifications", "transactions"],
    connectedAt:   new Date().toISOString(),
    ip:            req.socket.remoteAddress,
  });

  console.log(`[WS] Client connected: ${user.sub} | company: ${user.company}`);

  // Send welcome message with current rates
  ws.send(JSON.stringify({
    type: "connected",
    message: "Real-time feed active",
    userId: user.sub,
    ...buildRateFeed(),
  }));

  // Handle client messages (subscribe/unsubscribe/ping)
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const meta = clients.get(ws);

      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", timestamp: new Date().toISOString() }));
        return;
      }

      if (msg.type === "subscribe" && msg.channel) {
        if (!meta.subscriptions.includes(msg.channel)) {
          meta.subscriptions.push(msg.channel);
        }
        ws.send(JSON.stringify({ type: "subscribed", channel: msg.channel }));
      }

      if (msg.type === "unsubscribe" && msg.channel) {
        meta.subscriptions = meta.subscriptions.filter(s => s !== msg.channel);
        ws.send(JSON.stringify({ type: "unsubscribed", channel: msg.channel }));
      }
    } catch {
      // Ignore malformed messages
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected: ${user.sub}`);
  });

  ws.on("error", (err) => {
    console.error("[WS] Client error:", err.message);
    clients.delete(ws);
  });
});

// ─── REDIS SUBSCRIBER ─────────────────────────────────────────────
// Listen for events published by other services
redisSub.subscribe("notifications", (message) => {
  try {
    const payload = JSON.parse(message);
    const { userId, type, message: notifMessage, timestamp } = payload;

    for (const [ws, meta] of clients.entries()) {
      if (ws.readyState === 1 && meta.userId === userId && meta.subscriptions.includes("notifications")) {
        ws.send(JSON.stringify({
          type: "notification",
          notificationType: type,
          message: notifMessage,
          timestamp,
        }));
      }
    }
  } catch (err) {
    console.error("[WS] Redis message error:", err.message);
  }
});

redisSub.subscribe("transaction_update", (message) => {
  try {
    const { companyId, txId, status, amount, currency } = JSON.parse(message);

    for (const [ws, meta] of clients.entries()) {
      if (ws.readyState === 1 && meta.companyId === companyId && meta.subscriptions.includes("transactions")) {
        ws.send(JSON.stringify({
          type: "transaction_update",
          txId, status, amount, currency,
          timestamp: new Date().toISOString(),
        }));
      }
    }
  } catch (err) {
    console.error("[WS] Transaction update error:", err.message);
  }
});

redisSub.subscribe("aml_alert", (message) => {
  try {
    const { companyId, alertId, severity, alertType, txId } = JSON.parse(message);

    for (const [ws, meta] of clients.entries()) {
      // Broadcast AML alerts to compliance officers and admins
      if (ws.readyState === 1 && (meta.companyId === companyId || meta.role === "compliance" || meta.role === "admin")) {
        ws.send(JSON.stringify({
          type: "aml_alert",
          alertId, severity, alertType, txId,
          timestamp: new Date().toISOString(),
        }));
      }
    }
  } catch (err) {
    console.error("[WS] AML alert error:", err.message);
  }
});

// ─── ADMIN BROADCAST ─────────────────────────────────────────────
// Internal endpoint to push a message to all clients or a specific company
// Called by other services
const express = require("express");
const adminApp = express();
adminApp.use(express.json());

adminApp.post("/broadcast", (req, res) => {
  const { companyId, userId, message } = req.body;
  let sent = 0;

  for (const [ws, meta] of clients.entries()) {
    if (ws.readyState !== 1) continue;
    if (companyId && meta.companyId !== companyId) continue;
    if (userId && meta.userId !== userId) continue;
    ws.send(JSON.stringify({ type: "broadcast", ...message, timestamp: new Date().toISOString() }));
    sent++;
  }

  res.json({ sent, totalClients: clients.size });
});

adminApp.get("/clients", (req, res) => {
  const list = [];
  for (const [ws, meta] of clients.entries()) {
    list.push({ userId: meta.userId, companyId: meta.companyId, role: meta.role, connectedAt: meta.connectedAt, subscriptions: meta.subscriptions });
  }
  res.json({ count: list.length, clients: list });
});

adminApp.listen(3099, () => console.log("WebSocket admin API on port 3099"));

// ─── START ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3007;
server.listen(PORT, () => console.log(`WebSocket Service running on port ${PORT}`));
module.exports = { server, wss };
