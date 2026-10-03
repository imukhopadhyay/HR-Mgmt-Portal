import { z } from "zod";

/**
 * Server-side environment, validated once at first access.
 * Never import this module from client components.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_TIMEZONE: z.string().default("Asia/Kolkata"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default("./storage"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  EMAIL_DRIVER: z.enum(["console", "smtp", "disabled"]).default("console"),
  EMAIL_FROM: z.string().default("HR Portal <no-reply@example.com>"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  CRON_SECRET: z.string().min(16).optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const value = parsed.data;
  if (value.NODE_ENV === "production" && value.SESSION_SECRET.includes("change-me")) {
    throw new Error("SESSION_SECRET must be replaced with a strong secret in production");
  }
  if (value.STORAGE_DRIVER === "s3" && !value.S3_BUCKET) {
    throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3");
  }
  if (value.EMAIL_DRIVER === "smtp" && !value.SMTP_HOST) {
    throw new Error("SMTP_HOST is required when EMAIL_DRIVER=smtp");
  }
  cached = value;
  return value;
}
