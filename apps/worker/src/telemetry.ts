import {
  context,
  propagation,
  trace,
  SpanStatusCode,
  type Span,
} from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

/**
 * Starts the OpenTelemetry Node SDK exporting OTLP traces. A no-op unless
 * OTEL_EXPORTER_OTLP_ENDPOINT is set, so local dev and tests don't need a
 * collector. Returns a shutdown handle (or null when disabled).
 */
export function initTelemetry(serviceName: string): NodeSDK | null {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return null;

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: process.env.OTEL_SERVICE_VERSION ?? "0.0.0",
    }),
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [getNodeAutoInstrumentations()],
  });
  sdk.start();
  return sdk;
}

/**
 * A W3C `traceparent`/`tracestate` carrier we stash on the job payload so a
 * trace started in the API continues, unbroken, into the worker — the one
 * connected trace across services the export flow needs (§11).
 */
export type TraceCarrier = Record<string, string>;

const TRACER_NAME = "@fylym/worker";

/** Serialize the active trace context into a carrier for the job payload. */
export function injectTraceContext(): TraceCarrier {
  const carrier: TraceCarrier = {};
  propagation.inject(context.active(), carrier);
  return carrier;
}

/**
 * Run `fn` inside a span that is a child of the remote context carried on the
 * job — so the worker's spans share the API request's trace id.
 */
export async function runWithTraceContext<T>(
  carrier: TraceCarrier | undefined,
  spanName: string,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const parent = carrier
    ? propagation.extract(context.active(), carrier)
    : context.active();
  const tracer = trace.getTracer(TRACER_NAME);

  return context.with(parent, () =>
    tracer.startActiveSpan(spanName, async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (err) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : String(err),
        });
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    }),
  );
}
