/**
 * Frontend observability — Sentry init. Activates when VITE_SENTRY_DSN is set;
 * otherwise no-op so local dev doesn't ship telemetry. Tracks errors + a
 * basic transactions sample.
 *
 * Production: set VITE_SENTRY_DSN in the deploy env (or .env.local for
 * staging). Source maps should be uploaded via the Sentry CLI in the
 * build pipeline so stack traces resolve.
 */
import * as Sentry from '@sentry/react';

let initialized = false;

export function initObservability() {
  if (initialized) return;
  const dsn = (import.meta as any).env?.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  Sentry.init({
    dsn,
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.0,        // disabled to keep PII off Sentry
    replaysOnErrorSampleRate: 0.1,
    environment: (import.meta as any).env?.MODE ?? 'production',
    release: (import.meta as any).env?.VITE_RELEASE ?? 'dev',
    beforeSend(event) {
      // Drop any captured user text / mic transcripts before send.
      if (event.message?.match(/transcript|message:/i)) return null;
      return event;
    },
  });
  initialized = true;
}

export { Sentry };
