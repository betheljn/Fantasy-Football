import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createDb, type Db } from "../src/db.ts";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env: fall back to the environment (CI sets DATABASE_URL)
}

describe("health", () => {
  const app = buildApp({ db: createDb() });
  afterAll(() => app.close());

  it("reports the database up when Postgres answers", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, database: "up" });
  });

  it("reports the database down when it can't be reached", async () => {
    const broken = { $queryRaw: async () => Promise.reject(new Error("no db")), $disconnect: async () => {} } as unknown as Db;
    const down = buildApp({ db: broken });
    const res = await down.inject({ method: "GET", url: "/health" });
    expect(res.json()).toEqual({ ok: false, database: "down" });
    await down.close();
  });
});
