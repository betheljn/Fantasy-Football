// The salary cap: a hard cap that grows with league revenue, a floor teams
// must spend to, and what each player is worth on the open market.
// Money is in $ thousands.
import { capHit } from "../model/contract.ts";
import { playerOverall, type Player } from "../model/player.ts";
import type { Position } from "../model/positions.ts";
import type { Team } from "../model/team.ts";
import { Rng } from "../rng.ts";

export const CAP_RULES = {
  /** Cap in the first season, $K. */
  baseCap: 300_000,
  baseSeason: 2031,
  /** Yearly revenue growth range. */
  growth: [0.03, 0.06] as const,
  /** Share of the cap every team must spend. */
  floor: 0.85,
  /** Most unused cap that can roll into next season, as a share of the cap. */
  maxRollover: 0.1,
  /** League minimum salary as a share of the cap. */
  minimumShare: 0.0033,
};

/**
 * The cap for `season`. Grows each year by a seeded 3-6% (league revenue), so
 * every league has its own cap history but the same seed always gives the same one.
 */
export function salaryCap(seed: string, season: number): number {
  let cap = CAP_RULES.baseCap;
  for (let s = CAP_RULES.baseSeason + 1; s <= season; s++) {
    const [lo, hi] = CAP_RULES.growth;
    cap *= 1 + lo + (hi - lo) * new Rng(`${seed}:cap:${s}`).next();
  }
  for (let s = CAP_RULES.baseSeason; s > season; s--) cap /= 1.045;
  return Math.round(cap / 100) * 100;
}

export const minimumSalary = (cap: number) => Math.round((cap * CAP_RULES.minimumShare) / 10) * 10;
export const capFloor = (cap: number) => Math.round(cap * CAP_RULES.floor);

/** What the very best player at each position earns, as a share of the cap. */
export const TOP_OF_MARKET: Record<Position, number> = {
  QB: 0.18, DL: 0.12, WR: 0.12, CB: 0.1, OL: 0.09, LB: 0.08, S: 0.075, TE: 0.07, RB: 0.06, K: 0.02, P: 0.016, LS: 0.008,
};

/** Overall where market value starts rising above the minimum, and where it tops out. */
export const MARKET_CURVE = { floorOverall: 48, topOverall: 92, power: 1.8 };

/**
 * A player's yearly value on the open market: rises steeply with overall (the
 * league pays for stars), scaled by position, discounted for age past 29.
 * Uses only what the league can see: current overall, age and a revealed
 * development trait (never hidden potential).
 */
export function marketValue(player: Player, cap: number): number {
  const min = minimumSalary(cap);
  const trait = player.devTraitRevealed ? { normal: 0, impact: 1, star: 2, elite: 3 }[player.devTrait] : 0;
  const ovr = playerOverall(player) + trait;
  const { floorOverall, topOverall, power } = MARKET_CURVE;
  const f = Math.max(0, Math.min(1.1, (ovr - floorOverall) / (topOverall - floorOverall)));
  const ageFactor = player.age <= 29 ? 1 : Math.max(0.35, 1 - 0.09 * (player.age - 29));
  const top = TOP_OF_MARKET[player.position] * cap;
  return Math.max(min, Math.round((min + (top - min) * f ** power) * ageFactor / 10) * 10);
}

/** Total cap hits on the roster for `season`, plus any dead money and rollover the team carries. */
export function payroll(team: Team, season: number): number {
  const players = team.roster.reduce((s, p) => s + (p.contract ? capHit(p.contract, season) : 0), 0);
  return players + (team.cap?.deadMoney ?? 0);
}

/** Room under the cap (the cap plus any rollover, minus payroll). */
export function capSpace(team: Team, cap: number, season: number): number {
  return cap + (team.cap?.rollover ?? 0) - payroll(team, season);
}
