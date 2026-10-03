// Prisma 7 configuration: where the schema and migrations live, and the
// database to migrate (from .env, never committed).
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
