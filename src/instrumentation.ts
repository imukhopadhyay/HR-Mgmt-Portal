import type { Instrumentation } from "next";

/** Fail fast at server start if configuration is missing or unsafe. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { env } = await import("@/lib/env");
    env();
  }
}

/**
 * Server error hook: every unhandled error in a route, action or render is
 * logged as structured JSON (with Next's error digest, which is what users see
 * on the error page) so it can be correlated in the log drain / APM.
 * To add Sentry or another tracker, forward from here.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { logger } = await import("@/lib/logger");
  const e = err as Error & { digest?: string };
  logger.error("request.error", {
    digest: e.digest,
    name: e.name,
    message: e.message,
    stack: e.stack,
    method: request.method,
    path: request.path.split("?")[0],
    routePath: context.routePath,
    routeType: context.routeType,
  });
};
