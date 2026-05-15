/**
 * AegisLedger Node.js SDK
 * @version 1.0.0
 * Full TypeScript-compatible JavaScript SDK for the AegisLedger API.
 *
 * Installation: npm install aegisledger-sdk
 *
 * Usage:
 *   const AegisLedger = require('aegisledger-sdk');
 *   const client = new AegisLedger({ apiKey: 'ak_live_...', baseUrl: 'https://api.aegisledger.com' });
 *   const balance = await client.wallets.getBalances(companyId);
 */

const axios = require("axios");
const crypto = require("crypto");

class AegisLedgerError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.name = "AegisLedgerError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

class AegisLedgerClient {
  /**
   * @param {object} config
   * @param {string} config.apiKey - API key (ak_live_...) or service account credentials
   * @param {string} [config.baseUrl] - Base URL (default: https://api.aegisledger.com)
   * @param {string} [config.clientId] - Service account client ID
   * @param {string} [config.clientSecret] - Service account client secret
   * @param {number} [config.timeout] - Request timeout ms (default: 30000)
   * @param {string} [config.version] - API version (default: v1)
   */
  constructor(config = {}) {
    this.baseUrl = (config.baseUrl || "https://api.aegisledger.com").replace(/\/$/, "");
    this.apiKey  = config.apiKey;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.timeout = config.timeout || 30000;
    this.version = config.version || "v1";
    this._token  = null;
    this._tokenExpiry = null;

    this.http = axios.create({ baseURL: `${this.baseUrl}/api/${this.version}`, timeout: this.timeout });

    // Request interceptor — attach auth header
    this.http.interceptors.request.use(async (cfg) => {
      const token = await this._getToken();
      cfg.headers["Authorization"] = `Bearer ${token}`;
      cfg.headers["X-SDK-Version"]  = "1.0.0";
      cfg.headers["X-SDK-Language"] = "nodejs";
      return cfg;
    });

    // Response interceptor — normalise errors
    this.http.interceptors.response.use(
      (res) => res.data,
      (err) => {
        const status  = err.response?.status;
        const message = err.response?.data?.error || err.message;
        const code    = err.response?.data?.code;
        throw new AegisLedgerError(message, status, code);
      }
    );

    // Register resource namespaces
    this.auth        = new AuthResource(this);
    this.wallets     = new WalletsResource(this);
    this.transfers   = new TransfersResource(this);
    this.compliance  = new ComplianceResource(this);
    this.trade       = new TradeResource(this);
    this.kyb         = new KYBResource(this);
    this.analytics   = new AnalyticsResource(this);
    this.webhooks    = new WebhooksResource(this);
    this.billing     = new BillingResource(this);
  }

  async _getToken() {
    // API key auth
    if (this.apiKey) return this.apiKey;

    // Service account — get and cache JWT
    if (this.clientId && this.clientSecret) {
      if (this._token && this._tokenExpiry && Date.now() < this._tokenExpiry - 60000) return this._token;

      const response = await axios.post(`${this.baseUrl}/api/${this.version}/service-accounts/token`, {
        clientId: this.clientId, clientSecret: this.clientSecret,
      });
      this._token       = response.data.access_token;
      this._tokenExpiry = Date.now() + (response.data.expires_in * 1000);
      return this._token;
    }
    throw new AegisLedgerError("No authentication method configured", 401, "MISSING_AUTH");
  }

  /**
   * Verify a webhook signature from AegisLedger
   * @param {string} payload - Raw request body string
   * @param {string} signature - X-AegisLedger-Signature header value
   * @param {string} secret - Webhook signing secret
   */
  static verifyWebhookSignature(payload, signature, secret) {
    const expected = "sha256=" + crypto.createHmac("sha256", secret).update(payload).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }
}

class BaseResource {
  constructor(client) { this._client = client; }
  get http() { return this._client.http; }
}

class AuthResource extends BaseResource {
  login(email, password)              { return this.http.post("/auth/login", { email, password }); }
  verifyMFA(userId, token)            { return this.http.post("/auth/mfa", { userId, token }); }
  logout()                            { return this.http.post("/auth/logout"); }
  getProfile()                        { return this.http.get("/users/me"); }
  updateProfile(data)                 { return this.http.patch("/users/me", data); }
  listSessions()                      { return this.http.get("/auth/sessions"); }
  revokeSession(sessionId)            { return this.http.delete(`/auth/sessions/${sessionId}`); }
  revokeAllSessions()                 { return this.http.delete("/auth/sessions"); }
  generateBackupCodes()               { return this.http.post("/auth/backup-codes/generate"); }
  getBackupCodeStatus()               { return this.http.get("/auth/backup-codes/status"); }
  forgotPassword(email)               { return this.http.post("/auth/forgot-password", { email }); }
  resetPassword(token, newPassword)   { return this.http.post("/auth/reset-password", { token, newPassword }); }
  listApiKeys()                       { return this.http.get("/api-keys"); }
  createApiKey(name, scopes, opts)    { return this.http.post("/api-keys", { name, scopes, ...opts }); }
  revokeApiKey(keyId)                 { return this.http.delete(`/api-keys/${keyId}`); }
}

class WalletsResource extends BaseResource {
  getBalances(companyId)              { return this.http.get(`/wallets/${companyId}/balances`); }
  provision(companyId)                { return this.http.post("/wallets/provision", { companyId }); }
  getAddressBook()                    { return this.http.get("/address-book"); }
  addAddress(entry)                   { return this.http.post("/address-book", entry); }
  removeAddress(id)                   { return this.http.delete(`/address-book/${id}`); }
  listBalanceAlerts()                 { return this.http.get("/balance-alerts"); }
  createBalanceAlert(alert)           { return this.http.post("/balance-alerts", alert); }
  listSweepRules()                    { return this.http.get("/sweep-rules"); }
  createSweepRule(rule)               { return this.http.post("/sweep-rules", rule); }
  getPortfolioAllocation(companyId)   { return this.http.get(`/wallets/${companyId}/portfolio`); }
}

class TransfersResource extends BaseResource {
  list(params)                        { return this.http.get("/transfers", { params }); }
  get(txId)                           { return this.http.get(`/transfers/${txId}`); }
  initiate(transfer)                  { return this.http.post("/transfers", transfer); }
  approve(txId)                       { return this.http.post(`/transfers/${txId}/approve`); }
  cancel(txId, reason)                { return this.http.post(`/transfers/${txId}/cancel`, { reason }); }
  getReceipt(txId)                    { return this.http.get(`/receipts/transfer/${txId}`, { responseType: "arraybuffer" }); }

  // Recurring
  listRecurring()                     { return this.http.get("/recurring"); }
  createRecurring(payment)            { return this.http.post("/recurring", payment); }
  pauseRecurring(id)                  { return this.http.patch(`/recurring/${id}/pause`); }

  // Bulk
  uploadBulk(csvBuffer, filename)     {
    const FormData = require("form-data");
    const form = new FormData();
    form.append("csvFile", csvBuffer, { filename: filename || "payments.csv", contentType: "text/csv" });
    return this.http.post("/transfers/bulk", form, { headers: form.getHeaders() });
  }
  approveBulk(batchId)                { return this.http.post(`/transfers/bulk/${batchId}/approve`); }

  // Templates
  listTemplates()                     { return this.http.get("/templates"); }
  createTemplate(template)            { return this.http.post("/templates", template); }

  // FX
  lockFxRate(from, to, amount)        { return this.http.post("/fx/lock-rate", { fromCurrency: from, toCurrency: to, amount }); }
  getFxLock(lockId)                   { return this.http.get(`/fx/lock/${lockId}`); }

  // Multi-sig
  initiateMultisig(tx)                { return this.http.post("/transfers/multisig/initiate", tx); }
  signMultisig(txId)                  { return this.http.post(`/transfers/multisig/${txId}/sign`); }
}

class ComplianceResource extends BaseResource {
  screenTransaction(txData)           { return this.http.post("/compliance/screen/transaction", txData); }
  screenEntity(entityData)            { return this.http.post("/compliance/screen/entity", entityData); }
  getRules()                          { return this.http.get("/rules"); }
  createRule(rule)                    { return this.http.post("/rules", rule); }
  updateRule(ruleId, changes)         { return this.http.patch(`/rules/${ruleId}`, changes); }
  evaluateRules(transaction)          { return this.http.post("/rules/evaluate", { transaction }); }
  getCases(params)                    { return this.http.get("/cases", { params }); }
  createCase(caseData)                { return this.http.post("/cases", caseData); }
  addEvidence(caseId, evidence)       { return this.http.post(`/cases/${caseId}/evidence`, evidence); }
  updateCaseStatus(caseId, update)    { return this.http.patch(`/cases/${caseId}/status`, update); }
  generateSAR(caseId, format)         { return this.http.post("/sar/generate", { caseId, format }, format === "pdf" ? { responseType: "arraybuffer" } : {}); }
  getRegulatoryReports()              { return this.http.get("/compliance/reports/regulatory"); }
  getAnalytics(params)                { return this.http.get("/analytics/overview", { params }); }
  composeTravelRulePacket(data)       { return this.http.post("/travel-rule/compose", data); }
  checkWatchlistDelta(names)          { return this.http.post("/watchlist/check-delta", { entityNames: names }); }
  getRiskScore(companyId)             { return this.http.get(`/risk-score/${companyId}`); }
}

class TradeResource extends BaseResource {
  listEscrows()                       { return this.http.get("/escrows"); }
  createEscrow(escrow)                { return this.http.post("/escrows", escrow); }
  uploadDocument(escrowId, file, conditionType) {
    const FormData = require("form-data");
    const form = new FormData();
    form.append("document", file.buffer, { filename: file.name, contentType: file.mimetype });
    form.append("conditionType", conditionType);
    return this.http.post(`/escrows/${escrowId}/documents`, form, { headers: form.getHeaders() });
  }
  fulfillCondition(escrowId, data)    { return this.http.post(`/escrows/${escrowId}/fulfill`, data); }
  getEscrowReceipt(escrowId)          { return this.http.get(`/receipts/escrow/${escrowId}`, { responseType: "arraybuffer" }); }
}

class KYBResource extends BaseResource {
  submit(application)                 { return this.http.post("/kyb/submit", application); }
  getStatus(companyId)                { return this.http.get(`/kyb/${companyId}/status`); }
  resubmit(companyId, corrections)    { return this.http.post(`/kyb/${companyId}/resubmit`, corrections); }
  approve(id, decision)               { return this.http.patch(`/kyb/${id}/approve`, decision); }
  listQueue(params)                   { return this.http.get("/kyb/queue", { params }); }
}

class AnalyticsResource extends BaseResource {
  getTransactionAnalytics(params)     { return this.http.get("/transactions/analytics", { params }); }
  getPnLByCorridors(params)           { return this.http.get("/pnl/corridors", { params }); }
  getHeatmap(days)                    { return this.http.get("/heatmap/flows", { params: { days } }); }
  getCounterpartyExposure()           { return this.http.get("/exposure/counterparties"); }
  getLatencyBenchmarks()              { return this.http.get("/benchmarks/settlement-latency"); }
  getMRR(params)                      { return this.http.get("/revenue/mrr", { params }); }
  runCustomReport(config)             { return this.http.post("/reports/custom", config); }
  getDashboardLayout(userId)          { return this.http.get(`/dashboard/layout/${userId}`); }
  saveDashboardLayout(userId, layout) { return this.http.put(`/dashboard/layout/${userId}`, { layout }); }
}

class WebhooksResource extends BaseResource {
  list()                              { return this.http.get("/webhooks"); }
  create(webhook)                     { return this.http.post("/webhooks", webhook); }
  update(id, changes)                 { return this.http.patch(`/webhooks/${id}`, changes); }
  delete(id)                          { return this.http.delete(`/webhooks/${id}`); }
  getDeliveries(webhookId)            { return this.http.get(`/webhooks/${webhookId}/deliveries`); }
  redeliver(webhookId, deliveryId)    { return this.http.post(`/webhooks/${webhookId}/redeliver/${deliveryId}`); }
  getNotifPreferences()               { return this.http.get("/notification-preferences"); }
  updateNotifPreferences(prefs)       { return this.http.put("/notification-preferences", prefs); }
}

class BillingResource extends BaseResource {
  getTiers()                          { return this.http.get("/tiers"); }
  getSubscription()                   { return this.http.get("/subscription"); }
  upgrade(tier, paymentMethodId)      { return this.http.post("/subscription/upgrade", { tier, paymentMethodId }); }
  checkFeature(feature)               { return this.http.get(`/features/check/${feature}`); }
  getInvoices()                       { return this.http.get("/invoices"); }
  getWhitelabelConfig()               { return this.http.get("/whitelabel/config"); }
  updateWhitelabelConfig(config)      { return this.http.put("/whitelabel/config", config); }
  generateReferralCode()              { return this.http.post("/referrals/generate"); }
  getReferrals()                      { return this.http.get("/referrals"); }
  optimizeCashFlow(companyId, days)   { return this.http.post("/cashflow/optimise", { companyId, horizonDays: days }); }
}

module.exports = AegisLedgerClient;
module.exports.AegisLedgerError = AegisLedgerError;
module.exports.default = AegisLedgerClient;
