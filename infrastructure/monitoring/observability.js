/**
 * AegisLedger - Observability: OpenTelemetry Tracing + Structured Logging
 * Include at the top of every service: require('./observability')
 * Sends traces to Jaeger/AWS X-Ray, logs to CloudWatch/ELK
 */

const { NodeSDK }              = require("@opentelemetry/sdk-node");
const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
const { OTLPTraceExporter }    = require("@opentelemetry/exporter-trace-otlp-http");
const { Resource }             = require("@opentelemetry/resources");
const { SemanticResourceAttributes } = require("@opentelemetry/semantic-conventions");
const { BatchSpanProcessor }   = require("@opentelemetry/sdk-trace-base");
const { trace, context, SpanStatusCode } = require("@opentelemetry/api");
const winston  = require("winston");
const { v4: uuidv4 } = require("uuid");

const SERVICE_NAME    = process.env.SERVICE_NAME || "aegisledger-service";
const SERVICE_VERSION = process.env.SERVICE_VERSION || "1.0.0";
const ENVIRONMENT     = process.env.NODE_ENV || "development";

// ─── OPENTELEMETRY SETUP ──────────────────────────────────────────
const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318/v1/traces",
});

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]:    SERVICE_NAME,
    [SemanticResourceAttributes.SERVICE_VERSION]: SERVICE_VERSION,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: ENVIRONMENT,
    "aegisledger.region": process.env.AWS_REGION || "me-central-1",
  }),
  spanProcessor: new BatchSpanProcessor(traceExporter),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-http":     { enabled: true },
      "@opentelemetry/instrumentation-express":  { enabled: true },
      "@opentelemetry/instrumentation-pg":       { enabled: true, dbStatementSerializer: (op, params) => `${op} [${params?.length} params]` },
      "@opentelemetry/instrumentation-redis":    { enabled: true },
    }),
  ],
});

sdk.start();
process.on("SIGTERM", () => sdk.shutdown().then(() => process.exit(0)));

// ─── STRUCTURED LOGGER ────────────────────────────────────────────
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { service: SERVICE_NAME, version: SERVICE_VERSION, env: ENVIRONMENT },
  transports: [
    new winston.transports.Console({ format: ENVIRONMENT === "development" ? winston.format.prettyPrint() : winston.format.json() }),
    ...(process.env.LOG_FILE ? [new winston.transports.File({ filename: process.env.LOG_FILE, maxsize: 50_000_000, maxFiles: 5 })] : []),
  ],
});

// ─── REQUEST CORRELATION MIDDLEWARE ──────────────────────────────
function correlationMiddleware(req, res, next) {
  req.correlationId = req.headers["x-correlation-id"] || uuidv4();
  req.requestId     = uuidv4();

  res.setHeader("X-Correlation-ID", req.correlationId);
  res.setHeader("X-Request-ID",     req.requestId);

  const tracer = trace.getTracer(SERVICE_NAME);
  const span   = tracer.startSpan(`${req.method} ${req.path}`);
  span.setAttributes({
    "http.method":         req.method,
    "http.url":            req.url,
    "http.correlation_id": req.correlationId,
    "aegisledger.user_id": req.user?.sub || "anonymous",
    "aegisledger.company": req.user?.company || "unknown",
  });

  req.span = span;
  const startTime = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - startTime;
    span.setAttributes({ "http.status_code": res.statusCode, "http.response_time_ms": duration });

    if (res.statusCode >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();

    logger.info("http_request", {
      method:        req.method,
      path:          req.path,
      statusCode:    res.statusCode,
      durationMs:    duration,
      correlationId: req.correlationId,
      requestId:     req.requestId,
      userId:        req.user?.sub,
      companyId:     req.user?.company,
      ip:            req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      userAgent:     req.headers["user-agent"]?.slice(0, 100),
    });
  });

  next();
}

// ─── FINANCIAL TRANSACTION LOGGER ────────────────────────────────
function logFinancialEvent(eventType, data) {
  logger.info("financial_event", {
    eventType,
    timestamp:     new Date().toISOString(),
    ...data,
    _immutable: true,  // Flag for log shipping — do not modify
  });
}

// ─── ERROR TRACKING ───────────────────────────────────────────────
function logError(err, context = {}) {
  logger.error("application_error", {
    message:    err.message,
    stack:      err.stack,
    code:       err.code,
    statusCode: err.statusCode,
    ...context,
  });
}

// ─── PERFORMANCE METRICS ──────────────────────────────────────────
function createTimer(name) {
  const start = Date.now();
  return {
    end: (additionalData = {}) => {
      const durationMs = Date.now() - start;
      logger.debug("performance_metric", { name, durationMs, ...additionalData });
      return durationMs;
    },
  };
}

// ─── AUDIT LOGGER ────────────────────────────────────────────────
function logAuditEvent(userId, action, details, ipAddress) {
  logger.info("audit_event", {
    userId, action, details, ipAddress,
    timestamp: new Date().toISOString(),
    _audit: true,
  });
}

module.exports = {
  logger,
  correlationMiddleware,
  logFinancialEvent,
  logError,
  createTimer,
  logAuditEvent,
  trace,
  context,
};
