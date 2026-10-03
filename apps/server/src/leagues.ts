// League routes: create a league (you're its commissioner), join with the
// invite code and a display name, claim a state, and start the league; then
// ready up each week (or the deadline plays it). The server builds and plays
// the dynasty itself; phones never decide anything.
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { advanceLeague, changeLeague, deadlineAfter } from "./advance.ts";
import { fail, hashToken, newInviteCode, newToken, requireMember } from "./auth.ts";
import type { Db } from "./db.ts";
import { applyMove, type Move } from "./moves.ts";
import { forMember, madeCall } from "./offseason.ts";
import { idSchema, proposalSchema } from "./schemas.ts";
import { nextStep, openSeason } from "./season.ts";
import { decodeState, encodeState, newLeagueState, teamList, type LeagueState } from "./state.ts";

const nameSchema = { type: "string", minLength: 1, maxLength: 24 } as const;


const gzipped = promisify(gzip);
const isUniqueClash = (e: unknown) => (e as { code?: string })?.code === "P2002";
const clean = (s: string) => s.trim().replace(/\s+/g, " ");

export function leagueRoutes(app: FastifyInstance, db: Db) {
  /** Teams, parsed once per league per save version (the dynasty is big). */
  const cache = new Map<string, { version: number; data: string; state: LeagueState; teams: ReturnType<typeof teamList> }>();
  async function loadState(leagueId: string) {
    const save = await db.leagueSave.findUnique({ where: { leagueId } });
    if (!save) throw new Error(`League ${leagueId} has no save`);
    const hit = cache.get(leagueId);
    if (hit && hit.version === save.version) return hit;
    const state = decodeState(save.data);
    const entry = { version: save.version, data: save.data, state, teams: teamList(state) };
    cache.set(leagueId, entry);
    return entry;
  }

  async function view(leagueId: string) {
    const league = await db.league.findUniqueOrThrow({ where: { id: leagueId }, include: { members: { orderBy: { joinedAt: "asc" } } } });
    const { state, teams, version } = await loadState(leagueId);
    const claimedBy = new Map(league.members.filter((m) => m.team).map((m) => [m.team!, m.id]));
    return {
      id: league.id,
      name: league.name,
      inviteCode: league.inviteCode,
      phase: league.phase,
      season: state.dynasty.league.season,
      weeksPlayed: state.weeksPlayed,
      /** Changes whenever the save does (the app downloads it again). */
      saveVersion: version,
      weekHours: league.weekHours,
      deadline: league.deadline?.toISOString() ?? null,
      next: league.phase === "season" ? nextStep(state) : null,
      /** In the offseason: friends who've made their call for the open stage. */
      madeCall: madeCall(state),
      champion: state.progress.playoffs?.champion ?? null,
      members: league.members.map((m) => ({ id: m.id, displayName: m.displayName, team: m.team, isCommissioner: m.isCommissioner, ready: m.ready })),
      teams: teams.map((t) => ({ ...t, claimedBy: claimedBy.get(t.abbr) ?? null })),
    };
  }

  const memberOf = (req: FastifyRequest, reply: FastifyReply, leagueId: string) => requireMember(db, req, reply, leagueId);

  app.post<{ Body: { name: string; displayName: string; weekHours?: number } }>(
    "/leagues",
    {
      schema: {
        body: {
          type: "object",
          required: ["name", "displayName"],
          properties: { name: { type: "string", minLength: 1, maxLength: 40 }, displayName: nameSchema, weekHours: { type: "integer", minimum: 1, maximum: 168 } },
        },
      },
    },
    async (req, reply) => {
      const name = clean(req.body.name);
      const displayName = clean(req.body.displayName);
      if (!name || !displayName) return fail(reply, 400, "A league name and your name are needed");
      const seed = randomUUID();
      const data = encodeState(newLeagueState(seed));
      const token = newToken();
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const league = await db.league.create({
            data: {
              name,
              seed,
              weekHours: req.body.weekHours ?? 24,
              inviteCode: newInviteCode(),
              save: { create: { data } },
              members: { create: { displayName, tokenHash: hashToken(token), isCommissioner: true } },
            },
            include: { members: true },
          });
          return reply.code(201).send({ token, memberId: league.members[0]!.id, league: await view(league.id) });
        } catch (e) {
          if (!isUniqueClash(e)) throw e; // invite code taken: try another
        }
      }
      return fail(reply, 503, "Couldn't find a free invite code, try again");
    },
  );

  app.post<{ Body: { inviteCode: string; displayName: string } }>(
    "/join",
    { schema: { body: { type: "object", required: ["inviteCode", "displayName"], properties: { inviteCode: { type: "string", minLength: 1, maxLength: 12 }, displayName: nameSchema } } } },
    async (req, reply) => {
      const code = req.body.inviteCode.trim().toUpperCase();
      const displayName = clean(req.body.displayName);
      if (!displayName) return fail(reply, 400, "Pick a display name");
      const league = await db.league.findUnique({ where: { inviteCode: code }, include: { members: true } });
      if (!league) return fail(reply, 404, "No league with that invite code");
      if (league.phase !== "lobby") return fail(reply, 409, "This league has already started");
      if (league.members.some((m) => m.displayName.toLowerCase() === displayName.toLowerCase())) return fail(reply, 409, "That name is taken in this league");
      const token = newToken();
      try {
        const member = await db.member.create({ data: { leagueId: league.id, displayName, tokenHash: hashToken(token) } });
        return reply.code(201).send({ token, memberId: member.id, league: await view(league.id) });
      } catch (e) {
        if (isUniqueClash(e)) return fail(reply, 409, "That name is taken in this league");
        throw e;
      }
    },
  );

  app.get<{ Params: { id: string } }>("/leagues/:id", async (req, reply) => {
    if (!(await memberOf(req, reply, req.params.id))) return reply;
    return view(req.params.id);
  });

  app.post<{ Params: { id: string }; Body: { team: string | null } }>(
    "/leagues/:id/claim",
    { schema: { body: { type: "object", required: ["team"], properties: { team: { type: ["string", "null"], maxLength: 3 } } } } },
    async (req, reply) => {
      const member = await memberOf(req, reply, req.params.id);
      if (!member) return reply;
      const league = await db.league.findUniqueOrThrow({ where: { id: member.leagueId } });
      if (league.phase !== "lobby") return fail(reply, 409, "Teams are set once the league starts");
      const team = req.body.team?.toUpperCase() ?? null;
      if (team !== null && !(await loadState(league.id)).teams.some((t) => t.abbr === team)) return fail(reply, 400, `No team ${team}`);
      try {
        await db.member.update({ where: { id: member.id }, data: { team } });
      } catch (e) {
        if (isUniqueClash(e)) return fail(reply, 409, "Someone already claimed that state");
        throw e;
      }
      return view(league.id);
    },
  );

  app.post<{ Params: { id: string } }>("/leagues/:id/start", async (req, reply) => {
    const member = await memberOf(req, reply, req.params.id);
    if (!member) return reply;
    if (!member.isCommissioner) return fail(reply, 403, "Only the commissioner can start the league");
    const league = await db.league.findUniqueOrThrow({ where: { id: member.leagueId }, include: { members: true, save: true } });
    if (league.phase !== "lobby") return fail(reply, 409, "The league has already started");
    const waiting = league.members.filter((m) => !m.team);
    if (waiting.length) return fail(reply, 409, `Waiting on a team from ${waiting.map((m) => m.displayName).join(", ")}`);

    const { state } = await loadState(league.id);
    const humans = Object.fromEntries(league.members.map((m) => [m.team!, m.id]));
    const data = encodeState(openSeason({ ...state, humans }));
    // Only start from the save we read (another start or change in between wins).
    const started = await db.$transaction(async (tx) => {
      const saved = await tx.leagueSave.updateMany({ where: { leagueId: league.id, version: league.save!.version }, data: { data, version: { increment: 1 } } });
      if (saved.count === 0) return false;
      await tx.league.update({ where: { id: league.id }, data: { phase: "season", deadline: deadlineAfter(new Date(), league.weekHours) } });
      return true;
    });
    if (!started) return fail(reply, 409, "The league changed, try again");
    return view(league.id);
  });

  /** Ready (or not) for the next step; once everyone is ready it's played right away. */
  app.post<{ Params: { id: string }; Body: { ready: boolean } }>(
    "/leagues/:id/ready",
    { schema: { body: { type: "object", required: ["ready"], properties: { ready: { type: "boolean" } } } } },
    async (req, reply) => {
      const member = await memberOf(req, reply, req.params.id);
      if (!member) return reply;
      const league = await db.league.findUniqueOrThrow({ where: { id: member.leagueId } });
      if (league.phase !== "season") return fail(reply, 409, "The league hasn't started");
      await db.member.update({ where: { id: member.id }, data: { ready: req.body.ready } });
      const waiting = await db.member.count({ where: { leagueId: league.id, ready: false } });
      const advanced = waiting === 0 ? await advanceLeague(db, league.id) : null;
      return { advanced, league: await view(league.id) };
    },
  );

  /** The commissioner plays the next step now, whoever is ready (the rest are covered by the AI). */
  app.post<{ Params: { id: string } }>("/leagues/:id/advance", async (req, reply) => {
    const member = await memberOf(req, reply, req.params.id);
    if (!member) return reply;
    if (!member.isCommissioner) return fail(reply, 403, "Only the commissioner can advance the league");
    const advanced = await advanceLeague(db, member.leagueId);
    if (!advanced) return fail(reply, 409, "Nothing to advance right now");
    return { advanced, league: await view(member.leagueId) };
  });

  /**
   * Your own move: a depth-chart change, injured reserve, a free-agent signing,
   * or a trade offer to an AI team (made if their GM accepts). Refused moves
   * come back with the rule that stopped them (and a trade's verdict).
   */
  const moveSchema = {
    type: "object",
    required: ["move"],
    properties: {
      move: {
        oneOf: [
          { type: "object", required: ["kind", "pos", "ids"], properties: { kind: { const: "depth" }, pos: { type: "string", maxLength: 3 }, ids: { type: "array", items: idSchema, maxItems: 72 } } },
          { type: "object", required: ["kind", "player"], properties: { kind: { enum: ["ir", "sign"] }, player: idSchema } },
          { type: "object", required: ["kind", "proposal"], properties: { kind: { const: "trade" }, proposal: proposalSchema } },
        ],
      },
    },
  } as const;
  app.post<{ Params: { id: string }; Body: { move: Move } }>("/leagues/:id/moves", { schema: { body: moveSchema } }, async (req, reply) => {
    const member = await memberOf(req, reply, req.params.id);
    if (!member) return reply;
    if (!member.team) return fail(reply, 409, "Claim a team first");
    const team = member.team;
    const r = await changeLeague(db, member.leagueId, (state, league) => {
      if (league.phase !== "season") return { state: null, result: { done: false, problems: ["The league hasn't started."] } };
      const m = applyMove(state, team, req.body.move);
      return { state: m.state, result: { done: m.state !== null, problems: m.problems, ...(m.verdict ? { verdict: m.verdict } : {}) } };
    });
    if (!r) return fail(reply, 409, "The league is busy (a week may be being played): try again");
    return { ...r.result, saveVersion: r.version };
  });

  /** A week's results (the last week played if none is given). */
  app.get<{ Params: { id: string }; Querystring: { week?: number } }>(
    "/leagues/:id/games",
    { schema: { querystring: { type: "object", properties: { week: { type: "integer", minimum: 1 } } } } },
    async (req, reply) => {
      if (!(await memberOf(req, reply, req.params.id))) return reply;
      const { state } = await loadState(req.params.id);
      const week = req.query.week ?? state.weeksPlayed;
      const games = state.progress.results
        .filter((g) => g.week === week)
        .map(({ id, home, away, homeScore, awayScore, overtime, winner }) => ({ id, home, away, homeScore, awayScore, overtime, winner }));
      return { season: state.dynasty.league.season, week, games };
    },
  );

  /** The league's save, for the app to load (the sim's compact format). */
  app.get<{ Params: { id: string } }>("/leagues/:id/save", async (req, reply) => {
    const member = await memberOf(req, reply, req.params.id);
    if (!member) return reply;
    const { state, version, data: raw } = await loadState(req.params.id);
    reply.header("content-type", "application/json").header("x-save-version", String(version)).header("vary", "accept-encoding");
    // In the offseason, other friends' calls for the open stage stay private.
    const data = state.offseason ? encodeState(forMember(state, member.team)) : raw;
    // A save is a couple of MB of text; gzipped it's a fraction of that (phones unzip it themselves).
    if (/\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""))) return reply.header("content-encoding", "gzip").send(await gzipped(data));
    return reply.send(data);
  });
}
