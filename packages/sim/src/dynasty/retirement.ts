// Retirements: decided right after the season, before players age a year.
//
// The chance a player retires rises with years past his position's peak and
// falls with how good he still is (good players keep getting paid to play).
// Anyone at the age limit retires.
import type { Position } from "../model/positions.ts";
import { playerOverall, type Player } from "../model/player.ts";
import { buildDepthChart, type Team } from "../model/team.ts";
import { Rng } from "../rng.ts";
import type { League } from "../league/league.ts";
import { PEAK_AGES } from "./development.ts";

/** Everyone retires at this age. */
export const MAX_AGE: Record<Position, number> = {
  QB: 40, RB: 36, WR: 38, TE: 38, OL: 38, DL: 38, LB: 38, CB: 37, S: 38, K: 42, P: 42, LS: 42,
};

/** Logistic model coefficients (see retirementChance). */
export const RETIREMENT_MODEL = { base: -3, perYearPastPeak: 0.55, perOverallPoint: 0.08, pivotOverall: 60 };

export interface Retiree {
  player: Player;
  team: string;
  /** Overall in his final season. */
  overall: number;
}

export interface RetirementResult {
  league: League;
  retirees: Retiree[];
}

/**
 * Chance a player retires this offseason. At the end of his peak window a
 * 60-rated player retires about 5% of the time; three years later, about 21%
 * (an 80-rated one, about 5%).
 */
export function retirementChance(player: Player): number {
  if (player.age >= MAX_AGE[player.position]) return 1;
  const yearsPastPeak = player.age - PEAK_AGES[player.position][1];
  const m = RETIREMENT_MODEL;
  const logit = m.base + m.perYearPastPeak * yearsPastPeak - m.perOverallPoint * (playerOverall(player) - m.pivotOverall);
  return 1 / (1 + Math.exp(-logit));
}

/**
 * Decide retirements for the whole league. Returns a new league without the
 * retirees (depth charts rebuilt) and the list of who retired. Rosters may now
 * be short at some positions; the draft and roster moves refill them before
 * the next season.
 */
export function processRetirements(league: League): RetirementResult {
  const retirees: Retiree[] = [];
  const teams: Record<string, Team> = {};
  for (const [abbr, team] of Object.entries(league.teams)) {
    const keep: Player[] = [];
    for (const p of team.roster) {
      const rng = new Rng(`${league.seed}:${league.season}:retire:${p.id}`);
      if (rng.chance(retirementChance(p))) retirees.push({ player: p, team: abbr, overall: playerOverall(p) });
      else keep.push(p);
    }
    teams[abbr] = { ...team, roster: keep, depthChart: buildDepthChart(keep) };
  }
  return { league: { ...league, teams }, retirees };
}
