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
import { MAX_CALLS, applyMove, type Move } from "./moves.ts";
import { duelFor, handDuel, makeDuelCall } from "./duels.ts";
import { forMember, madeCall } from "./offseason.ts";
import { idSchema, proposalSchema } from "./schemas.ts";
import { nextStep, openSeason } from "./season.ts";
import { decodeState, encodeState, newLeagueState, teamList, type LeagueState, type TeamSetupChoice } from "./state.ts";
import { PROJECTS, buildDesignedStadium, designProblem, COACH_ABILITY_KEYS, DEFENSE_CONCEPTS, OFFENSE_CONCEPTS, SKILL_GROUP_KEYS, coachBuildProblem, createProgram, friendIdentityClash, identityProblem, planPrograms, setUpTeam, skillChoiceProblem, suggestedTag, randomRegion, regions, type CoachCall, type SkillGroup, type TeamIdentityChoice } from "@dynasty/sim";

const nameSchema = { type: "string", minLength: 1, maxLength: 24 } as const;


const gzipped = promisify(gzip);
const isUniqueClash = (e: unknown) => (e as { code?: string })?.code === "P2002";
const clean = (s: string) => s.trim().replace(/\s+/g, " ");

type LobbyMember = { id: string; team: string | null; joinedAt: Date };

/**
 * Each friend's team in the lobby: the spot their program will take (by their
 * skill groups, in the order friends joined), or the state they claimed.
 */
function lobbyTeams(state: LeagueState, members: readonly LobbyMember[]): Map<string, { team: string; region?: string }> {
  const joined = [...members].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
  const claimed = new Set(joined.filter((m) => m.team && !state.programs?.[m.id]).map((m) => m.team!));
  const plan = planPrograms(
    joined.filter((m) => state.programs?.[m.id]).map((m) => ({ id: m.id, groups: state.programs![m.id]!.groups, ...(state.programs![m.id]!.region ? { region: state.programs![m.id]!.region } : {}) })),
    claimed,
  );
  const out = new Map<string, { team: string; region?: string }>();
  for (const m of joined) {
    const p = plan.get(m.id);
    if (p) out.set(m.id, p);
    else if (m.team && !state.programs?.[m.id]) out.set(m.id, { team: m.team });
  }
  return out;
}

/** Setups still in force, by team: for friends whose lobby team is still the one they set up. */
function liveSetups(state: LeagueState, members: readonly LobbyMember[]): Map<string, TeamSetupChoice> {
  const teams = lobbyTeams(state, members);
  const out = new Map<string, TeamSetupChoice>();
  for (const m of members) {
    const s = state.setups?.[m.id];
    const team = teams.get(m.id)?.team;
    if (s && team) out.set(team, { ...s, team });
  }
  return out;
}

/** How a friend's set-up team will look once the league starts (shown in the lobby). */
function lookOf(setup: TeamSetupChoice | undefined, abbr: string, state: LeagueState, region?: string) {
  if (!setup) return {};
  const { identity: id, coach } = setup;
  const place = id.city?.trim() || region || state.dynasty.league.teams[abbr]!.state;
  return {
    name: `${place} ${id.nickname.trim()}`,
    nickname: id.nickname.trim(),
    // A program's blank short name comes from its name (as it will at the start), never its spot's state code.
    tag: id.tag?.trim().toUpperCase() || (region ? suggestedTag(state.dynasty.league, abbr, place) : abbr),
    logo: id.logo,
    ...(id.colors ? { colors: id.colors } : {}),
    coach: `${coach.firstName.trim()} ${coach.lastName.trim()}`,
  };
}

/** Why a friend's setup can't be used: the sim's rules, and never a name, logo or short name another friend has. */
function setupProblem(state: LeagueState, members: readonly LobbyMember[], memberId: string, setup: TeamSetupChoice): string | null {
  const league = state.dynasty.league;
  const problem = identityProblem(league, setup.team, setup.identity) ?? coachBuildProblem(setup.coach) ?? (setup.stadium ? designProblem(setup.stadium) : null);
  if (problem) return problem;
  const live = liveSetups(state, members);
  const teams = lobbyTeams(state, members);
  const friends: Record<string, TeamIdentityChoice | null> = {};
  for (const m of members) {
    const team = teams.get(m.id)?.team;
    if (team && m.id !== memberId) friends[team] = live.get(team)?.identity ?? null;
  }
  return friendIdentityClash(league, setup.team, setup.identity, friends);
}

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
    const inLobby = league.phase === "lobby";
    const lobby = inLobby ? lobbyTeams(state, league.members) : new Map<string, { team: string; region?: string }>();
    const teamOf = (m: { id: string; team: string | null }) => (inLobby ? (lobby.get(m.id)?.team ?? null) : m.team);
    const claimedBy = new Map(league.members.filter((m) => teamOf(m)).map((m) => [teamOf(m)!, m.id]));
    const setups = inLobby ? liveSetups(state, league.members) : new Map<string, TeamSetupChoice>();
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
      paused: league.paused,
      next: league.phase === "season" ? nextStep(state) : null,
      /** In the offseason: friends who've made their call for the open stage. */
      madeCall: madeCall(state),
      champion: state.progress.playoffs?.champion ?? null,
      members: league.members.map((m) => {
        const program = inLobby ? state.programs?.[m.id] : undefined;
        const placed = lobby.get(m.id);
        return {
          id: m.id,
          displayName: m.displayName,
          team: teamOf(m),
          isCommissioner: m.isCommissioner,
          ready: m.ready,
          away: m.away,
          setUp: setups.has(teamOf(m) ?? ""),
          ...(program ? { program: { groups: program.groups, region: placed?.region ?? null } } : {}),
        };
      }),
      teams: teams.map((t) => {
        // In the lobby a friend's program shows as its region until they name it.
        const region = [...lobby.values()].find((p) => p.team === t.abbr)?.region;
        const program = region ? { name: `${region} program`, program: region, tag: suggestedTag(state.dynasty.league, t.abbr, region) } : {};
        return { ...t, ...program, ...lookOf(setups.get(t.abbr), t.abbr, state, region), claimedBy: claimedBy.get(t.abbr) ?? null };
      }),
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

  /** Your top three skill groups (null clears them): your program is built in the region they fit when the league starts. */
  app.post<{ Params: { id: string }; Body: { groups: SkillGroup[] | null } }>(
    "/leagues/:id/program",
    { schema: { body: { type: "object", required: ["groups"], properties: { groups: { anyOf: [{ type: "null" }, { type: "array", items: { enum: [...SKILL_GROUP_KEYS] }, minItems: 3, maxItems: 3 }] } } } } },
    async (req, reply) => {
      const member = await memberOf(req, reply, req.params.id);
      if (!member) return reply;
      if ((await db.league.findUniqueOrThrow({ where: { id: member.leagueId } })).phase !== "lobby") return fail(reply, 409, "Teams are set once the league starts");
      const groups = req.body.groups;
      if (groups) {
        const problem = skillChoiceProblem(groups);
        if (problem) return fail(reply, 400, problem);
      }
      const r = await changeLeague(db, member.leagueId, (state, league) => {
        if (league.phase !== "lobby") return { state: null, result: "Teams are set once the league starts" };
        const { [member.id]: old, ...others } = state.programs ?? {};
        // Your region is drawn at random the first time (the commissioner can change it); new groups keep it.
        const region = old?.region ?? randomRegion(`${state.seed}:${member.id}`);
        const programs = groups ? { ...others, [member.id]: { groups, region } } : others;
        // A new program means a new spot: an old look may no longer fit it, so it's checked again when you save it.
        return { state: { ...state, programs }, result: null };
      });
      if (!r) return fail(reply, 409, "The league is busy, try again");
      if (r.result) return fail(reply, 409, r.result);
      // A program replaces any state you'd claimed.
      if (groups && member.team) await db.member.update({ where: { id: member.id }, data: { team: null } });
      return view(member.leagueId);
    },
  );

  /** The commissioner puts a friend's program in another region (lobby only). */
  app.post<{ Params: { id: string }; Body: { memberId: string; region: string } }>(
    "/leagues/:id/region",
    { schema: { body: { type: "object", required: ["memberId", "region"], properties: { memberId: idSchema, region: { type: "string", maxLength: 24 } } } } },
    async (req, reply) => {
      const member = await memberOf(req, reply, req.params.id);
      if (!member) return reply;
      if (!member.isCommissioner) return fail(reply, 403, "Only the commissioner can change regions");
      if (!regions().some((r) => r.name === req.body.region)) return fail(reply, 400, `No region ${req.body.region}`);
      if ((await db.league.findUniqueOrThrow({ where: { id: member.leagueId } })).phase !== "lobby") return fail(reply, 409, "Teams are set once the league starts");
      const r = await changeLeague(db, member.leagueId, (state, league) => {
        if (league.phase !== "lobby") return { state: null, result: "Teams are set once the league starts" };
        const program = state.programs?.[req.body.memberId];
        if (!program) return { state: null, result: "That friend hasn't built a program yet" };
        return { state: { ...state, programs: { ...state.programs, [req.body.memberId]: { ...program, region: req.body.region } } }, result: null };
      });
      if (!r) return fail(reply, 409, "The league is busy, try again");
      if (r.result) return fail(reply, 409, r.result);
      return view(member.leagueId);
    },
  );

  const str = (max: number) => ({ type: "string", maxLength: max }) as const;
  const rating = { type: "integer", minimum: 0, maximum: 99 } as const;
  const hex = { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" } as const;
  const setupSchema = {
    type: "object",
    required: ["setup"],
    properties: {
      setup: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            required: ["identity", "coach"],
            additionalProperties: false,
            properties: {
              identity: {
                type: "object",
                required: ["nickname", "logo"],
                additionalProperties: false,
                properties: { city: str(40), nickname: str(40), tag: str(8), logo: str(40), colors: { type: "object", required: ["primary", "trim"], additionalProperties: false, properties: { primary: hex, trim: hex } } },
              },
              stadium: {
                type: "object",
                required: ["roof", "surface", "stands", "name"],
                additionalProperties: false,
                properties: { roof: { enum: ["open", "retractable", "dome"] }, surface: { enum: ["grass", "turf"] }, stands: { enum: ["classic", "steep"] }, name: str(40) },
              },
              coach: {
                type: "object",
                required: ["firstName", "lastName", "age", "style", "offenseScheme", "defenseScheme", "aggressiveness", "tempo", "ratings"],
                additionalProperties: false,
                properties: {
                  firstName: str(40),
                  lastName: str(40),
                  age: { type: "integer", minimum: 0, maximum: 99 },
                  style: { enum: ["offense", "defense", "balanced"] },
                  offenseScheme: str(24),
                  defenseScheme: str(24),
                  aggressiveness: rating,
                  tempo: rating,
                  ratings: {
                    type: "object",
                    required: ["gameManagement", "discipline", "development", "playCalling"],
                    additionalProperties: false,
                    properties: { gameManagement: rating, discipline: rating, development: rating, playCalling: rating },
                  },
                },
              },
            },
          },
        ],
      },
    },
  } as const;

  /** Your team's look and head coach (null clears it: the team stays as generated). Lobby only; made when the league starts. */
  app.post<{ Params: { id: string }; Body: { setup: Omit<TeamSetupChoice, "team"> | null } }>("/leagues/:id/setup", { schema: { body: setupSchema } }, async (req, reply) => {
    const member = await memberOf(req, reply, req.params.id);
    if (!member) return reply;
    const locked = "Teams are set once the league starts";
    const noTeam = "Build your program first";
    if ((await db.league.findUniqueOrThrow({ where: { id: member.leagueId } })).phase !== "lobby") return fail(reply, 409, locked);
    const r = await changeLeague(db, member.leagueId, (state, league) => {
      if (league.phase !== "lobby") return { state: null, result: locked };
      const team = lobbyTeams(state, league.members).get(member.id)?.team;
      if (!team) return { state: null, result: noTeam };
      const { [member.id]: _old, ...others } = state.setups ?? {};
      if (!req.body.setup) return { state: { ...state, setups: others }, result: null };
      const setup = { team, ...req.body.setup } as TeamSetupChoice;
      const problem = setupProblem(state, league.members, member.id, setup);
      if (problem) return { state: null, result: problem };
      return { state: { ...state, setups: { ...others, [member.id]: setup } }, result: null };
    });
    if (!r) return fail(reply, 409, "The league is busy, try again");
    if (r.result) return fail(reply, r.result === noTeam || r.result === locked ? 409 : 400, r.result);
    return view(member.leagueId);
  });

  /** Your own setup (to edit it), if you still hold the team it's for. */
  app.get<{ Params: { id: string } }>("/leagues/:id/setup", async (req, reply) => {
    const member = await memberOf(req, reply, req.params.id);
    if (!member) return reply;
    const { state } = await loadState(member.leagueId);
    const league = await db.league.findUniqueOrThrow({ where: { id: member.leagueId }, include: { members: true } });
    const setup = state.setups?.[member.id];
    const placed = league.phase === "lobby" ? lobbyTeams(state, league.members).get(member.id) : undefined;
    return { setup: setup && placed ? { identity: setup.identity, coach: setup.coach } : null, team: placed?.team ?? null, region: placed?.region ?? null };
  });

  app.post<{ Params: { id: string } }>("/leagues/:id/start", async (req, reply) => {
    const member = await memberOf(req, reply, req.params.id);
    if (!member) return reply;
    if (!member.isCommissioner) return fail(reply, 403, "Only the commissioner can start the league");
    const league = await db.league.findUniqueOrThrow({ where: { id: member.leagueId }, include: { members: true, save: true } });
    if (league.phase !== "lobby") return fail(reply, 409, "The league has already started");
    const { state } = await loadState(league.id);
    const lobby = lobbyTeams(state, league.members);
    const waiting = league.members.filter((m) => !lobby.has(m.id));
    if (waiting.length) return fail(reply, 409, `Waiting on a program from ${waiting.map((m) => m.displayName).join(", ")}`);

    // Every friend's program, in the order they joined (the spots the lobby showed), then their looks and coaches.
    const members = [...league.members].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
    let dynasty = state.dynasty;
    const taken = new Set(members.filter((m) => !state.programs?.[m.id]).map((m) => lobby.get(m.id)!.team));
    const teamOf = new Map<string, string>();
    for (const m of members) {
      const program = state.programs?.[m.id];
      if (!program) {
        teamOf.set(m.id, lobby.get(m.id)!.team);
        continue;
      }
      const made = createProgram(dynasty, program.groups, { taken, ...(program.region ? { region: program.region } : {}) });
      dynasty = made.dynasty;
      taken.add(made.team);
      teamOf.set(m.id, made.team);
    }
    const live = liveSetups(state, league.members);
    for (const m of members) {
      const setup = live.get(teamOf.get(m.id)!);
      if (!setup) continue;
      const problem = setupProblem({ ...state, dynasty }, league.members, m.id, setup);
      if (problem) return fail(reply, 409, `${m.displayName}'s team setup no longer works (${problem}); they need to change it`);
      dynasty = setUpTeam(dynasty, setup.team, setup);
      // Their stadium, built to their design.
      if (setup.stadium) dynasty = buildDesignedStadium(dynasty, setup.team, setup.stadium);
    }
    const humans = Object.fromEntries(members.map((m) => [teamOf.get(m.id)!, m.id]));
    const { setups: _made, programs: _built, ...rest } = state;
    const data = encodeState(openSeason({ ...rest, dynasty, humans }));
    // Only start from the save we read (another start or change in between wins).
    const started = await db.$transaction(async (tx) => {
      const saved = await tx.leagueSave.updateMany({ where: { leagueId: league.id, version: league.save!.version }, data: { data, version: { increment: 1 } } });
      if (saved.count === 0) return false;
      // Clear old claims first (the one-team-per-state rule), then everyone's team.
      await tx.member.updateMany({ where: { leagueId: league.id }, data: { team: null } });
      for (const [memberId, team] of teamOf) await tx.member.update({ where: { id: memberId }, data: { team } });
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
      // Nobody waits on a team the commissioner handed to the AI; a paused league doesn't play on its own.
      const waiting = await db.member.count({ where: { leagueId: league.id, ready: false, away: false } });
      const advanced = waiting === 0 && !league.paused ? await advanceLeague(db, league.id) : null;
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
  // One coaching call: a play (with personnel and alignment), a defense, a timeout or a try.
  const callSchema = {
    type: "object",
    additionalProperties: false,
    maxProperties: 6,
    properties: {
      call: { enum: ["run", "pass", "punt", "field_goal", "kneel", "spike"] },
      // The play duel: a concept on either side of the ball (the sim checks it fits the call).
      concept: { enum: [...OFFENSE_CONCEPTS, ...DEFENSE_CONCEPTS] },
      personnel: { enum: ["10", "11", "12", "13", "21"] },
      set: { enum: ["shotgun", "under_center"] },
      package: { enum: ["base", "nickel", "dime", "goal_line"] },
      coverage: { enum: ["cover_0", "cover_1", "cover_2", "cover_3", "cover_4"] },
      blitz: { type: "integer", minimum: 0, maximum: 2 },
      timeout: { type: "boolean" },
      try: { enum: ["kick", "two_point"] },
      // Fatigue (rules 8): players to keep in or rest.
      lineup: { type: "object", additionalProperties: false, properties: { keep: { type: "array", maxItems: 30, items: idSchema }, rest: { type: "array", maxItems: 30, items: idSchema } } },
      // Halftime (rules 9): where to lean the second half.
      halftime: { type: "object", required: ["defense", "offense"], additionalProperties: false, properties: { defense: { enum: ["run", "pass", "balanced"] }, offense: { enum: ["man", "zone", "balanced"] } } },
    },
  } as const;
  const moveSchema = {
    type: "object",
    required: ["move"],
    properties: {
      move: {
        oneOf: [
          { type: "object", required: ["kind", "pos", "ids"], properties: { kind: { const: "depth" }, pos: { type: "string", maxLength: 3 }, ids: { type: "array", items: idSchema, maxItems: 72 } } },
          { type: "object", required: ["kind", "player"], properties: { kind: { enum: ["ir", "sign"] }, player: idSchema } },
          { type: "object", required: ["kind", "proposal"], properties: { kind: { const: "trade" }, proposal: proposalSchema } },
          { type: "object", required: ["kind", "track"], properties: { kind: { const: "upgrade" }, track: { enum: ["facilities", "recruiting", "analytics", "clinic"] } } },
          { type: "object", required: ["kind", "ability"], properties: { kind: { const: "ability" }, ability: { enum: [...COACH_ABILITY_KEYS] } } },
          {
            type: "object",
            required: ["kind", "plan"],
            properties: {
              kind: { const: "recruit" },
              plan: { type: "array", maxItems: 40, items: { type: "object", required: ["prospect", "points"], additionalProperties: false, properties: { prospect: idSchema, points: { type: "integer", minimum: 1, maximum: 100 } } } },
            },
          },
          {
            type: "object",
            required: ["kind", "project", "financing"],
            properties: { kind: { const: "build" }, project: { enum: Object.keys(PROJECTS) }, financing: { enum: ["cash", "bonds"] } },
          },
          { type: "object", required: ["kind", "name"], properties: { kind: { const: "rename" }, name: { type: "string", maxLength: 40 } } },
          { type: "object", required: ["kind", "ticket", "concessions"], properties: { kind: { const: "prices" }, ticket: { type: "integer", minimum: 1, maximum: 100_000 }, concessions: { type: "integer", minimum: 1, maximum: 100_000 } } },
          { type: "object", required: ["kind", "offer"], properties: { kind: { const: "naming" }, offer: { type: "integer", minimum: 0, maximum: 9 } } },
          {
            type: "object",
            required: ["kind", "plan"],
            properties: {
              kind: { const: "scout" },
              plan: { type: "array", maxItems: 40, items: { type: "object", required: ["prospect", "points"], additionalProperties: false, properties: { prospect: idSchema, points: { type: "integer", minimum: 1, maximum: 100 } } } },
            },
          },
          {
            type: "object",
            required: ["kind", "plan"],
            properties: {
              kind: { const: "practice" },
              plan: {
                anyOf: [
                  { type: "null" },
                  {
                    type: "object",
                    required: ["installs", "intensity"],
                    additionalProperties: false,
                    properties: { installs: { type: "array", maxItems: 3, items: { enum: [...OFFENSE_CONCEPTS, ...DEFENSE_CONCEPTS] } }, intensity: { enum: ["light", "normal", "hard"] } },
                  },
                ],
              },
            },
          },
          {
            type: "object",
            required: ["kind", "picks", "stake"],
            properties: {
              kind: { const: "slate" },
              picks: {
                type: "array",
                maxItems: 6,
                items: {
                  type: "object",
                  required: ["prop", "side"],
                  additionalProperties: false,
                  properties: {
                    prop: { type: "string", maxLength: 80 },
                    side: { enum: ["over", "under"] },
                    via: { type: "object", required: ["host", "fade"], additionalProperties: false, properties: { host: { type: "string", maxLength: 40 }, fade: { type: "boolean" } } },
                  },
                },
              },
              stake: { type: "integer", minimum: 1, maximum: 10_000_000 },
            },
          },
          {
            type: "object",
            required: ["kind", "game", "calls"],
            properties: { kind: { const: "coach" }, game: { type: "string", maxLength: 80 }, calls: { type: "array", maxItems: MAX_CALLS, items: { anyOf: [{ type: "null" }, callSchema] } } },
          },
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

  /** Your duel this week (a game against a friend): what you may see of it, and your call if it's waiting. */
  app.get<{ Params: { id: string } }>("/leagues/:id/duel", async (req, reply) => {
    const member = await memberOf(req, reply, req.params.id);
    if (!member) return reply;
    if (!member.team) return { duel: null };
    const { state, version } = await loadState(req.params.id);
    return { duel: duelFor(state, member.team), saveVersion: version };
  });

  /** A call in your duel (null: your coaches' call); `at` is how many calls you saw made. */
  app.post<{ Params: { id: string }; Body: { at: number; call: CoachCall | null } }>(
    "/leagues/:id/duel/call",
    { schema: { body: { type: "object", required: ["at", "call"], properties: { at: { type: "integer", minimum: 0, maximum: MAX_CALLS }, call: { anyOf: [{ type: "null" }, callSchema] } } } } },
    async (req, reply) => {
      const member = await memberOf(req, reply, req.params.id);
      if (!member) return reply;
      if (!member.team) return fail(reply, 409, "Claim a team first");
      const team = member.team;
      const r = await changeLeague(db, member.leagueId, (state) => {
        const d = makeDuelCall(state, team, req.body.at, req.body.call);
        return { state: d.state, result: d.state ? { done: true as const, duel: duelFor(d.state, team) } : { done: false as const, problem: d.problem } };
      });
      if (!r) return fail(reply, 409, "The league is busy (a week may be being played): try again");
      if (!r.result.done) return fail(reply, 409, r.result.problem);
      return { duel: r.result.duel, saveVersion: r.version };
    },
  );

  /** Hand your calls to your coaches until the end of this drive, this half, or the game. */
  app.post<{ Params: { id: string }; Body: { until: "drive" | "half" | "game" } }>(
    "/leagues/:id/duel/hand",
    { schema: { body: { type: "object", required: ["until"], properties: { until: { enum: ["drive", "half", "game"] } } } } },
    async (req, reply) => {
      const member = await memberOf(req, reply, req.params.id);
      if (!member) return reply;
      if (!member.team) return fail(reply, 409, "Claim a team first");
      const team = member.team;
      const r = await changeLeague(db, member.leagueId, (state) => {
        const d = handDuel(state, team, req.body.until);
        return { state: d.state, result: d.state ? { done: true as const, duel: duelFor(d.state, team) } : { done: false as const, problem: d.problem } };
      });
      if (!r) return fail(reply, 409, "The league is busy (a week may be being played): try again");
      if (!r.result.done) return fail(reply, 409, r.result.problem);
      return { duel: r.result.duel, saveVersion: r.version };
    },
  );

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
    // In the offseason, other friends' calls for the open stage stay private (and everyone's coaching calls).
    const privateBits = state.offseason || state.coaching || state.duels || state.recruiting || state.scoutPlans || state.progress.news?.some((x) => x.for) || Object.values(state.picks?.members ?? {}).some((m) => m.open.length > 0);
    const data = privateBits ? encodeState(forMember(state, member.team)) : raw;
    // A save is a couple of MB of text; gzipped it's a fraction of that (phones unzip it themselves).
    if (/\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""))) return reply.header("content-encoding", "gzip").send(await gzipped(data));
    return reply.send(data);
  });
}
