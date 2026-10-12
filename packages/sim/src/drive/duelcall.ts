// The play duel's AI: how a coach picks a concept before the snap (rules 4).
// Each side starts from its playbook (the scheme of whoever calls that side),
// shaped by the situation; then it leans to the calls that beat what it
// expects from the other side. What it expects starts from scouting (the
// other side's playbook) and moves toward what it has seen them call in this
// game, in the same kind of situation. Better play callers read tendencies
// faster and lean on them harder; nobody is predictable enough to be sure.
import type { DefensiveScheme, OffensiveScheme } from "../model/staff.ts";
import type { Team } from "../model/team.ts";
import { starters } from "../model/team.ts";
import type { Rng } from "../rng.ts";
import { avg, clamp, edge } from "../play/common.ts";
import { playCallers, staffEdge } from "../play/coaching.ts";
import {
  DEFENSE_CONCEPT_INFO,
  EDGE_TABLE,
  DEFENSE_CONCEPTS,
  OFFENSE_CONCEPT_INFO,
  OFFENSE_CONCEPTS,
  type DefenseConcept,
  type OffenseConcept,
} from "../play/concepts.ts";
import type { Situation } from "../play/events.ts";
import type { Coverage, OffenseSet, Personnel } from "../play/formation.ts";

/** Kinds of situation tendencies are kept by. */
export type DuelBucket = "early" | "short" | "medium" | "long" | "goal";
export const DUEL_BUCKETS: readonly DuelBucket[] = ["early", "short", "medium", "long", "goal"];

export function duelBucket(s: Situation): DuelBucket {
  if (100 - s.yardline <= 10) return "goal";
  if (s.distance <= 2 && (s.down >= 3 || s.distance <= 1)) return "short";
  if (s.down >= 3) return s.distance >= 7 ? "long" : "medium";
  return s.distance >= 11 ? "long" : "early";
}

type Weights<K extends string> = Record<K, number>;

/** What each team has called in this game, by situation (counts in concept order): the film both sides are reading. */
export interface DuelBook {
  offense: Record<string, Partial<Record<DuelBucket, number[]>>>;
  defense: Record<string, Partial<Record<DuelBucket, number[]>>>;
}

export function newDuelBook(): DuelBook {
  return { offense: {}, defense: {} };
}

/** Log the calls on a snap. */
export function recordCalls(book: DuelBook, offense: string, defense: string, s: Situation, off: OffenseConcept, def: DefenseConcept): void {
  const b = duelBucket(s);
  ((book.offense[offense] ??= {})[b] ??= OFFENSE_CONCEPTS.map(() => 0))[OFF_INDEX[off]]! += 1;
  ((book.defense[defense] ??= {})[b] ??= DEFENSE_CONCEPTS.map(() => 0))[DEF_INDEX[def]]! += 1;
}

const OFF_INDEX = Object.fromEntries(OFFENSE_CONCEPTS.map((c, i) => [c, i])) as Record<OffenseConcept, number>;
const DEF_INDEX = Object.fromEntries(DEFENSE_CONCEPTS.map((c, i) => [c, i])) as Record<DefenseConcept, number>;

// --- playbooks: what each scheme likes to call ---

const RUNS: OffenseConcept[] = ["inside_run", "outside_run", "draw"];
const PASSES: OffenseConcept[] = ["screen", "quick", "intermediate", "deep_shot", "play_action"];

/** Run and pass mixes by situation (each sums to 1 within its kind). */
const OFFENSE_BASE: Record<DuelBucket, Partial<Weights<OffenseConcept>>> = {
  early: { inside_run: 0.45, outside_run: 0.37, draw: 0.18, screen: 0.12, quick: 0.55, intermediate: 0.13, deep_shot: 0.09, play_action: 0.11 },
  short: { inside_run: 0.65, outside_run: 0.25, draw: 0.1, screen: 0.08, quick: 0.64, intermediate: 0.08, deep_shot: 0.06, play_action: 0.14 },
  medium: { inside_run: 0.4, outside_run: 0.3, draw: 0.3, screen: 0.1, quick: 0.58, intermediate: 0.2, deep_shot: 0.07, play_action: 0.05 },
  long: { inside_run: 0.3, outside_run: 0.25, draw: 0.45, screen: 0.12, quick: 0.44, intermediate: 0.27, deep_shot: 0.13, play_action: 0.04 },
  goal: { inside_run: 0.6, outside_run: 0.3, draw: 0.1, screen: 0.08, quick: 0.57, intermediate: 0.12, deep_shot: 0.06, play_action: 0.17 },
};

const OFFENSE_SCHEME: Record<OffensiveScheme, Partial<Weights<OffenseConcept>>> = {
  "West Coast": { quick: 1.3, screen: 1.3, intermediate: 1.1, deep_shot: 0.75 },
  "Air Raid": { deep_shot: 1.4, intermediate: 1.2, quick: 1.1, play_action: 0.6, inside_run: 0.8, draw: 1.2 },
  "Power Run": { inside_run: 1.4, play_action: 1.6, outside_run: 0.8, screen: 0.8, draw: 0.8 },
  "Spread Option": { outside_run: 1.4, draw: 1.3, screen: 1.2, play_action: 0.9, inside_run: 0.8 },
  "Pro Style": {},
};

/** Defensive mixes by situation (each sums to 1). */
const DEFENSE_BASE: Record<DuelBucket, Weights<DefenseConcept>> = {
  early: { base: 0.22, run_blitz: 0.13, pass_blitz: 0.06, man_press: 0.17, cover_2: 0.14, cover_3: 0.13, cover_4: 0.15 },
  short: { base: 0.2, run_blitz: 0.33, pass_blitz: 0.1, man_press: 0.2, cover_2: 0.05, cover_3: 0.1, cover_4: 0.02 },
  medium: { base: 0.12, run_blitz: 0.07, pass_blitz: 0.17, man_press: 0.23, cover_2: 0.13, cover_3: 0.18, cover_4: 0.1 },
  long: { base: 0.07, run_blitz: 0.04, pass_blitz: 0.12, man_press: 0.16, cover_2: 0.23, cover_3: 0.14, cover_4: 0.24 },
  goal: { base: 0.16, run_blitz: 0.24, pass_blitz: 0.14, man_press: 0.3, cover_2: 0.1, cover_3: 0.06, cover_4: 0 },
};

/** Late, protecting a lead with a long field to cover: nothing deep. */
const PREVENT: Weights<DefenseConcept> = { base: 0, run_blitz: 0, pass_blitz: 0, man_press: 0, cover_2: 0.3, cover_3: 0.1, cover_4: 0.6 };

const DEFENSE_SCHEME: Record<DefensiveScheme, Partial<Weights<DefenseConcept>>> = {
  "Blitz Heavy": { run_blitz: 1.6, pass_blitz: 1.8, man_press: 1.3, cover_2: 0.7, cover_4: 0.7 },
  "Man Press": { man_press: 1.8, pass_blitz: 1.1, run_blitz: 1.1, cover_2: 0.8, cover_3: 0.8, cover_4: 0.8 },
  "Two-High Zone": { cover_2: 1.7, cover_4: 1.7, run_blitz: 0.6, pass_blitz: 0.6, man_press: 0.7 },
  "Cover 3 Zone": { base: 1.5, cover_3: 1.8, cover_2: 0.8, cover_4: 0.8, man_press: 0.8 },
  Multiple: {},
};

/** Heavy sets lean run, spread sets pass: how each personnel group tilts what a defense expects. */
const PERSONNEL_RUN: Record<Personnel, number> = { "10": 0.6, "11": 0.9, "12": 1.25, "13": 1.8, "21": 1.4 };

// The tables as rows of numbers in concept order (each snap weighs every one of them).
const offRow = (w: Partial<Weights<OffenseConcept>>, fill: number) => OFFENSE_CONCEPTS.map((c) => w[c] ?? fill);
const defRow = (w: Partial<Weights<DefenseConcept>>, fill: number) => DEFENSE_CONCEPTS.map((c) => w[c] ?? fill);
const OFF_BASE = Object.fromEntries(DUEL_BUCKETS.map((b) => [b, offRow(OFFENSE_BASE[b], 0)])) as Record<DuelBucket, number[]>;
const DEF_BASE = Object.fromEntries(DUEL_BUCKETS.map((b) => [b, defRow(DEFENSE_BASE[b], 0)])) as Record<DuelBucket, number[]>;
const OFF_SCHEME = Object.fromEntries(Object.entries(OFFENSE_SCHEME).map(([k, w]) => [k, offRow(w, 1)])) as Record<OffensiveScheme, number[]>;
const DEF_SCHEME = Object.fromEntries(Object.entries(DEFENSE_SCHEME).map(([k, w]) => [k, defRow(w, 1)])) as Record<DefensiveScheme, number[]>;
const NO_SCHEME_OFF = offRow({}, 1);
const NO_SCHEME_DEF = defRow({}, 1);
const PREVENT_ROW = defRow(PREVENT, 0);
const IS_RUN = OFFENSE_CONCEPTS.map((c) => OFFENSE_CONCEPT_INFO[c].kind === "run");
const PA = OFF_INDEX.play_action;
const DRAW = OFF_INDEX.draw;
const SCREEN = OFF_INDEX.screen;
const MAN = DEFENSE_CONCEPTS.map((c) => DEFENSE_CONCEPT_INFO[c].coverage === "cover_0" || DEFENSE_CONCEPT_INFO[c].coverage === "cover_1");
const RUN_FRONT = DEFENSE_CONCEPTS.map((c) => c === "run_blitz" || c === "base");
const TWO_DEEP = DEFENSE_CONCEPTS.map((c) => c === "cover_2" || c === "cover_4");

function normalize(w: number[]): number[] {
  let total = 0;
  for (const x of w) total += x;
  if (total > 0) for (let i = 0; i < w.length; i++) w[i]! /= total;
  return w;
}

const offenseScheme = (team: Team) => (team.staff ? OFF_SCHEME[playCallers(team.staff).oc.scheme] : NO_SCHEME_OFF);
const defenseScheme = (team: Team) => (team.staff ? DEF_SCHEME[playCallers(team.staff).dc.scheme] : NO_SCHEME_DEF);

/**
 * How well a side's play caller reads and exploits tendencies: 0 for an
 * average one (and for no staff). A film-junkie head coach adds to it; a
 * halftime adjuster adds more after the break.
 */
export function callerSkill(team: Team, side: "offense" | "defense", s?: Situation): number {
  if (!team.staff) return 0;
  const c = playCallers(team.staff);
  const hc = team.staff.hc.abilities ?? [];
  const film = hc.includes("film_junkie") ? 0.5 : 0;
  const halftime = hc.includes("halftime_adjuster") && s && s.quarter >= 3 ? 0.75 : 0;
  return staffEdge(side === "offense" ? c.oc.playCalling : c.dc.playCalling) + film + halftime;
}

/** What the offense likes to call here for a run or a pass (its playbook, before any reading of the defense), in concept order. */
export function offensePlaybook(team: Team, s: Situation, kind: "run" | "pass", set?: OffenseSet): number[] {
  const base = OFF_BASE[duelBucket(s)];
  const scheme = offenseScheme(team);
  const run = kind === "run";
  const w = base.map((x, i) => (IS_RUN[i] === run ? x * scheme[i]! : 0));
  // Play action sells from under center; draws and screens live in the shotgun.
  if (set) {
    w[PA]! *= set === "under_center" ? 1.6 : 0.6;
    w[DRAW]! *= set === "shotgun" ? 1.2 : 0.8;
    w[SCREEN]! *= set === "shotgun" ? 1.2 : 0.8;
  }
  return normalize(w);
}

/** Corners better in man than in zone mean more man (kept per team: it's read every snap). */
const manLeanCache = new WeakMap<Team, number>();
function manLean(team: Team): number {
  let lean = manLeanCache.get(team);
  if (lean === undefined) {
    const corners = starters(team, "CB", 2);
    lean = corners.length
      ? clamp(1 + 0.03 * (avg(corners, (p) => p.ratings.manCoverage) - avg(corners, (p) => p.ratings.zoneCoverage)) + 0.15 * edge(avg(corners, (p) => p.ratings.manCoverage)), 0.7, 1.5)
      : 1;
    manLeanCache.set(team, lean);
  }
  return lean;
}

/** What the defense likes to call here (its playbook), given what it can see of the offense, in concept order. */
export function defensePlaybook(team: Team, s: Situation, personnel: Personnel | undefined, prevent: boolean): number[] {
  if (prevent) return PREVENT_ROW;
  const base = DEF_BASE[duelBucket(s)];
  const scheme = defenseScheme(team);
  const lean = manLean(team);
  const runTilt = personnel ? PERSONNEL_RUN[personnel] : 1;
  return normalize(base.map((x, i) => x * scheme[i]! * (MAN[i] ? lean : 1) * (RUN_FRONT[i] ? runTilt : 1) / (TWO_DEEP[i] ? runTilt : 1)));
}

/**
 * What one side expects the other to call: scouting (its playbook) blended
 * with what it has called in this game in this kind of situation. A sharper
 * caller trusts the film sooner.
 */
function expect(prior: number[], seen: number[] | undefined, skill: number, disguised = false): number[] {
  let n = 0;
  if (seen) for (const x of seen) n += x;
  if (!n) return prior;
  // How many snaps of film count as much as the scouting report (a disguised defense takes more).
  const trust = clamp(6 - 2 * skill, 2, 10) + (disguised ? 4 : 0);
  return prior.map((p, i) => (p * trust + seen![i]!) / (trust + n));
}

/** How hard a caller leans toward the calls that beat what it expects. */
const lean = (skill: number) => clamp(1 + 0.4 * skill, 0.3, 1.8);

export interface OffenseRead {
  /** The concept for a run call and for a pass call (whichever the play turns out to be). */
  run: OffenseConcept;
  pass: OffenseConcept;
}

/**
 * The offense's concept for this snap, one for each kind (the run/pass call
 * itself is made by the play caller as always). One random draw, so the same
 * snap always reads the same.
 */
export function chooseOffenseConcepts(rng: Rng, offense: Team, defense: Team, s: Situation, book: DuelBook | undefined, set: OffenseSet, personnel: Personnel, prevent: boolean): OffenseRead {
  const skill = callerSkill(offense, "offense", s);
  const disguised = defense.staff?.dc.abilities?.includes("disguise") ?? false;
  const expected = expect(defensePlaybook(defense, s, personnel, prevent), book?.defense[defense.abbr]?.[duelBucket(s)], skill, disguised);
  const k = lean(skill);
  // How each concept fares against what the defense is expected to call.
  const pull = EDGE_TABLE.map((row) => {
    let e = 0;
    for (let j = 0; j < row.length; j++) e += expected[j]! * row[j]!;
    return Math.exp(k * e);
  });
  const u = rng.next();
  const pick = (kind: "run" | "pass") => byDraw(OFFENSE_CONCEPTS, offensePlaybook(offense, s, kind, set).map((w, i) => w * pull[i]!), u);
  return { run: pick("run"), pass: pick("pass") };
}

/** The defense's concept for this snap: it sees the offense's personnel and alignment, never its call. */
export function chooseDefenseConcept(rng: Rng, defense: Team, offense: Team, s: Situation, book: DuelBook | undefined, personnel: Personnel, set: OffenseSet, passChance: number, prevent: boolean): DefenseConcept {
  const play = defensePlaybook(defense, s, personnel, prevent);
  const u = rng.next();
  if (prevent) return byDraw(DEFENSE_CONCEPTS, play, u);
  const skill = callerSkill(defense, "defense", s);
  // Scouting: the offense's playbook here, split by how often it throws from this look.
  const runs = offensePlaybook(offense, s, "run", set);
  const passes = offensePlaybook(offense, s, "pass", set);
  const prior = runs.map((r, i) => (IS_RUN[i] ? r * (1 - passChance) : passes[i]! * passChance));
  const expected = expect(prior, book?.offense[offense.abbr]?.[duelBucket(s)], skill);
  const k = lean(skill);
  const w = play.map((x, j) => {
    let e = 0;
    for (let i = 0; i < EDGE_TABLE.length; i++) e += expected[i]! * EDGE_TABLE[i]![j]!;
    return x * Math.exp(-k * e);
  });
  return byDraw(DEFENSE_CONCEPTS, w, u);
}

function byDraw<T>(items: readonly T[], weights: readonly number[], u: number): T {
  let total = 0;
  for (const w of weights) total += Math.max(0, w);
  let x = u * total;
  for (let i = 0; i < items.length; i++) {
    x -= Math.max(0, weights[i]!);
    if (x < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/** The concept a coverage and blitz amount to (for a defensive call made the old way). */
export function conceptForFormation(coverage: Coverage, blitz: number): DefenseConcept {
  if (coverage === "cover_0" || blitz >= 2) return "pass_blitz";
  if (blitz >= 1) return "run_blitz";
  if (coverage === "cover_1") return "man_press";
  if (coverage === "cover_2") return "cover_2";
  if (coverage === "cover_4") return "cover_4";
  return "base";
}

/** The run/pass call a concept belongs to. */
export const conceptKind = (c: OffenseConcept) => OFFENSE_CONCEPT_INFO[c].kind;
export { RUNS as RUN_CONCEPTS, PASSES as PASS_CONCEPTS };
