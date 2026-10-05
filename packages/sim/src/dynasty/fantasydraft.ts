// The fantasy draft that can start a dynasty: every rostered player (and the
// free agents) goes into one pool and all 50 teams draft new 72-man rosters
// from it, a snake draft in a seeded order. A human team picks its first
// rounds on the clock (one yield per pick, like the rookie draft) and the AI
// takes over after that. AI teams judge players as their GM would (his
// philosophy and eye for talent), fill a sensible roster shape, and never break
// the roster rules. Afterwards depth charts are rebuilt and every contract is
// written again to fit the hard cap; whoever is left over is a free agent.
import { assignContracts } from "../gen/contract-gen.ts";
import { pickJersey, ROSTER_TEMPLATE } from "../gen/team-gen.ts";
import { allTeams, type League } from "../league/league.ts";
import { POSITIONS, type Position } from "../model/positions.ts";
import { playerOverall, type Player, type PlayerId } from "../model/player.ts";
import { buildDepthChart, ROSTER_MAX, type Team } from "../model/team.ts";
import { Rng } from "../rng.ts";
import { freeAgentPool } from "../contracts/inseason.ts";
import { POSITION_VALUE } from "./draftclass.ts";
import { NEUTRAL_DRAFT_STYLE, draftStyle, evaluationError, type DraftStyle } from "./frontoffice.ts";
import { ROSTER_MIN, ROSTER_POSITION_MAX } from "./roster.ts";

/** Rounds a full fantasy draft runs: one per roster spot. */
export const FANTASY_ROUNDS = ROSTER_MAX;
/** How many rounds you can choose to pick yourself (the AI picks the rest for you). */
export const FANTASY_LENGTHS = [10, 25, ROSTER_MAX] as const;

/** Need: how much more a team wants a position it is short of (by its usual roster shape). */
const NEED_WEIGHT = 0.35;
/** A position already at its usual count is worth this share (depth beyond the shape). */
const OVER_SHAPE = 0.55;
/** Candidates per position considered at each AI pick. */
const CONSIDER = 3;

export interface FantasyPick {
  round: number;
  /** Pick within the round (1-50), and overall. */
  pick: number;
  overall: number;
  team: string;
  player: PlayerId;
  /** Made by the AI for a human team (after its rounds ran out). */
  auto?: boolean;
}

/** A pick on the clock for a human team. */
export interface FantasyTurn {
  team: string;
  round: number;
  pick: number;
  overall: number;
  /** Rounds this team picks itself. */
  humanRounds: number;
  /** Everyone still available, best first by draft value (`fantasyValue`). */
  available: Player[];
  /** The team's roster so far. */
  roster: Player[];
  /** Positions it may take now (under the position max, and still able to reach every minimum). */
  allowed: Position[];
  /** Who the AI would take here (for "Auto pick"). */
  suggestion: PlayerId;
  /** Every pick so far. */
  picks: readonly FantasyPick[];
}

export interface FantasyDraftResult {
  /** Team abbrs in first-round order (rounds alternate direction). */
  order: string[];
  picks: FantasyPick[];
  /** The league with its new rosters, depth charts and contracts. */
  league: League;
}

export interface FantasyDraftOptions {
  /** Teams that pick themselves, and for how many rounds each. */
  humans?: Readonly<Record<string, number>>;
  /** First-round order; absent = a seeded shuffle. */
  order?: readonly string[];
}

/**
 * The first-round order: a seeded shuffle, with `mine.team` moved to pick
 * `mine.slot` (1-50) if given (everyone else keeps their order around it).
 */
export function fantasyDraftOrder(league: League, mine?: { team: string; slot: number }): string[] {
  const shuffled = new Rng(`${league.seed}:${league.season}:fantasy-order`).shuffle(allTeams(league).map((t) => t.abbr));
  if (!mine) return shuffled;
  if (!league.teams[mine.team]) throw new Error(`${mine.team} is not in the league`);
  if (!Number.isInteger(mine.slot) || mine.slot < 1 || mine.slot > shuffled.length) throw new Error(`Draft slot is 1 to ${shuffled.length}`);
  const others = shuffled.filter((a) => a !== mine.team);
  others.splice(mine.slot - 1, 0, mine.team);
  return others;
}

/** Who picks at each overall pick (snake: even rounds run backwards). */
export function fantasyPickTeam(order: readonly string[], overall: number): { team: string; round: number; pick: number } {
  const n = order.length;
  const round = Math.floor((overall - 1) / n) + 1;
  const i = (overall - 1) % n;
  const pick = i + 1;
  return { team: order[round % 2 === 1 ? i : n - 1 - i]!, round, pick };
}

const count = (roster: readonly Player[], pos: Position) => roster.reduce((s, p) => s + (p.position === pos ? 1 : 0), 0);

/** Positions a team may draft now: under each max, and never so short elsewhere it couldn't reach the minimums. */
export function allowedPositions(roster: readonly Player[], picksLeft: number): Position[] {
  const counts = new Map(POSITIONS.map((pos) => [pos, count(roster, pos)]));
  const short = (pos: Position) => Math.max(0, ROSTER_MIN[pos] - counts.get(pos)!);
  const deficit = POSITIONS.reduce((s, pos) => s + short(pos), 0);
  const open = POSITIONS.filter((pos) => counts.get(pos)! < ROSTER_POSITION_MAX[pos]);
  // With only enough picks left to cover the shortfalls, each pick must cover one.
  return deficit >= picksLeft ? open.filter((pos) => short(pos) > 0) : open;
}

/**
 * A player's draft value with no GM's slant: what he is now and will be,
 * weighted by position (a 95 punter is not a first-rounder). The board order.
 */
export function fantasyValue(p: Player): number {
  return Math.round(judge(p, NEUTRAL_DRAFT_STYLE) * 10) / 10;
}

/** What a GM thinks a player is worth to build around: now and later, by his philosophy. */
function judge(p: Player, style: DraftStyle): number {
  const ovr = playerOverall(p);
  // Later: growth for the young, decline for the old.
  const later = p.age <= 26 ? Math.max(ovr, p.potential) : ovr - Math.max(0, p.age - 29) * 1.5;
  return (style.overallShare * ovr + (1 - style.overallShare) * later) * POSITION_VALUE[p.position];
}

/**
 * The fantasy draft one human pick at a time: yields each human team's turn
 * and resumes with the chosen player's id; returns the finished draft.
 */
export function* fantasyDraftSteps(league: League, opts: FantasyDraftOptions = {}): Generator<FantasyTurn, FantasyDraftResult, PlayerId> {
  const rng = new Rng(`${league.seed}:${league.season}:fantasy`);
  const order = [...(opts.order ?? fantasyDraftOrder(league))];
  const humans = opts.humans ?? {};
  const teams = allTeams(league);
  if (order.length !== teams.length || new Set(order).size !== teams.length || order.some((a) => !league.teams[a])) throw new Error("The draft order must list every team once");

  const pool: Player[] = [...teams.flatMap((t) => [...t.roster, ...(t.reserve ?? [])]), ...(league.freeAgents ?? [])];
  const taken = new Set<PlayerId>();
  const byId = new Map(pool.map((p) => [p.id, p]));
  const rosters = new Map<string, Player[]>(teams.map((t) => [t.abbr, []]));
  const picks: FantasyPick[] = [];

  // Each draft style sorts each position once; picks skip whoever is gone.
  const sorted = new Map<DraftStyle, Map<Position, Player[]>>();
  const boardFor = (style: DraftStyle) => {
    let b = sorted.get(style);
    if (!b) {
      b = new Map(POSITIONS.map((pos) => [pos, pool.filter((p) => p.position === pos).sort((x, y) => judge(y, style) - judge(x, style) || x.id.localeCompare(y.id))]));
      sorted.set(style, b);
    }
    return b;
  };
  const cursor = new Map<Player[], number>();
  const topAvailable = (list: Player[], n: number): Player[] => {
    let i = cursor.get(list) ?? 0;
    while (i < list.length && taken.has(list[i]!.id)) i++;
    cursor.set(list, i);
    const out: Player[] = [];
    for (let j = i; j < list.length && out.length < n; j++) if (!taken.has(list[j]!.id)) out.push(list[j]!);
    return out;
  };

  /** The AI's pick for a team (the best fit among the top few at each position it may take). */
  const aiPick = (team: Team, roster: readonly Player[], allowed: readonly Position[]): Player | null => {
    const style = draftStyle(team);
    const board = boardFor(style);
    let best: Player | null = null;
    let bestScore = -Infinity;
    for (const pos of allowed) {
      const have = count(roster, pos);
      const want = ROSTER_TEMPLATE[pos];
      const fit = have < want ? 1 + NEED_WEIGHT * style.needWeight * ((want - have) / want) : OVER_SHAPE;
      for (const p of topAvailable(board.get(pos)!, CONSIDER)) {
        const score = (judge(p, style) + evaluationError(team, p.id)) * fit * (1 + rng.normal(0, 0.015));
        if (score > bestScore) [best, bestScore] = [p, score];
      }
    }
    return best;
  };

  const total = FANTASY_ROUNDS * order.length;
  for (let overall = 1; overall <= total; overall++) {
    const { team: abbr, round, pick } = fantasyPickTeam(order, overall);
    const team = league.teams[abbr]!;
    const roster = rosters.get(abbr)!;
    const allowed = allowedPositions(roster, FANTASY_ROUNDS - roster.length);
    const suggestion = aiPick(team, roster, allowed);
    // Nobody left this team may take: it fills from free agency afterwards.
    if (!suggestion) continue;
    let chosen = suggestion;
    const humanRounds = humans[abbr] ?? 0;
    if (round <= humanRounds) {
      const available = pool.filter((p) => !taken.has(p.id)).sort((a, b) => fantasyValue(b) - fantasyValue(a) || a.id.localeCompare(b.id));
      const id: PlayerId = yield { team: abbr, round, pick, overall, humanRounds, available, roster: [...roster], allowed, suggestion: suggestion.id, picks: [...picks] };
      const p = byId.get(id);
      if (!p || taken.has(id)) throw new Error(`${abbr} tried to draft ${id}, who isn't available`);
      if (!allowed.includes(p.position)) throw new Error(`${abbr} can't take another ${p.position} now`);
      chosen = p;
    }
    taken.add(chosen.id);
    roster.push(chosen);
    picks.push({ round, pick, overall, team: abbr, player: chosen.id, ...(humans[abbr] && round > humanRounds ? { auto: true } : {}) });
  }

  return { order, picks, league: finishFantasyDraft(league, rosters, pool, taken, rng) };
}

/** Run the whole fantasy draft with the AI picking for everyone. */
export function runFantasyDraft(league: League, opts: Omit<FantasyDraftOptions, "humans"> = {}): FantasyDraftResult {
  const steps = fantasyDraftSteps(league, opts);
  const r = steps.next();
  if (!r.done) throw new Error("No human teams, so nobody should be on the clock");
  return r.value;
}

/** New rosters onto the teams: jerseys sorted out, depth charts, short rosters filled, contracts fitted to the cap. */
function finishFantasyDraft(league: League, rosters: Map<string, Player[]>, pool: readonly Player[], taken: Set<PlayerId>, rng: Rng): League {
  const leftovers = pool.filter((p) => !taken.has(p.id)).sort((a, b) => playerOverall(b) - playerOverall(a) || a.id.localeCompare(b.id));
  const teams: League["teams"] = {};
  for (const t of allTeams(league)) {
    const picked = rosters.get(t.abbr)!;
    // A team the pool ran dry on (rare) signs the best leftovers it may take.
    while (picked.length < ROSTER_MAX) {
      const allowed = new Set(allowedPositions(picked, ROSTER_MAX - picked.length));
      const i = leftovers.findIndex((p) => allowed.has(p.position));
      if (i < 0) break;
      picked.push(leftovers.splice(i, 1)[0]!);
    }
    // Keep each player's number unless a new teammate already wears it (best players keep theirs).
    const used = new Set<number>();
    const roster = [...picked]
      .sort((a, b) => playerOverall(b) - playerOverall(a) || a.id.localeCompare(b.id))
      .map((p) => {
        const { contract: _c, ...rest } = p;
        const jersey = used.has(p.jersey) ? pickJersey(rng, p.position, used) : p.jersey;
        used.add(jersey);
        return { ...rest, jersey } as Player;
      });
    teams[t.abbr] = { ...t, roster, depthChart: buildDepthChart(roster), reserve: [], cap: { rollover: 0, deadMoney: 0 } };
  }
  const rostered = new Set(Object.values(teams).flatMap((t) => t.roster.map((p) => p.id)));
  return assignContracts({ ...league, teams, freeAgents: freeAgentPool(leftovers, rostered) });
}
