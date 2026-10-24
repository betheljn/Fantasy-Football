// The play duel's vocabulary: the concept each side calls before the snap,
// and how each offensive concept fares against each defensive one. The
// matchup gives the play a small edge (offense's point of view, -2 to +2)
// with a reason for the reveal; the players' ratings still decide most of it.
// A play carries concepts only under rules 4 and later (see PlayContext).
import type { Coverage } from "./formation.ts";

export type OffenseConcept = "inside_run" | "outside_run" | "draw" | "screen" | "quick" | "intermediate" | "deep_shot" | "play_action";
export type DefenseConcept = "base" | "run_blitz" | "pass_blitz" | "man_press" | "cover_2" | "cover_3" | "cover_4";

export const OFFENSE_CONCEPTS: readonly OffenseConcept[] = ["inside_run", "outside_run", "draw", "screen", "quick", "intermediate", "deep_shot", "play_action"];
export const DEFENSE_CONCEPTS: readonly DefenseConcept[] = ["base", "run_blitz", "pass_blitz", "man_press", "cover_2", "cover_3", "cover_4"];

/** Throw depths the pass engine knows. */
export type ConceptBand = "screen" | "short" | "intermediate" | "deep";

export interface OffenseConceptInfo {
  label: string;
  note: string;
  kind: "run" | "pass";
  /** Runs: where it goes. */
  direction?: "middle" | "edge";
  /** Passes: how deep the ball goes. */
  band?: ConceptBand;
  /** Sells the run first (play action from any alignment). */
  playAction?: boolean;
  /** The ball comes out fast (fewer sacks). */
  quickRelease?: boolean;
  /** Passes: sack chance against an average one (quick throws get it out, long developing ones hold it). */
  sackFactor?: number;
}

export const OFFENSE_CONCEPT_INFO: Record<OffenseConcept, OffenseConceptInfo> = {
  inside_run: { label: "Inside run", note: "Downhill between the tackles", kind: "run", direction: "middle" },
  outside_run: { label: "Outside run", note: "Stretch to the edge", kind: "run", direction: "edge" },
  draw: { label: "Draw", note: "Show pass, hand it off late", kind: "run", direction: "middle" },
  screen: { label: "Screen", note: "Let them rush, dump it behind them", kind: "pass", band: "screen", quickRelease: true, sackFactor: 0.78 },
  quick: { label: "Quick game", note: "Three-step drop, out in a beat", kind: "pass", band: "short", quickRelease: true, sackFactor: 0.97 },
  intermediate: { label: "Intermediate", note: "Digs and crossers in the middle", kind: "pass", band: "intermediate", sackFactor: 1.12 },
  deep_shot: { label: "Deep shot", note: "Go routes and posts", kind: "pass", band: "deep", sackFactor: 1.25 },
  play_action: { label: "Play action", note: "Fake the run, throw over the top", kind: "pass", band: "intermediate", playAction: true, sackFactor: 1.15 },
};

export interface DefenseConceptInfo {
  label: string;
  note: string;
  coverage: Coverage;
  /** Extra rushers. */
  blitz: number;
}

export const DEFENSE_CONCEPT_INFO: Record<DefenseConcept, DefenseConceptInfo> = {
  base: { label: "Base", note: "Sound and balanced, single-high", coverage: "cover_3", blitz: 0 },
  run_blitz: { label: "Run blitz", note: "A linebacker shoots the gap", coverage: "cover_1", blitz: 1 },
  pass_blitz: { label: "Pass blitz", note: "Two extra rushers, man behind it", coverage: "cover_0", blitz: 2 },
  man_press: { label: "Man press", note: "Jam them at the line", coverage: "cover_1", blitz: 0 },
  cover_2: { label: "Cover 2", note: "Two deep halves, squat corners", coverage: "cover_2", blitz: 0 },
  cover_3: { label: "Cover 3", note: "Three deep, rally to the ball", coverage: "cover_3", blitz: 0 },
  cover_4: { label: "Cover 4", note: "Quarters: nothing deep", coverage: "cover_4", blitz: 0 },
};

/** Columns, in DEFENSE_CONCEPTS order. */
const TABLE: Record<OffenseConcept, readonly number[]> = {
  //            base run_blz pass_blz man  cov2 cov3 cov4
  inside_run:   [0,   -2,      1,      1,   1,   0,   2],
  outside_run:  [0,   -1,      1,      0,   1,  -1,   1],
  draw:         [0,   -1,      2,      1,   0,   0,   1],
  screen:       [0,    1,      2,     -1,  -1,   0,   1],
  quick:        [0,    1,      2,     -1,   0,   1,   1],
  intermediate: [0,    1,      0,      0,   1,  -1,  -1],
  deep_shot:    [0,    2,     -1,      1,  -2,  -1,  -2],
  play_action:  [0,    2,     -1,      1,  -1,   1,  -1],
};

/** Why the big matchups go the way they do (anything not here is an even call). */
const WHY: Partial<Record<`${OffenseConcept}:${DefenseConcept}`, string>> = {
  "inside_run:run_blitz": "The run blitz shot the gap the run was going to.",
  "inside_run:cover_4": "Two deep safeties left a light box to run into.",
  "inside_run:pass_blitz": "The blitzers ran past the run.",
  "outside_run:run_blitz": "The blitz closed the edge early.",
  "outside_run:cover_3": "The extra safety rolled down to the edge.",
  "draw:pass_blitz": "The rush ran right past the handoff.",
  "screen:pass_blitz": "The rush ran right past the screen.",
  "screen:man_press": "Press coverage sniffed out the screen.",
  "screen:cover_2": "The squat corners sat on the screen.",
  "quick:pass_blitz": "The ball was out before the blitz got home.",
  "quick:man_press": "The jam at the line killed the timing.",
  "intermediate:cover_2": "The hole between the corners and safeties was wide open.",
  "intermediate:cover_3": "The underneath zones closed the window.",
  "intermediate:cover_4": "Quarters took away the middle.",
  "deep_shot:run_blitz": "One-on-one outside with no help over the top.",
  "deep_shot:cover_2": "A safety was over the top.",
  "deep_shot:cover_4": "Four deep: nowhere to go.",
  "deep_shot:pass_blitz": "The blitz got home before the routes did.",
  "deep_shot:man_press": "Man coverage with one safety: a chance deep.",
  "play_action:run_blitz": "The linebackers bit hard on the fake.",
  "play_action:cover_3": "The fake pulled the curl defenders up.",
  "play_action:pass_blitz": "Nobody bites on the fake when they're already coming.",
};

/** The edge table as rows of numbers (OFFENSE_CONCEPTS by DEFENSE_CONCEPTS), for callers that weigh every matchup. */
export const EDGE_TABLE: readonly (readonly number[])[] = OFFENSE_CONCEPTS.map((c) => TABLE[c]);

export interface ConceptMatchup {
  /** The offense's edge, -2 (badly beaten) to +2 (right call). */
  edge: number;
  why: string | null;
}

/** How an offensive concept fares against a defensive one. */
export function conceptMatchup(offense: OffenseConcept, defense: DefenseConcept): ConceptMatchup {
  const edge = TABLE[offense][DEFENSE_CONCEPTS.indexOf(defense)]!;
  return { edge, why: WHY[`${offense}:${defense}`] ?? null };
}

/** How much a matchup edge moves the play (per point of edge). */
export const CONCEPT_EFFECT = {
  /** Mean run yards. */
  runYards: 0.6,
  /** Chance of a big run. */
  breakaway: 0.008,
  /** Completion chance. */
  completion: 0.025,
  /** Sack chance (more edge, fewer sacks). */
  sack: 0.008,
  /** Yards after the catch (half again for screens and quick throws, which live on them). */
  yac: 1.0,
} as const;

/** The calls on a play (rules 4 and later). */
export interface PlayConcepts {
  offense: OffenseConcept;
  defense: DefenseConcept;
}
