import type { Player } from "../model/player.ts";
import type { Team } from "../model/team.ts";
import type { Rng } from "../rng.ts";
import type { Direction, Fumble, Situation, StopReason, Turnover } from "./events.ts";
import type { DefensePersonnel } from "./personnel.ts";

/** Everything a single play needs. Plays never mutate this. */
export interface PlayContext {
  offense: Team;
  defense: Team;
  situation: Situation;
}

/** Rating of a typical starter; the baseline all edges are measured from. */
export const AVG_STARTER = 65;

/** Rating edge: 0 at an average starter, +1 about 15 points better. */
export function edge(rating: number): number {
  return (rating - AVG_STARTER) / 15;
}

export function avg(players: readonly Player[], pick: (p: Player) => number): number {
  return players.reduce((s, p) => s + pick(p), 0) / players.length;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function weightedPick<T>(rng: Rng, items: readonly T[], weight: (item: T) => number): T {
  const weights = items.map((i) => Math.max(0, weight(i)));
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/** Exponentially distributed value with the given mean (long-tail gains). */
export function exponential(rng: Rng, mean: number): number {
  return -mean * Math.log(1 - rng.next());
}

export function pickDirection(rng: Rng): Direction {
  const r = rng.next();
  return r < 0.35 ? "left" : r < 0.65 ? "middle" : "right";
}

/** Where the ball ends up and what that means for scoring and the chains. */
export function spotBall(sit: Situation, rawYards: number) {
  const raw = sit.yardline + Math.round(rawYards);
  const touchdown = raw >= 100;
  const safety = raw <= 0;
  const endYardline = clamp(raw, 0, 100);
  const yardsGained = endYardline - sit.yardline;
  return {
    yardsGained,
    endYardline,
    touchdown,
    safety,
    firstDown: !touchdown && !safety && yardsGained >= sit.distance,
  };
}

/** Defender credited with the tackle; who is likelier depends on how far the play went. */
export function pickTackler(rng: Rng, d: DefensePersonnel, yards: number): Player {
  const posWeight = (p: Player): number => {
    const byDepth =
      yards <= 3
        ? { DL: 3, LB: 3, CB: 0.5, S: 0.5 }
        : yards <= 10
          ? { DL: 1, LB: 3, CB: 1.5, S: 1.5 }
          : { DL: 0.2, LB: 1, CB: 2, S: 3 };
    return (byDepth[p.position as keyof typeof byDepth] ?? 0) * (p.ratings.tackling + p.ratings.speed) / 2;
  };
  return weightedPick(rng, d.all, posWeight);
}

/**
 * Roll for a fumble by the ball carrier. Returns null if none. Recovery is
 * roughly a coin flip, slightly favouring the offense.
 */
export function rollFumble(
  rng: Rng,
  carrier: Player,
  forcedBy: Player | null,
  defense: DefensePersonnel,
  baseRate: number,
): Fumble | null {
  const rate = baseRate * clamp(1 - 0.5 * edge(carrier.ratings.carrying), 0.4, 1.8);
  if (!rng.chance(rate)) return null;
  const lost = rng.chance(0.47);
  const recoveredBy = lost ? rng.pick(defense.all) : carrier;
  return { by: carrier.id, forcedBy: forcedBy?.id ?? null, recoveredBy: recoveredBy.id, lost };
}

/**
 * Change of possession at `spot` (old-offense perspective), with a return.
 * Returns are measured toward the old offense's end zone.
 */
export function buildTurnover(
  rng: Rng,
  type: Turnover["type"],
  by: Player,
  spot: number,
  returnMean: number,
): Turnover {
  const catchSpot = 100 - spot; // new offense perspective
  if (type === "interception" && catchSpot <= 0 && rng.chance(0.7)) {
    return { type, by: by.id, returnYards: 0, endYardline: 20, touchdown: false, touchback: true };
  }
  let returnYards = Math.max(0, Math.round(rng.normal(returnMean, returnMean)));
  // Occasional long return: the defender breaks into the open.
  if (rng.chance(0.06)) returnYards += Math.round(20 + rng.next() * 60);
  const end = Math.max(0, catchSpot) + returnYards;
  if (end >= 100) {
    return { type, by: by.id, returnYards: 100 - Math.max(0, catchSpot), endYardline: 100, touchdown: true, touchback: false };
  }
  if (end <= 0) {
    return { type, by: by.id, returnYards, endYardline: 20, touchdown: false, touchback: true };
  }
  return { type, by: by.id, returnYards, endYardline: end, touchdown: false, touchback: false };
}

/** A lost fumble becomes a turnover at the spot, with a short return. */
export function fumbleTurnover(rng: Rng, fumble: Fumble, defenders: readonly Player[], spot: number): Turnover {
  const recoverer = defenders.find((p) => p.id === fumble.recoveredBy);
  if (!recoverer) throw new Error(`Fumble recovered by ${fumble.recoveredBy}, who is not on defense`);
  return buildTurnover(rng, "fumble", recoverer, spot, 3);
}

export function stopReasonFor(r: {
  touchdown: boolean;
  safety: boolean;
  turnover: Turnover | null;
  outOfBounds: boolean;
  incomplete?: boolean;
}): StopReason | null {
  if (r.turnover) return r.turnover.touchdown ? "touchdown" : "turnover";
  if (r.touchdown) return "touchdown";
  if (r.safety) return "safety";
  if (r.incomplete) return "incomplete";
  if (r.outOfBounds) return "out_of_bounds";
  return null;
}

