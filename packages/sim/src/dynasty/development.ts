// Offseason development: every player ages a year and their ratings move.
//
// Each position has a peak window. Before it, players grow toward their
// potential (faster the further away they are); inside it they drift; after
// it they decline, a little more each year. Physical ratings fade from about
// 28 on, while awareness and play recognition keep growing into the early 30s.
import type { Position } from "../model/positions.ts";
import { playerOverall, type DevTrait, type Player } from "../model/player.ts";
import { OVERALL_WEIGHTS, RATING_KEYS, clampRating, type RatingKey, type Ratings } from "../model/ratings.ts";
import { buildDepthChart, type Team } from "../model/team.ts";
import { Rng } from "../rng.ts";
import type { League } from "../league/league.ts";

/** Ages (inclusive) when a player at each position is at his best. */
export const PEAK_AGES: Record<Position, readonly [number, number]> = {
  QB: [27, 33],
  RB: [23, 27],
  WR: [25, 29],
  TE: [25, 30],
  OL: [26, 31],
  DL: [25, 30],
  LB: [25, 29],
  CB: [24, 28],
  S: [25, 29],
  K: [26, 36],
  P: [26, 36],
  LS: [26, 35],
};

const PHYSICAL: ReadonlySet<RatingKey> = new Set(["speed", "acceleration", "agility", "stamina", "jumping"]);
const MENTAL: ReadonlySet<RatingKey> = new Set(["awareness", "playRecognition"]);
/**
 * What a development trait does: growth before the peak is multiplied; Star and
 * Elite keep improving a little at their peak; better traits decline more slowly.
 */
export const DEV_TRAIT_EFFECTS: Record<DevTrait, { growth: number; peakDrift: number; decline: number }> = {
  normal: { growth: 1.0, peakDrift: 0, decline: 1.0 },
  impact: { growth: 1.25, peakDrift: 0.3, decline: 0.92 },
  star: { growth: 1.5, peakDrift: 0.6, decline: 0.85 },
  elite: { growth: 1.8, peakDrift: 1.0, decline: 0.75 },
};

/** Physical ratings start to fade after this age. */
export const PHYSICAL_DECLINE_AGE = 28;
/** Awareness keeps growing through this age. */
export const AWARENESS_GROWTH_UNTIL = 32;

/**
 * Expected change in overall for a player entering `age` this season.
 * Young: a share of the gap to potential. Peak: small drift toward potential.
 * Past peak: a decline that steepens each year.
 */
export function expectedGrowth(position: Position, age: number, overall: number, potential: number, trait: DevTrait = "normal"): number {
  const [start, end] = PEAK_AGES[position];
  const fx = DEV_TRAIT_EFFECTS[trait];
  if (age < start) return Math.min(10, Math.max(0, potential - overall) * (0.28 + 0.04 * (start - age)) * fx.growth);
  if (age <= end) return Math.max(-1, Math.min(3, (potential - overall) * 0.2 + fx.peakDrift));
  return -(1.2 + 0.7 * (age - end)) * fx.decline;
}

/** Round to an integer, up with probability equal to the fraction (so small changes aren't lost). */
function stochasticRound(rng: Rng, x: number): number {
  const f = Math.floor(x);
  return f + (rng.next() < x - f ? 1 : 0);
}

/** One offseason for one player: a year older, ratings moved. */
export function developPlayer(rng: Rng, player: Player): Player {
  const age = player.age + 1;
  const ovr = playerOverall(player);
  // A player-level swing (a great offseason or a lost one) on top of the curve.
  const growth = expectedGrowth(player.position, age, ovr, player.potential, player.devTrait) + rng.normal(0, 1.5);
  const weighted = OVERALL_WEIGHTS[player.position];

  const ratings = {} as Ratings;
  for (const key of RATING_KEYS) {
    let delta = key in weighted ? growth + rng.normal(0, 1.2) : 0.3 * growth + rng.normal(0, 0.8);
    if (PHYSICAL.has(key) && age > PHYSICAL_DECLINE_AGE) delta -= 0.5 * (age - PHYSICAL_DECLINE_AGE);
    if (MENTAL.has(key) && age <= AWARENESS_GROWTH_UNTIL) delta += 0.8;
    ratings[key] = clampRating(player.ratings[key] + stochasticRound(rng, delta));
  }
  // A season in the league shows everyone what kind of developer he is.
  return { ...player, age, ratings, devTraitRevealed: true };
}

/** Develop every player on a team and rebuild the depth chart. */
export function developTeam(team: Team, seedPrefix: string): Team {
  const roster = team.roster.map((p) => developPlayer(new Rng(`${seedPrefix}:develop:${p.id}`), p));
  return { ...team, roster, depthChart: buildDepthChart(roster) };
}

/**
 * The whole league's offseason development. Returns a new league; the old one
 * is untouched (past seasons stay replayable with the rosters they had).
 */
export function developLeague(league: League): League {
  const prefix = `${league.seed}:${league.season}`;
  const teams: Record<string, Team> = {};
  for (const [abbr, team] of Object.entries(league.teams)) teams[abbr] = developTeam(team, prefix);
  return { ...league, teams };
}
