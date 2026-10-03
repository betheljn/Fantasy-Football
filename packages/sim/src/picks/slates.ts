// Slates: 2-6 over/under picks on the week's board, played for points against
// the house. Every pick has to hit; more picks pay more. Points have no cash
// value and can't be bought: everyone starts with the same balance, and a
// player who's nearly out gets a small weekly top-up so he can keep playing.
import type { BoxScore } from "../stats/boxscore.ts";
import type { GameSummary } from "../league/standings.ts";
import { propValue, type Prop } from "./lines.ts";

export const SLATE_RULES = {
  minPicks: 2,
  maxPicks: 6,
  /** Picks from one game at most (no stacking a single game). */
  perGame: 2,
  minStake: 10,
  /** Points everyone starts with. */
  startingBalance: 1_000,
  /** A balance below `floor` is topped up to it each week. */
  floor: 100,
};

/** Payout multiplier by number of picks (all must hit). Coin-flip props would pay 4x, 8x, 16x, 32x, 64x. */
export const SLATE_PAYOUT: Record<number, number> = { 2: 3, 3: 5, 4: 10, 5: 20, 6: 35 };

export type PickSide = "over" | "under";

export interface SlatePick {
  prop: Prop;
  side: PickSide;
  /** Taken from a radio host: following their pick, or fading it (the other side). */
  via?: { host: string; fade: boolean };
}

/** Your record following and fading each host: picks that hit and missed. */
export function tailRecord(history: readonly SettledSlate[]): Record<string, { follow: [number, number]; fade: [number, number] }> {
  const out: Record<string, { follow: [number, number]; fade: [number, number] }> = {};
  for (const s of history)
    for (const p of s.picks) {
      if (!p.via) continue;
      const r = (out[p.via.host] ??= { follow: [0, 0], fade: [0, 0] });
      const bucket = p.via.fade ? r.fade : r.follow;
      bucket[p.hit ? 0 : 1]++;
    }
  return out;
}

export interface Slate {
  id: string;
  season: number;
  week: number;
  picks: SlatePick[];
  stake: number;
}

export interface SettledPick extends SlatePick {
  /** What the game produced for the prop. */
  value: number;
  hit: boolean;
}

export interface SettledSlate extends Omit<Slate, "picks"> {
  picks: SettledPick[];
  won: boolean;
  /** Points paid back (0 if any pick missed). */
  payout: number;
}

/** Picks on your own players (allowed: overs only). */
export function ownPicks(picks: readonly SlatePick[], own: string | undefined): SlatePick[] {
  return own ? picks.filter((p) => p.prop.team === own) : [];
}

/**
 * What's wrong with a slate (empty = it can be placed). `own` is your team:
 * on your own games only overs on your own players are allowed.
 */
export function slateProblems(picks: readonly SlatePick[], stake: number, balance: number, own?: string, ownGames: ReadonlySet<string> = new Set()): string[] {
  const problems: string[] = [];
  for (const p of picks) {
    if (!ownGames.has(p.prop.game)) continue;
    if (p.prop.kind !== "player" || p.prop.team !== own) problems.push("Your own games are off the board, except overs on your own players.");
    else if (p.side !== "over") problems.push("On your own players, only overs.");
  }
  const { minPicks, maxPicks, perGame, minStake } = SLATE_RULES;
  if (picks.length < minPicks) problems.push(`Pick at least ${minPicks}.`);
  if (picks.length > maxPicks) problems.push(`Pick at most ${maxPicks}.`);
  if (new Set(picks.map((p) => p.prop.id)).size !== picks.length) problems.push("Each prop only once.");
  const byGame = new Map<string, number>();
  for (const p of picks) byGame.set(p.prop.game, (byGame.get(p.prop.game) ?? 0) + 1);
  if ([...byGame.values()].some((n) => n > perGame)) problems.push(`At most ${perGame} picks from one game.`);
  if (!Number.isInteger(stake) || stake < minStake) problems.push(`Play at least ${minStake} points.`);
  if (stake > balance) problems.push("Not enough points.");
  return [...new Set(problems)];
}

/** What a winning slate pays: the stake times the multiplier for its size. */
export function slatePayout(picks: number, stake: number): number {
  return Math.round(stake * (SLATE_PAYOUT[picks] ?? 0));
}

/** Settle a slate from the week's games (box scores by game id). */
export function settleSlate(slate: Slate, games: ReadonlyMap<string, { summary: GameSummary; box: BoxScore }>): SettledSlate {
  const picks = slate.picks.map((p) => {
    const g = games.get(p.prop.game);
    const value = g ? propValue(p.prop, g.summary, g.box) : 0;
    const over = value > p.prop.line;
    return { ...p, value, hit: g ? (p.side === "over" ? over : !over) : false };
  });
  const won = picks.every((p) => p.hit);
  return { ...slate, picks, won, payout: won ? slatePayout(picks.length, slate.stake) : 0 };
}

/** The weekly top-up: a balance under the floor comes back up to it. */
export function topUp(balance: number): number {
  return Math.max(balance, SLATE_RULES.floor);
}
