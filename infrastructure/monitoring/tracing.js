const { NodeSDK } = require("@opentelemetry/sdk-node");
const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");
const { Resource } = require("@opentelemetry/resources");
function initTracing(serviceName) {
  const sdk = new NodeSDK({
    resource: new Resource({"service.name":serviceName,"deployment.environment":process.env.NODE_ENV||"dev"}),
    traceExporter: new OTLPTraceExporter({url:process.env.OTEL_ENDPOINT||"http://otel-collector:4318/v1/traces"}),
    instrumentations: [getNodeAutoInstrumentations({"@opentelemetry/instrumentation-fs":{enabled:false}})],
  });
  sdk.start();
  process.on("SIGTERM",()=>sdk.shutdown());
  console.log(`[OTEL] Tracing initialized: ${serviceName}`);
}
module.exports = { initTracing };
