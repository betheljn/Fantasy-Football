// The database: Prisma over Postgres (Prisma 7 talks to Postgres through the pg driver).
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";

export type Db = PrismaClient;

export function createDb(url = process.env.DATABASE_URL): Db {
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
