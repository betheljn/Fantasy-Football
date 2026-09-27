import type { Position } from "./positions.ts";

export const RATING_MIN = 0;
export const RATING_MAX = 99;

/** Every player carries every rating; position weights decide which ones matter. */
export const RATING_KEYS = [
  // physical / mental
  "speed",
  "acceleration",
  "strength",
  "agility",
  "awareness",
  "stamina",
  // passing
  "throwPower",
  "throwAccuracy",
  // ball carrying
  "carrying",
  "elusiveness",
  "breakTackle",
  // receiving
  "catching",
  "routeRunning",
  // blocking
  "runBlock",
  "passBlock",
  // defense
  "passRush",
  "runStop",
  "tackling",
  "coverage",
  // specialists
  "kickPower",
  "kickAccuracy",
  "snapping",
] as const;

export type RatingKey = (typeof RATING_KEYS)[number];

export type Ratings = Record<RatingKey, number>;

type Weights = Partial<Record<RatingKey, number>>;

/** Relative weights used to compute a position overall. Normalised at use time. */
export const OVERALL_WEIGHTS: Record<Position, Weights> = {
  QB: { throwAccuracy: 30, throwPower: 20, awareness: 25, agility: 5, speed: 5, carrying: 5, strength: 5, stamina: 5 },
  RB: { speed: 18, acceleration: 14, elusiveness: 16, breakTackle: 14, carrying: 12, catching: 8, agility: 8, awareness: 5, stamina: 5 },
  WR: { speed: 20, catching: 22, routeRunning: 22, acceleration: 10, agility: 10, awareness: 8, stamina: 4, elusiveness: 4 },
  TE: { catching: 18, routeRunning: 12, runBlock: 16, passBlock: 10, strength: 12, speed: 10, awareness: 10, breakTackle: 6, stamina: 6 },
  OL: { runBlock: 30, passBlock: 30, strength: 20, awareness: 10, agility: 5, stamina: 5 },
  DL: { passRush: 25, runStop: 25, strength: 20, acceleration: 10, tackling: 10, awareness: 5, stamina: 5 },
  LB: { tackling: 22, runStop: 18, coverage: 14, speed: 12, awareness: 14, passRush: 8, strength: 6, stamina: 6 },
  CB: { coverage: 32, speed: 22, acceleration: 12, agility: 12, awareness: 10, catching: 4, tackling: 4, stamina: 4 },
  S: { coverage: 24, tackling: 18, speed: 16, awareness: 16, runStop: 10, acceleration: 8, catching: 4, stamina: 4 },
  K: { kickPower: 45, kickAccuracy: 50, awareness: 5 },
  P: { kickPower: 50, kickAccuracy: 45, awareness: 5 },
  LS: { snapping: 70, awareness: 15, strength: 15 },
};

export function clampRating(value: number): number {
  return Math.max(RATING_MIN, Math.min(RATING_MAX, Math.round(value)));
}

/** A ratings object with every key set to `base` (default 50), overridden by `overrides`. */
export function makeRatings(overrides: Partial<Ratings> = {}, base = 50): Ratings {
  const ratings = {} as Ratings;
  for (const key of RATING_KEYS) {
    ratings[key] = clampRating(overrides[key] ?? base);
  }
  return ratings;
}

/** Weighted position overall, 0-99. */
export function overall(position: Position, ratings: Ratings): number {
  const weights = OVERALL_WEIGHTS[position];
  let total = 0;
  let weightSum = 0;
  for (const [key, weight] of Object.entries(weights) as [RatingKey, number][]) {
    total += ratings[key] * weight;
    weightSum += weight;
  }
  return clampRating(total / weightSum);
}
