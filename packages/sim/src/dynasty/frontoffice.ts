// How the front office and the head coach shape rosters over time. Every
// effect is neutral for an average staff (and for a team without one), so the
// league's overall talent stays stable while teams diverge.
import type { Team } from "../model/team.ts";
import type { GmPhilosophy } from "../model/staff.ts";
import { Rng } from "../rng.ts";
import { staffEdge } from "../play/coaching.ts";

/** Scouting quality multiplier from the scouting director (1 = average). */
export function scoutingQuality(team: Team | undefined): number {
  const s = team?.staff?.scout;
  return s ? Math.max(0.5, Math.min(1.8, 1 + 0.4 * staffEdge(s.scouting))) : 1;
}

/**
 * A GM's fixed misjudgment of one player, in overall points. The same GM
 * always sees the same player the same (wrong) way; sharp evaluators are
 * off by about a point, poor ones by five or more.
 */
export function evaluationError(team: Team | undefined, playerId: string): number {
  const gm = team?.staff?.gm;
  if (!gm) return 0;
  const sd = Math.max(0.5, Math.min(6, 3 - 1.5 * staffEdge(gm.talentEvaluation)));
  return new Rng(`eval:${gm.id}:${playerId}`).normal(0, sd);
}

/**
 * How much of the gap between the scouting estimate and a player's real value
 * a GM closes with his own eye: 0 for an average evaluator, up to about a third
 * for the best.
 */
export function evaluationInsight(team: Team | undefined): number {
  const gm = team?.staff?.gm;
  return gm ? Math.max(0, Math.min(0.35, 0.2 * staffEdge(gm.talentEvaluation))) : 0;
}

export interface DraftStyle {
  /** Multiplier on how much position need counts. */
  needWeight: number;
  /** Share of draft value from current ability (the rest is potential). */
  overallShare: number;
}

const DRAFT_STYLES: Record<GmPhilosophy, DraftStyle> = {
  "Best Available": { needWeight: 0.4, overallShare: 0.45 },
  "Build Through Need": { needWeight: 1.8, overallShare: 0.45 },
  "Youth Movement": { needWeight: 1, overallShare: 0.3 },
  "Win Now": { needWeight: 1, overallShare: 0.6 },
};

export const NEUTRAL_DRAFT_STYLE: DraftStyle = { needWeight: 1, overallShare: 0.45 };

export function draftStyle(team: Team | undefined): DraftStyle {
  const gm = team?.staff?.gm;
  return gm ? DRAFT_STYLES[gm.philosophy] : NEUTRAL_DRAFT_STYLE;
}

export interface KeepStyle {
  /** Multiplier on expected growth (youth upside). */
  growth: number;
  /** Multiplier on the discount for aging veterans. */
  aging: number;
}

const KEEP_STYLES: Record<GmPhilosophy, KeepStyle> = {
  "Best Available": { growth: 1, aging: 1 },
  "Build Through Need": { growth: 1, aging: 1 },
  "Youth Movement": { growth: 1.3, aging: 1.5 },
  "Win Now": { growth: 0.7, aging: 0.6 },
};

export const NEUTRAL_KEEP_STYLE: KeepStyle = { growth: 1, aging: 1 };

export function keepStyle(team: Team | undefined): KeepStyle {
  const gm = team?.staff?.gm;
  return gm ? KEEP_STYLES[gm.philosophy] : NEUTRAL_KEEP_STYLE;
}

export interface DevelopmentFactor {
  /** Multiplier on growth before a player's peak. */
  growth: number;
  /** Multiplier on decline after it. */
  decline: number;
}

/** The head coach's effect on how his players develop. */
export function developmentFactor(team: Team | undefined): DevelopmentFactor {
  const hc = team?.staff?.hc;
  if (!hc) return { growth: 1, decline: 1 };
  const e = staffEdge(hc.development);
  return { growth: Math.max(0.7, Math.min(1.35, 1 + 0.15 * e)), decline: Math.max(0.8, Math.min(1.2, 1 - 0.1 * e)) };
}
