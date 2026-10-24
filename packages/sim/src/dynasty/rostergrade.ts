// Roster grades, A+ to F: the whole roster, each position group, and the
// traits a team wins with (arm, hands, pass protection, pass rush, coverage).
// Each is the average score of the players in it (an empty spot counts as a
// replacement-level player, so missing depth drags it down), graded on a
// curve against the league: a league-average group is a C. What it shows is
// where a roster is thin or weak, i.e. which players it still needs.
import { ROSTER_TEMPLATE } from "../gen/team-gen.ts";
import { allTeams, type League } from "../league/league.ts";
import { BASE_STARTERS, POSITIONS, type Position } from "../model/positions.ts";
import { playerOverall, type Player } from "../model/player.ts";
import type { RatingKey } from "../model/ratings.ts";
import { ROSTER_MAX } from "../model/team.ts";

export type Grade = "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "C-" | "D+" | "D" | "D-" | "F";

/** What an empty roster spot counts as. */
export const REPLACEMENT_LEVEL = 40;

/** Lower bounds (in standard deviations from the league average) for each grade. */
const GRADE_STEPS: ReadonlyArray<readonly [number, Grade]> = [
  [1.75, "A+"], [1.25, "A"], [0.9, "A-"], [0.6, "B+"], [0.3, "B"], [0.1, "B-"],
  [-0.1, "C+"], [-0.35, "C"], [-0.6, "C-"], [-0.9, "D+"], [-1.25, "D"], [-1.6, "D-"],
];

/** A letter for a score `z` standard deviations from the league average. */
export function letterGrade(z: number): Grade {
  for (const [min, g] of GRADE_STEPS) if (z >= min) return g;
  return "F";
}

/** Team traits: the rating keys that make them, at the starters of these positions. */
export const TRAITS = {
  arm: { label: "Arm", positions: ["QB"], keys: ["throwPower", "shortAccuracy", "mediumAccuracy", "deepAccuracy"] },
  run: { label: "Running game", positions: ["RB"], keys: ["ballCarrierVision", "breakTackle", "elusiveness", "carrying"] },
  hands: { label: "Hands", positions: ["WR", "TE"], keys: ["catching", "catchInTraffic", "spectacularCatch"] },
  routes: { label: "Route running", positions: ["WR", "TE"], keys: ["shortRouteRunning", "mediumRouteRunning", "deepRouteRunning", "release"] },
  speed: { label: "Speed", positions: ["RB", "WR", "CB", "S"], keys: ["speed", "acceleration"] },
  runBlock: { label: "Run blocking", positions: ["OL"], keys: ["runBlockPower", "runBlockFinesse"] },
  passBlock: { label: "Pass protection", positions: ["OL"], keys: ["passBlockPower", "passBlockFinesse"] },
  passRush: { label: "Pass rush", positions: ["DL", "LB"], keys: ["powerMoves", "finesseMoves", "blockShedding"] },
  runD: { label: "Run defense", positions: ["DL", "LB"], keys: ["tackle", "pursuit", "blockShedding", "playRecognition"] },
  coverage: { label: "Coverage", positions: ["CB", "S", "LB"], keys: ["manCoverage", "zoneCoverage", "playRecognition"] },
  tackling: { label: "Tackling", positions: ["DL", "LB", "CB", "S"], keys: ["tackle", "hitPower", "pursuit"] },
  kicking: { label: "Kicking", positions: ["K", "P"], keys: ["kickPower", "kickAccuracy"] },
} as const satisfies Record<string, { label: string; positions: readonly Position[]; keys: readonly RatingKey[] }>;

export type TraitKey = keyof typeof TRAITS;
const TRAIT_KEYS = Object.keys(TRAITS) as TraitKey[];

interface Norm {
  mean: number;
  sd: number;
}

/** The league's averages to grade against. */
export interface RosterNorms {
  overall: Norm;
  positions: Record<Position, Norm>;
  traits: Record<TraitKey, Norm>;
}

export interface GradedScore {
  /** The average player score (0-99). */
  score: number;
  grade: Grade;
}

export interface PositionGrade extends GradedScore {
  position: Position;
  have: number;
  /** A normal roster's count here. */
  target: number;
  starters: number;
  /** Players still needed to reach the normal count. */
  short: number;
}

export interface RosterReport {
  overall: GradedScore;
  positions: PositionGrade[];
  traits: Array<GradedScore & { key: TraitKey; label: string }>;
  /** Positions most in need, worst first: short of players, or graded C- or lower. */
  needs: Position[];
}

const byOverall = (a: Player, b: Player) => playerOverall(b) - playerOverall(a) || a.id.localeCompare(b.id);
const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/** Average of the best `slots` scores, empty spots at replacement level. */
function slotAverage(scores: number[], slots: number): number {
  const top = [...scores].sort((a, b) => b - a).slice(0, slots);
  while (top.length < slots) top.push(REPLACEMENT_LEVEL);
  return mean(top);
}

function rawScores(roster: readonly Player[]): { overall: number; positions: Record<Position, number>; traits: Record<TraitKey, number> } {
  const at = new Map<Position, Player[]>(POSITIONS.map((pos) => [pos, roster.filter((p) => p.position === pos).sort(byOverall)]));
  const positions = {} as Record<Position, number>;
  for (const pos of POSITIONS) positions[pos] = slotAverage(at.get(pos)!.map(playerOverall), ROSTER_TEMPLATE[pos]);
  const traits = {} as Record<TraitKey, number>;
  for (const key of TRAIT_KEYS) {
    const trait = TRAITS[key];
    const scores: number[] = [];
    for (const pos of trait.positions) {
      const starters = at.get(pos)!.slice(0, BASE_STARTERS[pos]);
      for (let i = 0; i < BASE_STARTERS[pos]; i++) {
        const p = starters[i];
        scores.push(p ? mean(trait.keys.map((k) => p.ratings[k])) : REPLACEMENT_LEVEL);
      }
    }
    traits[key] = mean(scores);
  }
  return { overall: slotAverage(roster.map(playerOverall), ROSTER_MAX), positions, traits };
}

/** The league's averages and spreads for every grade (from its current rosters). */
export function rosterNorms(league: League): RosterNorms {
  const all = allTeams(league).map((t) => rawScores(t.roster));
  const norm = (xs: number[]): Norm => {
    const m = mean(xs);
    return { mean: m, sd: Math.max(0.75, Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))) };
  };
  const positions = {} as Record<Position, Norm>;
  for (const pos of POSITIONS) positions[pos] = norm(all.map((s) => s.positions[pos]));
  const traits = {} as Record<TraitKey, Norm>;
  for (const key of TRAIT_KEYS) traits[key] = norm(all.map((s) => s.traits[key]));
  return { overall: norm(all.map((s) => s.overall)), positions, traits };
}

const graded = (score: number, n: Norm): GradedScore => ({ score: Math.round(score * 10) / 10, grade: letterGrade((score - n.mean) / n.sd) });

/** Grade a roster (complete or still being drafted) against the league's norms. */
export function rosterReport(roster: readonly Player[], norms: RosterNorms): RosterReport {
  const raw = rawScores(roster);
  const positions: PositionGrade[] = POSITIONS.map((pos) => {
    const have = roster.filter((p) => p.position === pos).length;
    const target = ROSTER_TEMPLATE[pos];
    return { position: pos, have, target, starters: BASE_STARTERS[pos], short: Math.max(0, target - have), ...graded(raw.positions[pos], norms.positions[pos]) };
  });
  const traits = TRAIT_KEYS.map((key) => ({ key, label: TRAITS[key].label, ...graded(raw.traits[key], norms.traits[key]) }));
  // Worst first: missing starters, then missing depth, then weak grades.
  const z = (p: PositionGrade) => (raw.positions[p.position] - norms.positions[p.position].mean) / norms.positions[p.position].sd;
  const missingStarters = (p: PositionGrade) => Math.max(0, p.starters - p.have);
  const needs = positions
    .filter((p) => p.short > 0 || z(p) < -0.35)
    .sort((a, b) => missingStarters(b) - missingStarters(a) || z(a) - z(b))
    .map((p) => p.position);
  return { overall: graded(raw.overall, norms.overall), positions, traits, needs };
}
