// Scouting: each team's own, gradually sharpening view of a draft class.
//
// Knowledge of a prospect is a number from 0 to 1 per team. It grows by itself
// over the season (film, word of mouth) and faster where the team spends its
// weekly scouting points. Every attribute is shown as a range that always
// contains the true value; the range narrows as knowledge grows. Each team's
// range sits at its own fixed offset around the truth, so teams disagree about
// prospects without anyone being told something false.
//
// After the season the combine measures physical attributes exactly for all.
import { BASE_STARTERS, POSITIONS, type Position } from "../model/positions.ts";
import { playerOverall, type DevTrait, type Player, type PlayerId } from "../model/player.ts";
import { OVERALL_WEIGHTS, RATING_KEYS, type RatingKey } from "../model/ratings.ts";
import { hashString } from "../rng.ts";
import type { League } from "../league/league.ts";
import { REGULAR_SEASON_WEEKS } from "../league/schedule.ts";
import { leagueFormat } from "../league/format.ts";

/** How many weeks this scouting runs: the regular season it was started in. */
export function seasonWeeks(state: Pick<ScoutingState, "weeks">): number {
  return state.weeks ?? REGULAR_SEASON_WEEKS;
}
import { draftValue, type DraftClass, type Prospect } from "./draftclass.ts";
import { scoutingQuality } from "./frontoffice.ts";
import { recruitingWeek, type RecruitingChoices } from "./recruiting.ts";

export const SCOUTING = {
  pointsPerWeek: 12,
  /** Points spent per prospect in one go by AI teams. */
  chunk: 3,
  /** Knowledge every team gains on every prospect over a full season without trying. */
  automaticBySeasonEnd: 0.35,
  /** Points for ~63% knowledge from focus alone (1 - e^-1). */
  pointsScale: 20,
  /** Knowledge at which a team can tell a prospect's development trait. */
  devTraitAt: 0.8,
  /** Range width at zero knowledge, for attributes and for potential. */
  attributeWidth: 24,
  potentialWidth: 30,
};

/** Measured at the combine: known exactly by every team afterwards. */
export const COMBINE_ATTRIBUTES: readonly RatingKey[] = ["speed", "acceleration", "agility", "strength", "jumping"];

export interface ScoutingState {
  /** League seed and the draft class season (for deterministic offsets). */
  seed: string;
  classSeason: number;
  /** Weeks of scouting done (0 to the regular season length). */
  week: number;
  /** The regular season's length in weeks (absent: 22, from before league formats). */
  weeks?: number;
  combineDone: boolean;
  /** team -> prospect -> points spent. */
  focus: Record<string, Record<PlayerId, number>>;
  /** team -> scout quality multiplier on points (1 = average staff). */
  quality: Record<string, number>;
  /** Recruiting: team -> prospect -> his interest in the program, 0-100 (absent: from before recruiting). */
  interest?: Record<string, Record<PlayerId, number>>;
}

export interface RangeEstimate {
  low: number;
  high: number;
  /** Midpoint: the team's best guess. */
  estimate: number;
  exact: boolean;
}

export interface ScoutingReport {
  prospect: Prospect;
  team: string;
  knowledge: number;
  attributes: Record<RatingKey, RangeEstimate>;
  overall: RangeEstimate;
  potential: RangeEstimate;
  /** Null until the team knows enough (or the trait is public). */
  devTrait: DevTrait | null;
}

export function createScouting(league: League, draftClass: DraftClass): ScoutingState {
  const teams = Object.keys(league.teams);
  return {
    seed: league.seed,
    classSeason: draftClass.season,
    week: 0,
    weeks: leagueFormat(league).weeks,
    combineDone: false,
    focus: Object.fromEntries(teams.map((t) => [t, {}])),
    // The scouting director sets how much each point teaches the department.
    quality: Object.fromEntries(teams.map((t) => [t, scoutingQuality(league.teams[t])])),
  };
}

/** A team's knowledge of a prospect, 0 to 1. */
export function knowledge(state: ScoutingState, team: string, prospect: PlayerId): number {
  const auto = SCOUTING.automaticBySeasonEnd * Math.min(1, state.week / seasonWeeks(state));
  const points = (state.focus[team]?.[prospect] ?? 0) * (state.quality[team] ?? 1);
  const fromFocus = 1 - Math.exp(-points / SCOUTING.pointsScale);
  return 1 - (1 - auto) * (1 - fromFocus);
}

/**
 * A team's fixed offset for one prospect on one rating (0-1): where the true
 * value sits inside the range its scouts see. Hashed straight from who is
 * looking at whom, so only the offsets an estimate uses are ever computed.
 * Index RATING_KEYS.length is the potential's offset.
 */
function offset(base: number, index: number): number {
  let h = (base + Math.imul(index + 1, 0x9e3779b9)) | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// By league and class, then team, then prospect (no key strings to build on a hit).
const baseCache = new Map<string, Map<string, Map<PlayerId, number>>>();
let baseCount = 0;
function offsetBase(state: ScoutingState, team: string, prospect: PlayerId): number {
  const cls = `${state.seed}:${state.classSeason}`;
  let byTeam = baseCache.get(cls);
  if (!byTeam) {
    if (baseCount > 100_000) {
      baseCache.clear();
      baseCount = 0;
    }
    baseCache.set(cls, (byTeam = new Map()));
  }
  let byProspect = byTeam.get(team);
  if (!byProspect) byTeam.set(team, (byProspect = new Map()));
  const cached = byProspect.get(prospect);
  if (cached !== undefined) return cached;
  const b = hashString(`scout:${cls}:${team}:${prospect}`);
  byProspect.set(prospect, b);
  baseCount++;
  return b;
}

function range(truth: number, width: number, offset: number): RangeEstimate {
  const w = Math.max(0, Math.round(width));
  if (w === 0) return { low: truth, high: truth, estimate: truth, exact: true };
  let low = truth - Math.round(offset * w);
  let high = low + w;
  if (low < 0) [low, high] = [0, w];
  if (high > 99) [low, high] = [99 - w, 99];
  return { low, high, estimate: (low + high) / 2, exact: false };
}

/** range(...).estimate without building the range (the same numbers). */
function rangeEstimate(truth: number, width: number, offset: number): number {
  const w = Math.max(0, Math.round(width));
  if (w === 0) return truth;
  let low = truth - Math.round(offset * w);
  let high = low + w;
  if (low < 0) [low, high] = [0, w];
  if (high > 99) [low, high] = [99 - w, 99];
  return (low + high) / 2;
}

/** Width of a range at a given knowledge level. Never quite zero until measured. */
function width(full: number, k: number): number {
  return Math.max(2, full * Math.pow(1 - k, 1.2));
}

export function scoutingReport(state: ScoutingState, team: string, prospect: Prospect): ScoutingReport {
  const p = prospect.player;
  const k = knowledge(state, team, p.id);
  const base = offsetBase(state, team, p.id);
  const attributes = {} as Record<RatingKey, RangeEstimate>;
  RATING_KEYS.forEach((key, i) => {
    const measured = state.combineDone && COMBINE_ATTRIBUTES.includes(key);
    attributes[key] = measured ? range(p.ratings[key], 0, 0) : range(p.ratings[key], width(SCOUTING.attributeWidth, k), offset(base, i));
  });
  // Overall: the position formula applied to the ends and middle of the ranges.
  const weights = Object.entries(OVERALL_WEIGHTS[p.position]) as [RatingKey, number][];
  const total = weights.reduce((s, [, w]) => s + w, 0);
  const blend = (f: (r: RangeEstimate) => number) => weights.reduce((s, [key, w]) => s + f(attributes[key]) * w, 0) / total;
  const overall: RangeEstimate = {
    low: Math.round(blend((r) => r.low)),
    high: Math.round(blend((r) => r.high)),
    estimate: blend((r) => r.estimate),
    exact: weights.every(([key]) => attributes[key].exact),
  };
  const potential = range(p.potential, width(SCOUTING.potentialWidth, k), offset(base, RATING_KEYS.length));
  const devTrait = p.devTraitRevealed || k >= SCOUTING.devTraitAt ? p.devTrait : null;
  return { prospect, team, knowledge: k, attributes, overall, potential, devTrait };
}

/**
 * Just the numbers a board needs (estimated overall and potential), without
 * building every attribute range: much cheaper when ranking whole classes.
 */
type Estimate = { overall: number; potential: number; knowledge: number };

/**
 * One team's view of a class in one week, set up once: its estimates so far,
 * its offsets, and what its knowledge depends on. Boards ask for every
 * prospect for every team each week, so nothing here is looked up per prospect
 * that could be looked up once.
 */
interface TeamScout {
  estimates: Map<PlayerId, Estimate>;
  bases: Map<PlayerId, number>;
  cls: string;
  team: string;
  focus: Record<PlayerId, number> | undefined;
  quality: number;
  auto: number;
  combineDone: boolean;
}

const scoutCache = new WeakMap<ScoutingState, Map<string, TeamScout>>();

function teamScout(state: ScoutingState, team: string): TeamScout {
  let byTeam = scoutCache.get(state);
  if (!byTeam) scoutCache.set(state, (byTeam = new Map()));
  let ts = byTeam.get(team);
  if (ts) return ts;
  const cls = `${state.seed}:${state.classSeason}`;
  let byClass = baseCache.get(cls);
  if (!byClass) {
    if (baseCount > 100_000) {
      baseCache.clear();
      baseCount = 0;
    }
    baseCache.set(cls, (byClass = new Map()));
  }
  let bases = byClass.get(team);
  if (!bases) byClass.set(team, (bases = new Map()));
  ts = {
    estimates: new Map(),
    bases,
    cls,
    team,
    focus: state.focus[team],
    quality: state.quality[team] ?? 1,
    // As in knowledge(): the same numbers, worked out once.
    auto: SCOUTING.automaticBySeasonEnd * Math.min(1, state.week / seasonWeeks(state)),
    combineDone: state.combineDone,
  };
  byTeam.set(team, ts);
  return ts;
}

export function quickEstimate(state: ScoutingState, team: string, prospect: Prospect): Estimate {
  const ts = teamScout(state, team);
  const id = prospect.player.id;
  const hit = ts.estimates.get(id);
  if (hit) return hit;
  const value = computeEstimate(ts, prospect);
  ts.estimates.set(id, value);
  return value;
}

function computeEstimate(ts: TeamScout, prospect: Prospect): Estimate {
  const p = prospect.player;
  const id = p.id;
  // knowledge(), with the team's lookups already done.
  const points = (ts.focus?.[id] ?? 0) * ts.quality;
  const fromFocus = 1 - Math.exp(-points / SCOUTING.pointsScale);
  const k = 1 - (1 - ts.auto) * (1 - fromFocus);
  let base = ts.bases.get(id);
  if (base === undefined) {
    base = hashString(`scout:${ts.cls}:${ts.team}:${id}`);
    ts.bases.set(id, base);
    baseCount++;
  }
  const wAttr = width(SCOUTING.attributeWidth, k);
  const f = WEIGHTED[p.position];
  const ratings = p.ratings;
  let sum = 0;
  for (let i = 0; i < f.keys.length; i++) {
    const key = f.keys[i]!;
    sum += (ts.combineDone && f.combine[i] ? ratings[key] : rangeEstimate(ratings[key], wAttr, offset(base, f.index[i]!))) * f.weight[i]!;
  }
  const potential = rangeEstimate(p.potential, width(SCOUTING.potentialWidth, k), offset(base, RATING_KEYS.length));
  return { overall: sum / f.total, potential, knowledge: k };
}

/** Each position's overall weights, column by column: the rating, its offset index, its weight, whether the combine measures it; and the weights' total. */
interface Weighted {
  keys: RatingKey[];
  index: number[];
  weight: number[];
  combine: boolean[];
  total: number;
}
const WEIGHTED = {} as Record<Position, Weighted>;
for (const pos of POSITIONS) {
  const entries = Object.entries(OVERALL_WEIGHTS[pos]) as [RatingKey, number][];
  // The total summed in the same order as the estimate's loop always summed it.
  let total = 0;
  for (const [, w] of entries) total += w;
  WEIGHTED[pos] = {
    keys: entries.map(([key]) => key),
    index: entries.map(([key]) => RATING_KEYS.indexOf(key)),
    weight: entries.map(([, w]) => w),
    combine: entries.map(([key]) => COMBINE_ATTRIBUTES.includes(key)),
    total,
  };
}

export interface BoardEntry {
  prospect: Prospect;
  /** This team's estimates (midpoints of its ranges) and how well it knows him. */
  overall: number;
  potential: number;
  knowledge: number;
  /** Draft value from this team's estimates. */
  value: number;
  rank: number;
}

/** A team's own big board: prospects ranked by its estimates. Use scoutingReport for the full detail. */
export function teamBoard(state: ScoutingState, draftClass: DraftClass, team: string, available?: ReadonlySet<PlayerId>): BoardEntry[] {
  const entries: BoardEntry[] = [];
  for (const prospect of draftClass.prospects) {
    if (available && !available.has(prospect.player.id)) continue;
    const est = quickEstimate(state, team, prospect);
    entries.push({ prospect, ...est, value: draftValue(prospect.player.position, est.overall, est.potential), rank: 0 });
  }
  entries.sort((a, b) => b.value - a.value || a.prospect.player.id.localeCompare(b.prospect.player.id));
  entries.forEach((e, i) => (e.rank = i + 1));
  return entries;
}

/**
 * How much a team needs each position: starters (plus one backup) who are good
 * and not about to age out, against how many it needs. 0 = set, 1 = empty.
 */
export function positionNeeds(team: { roster: readonly Player[] }): Record<Position, number> {
  const needs = {} as Record<Position, number>;
  for (const pos of POSITIONS) {
    const want = BASE_STARTERS[pos] + 1;
    const solid = team.roster.filter((p) => p.position === pos && playerOverall(p) >= 60 && p.age <= 30).length;
    needs[pos] = Math.max(0, want - solid) / want;
  }
  return needs;
}

/** Where an AI team spends this week's points: high on its board, at positions of need, not yet well known. */
export function aiScoutingChoices(state: ScoutingState, league: League, draftClass: DraftClass, team: string): Array<{ prospect: PlayerId; points: number }> {
  const needs = positionNeeds(league.teams[team]!);
  const board = draftClass.prospects
    .map((prospect) => ({ prospect, est: quickEstimate(state, team, prospect) }))
    .filter((e) => e.est.knowledge < 0.85)
    .map((e) => {
      const pos = e.prospect.player.position;
      return { id: e.prospect.player.id, priority: draftValue(pos, e.est.overall, e.est.potential) * (1 + 0.15 * needs[pos]) };
    })
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const picks = Math.floor(SCOUTING.pointsPerWeek / SCOUTING.chunk);
  return board.slice(0, picks).map((e) => ({ prospect: e.id, points: SCOUTING.chunk }));
}

/**
 * One week of scouting. Teams in `choices` spend their points as given (up to
 * the weekly allowance); every other team scouts on its own.
 */
export function advanceScoutingWeek(
  state: ScoutingState,
  league: League,
  draftClass: DraftClass,
  choices: Record<string, Array<{ prospect: PlayerId; points: number }>> = {},
  /** Recruiting: teams people run spend their week's points as given (everyone else recruits on its own). */
  recruiting: RecruitingChoices = {},
): ScoutingState {
  if (state.week >= seasonWeeks(state)) return state;
  // Recruiting first (from where interest stood): its visits are scouting looks too.
  const recruited = recruitingWeek(state, league, draftClass, (team, p) => quickEstimate(state, team, p), recruiting);
  const focus: ScoutingState["focus"] = {};
  for (const team of Object.keys(state.focus)) {
    const spend = choices[team] ?? aiScoutingChoices(state, league, draftClass, team);
    const mine = { ...state.focus[team] };
    let left = SCOUTING.pointsPerWeek;
    for (const { prospect, points } of spend) {
      const p = Math.min(points, left);
      if (p <= 0) break;
      mine[prospect] = (mine[prospect] ?? 0) + p;
      left -= p;
    }
    for (const [prospect, pts] of Object.entries(recruited.visits[team] ?? {})) mine[prospect] = (mine[prospect] ?? 0) + pts;
    focus[team] = mine;
  }
  return { ...state, week: state.week + 1, focus, interest: recruited.interest };
}

/** The combine: physical attributes become known exactly to everyone. */
export function runCombine(state: ScoutingState): ScoutingState {
  return { ...state, combineDone: true };
}

/** Scout a whole season (AI for every team, or the given weekly choices), then run the combine. */
export function scoutSeason(
  league: League,
  draftClass: DraftClass,
  weeklyChoices: (week: number) => Record<string, Array<{ prospect: PlayerId; points: number }>> = () => ({}),
): ScoutingState {
  let state = createScouting(league, draftClass);
  while (state.week < seasonWeeks(state)) state = advanceScoutingWeek(state, league, draftClass, weeklyChoices(state.week + 1));
  return runCombine(state);
}
