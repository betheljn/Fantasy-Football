// How coaches show up on the field. Every effect here is exactly neutral for
// a team without staff, and quality effects are measured from an average hire,
// so coaching shifts results between teams rather than across the league.
import type { DefensiveScheme, OffensiveScheme } from "../model/staff.ts";
import type { Team } from "../model/team.ts";
import type { Personnel } from "./formation.ts";

/** Rating of an average staff hire; quality edges are measured from here. */
export const STAFF_AVERAGE = 58;

/** Staff rating edge: 0 for an average hire, +1 about 15 points better. */
export function staffEdge(rating: number | undefined): number {
  if (rating === undefined) return 0;
  return Math.max(-2, Math.min(2, (rating - STAFF_AVERAGE) / 15));
}

export interface OffenseProfile {
  /** Added to the pass probability. */
  passLean: number;
  /** Multipliers on personnel choice weights. */
  personnel: Partial<Record<Personnel, number>>;
  /** Added to the shotgun rate. */
  shotgun: number;
  /** Multiplier on how often the ball goes deep. */
  deep: number;
  /** Multiplier on designed QB runs. */
  qbRun: number;
}

export const NEUTRAL_OFFENSE: OffenseProfile = { passLean: 0, personnel: {}, shotgun: 0, deep: 1, qbRun: 1 };

export const OFFENSE_PROFILES: Record<OffensiveScheme, OffenseProfile> = {
  "West Coast": { passLean: 0.04, personnel: { "11": 1.1 }, shotgun: 0.05, deep: 0.8, qbRun: 1 },
  "Air Raid": { passLean: 0.09, personnel: { "10": 2.2, "11": 1.2, "12": 0.6, "21": 0.4, "13": 0.5 }, shotgun: 0.15, deep: 1.2, qbRun: 1 },
  "Power Run": { passLean: -0.09, personnel: { "12": 1.6, "21": 1.8, "13": 1.5, "10": 0.4, "11": 0.8 }, shotgun: -0.2, deep: 1, qbRun: 0.8 },
  "Spread Option": { passLean: -0.03, personnel: { "10": 1.5, "11": 1.2, "12": 0.7, "21": 0.5 }, shotgun: 0.15, deep: 0.9, qbRun: 2.5 },
  "Pro Style": NEUTRAL_OFFENSE,
};

export interface DefenseProfile {
  /** Multiplier on the chance of blitzing. */
  blitz: number;
  /** Multipliers on coverage weights: man (Cover 0/1), two-high (Cover 2/4), single-high zone (Cover 3). */
  man: number;
  twoHigh: number;
  cover3: number;
}

export const NEUTRAL_DEFENSE: DefenseProfile = { blitz: 1, man: 1, twoHigh: 1, cover3: 1 };

export const DEFENSE_PROFILES: Record<DefensiveScheme, DefenseProfile> = {
  "Blitz Heavy": { blitz: 1.7, man: 1.4, twoHigh: 0.7, cover3: 0.9 },
  "Man Press": { blitz: 1.1, man: 1.6, twoHigh: 0.8, cover3: 0.8 },
  "Two-High Zone": { blitz: 0.7, man: 0.7, twoHigh: 1.7, cover3: 0.9 },
  "Cover 3 Zone": { blitz: 1, man: 0.8, twoHigh: 0.8, cover3: 1.8 },
  Multiple: NEUTRAL_DEFENSE,
};

export function offenseProfile(team: Team | undefined): OffenseProfile {
  const oc = team?.staff?.oc;
  return oc ? OFFENSE_PROFILES[oc.scheme] : NEUTRAL_OFFENSE;
}

export function defenseProfile(team: Team | undefined): DefenseProfile {
  const dc = team?.staff?.dc;
  return dc ? DEFENSE_PROFILES[dc.scheme] : NEUTRAL_DEFENSE;
}

/**
 * Small edges from coordinator quality: offensive play calling and unit
 * coaching against the defensive coordinator's. `run` is added to the run
 * line battle (about yards per carry); `completion` to completion odds.
 */
export function coachingEdges(offense: Team, defense: Team): { run: number; completion: number } {
  const oc = offense.staff?.oc;
  const dc = defense.staff?.dc;
  const ocRun = oc ? staffEdge(oc.runningGame) + 0.5 * staffEdge(oc.playCalling) : 0;
  const ocPass = oc ? staffEdge(oc.passingGame) + 0.5 * staffEdge(oc.playCalling) : 0;
  const dcRun = dc ? staffEdge(dc.runDefense) + 0.5 * staffEdge(dc.playCalling) : 0;
  const dcPass = dc ? staffEdge(dc.passDefense) + 0.5 * staffEdge(dc.playCalling) : 0;
  return { run: 0.15 * (ocRun - dcRun), completion: 0.015 * (ocPass - dcPass) };
}

/** Head coach aggressiveness, -1 (very conservative) to +1 (very aggressive); 0 without staff. */
export function aggression(team: Team | undefined): number {
  const hc = team?.staff?.hc;
  return hc ? Math.max(-1, Math.min(1, (hc.aggressiveness - 50) / 35)) : 0;
}

/** Multiplier on a team's penalty rate from its head coach's discipline. */
export function disciplineFactor(team: Team | undefined): number {
  const hc = team?.staff?.hc;
  return hc ? Math.max(0.7, Math.min(1.35, 1 - 0.25 * staffEdge(hc.discipline))) : 1;
}

/** Chance a head coach misses the right moment for a timeout (0 for average or better). */
export function clockMistakeChance(team: Team | undefined): number {
  const hc = team?.staff?.hc;
  return hc ? Math.max(0, Math.min(0.3, (STAFF_AVERAGE - hc.gameManagement) / 100)) : 0;
}

/** An up-tempo coordinator plays fast even when the game situation doesn't demand it. */
export function playsUpTempo(team: Team | undefined): boolean {
  return (team?.staff?.oc.tempo ?? 0) >= 65;
}
