// The online-leagues server. Leagues live here, and the sim runs here: game
// results are decided on the server, never on a phone. A health check (with the
// database), the league routes, and a timer that plays weeks past their deadline.
import Fastify, { type FastifyInstance } from "fastify";
import { advanceOverdue } from "./advance.ts";
import type { Db } from "./db.ts";
import { leagueRoutes } from "./leagues.ts";

export interface AppOptions {
  db: Db;
  logger?: boolean;
  /** How often to play weeks whose deadline has passed (ms); off when absent. */
  sweepEveryMs?: number;
}

export function buildApp({ db, logger = false, sweepEveryMs }: AppOptions): FastifyInstance {
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

  leagueRoutes(app, db);

  let sweep: NodeJS.Timeout | undefined;
  if (sweepEveryMs) {
    app.addHook("onReady", async () => {
      sweep = setInterval(() => {
        advanceOverdue(db)
          .then((done) => done.forEach((d) => app.log.info({ league: d.leagueId, advanced: d.summary.kind }, "deadline passed: advanced")))
          .catch((e) => app.log.error(e, "deadline sweep failed"));
      }, sweepEveryMs);
    });
  }

  app.addHook("onClose", async () => {
    clearInterval(sweep);
    await db.$disconnect();
  });
  return app;
}
