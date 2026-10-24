// Regional talent. Each region (a division) has a core of skill groups that
// its players lean to, after long-running tendencies in where football talent
// has come from: speed and defensive backs from the Deep South, big men up
// front from the Midwest, quarterbacks from Texas and California, and so on.
// A player's home state is drawn from the regions by how well his best skill
// group fits each one's core, more strongly the better he is, so the best
// speed players mostly grow up in the Southeast; ratings are never changed,
// and anyone can come from anywhere.
import { LEAGUE_STRUCTURE } from "../league/league.ts";
import type { Player } from "../model/player.ts";
import type { Position } from "../model/positions.ts";
import type { RatingKey, Ratings } from "../model/ratings.ts";
import { Rng } from "../rng.ts";

export type SkillGroup = "speed" | "bigMen" | "passers" | "catchers" | "powerRun" | "passRush" | "runStop" | "coverage" | "kicking";

export interface SkillGroupInfo {
  label: string;
  note: string;
  /** The ratings that make the group, by the positions in it. */
  keys: Partial<Record<Position, readonly RatingKey[]>>;
}

export const SKILL_GROUPS: Record<SkillGroup, SkillGroupInfo> = {
  speed: {
    label: "Speed and elusiveness",
    note: "Backs, receivers and defensive backs who outrun everyone",
    keys: { RB: ["speed", "acceleration", "elusiveness", "jukeMove"], WR: ["speed", "acceleration", "deepRouteRunning"], CB: ["speed", "acceleration", "agility"], S: ["speed", "acceleration", "pursuit"] },
  },
  bigMen: {
    label: "Big men up front",
    note: "Linemen who win in the trenches on both sides",
    keys: { OL: ["strength", "runBlockPower", "passBlockPower", "impactBlocking"], DL: ["strength", "blockShedding", "powerMoves"] },
  },
  passers: {
    label: "Quarterbacks",
    note: "Arm talent and accuracy",
    keys: { QB: ["throwPower", "shortAccuracy", "mediumAccuracy", "deepAccuracy", "throwUnderPressure"] },
  },
  catchers: {
    label: "Hands and routes",
    note: "Receivers and tight ends who get open and catch everything",
    keys: { WR: ["catching", "catchInTraffic", "shortRouteRunning", "mediumRouteRunning"], TE: ["catching", "catchInTraffic", "shortRouteRunning", "mediumRouteRunning"] },
  },
  powerRun: {
    label: "Power running",
    note: "Downhill backs and blocking tight ends",
    keys: { RB: ["trucking", "breakTackle", "stiffArm", "carrying"], TE: ["runBlockPower", "impactBlocking", "strength"] },
  },
  passRush: {
    label: "Pass rushers",
    note: "Edge and interior rushers who live in the backfield",
    keys: { DL: ["powerMoves", "finesseMoves", "acceleration"], LB: ["powerMoves", "finesseMoves", "acceleration"] },
  },
  runStop: {
    label: "Run stoppers",
    note: "Linebackers and safeties who fill and tackle",
    keys: { LB: ["tackle", "pursuit", "playRecognition", "hitPower"], DL: ["tackle", "blockShedding", "pursuit"], S: ["tackle", "hitPower", "playRecognition"] },
  },
  coverage: {
    label: "Ball hawks",
    note: "Cover men who take the ball away",
    keys: { CB: ["manCoverage", "zoneCoverage", "press", "playRecognition"], S: ["zoneCoverage", "manCoverage", "playRecognition"], LB: ["zoneCoverage", "playRecognition"] },
  },
  kicking: {
    label: "Specialists",
    note: "Kickers, punters and snappers",
    keys: { K: ["kickPower", "kickAccuracy"], P: ["kickPower", "kickAccuracy"], LS: ["snapping"] },
  },
};

export const SKILL_GROUP_KEYS = Object.keys(SKILL_GROUPS) as SkillGroup[];

/**
 * Each region's core, strongest first. Drawn from long-running tendencies in
 * where talent has come from (qualitative, fictional league).
 */
export const REGION_CORES: Record<string, readonly SkillGroup[]> = {
  Northeast: ["bigMen", "runStop", "kicking"],
  Atlantic: ["runStop", "passers", "bigMen"],
  Capital: ["passRush", "coverage", "speed"],
  Southeast: ["speed", "coverage", "passRush"],
  "Great Lakes": ["bigMen", "runStop", "catchers"],
  North: ["bigMen", "powerRun", "kicking"],
  Plains: ["powerRun", "bigMen", "runStop"],
  Southwest: ["passers", "coverage", "speed"],
  Mountain: ["bigMen", "passRush", "kicking"],
  Pacific: ["passers", "catchers", "passRush"],
};

/** How strongly a region's first, second and third core groups pull players. */
const CORE_PULL = [1.6, 1.1, 0.7] as const;

type Region = { name: string; states: readonly string[] };
let regionList: Region[] | null = null;
let regionOfState: Map<string, string> | null = null;

/** The regions (divisions) and their states (built on first use: the league structure loads after this module). */
export function regions(): readonly Region[] {
  regionList ??= LEAGUE_STRUCTURE.flatMap((c) => c.divisions.map((d) => ({ name: d.name, states: d.states })));
  return regionList;
}

/** The region a state is in. */
export function regionOf(state: string): string | undefined {
  regionOfState ??= new Map(regions().flatMap((r) => r.states.map((st) => [st, r.name] as const)));
  return regionOfState.get(state);
}

/** How much a region's core values a skill group (0 = not in its core). */
export function corePull(region: string, group: SkillGroup): number {
  const i = REGION_CORES[region]?.indexOf(group) ?? -1;
  return i < 0 ? 0 : CORE_PULL[i]!;
}

const avg = (ratings: Ratings, keys: readonly RatingKey[]) => keys.reduce((s, k) => s + ratings[k], 0) / keys.length;

/** A player's skill group: the best-rated group his position belongs to. */
export function skillGroupOf(p: Pick<Player, "position" | "ratings">): SkillGroup {
  let best: SkillGroup = "kicking";
  let bestScore = -Infinity;
  for (const g of SKILL_GROUP_KEYS) {
    const keys = SKILL_GROUPS[g].keys[p.position];
    if (!keys) continue;
    const score = avg(p.ratings, keys);
    if (score > bestScore) [best, bestScore] = [g, score];
  }
  return best;
}

/**
 * Where a newly generated player grew up: a region weighted by its core's
 * pull on his skill group (stronger for better players: `talent` is his
 * ability, 0-99), then one of its states. Its own random stream (by id), so
 * it never changes anything else that's generated.
 */
export function pickHomeState(id: string, p: Pick<Player, "position" | "ratings">, talent: number): string {
  const rng = new Rng(`home:${id}`);
  const group = skillGroupOf(p);
  // Average players come from everywhere; the best mostly from the regions known for them.
  const quality = Math.max(0, Math.min(1.5, (talent - 55) / 15));
  const all = regions();
  const weights = all.map((r) => 1 + corePull(r.name, group) * (0.5 + 3 * quality));
  const total = weights.reduce((s, w) => s + w, 0);
  let x = rng.next() * total;
  let region = all[0]!;
  for (const [i, w] of weights.entries()) {
    x -= w;
    if (x <= 0) {
      region = all[i]!;
      break;
    }
  }
  return region.states[rng.int(0, region.states.length - 1)]!;
}
