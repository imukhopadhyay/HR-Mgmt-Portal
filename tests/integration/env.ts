export function testDatabaseUrl() {
  return (
    process.env.TEST_DATABASE_URL ??
    "postgresql://hrportal:hrportal_dev@localhost:5432/hrportal_test?schema=public"
  );
}
