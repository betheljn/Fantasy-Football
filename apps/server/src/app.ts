// The online-leagues server. Leagues live here, and the sim runs here: game
// results are decided on the server, never on a phone. This first version is
// the scaffold: a health check that also confirms the database is reachable.
import Fastify, { type FastifyInstance } from "fastify";
import type { Db } from "./db.ts";

export interface AppOptions {
  db: Db;
  logger?: boolean;
}

export function buildApp({ db, logger = false }: AppOptions): FastifyInstance {
  const app = Fastify({ logger });

  app.get("/health", async () => {
    let database: "up" | "down" = "up";
    try {
      await db.$queryRaw`SELECT 1`;
    } catch {
      database = "down";
    }
    return { ok: database === "up", database };
  });

  app.addHook("onClose", async () => {
    await db.$disconnect();
  });
  return app;
}
