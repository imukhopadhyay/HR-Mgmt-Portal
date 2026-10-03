import { inject } from "vitest";

const url = inject("dbUrl");
process.env.DATABASE_URL = url;
process.env.DIRECT_DATABASE_URL = url;
process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-0123456789";
process.env.EMAIL_DRIVER = "disabled";
process.env.STORAGE_DRIVER = "local";
process.env.LOCAL_STORAGE_DIR = "./storage-test";
process.env.APP_TIMEZONE = "Asia/Kolkata";
