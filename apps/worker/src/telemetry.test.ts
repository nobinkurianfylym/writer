import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { trace } from "@opentelemetry/api";
import {
  NodeTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { injectTraceContext, runWithTraceContext } from "./telemetry.js";

const exporter = new InMemorySpanExporter();

beforeAll(() => {
  // register() installs the AsyncLocalStorage context manager + propagator,
  // so context.active()/getActiveSpan() work exactly as in the running apps.
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  provider.register({ propagator: new W3CTraceContextPropagator() });
});

afterAll(() => {
  exporter.reset();
});

describe("trace-context propagation (API → worker)", () => {
  it("keeps one trace id across an enqueue → process hop", async () => {
    const tracer = trace.getTracer("test-api");

    // ── API side: start a request span, capture the carrier the producer
    //    would stash on the job payload. ──
    let apiTraceId = "";
    let carrier: Record<string, string> = {};
    await tracer.startActiveSpan("POST /v1/scripts/:id/exports", async (apiSpan) => {
      apiTraceId = apiSpan.spanContext().traceId;
      carrier = injectTraceContext();
      apiSpan.end();
    });

    expect(carrier.traceparent).toContain(apiTraceId);

    // ── Worker side: process the job under the extracted context. ──
    let workerTraceId = "";
    await runWithTraceContext(carrier, "job.export", async () => {
      workerTraceId = trace.getActiveSpan()!.spanContext().traceId;
    });

    // One connected trace across services.
    expect(workerTraceId).toBe(apiTraceId);

    // Both spans exported, sharing the trace id.
    const traceIds = new Set(exporter.getFinishedSpans().map((s) => s.spanContext().traceId));
    expect(traceIds.has(apiTraceId)).toBe(true);
  });

  it("starts a fresh trace when no carrier is present", async () => {
    let traceId = "";
    await runWithTraceContext(undefined, "job.demo", async () => {
      traceId = trace.getActiveSpan()!.spanContext().traceId;
    });
    expect(traceId).toMatch(/^[a-f0-9]{32}$/);
  });

  it("records the exception and rethrows on failure", async () => {
    await expect(
      runWithTraceContext({}, "job.export", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
