/**
 * Minimal structured JSON logger. Redacts keys that commonly hold secrets or PII
 * so that request payloads can be logged safely.
 */
type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const REDACT =
  /pass(word)?|token|secret|authorization|cookie|pan|aadhaar|account|ifsc|uan|salary|ctc/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== "object") return value;
  if (value instanceof Error)
    return { name: value.name, message: value.message, stack: value.stack };
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT.test(k) ? "[REDACTED]" : redact(v, depth + 1);
  }
  return out;
}

function threshold(): number {
  const lvl = (process.env.LOG_LEVEL as Level) || "info";
  return order[lvl] ?? order.info;
}

function write(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (order[level] < threshold()) return;
  if (process.env.NODE_ENV === "test" && level !== "error") return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...(meta ? (redact(meta) as Record<string, unknown>) : {}),
  });
  if (level === "error" || level === "warn") console.error(line);
  else process.stdout.write(line + "\n");
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => write("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => write("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write("error", msg, meta),
};
