// Position archetypes: what kind of player someone is. An archetype shifts
// attributes up and down around the player's talent level; generation
// re-centres the shifts so it changes his profile, not his overall.
import type { Position } from "../model/positions.ts";
import type { Ratings } from "../model/ratings.ts";

export interface Archetype {
  name: string;
  /** Relative frequency within the position. */
  weight: number;
  offsets: Partial<Ratings>;
}

export const ARCHETYPES: Record<Position, Archetype[]> = {
  QB: [
    { name: "Field General", weight: 4, offsets: { awareness: 7, shortAccuracy: 4, mediumAccuracy: 4, throwUnderPressure: 3, throwPower: -4, speed: -6, throwOnTheRun: -3 } },
    { name: "Strong Arm", weight: 3, offsets: { throwPower: 9, deepAccuracy: 5, playAction: 3, shortAccuracy: -3, awareness: -2, speed: -3 } },
    { name: "Scrambler", weight: 3, offsets: { speed: 14, acceleration: 10, agility: 8, throwOnTheRun: 9, breakSack: 9, elusiveness: 12, ballCarrierVision: 10, awareness: -4, throwPower: -2 } },
  ],
  RB: [
    { name: "Power Back", weight: 3, offsets: { trucking: 11, breakTackle: 8, stiffArm: 7, strength: 8, carrying: 4, speed: -5, jukeMove: -6, spinMove: -4 } },
    { name: "Elusive Back", weight: 4, offsets: { elusiveness: 8, jukeMove: 11, spinMove: 9, agility: 6, speed: 4, trucking: -9, breakTackle: -4, stiffArm: -4 } },
    { name: "Receiving Back", weight: 3, offsets: { catching: 12, shortRouteRunning: 14, mediumRouteRunning: 10, release: 8, catchInTraffic: 6, trucking: -5, breakTackle: -3 } },
  ],
  WR: [
    { name: "Deep Threat", weight: 3, offsets: { speed: 8, acceleration: 4, deepRouteRunning: 9, spectacularCatch: 6, shortRouteRunning: -5, catchInTraffic: -5, strength: -4 } },
    { name: "Route Runner", weight: 4, offsets: { shortRouteRunning: 8, mediumRouteRunning: 8, release: 7, agility: 5, catching: 3, speed: -3, jumping: -3 } },
    { name: "Physical", weight: 3, offsets: { catchInTraffic: 9, jumping: 7, strength: 10, release: 4, spectacularCatch: 4, speed: -5, agility: -4 } },
  ],
  TE: [
    { name: "Receiving", weight: 4, offsets: { catching: 6, shortRouteRunning: 7, mediumRouteRunning: 7, release: 5, speed: 4, runBlockPower: -8, passBlockPower: -6, leadBlock: -5 } },
    { name: "Blocking", weight: 3, offsets: { runBlockPower: 9, runBlockFinesse: 5, passBlockPower: 7, leadBlock: 7, strength: 7, catching: -6, speed: -5, release: -4 } },
    { name: "Vertical", weight: 2, offsets: { speed: 7, deepRouteRunning: 12, spectacularCatch: 7, jumping: 6, runBlockPower: -5, passBlockPower: -4 } },
  ],
  OL: [
    { name: "Power", weight: 4, offsets: { runBlockPower: 8, passBlockPower: 6, strength: 6, impactBlocking: 5, runBlockFinesse: -4, passBlockFinesse: -4, agility: -4 } },
    { name: "Agile", weight: 3, offsets: { runBlockFinesse: 8, passBlockFinesse: 7, agility: 7, strength: -5, runBlockPower: -4 } },
    { name: "Pass Protector", weight: 3, offsets: { passBlockPower: 5, passBlockFinesse: 7, awareness: 3, runBlockPower: -5, runBlockFinesse: -3, impactBlocking: -3 } },
  ],
  DL: [
    { name: "Power Rusher", weight: 3, offsets: { powerMoves: 11, strength: 6, hitPower: 4, finesseMoves: -7, speed: -3 } },
    { name: "Speed Rusher", weight: 3, offsets: { finesseMoves: 11, speed: 7, acceleration: 7, strength: -7, blockShedding: -4 } },
    { name: "Run Stopper", weight: 4, offsets: { blockShedding: 9, strength: 6, tackle: 5, playRecognition: 3, powerMoves: -4, finesseMoves: -7 } },
  ],
  LB: [
    { name: "Field General", weight: 3, offsets: { playRecognition: 9, awareness: 7, zoneCoverage: 3, speed: -3, powerMoves: -3 } },
    { name: "Pass Coverage", weight: 3, offsets: { zoneCoverage: 9, manCoverage: 8, speed: 5, blockShedding: -7, hitPower: -5 } },
    { name: "Run Stopper", weight: 4, offsets: { tackle: 6, blockShedding: 9, hitPower: 7, strength: 4, zoneCoverage: -6, manCoverage: -5 } },
  ],
  CB: [
    { name: "Man to Man", weight: 4, offsets: { manCoverage: 8, press: 8, speed: 2, zoneCoverage: -6 } },
    { name: "Zone", weight: 3, offsets: { zoneCoverage: 9, playRecognition: 7, catching: 4, manCoverage: -6, press: -4 } },
    { name: "Slot", weight: 3, offsets: { agility: 7, acceleration: 6, manCoverage: 3, tackle: 3, press: -5, jumping: -4 } },
  ],
  S: [
    { name: "Zone", weight: 4, offsets: { zoneCoverage: 9, playRecognition: 6, catching: 4, hitPower: -5, tackle: -2 } },
    { name: "Run Support", weight: 3, offsets: { tackle: 8, hitPower: 9, pursuit: 5, zoneCoverage: -6, manCoverage: -5 } },
    { name: "Hybrid", weight: 3, offsets: { manCoverage: 8, speed: 4, press: 5, playRecognition: -3 } },
  ],
  K: [
    { name: "Accurate", weight: 1, offsets: { kickAccuracy: 6, kickPower: -5 } },
    { name: "Power", weight: 1, offsets: { kickPower: 7, kickAccuracy: -5 } },
  ],
  P: [
    { name: "Accurate", weight: 1, offsets: { kickAccuracy: 6, kickPower: -5 } },
    { name: "Power", weight: 1, offsets: { kickPower: 7, kickAccuracy: -5 } },
  ],
  LS: [{ name: "Long Snapper", weight: 1, offsets: {} }],
};
