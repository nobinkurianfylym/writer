import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getWebEnv } = await import("./src/env");
    getWebEnv();

    // Server-side Sentry (opt-in via DSN), release-tagged for attribution.
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
        environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
        tracesSampleRate: 0.1,
      });
    }
  }
}

export const onRequestError = Sentry.captureRequestError;
