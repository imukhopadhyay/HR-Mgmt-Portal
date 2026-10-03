import { testDatabaseUrl } from "./env";

process.env.DATABASE_URL = testDatabaseUrl();
process.env.DIRECT_DATABASE_URL = testDatabaseUrl();
process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-0123456789";
process.env.EMAIL_DRIVER = "disabled";
process.env.STORAGE_DRIVER = "local";
process.env.LOCAL_STORAGE_DIR = "./storage-test";
process.env.APP_TIMEZONE = "Asia/Kolkata";
