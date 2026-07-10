import * as Sentry from "@sentry/node";
import { initTelemetry } from "@fylym/worker";

/**
 * Boots OpenTelemetry tracing and Sentry error reporting for the API. Both
 * are opt-in: tracing starts only with OTEL_EXPORTER_OTLP_ENDPOINT set, and
 * Sentry only with SENTRY_DSN set — so local dev needs neither. Errors are
 * tagged with the release (git SHA) so Sentry can attribute regressions.
 *
 * Must run before the Nest app is created so auto-instrumentation and
 * Sentry's global handlers hook in first.
 */
export function initObservability(): void {
  initTelemetry("fylym-api");

  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      release: process.env.SENTRY_RELEASE,
      environment: process.env.SENTRY_ENVIRONMENT ?? "development",
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    });
  }
}

/** Report a server-side error to Sentry (no-op when Sentry isn't configured). */
export function captureError(error: unknown): void {
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error);
  }
}
