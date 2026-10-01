import type { Position } from "./positions.ts";

export const RATING_MIN = 0;
export const RATING_MAX = 99;

/**
 * Every player carries every attribute (Madden-style); position weights decide
 * which ones count toward his overall, and the sim reads the ones that matter
 * for each moment of a play.
 */
export const RATING_KEYS = [
  // physical
  "speed", "acceleration", "agility", "strength", "jumping", "stamina",
  // mental
  "awareness", "playRecognition",
  // ball carrier
  "carrying", "ballCarrierVision", "breakTackle", "trucking", "elusiveness", "jukeMove", "spinMove", "stiffArm",
  // receiving
  "catching", "catchInTraffic", "spectacularCatch", "shortRouteRunning", "mediumRouteRunning", "deepRouteRunning", "release",
  // passing
  "throwPower", "shortAccuracy", "mediumAccuracy", "deepAccuracy", "throwOnTheRun", "throwUnderPressure", "playAction", "breakSack",
  // blocking
  "runBlockPower", "runBlockFinesse", "passBlockPower", "passBlockFinesse", "impactBlocking", "leadBlock",
  // defense
  "tackle", "hitPower", "pursuit", "manCoverage", "zoneCoverage", "press", "blockShedding", "powerMoves", "finesseMoves",
  // special teams
  "kickPower", "kickAccuracy", "kickReturn", "snapping",
] as const;

export type RatingKey = (typeof RATING_KEYS)[number];

export type Ratings = Record<RatingKey, number>;

type Weights = Partial<Record<RatingKey, number>>;

export type RatingGroup = "Physical" | "Mental" | "Ball Carrier" | "Receiving" | "Passing" | "Blocking" | "Defense" | "Special Teams";

/** Display metadata: Madden-style abbreviation, full name, and group. */
export const RATING_INFO: Record<RatingKey, { abbr: string; name: string; group: RatingGroup }> = {
  speed: { abbr: "SPD", name: "Speed", group: "Physical" },
  acceleration: { abbr: "ACC", name: "Acceleration", group: "Physical" },
  agility: { abbr: "AGI", name: "Agility", group: "Physical" },
  strength: { abbr: "STR", name: "Strength", group: "Physical" },
  jumping: { abbr: "JMP", name: "Jumping", group: "Physical" },
  stamina: { abbr: "STA", name: "Stamina", group: "Physical" },
  awareness: { abbr: "AWR", name: "Awareness", group: "Mental" },
  playRecognition: { abbr: "PRC", name: "Play Recognition", group: "Mental" },
  carrying: { abbr: "CAR", name: "Carrying", group: "Ball Carrier" },
  ballCarrierVision: { abbr: "BCV", name: "Ball Carrier Vision", group: "Ball Carrier" },
  breakTackle: { abbr: "BTK", name: "Break Tackle", group: "Ball Carrier" },
  trucking: { abbr: "TRK", name: "Trucking", group: "Ball Carrier" },
  elusiveness: { abbr: "ELU", name: "Elusiveness", group: "Ball Carrier" },
  jukeMove: { abbr: "JKM", name: "Juke Move", group: "Ball Carrier" },
  spinMove: { abbr: "SPM", name: "Spin Move", group: "Ball Carrier" },
  stiffArm: { abbr: "SFA", name: "Stiff Arm", group: "Ball Carrier" },
  catching: { abbr: "CTH", name: "Catching", group: "Receiving" },
  catchInTraffic: { abbr: "CIT", name: "Catch in Traffic", group: "Receiving" },
  spectacularCatch: { abbr: "SPC", name: "Spectacular Catch", group: "Receiving" },
  shortRouteRunning: { abbr: "SRR", name: "Short Route Running", group: "Receiving" },
  mediumRouteRunning: { abbr: "MRR", name: "Medium Route Running", group: "Receiving" },
  deepRouteRunning: { abbr: "DRR", name: "Deep Route Running", group: "Receiving" },
  release: { abbr: "RLS", name: "Release", group: "Receiving" },
  throwPower: { abbr: "THP", name: "Throw Power", group: "Passing" },
  shortAccuracy: { abbr: "SAC", name: "Short Accuracy", group: "Passing" },
  mediumAccuracy: { abbr: "MAC", name: "Medium Accuracy", group: "Passing" },
  deepAccuracy: { abbr: "DAC", name: "Deep Accuracy", group: "Passing" },
  throwOnTheRun: { abbr: "TOR", name: "Throw on the Run", group: "Passing" },
  throwUnderPressure: { abbr: "TUP", name: "Throw Under Pressure", group: "Passing" },
  playAction: { abbr: "PAC", name: "Play Action", group: "Passing" },
  breakSack: { abbr: "BSK", name: "Break Sack", group: "Passing" },
  runBlockPower: { abbr: "RBP", name: "Run Block Power", group: "Blocking" },
  runBlockFinesse: { abbr: "RBF", name: "Run Block Finesse", group: "Blocking" },
  passBlockPower: { abbr: "PBP", name: "Pass Block Power", group: "Blocking" },
  passBlockFinesse: { abbr: "PBF", name: "Pass Block Finesse", group: "Blocking" },
  impactBlocking: { abbr: "IBL", name: "Impact Blocking", group: "Blocking" },
  leadBlock: { abbr: "LBK", name: "Lead Block", group: "Blocking" },
  tackle: { abbr: "TAK", name: "Tackle", group: "Defense" },
  hitPower: { abbr: "POW", name: "Hit Power", group: "Defense" },
  pursuit: { abbr: "PUR", name: "Pursuit", group: "Defense" },
  manCoverage: { abbr: "MCV", name: "Man Coverage", group: "Defense" },
  zoneCoverage: { abbr: "ZCV", name: "Zone Coverage", group: "Defense" },
  press: { abbr: "PRS", name: "Press", group: "Defense" },
  blockShedding: { abbr: "BSH", name: "Block Shedding", group: "Defense" },
  powerMoves: { abbr: "PMV", name: "Power Moves", group: "Defense" },
  finesseMoves: { abbr: "FMV", name: "Finesse Moves", group: "Defense" },
  kickPower: { abbr: "KPW", name: "Kick Power", group: "Special Teams" },
  kickAccuracy: { abbr: "KAC", name: "Kick Accuracy", group: "Special Teams" },
  kickReturn: { abbr: "KR", name: "Kick Return", group: "Special Teams" },
  snapping: { abbr: "SNP", name: "Long Snapping", group: "Special Teams" },
};

/** Relative weights used to compute a position overall. Normalised at use time. */
export const OVERALL_WEIGHTS: Record<Position, Weights> = {
  QB: { shortAccuracy: 16, mediumAccuracy: 16, deepAccuracy: 12, throwPower: 14, awareness: 16, throwUnderPressure: 8, throwOnTheRun: 5, playAction: 4, breakSack: 3, speed: 3, agility: 2 },
  RB: { speed: 14, acceleration: 10, agility: 7, ballCarrierVision: 12, elusiveness: 10, jukeMove: 6, spinMove: 3, breakTackle: 10, trucking: 6, stiffArm: 4, carrying: 8, catching: 5, stamina: 3, awareness: 2 },
  WR: { speed: 15, acceleration: 7, agility: 6, catching: 14, catchInTraffic: 7, spectacularCatch: 6, shortRouteRunning: 9, mediumRouteRunning: 10, deepRouteRunning: 9, release: 7, jumping: 4, elusiveness: 3, awareness: 3 },
  TE: { catching: 12, catchInTraffic: 8, shortRouteRunning: 6, mediumRouteRunning: 6, release: 5, runBlockPower: 9, runBlockFinesse: 5, passBlockPower: 6, passBlockFinesse: 4, leadBlock: 4, strength: 9, speed: 8, breakTackle: 5, awareness: 8 },
  OL: { runBlockPower: 16, runBlockFinesse: 12, passBlockPower: 16, passBlockFinesse: 16, impactBlocking: 8, strength: 16, awareness: 10, agility: 4, stamina: 2 },
  DL: { powerMoves: 16, finesseMoves: 14, blockShedding: 18, strength: 14, tackle: 10, pursuit: 6, playRecognition: 8, acceleration: 8, speed: 4, hitPower: 2 },
  LB: { tackle: 16, pursuit: 12, playRecognition: 14, blockShedding: 8, zoneCoverage: 10, manCoverage: 4, speed: 10, hitPower: 6, powerMoves: 3, finesseMoves: 3, awareness: 6, strength: 4, acceleration: 4 },
  CB: { manCoverage: 20, zoneCoverage: 16, press: 8, speed: 16, acceleration: 8, agility: 8, playRecognition: 8, catching: 4, jumping: 4, tackle: 4, awareness: 4 },
  S: { zoneCoverage: 18, manCoverage: 10, tackle: 12, hitPower: 6, pursuit: 8, playRecognition: 14, speed: 12, acceleration: 6, catching: 4, jumping: 4, awareness: 6 },
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
/** Overall ratings already worked out: a player's ratings object never changes once he is built. */
const overallCache = new WeakMap<Ratings, Partial<Record<Position, number>>>();

export function overall(position: Position, ratings: Ratings): number {
  let byPos = overallCache.get(ratings);
  const hit = byPos?.[position];
  if (hit !== undefined) return hit;
  const weights = OVERALL_WEIGHTS[position];
  let total = 0;
  let weightSum = 0;
  for (const [key, weight] of Object.entries(weights) as [RatingKey, number][]) {
    total += ratings[key] * weight;
    weightSum += weight;
  }
  const value = clampRating(total / weightSum);
  if (!byPos) overallCache.set(ratings, (byPos = {}));
  byPos[position] = value;
  return value;
}

// --- composites the sim uses where several attributes combine ----------------

export const runBlocking = (r: Ratings) => (r.runBlockPower + r.runBlockFinesse) / 2;
export const passBlocking = (r: Ratings) => (r.passBlockPower + r.passBlockFinesse) / 2;
/** A rusher leans on his better move. */
export const passRushing = (r: Ratings) => Math.max(r.powerMoves, r.finesseMoves) * 0.7 + Math.min(r.powerMoves, r.finesseMoves) * 0.3;
/** Holding the point against the run. */
export const runDefense = (r: Ratings) => r.blockShedding * 0.45 + r.tackle * 0.3 + r.playRecognition * 0.25;
export const coverageSkill = (r: Ratings, man: boolean) => (man ? r.manCoverage : r.zoneCoverage);
export const routeRunning = (r: Ratings) => (r.shortRouteRunning + r.mediumRouteRunning + r.deepRouteRunning) / 3;
export const accuracy = (r: Ratings) => (r.shortAccuracy + r.mediumAccuracy + r.deepAccuracy) / 3;
