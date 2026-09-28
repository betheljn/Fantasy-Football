// Season schedule: 20 games per team over 22 weeks (two byes each).
//
// Matchups per team (slot = a team's position within its division):
//   division          8  home and away vs each of the 4 division rivals
//   conference        8  two teams from each other division in the conference:
//                        the ones in the neighbouring slots (slot - 1 and slot + 1)
//   interconference   4  the same-slot team in 4 of the 5 divisions of the other
//                        conference; the skipped division rotates each season
//
// Every team gets exactly 10 home games: 4 division, plus an even split of the
// other 12 (an Euler orientation of that part of the schedule).
//
// Weeks: a seeded search finds a clash-free schedule, then Kempe-chain swaps
// put one bye in each bye window (weeks 5-11 and 12-18), keep 4-10 teams off
// per bye week, and put at least three weeks between division rematches
// (see placeGames).
import { Rng } from "../rng.ts";
import type { League } from "./league.ts";

export const REGULAR_SEASON_WEEKS = 22;
export const GAMES_PER_TEAM = 20;
export const HOME_GAMES_PER_TEAM = 10;
/** Each team gets one bye in each of these windows (1-indexed weeks, inclusive). */
export const BYE_WINDOWS: ReadonlyArray<{ first: number; last: number }> = [
  { first: 5, last: 11 },
  { first: 12, last: 18 },
];
export const BYES_PER_TEAM = BYE_WINDOWS.length;
/** Teams off in any one bye week (inclusive range). */
export const BYES_PER_WEEK = { min: 4, max: 10 };
/** The two meetings of division rivals are at least this many weeks apart. */
export const REMATCH_GAP = 3;

export type GameKind = "division" | "conference" | "interconference";

export interface ScheduledGame {
  id: string;
  /** 1-indexed week. */
  week: number;
  home: string;
  away: string;
  kind: GameKind;
}

export interface Schedule {
  season: number;
  weeks: number;
  /** Sorted by week. */
  games: ScheduledGame[];
  /** Team abbr -> bye weeks, in order. */
  byes: Record<string, number[]>;
}

interface Matchup {
  home: string;
  away: string;
  kind: GameKind;
}

/**
 * Who plays whom and where. `slotOrder` optionally gives each division's teams
 * in slot order (e.g. last season's finish); by default the league order is used.
 */
export function buildMatchups(league: League, season = league.season, slotOrder?: Record<string, string[]>): Matchup[] {
  const rng = new Rng(`matchups:${league.seed}:${season}`);
  const slots = (name: string, teams: string[]) => slotOrder?.[name] ?? teams;
  const division: Matchup[] = [];
  const pairs: Array<[string, string, GameKind]> = [];

  for (const conf of league.conferences) {
    const divs = conf.divisions.map((d) => slots(d.name, d.teams));
    for (const teams of divs) {
      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
          division.push({ home: teams[i]!, away: teams[j]!, kind: "division" });
          division.push({ home: teams[j]!, away: teams[i]!, kind: "division" });
        }
      }
    }
    // Conference: neighbouring slots in every other division.
    for (let d = 0; d < divs.length; d++) {
      for (let e = d + 1; e < divs.length; e++) {
        for (let p = 0; p < 5; p++) {
          pairs.push([divs[d]![p]!, divs[e]![(p + 1) % 5]!, "conference"]);
          pairs.push([divs[d]![p]!, divs[e]![(p + 4) % 5]!, "conference"]);
        }
      }
    }
  }

  // Interconference: same slot, every division pairing except one that rotates yearly.
  const [east, west] = league.conferences as [League["conferences"][number], League["conferences"][number]];
  for (let i = 0; i < east.divisions.length; i++) {
    const skip = (i + season) % west.divisions.length;
    for (let j = 0; j < west.divisions.length; j++) {
      if (j === skip) continue;
      const e = slots(east.divisions[i]!.name, east.divisions[i]!.teams);
      const w = slots(west.divisions[j]!.name, west.divisions[j]!.teams);
      for (let p = 0; p < 5; p++) pairs.push([e[p]!, w[p]!, "interconference"]);
    }
  }

  return [...division, ...orientEvenly(rng, pairs)];
}

/**
 * Give every team the same number of home and away games among `pairs`.
 * Every team has an even number of these games, so walking closed trails and
 * making each step "host -> visitor" balances everyone exactly.
 */
function orientEvenly(rng: Rng, pairs: Array<[string, string, GameKind]>): Matchup[] {
  const order = rng.shuffle(pairs.map((_, i) => i));
  const adj = new Map<string, number[]>();
  for (const i of order) {
    const [a, b] = pairs[i]!;
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(i);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(i);
  }
  const used = new Array(pairs.length).fill(false);
  const out: Matchup[] = [];
  for (const startTeam of [...adj.keys()].sort()) {
    for (;;) {
      // Walk a closed trail from startTeam using unused games.
      let at = startTeam;
      let moved = false;
      for (;;) {
        const list = adj.get(at)!;
        let next = -1;
        while (list.length > 0) {
          const i = list.pop()!;
          if (!used[i]) {
            next = i;
            break;
          }
        }
        if (next < 0) break;
        used[next] = true;
        moved = true;
        const [a, b, kind] = pairs[next]!;
        const other = a === at ? b : a;
        out.push({ home: at, away: other, kind });
        at = other;
      }
      if (!moved) break;
    }
  }
  return out;
}

export function generateSchedule(league: League, opts: { season?: number; slotOrder?: Record<string, string[]> } = {}): Schedule {
  const season = opts.season ?? league.season;
  const matchups = buildMatchups(league, season, opts.slotOrder);
  const teams = Object.keys(league.teams).sort();
  for (let attempt = 0; attempt < 10; attempt++) {
    const rng = new Rng(`schedule:${league.seed}:${season}:${attempt}`);
    const weeks = placeGames(rng, matchups, teams);
    if (!weeks) continue;
    const games = matchups
      .map((m, i) => ({ id: `${season}-W${weeks[i]}-${m.away}@${m.home}`, week: weeks[i]!, ...m }))
      .sort((a, b) => a.week - b.week || a.home.localeCompare(b.home));
    const byes: Record<string, number[]> = {};
    for (const t of teams) {
      const played = new Set(games.filter((g) => g.home === t || g.away === t).map((g) => g.week));
      byes[t] = [];
      for (let w = 1; w <= REGULAR_SEASON_WEEKS; w++) if (!played.has(w)) byes[t].push(w);
    }
    return { season, weeks: REGULAR_SEASON_WEEKS, games, byes };
  }
  throw new Error("Could not build a schedule");
}

/**
 * Place games in weeks in three phases:
 *   1. tabu search for a clash-free assignment (each team's two open weeks land anywhere),
 *   2. Kempe-chain swaps that put one bye in each window and 4-10 teams off per bye week,
 *   3. Kempe-chain swaps between fully-played weeks that spread out division rematches.
 * A Kempe swap takes two weeks, finds the chain of games alternating between them
 * through one team, and swaps the weeks of every game on the chain; it never
 * double-books anyone. Returns each game's week, or null if a phase didn't finish.
 */
function placeGames(rng: Rng, games: Matchup[], teams: string[]): number[] | null {
  const idx = new Map(teams.map((t, i) => [t, i]));
  const H = games.map((g) => idx.get(g.home)!);
  const A = games.map((g) => idx.get(g.away)!);
  const week = solveClashFree(rng, H, A, teams.length);
  if (!week) return null;
  const board = new WeekBoard(week, H, A, teams.length);
  if (!arrangeByes(rng, board, teams.length)) return null;

  // Each division game's rematch (same two teams, other venue).
  const twin = games.map(() => -1);
  const first = new Map<string, number>();
  games.forEach((g, i) => {
    if (g.kind !== "division") return;
    const key = [g.home, g.away].sort().join("-");
    const j = first.get(key);
    if (j === undefined) first.set(key, i);
    else [twin[i], twin[j]] = [j, i];
  });
  if (!spreadRematches(rng, board, twin, H)) return null;
  return Array.from(board.week);
}

/** Which bye window a week is in, or -1. */
const windowOf = (w: number) => BYE_WINDOWS.findIndex((b) => w >= b.first && w <= b.last);

/** Tabu search: move double-booked games to the week that clashes least. */
function solveClashFree(rng: Rng, H: number[], A: number[], T: number, maxIter = 100_000): Int16Array | null {
  const W = REGULAR_SEASON_WEEKS;
  const n = H.length;
  const cell = (t: number, w: number) => t * (W + 1) + w;
  const occ = new Int16Array(T * (W + 1));
  const inCell = Array.from({ length: T * (W + 1) }, () => new Set<number>());
  const week = new Int16Array(n);
  const place = (i: number, w: number) => {
    week[i] = w;
    for (const t of [H[i]!, A[i]!]) {
      occ[cell(t, w)]!++;
      inCell[cell(t, w)]!.add(i);
    }
  };
  const unplace = (i: number) => {
    for (const t of [H[i]!, A[i]!]) {
      occ[cell(t, week[i]!)]!--;
      inCell[cell(t, week[i]!)]!.delete(i);
    }
  };
  for (const i of rng.shuffle(H.map((_, k) => k))) {
    let best: number[] = [];
    let bestLoad = Infinity;
    for (let w = 1; w <= W; w++) {
      const load = occ[cell(H[i]!, w)]! + occ[cell(A[i]!, w)]!;
      if (load < bestLoad) [best, bestLoad] = [[w], load];
      else if (load === bestLoad) best.push(w);
    }
    place(i, rng.pick(best));
  }

  const bad: number[] = [];
  const pos = new Int32Array(n).fill(-1);
  const refresh = (i: number) => {
    const b = occ[cell(H[i]!, week[i]!)]! > 1 || occ[cell(A[i]!, week[i]!)]! > 1;
    if (b && pos[i] === -1) {
      pos[i] = bad.length;
      bad.push(i);
    } else if (!b && pos[i]! >= 0) {
      const last = bad.pop()!;
      if (last !== i) {
        bad[pos[i]!] = last;
        pos[last] = pos[i]!;
      }
      pos[i] = -1;
    }
  };
  let total = 0;
  for (let c = 0; c < occ.length; c++) total += Math.max(0, occ[c]! - 1);
  for (let i = 0; i < n; i++) refresh(i);

  const tabu = new Int32Array(n * (W + 1));
  let best = total;
  for (let iter = 0; iter < maxIter; iter++) {
    if (bad.length === 0) return week;
    const i = bad[Math.floor(rng.next() * bad.length)]!;
    const from = week[i]!;
    const [h, a] = [H[i]!, A[i]!];
    const leave = occ[cell(h, from)]! - 1 + occ[cell(a, from)]! - 1;
    let choices: number[] = [];
    let bestDelta = Infinity;
    for (let w = 1; w <= W; w++) {
      if (w === from) continue;
      const delta = occ[cell(h, w)]! + occ[cell(a, w)]! - leave;
      if (tabu[i * (W + 1) + w]! > iter && total + delta >= best) continue;
      if (delta < bestDelta) [choices, bestDelta] = [[w], delta];
      else if (delta === bestDelta) choices.push(w);
    }
    if (choices.length === 0) continue;
    const to = rng.pick(choices);
    const touched = new Set<number>([i, ...inCell[cell(h, from)]!, ...inCell[cell(a, from)]!]);
    unplace(i);
    place(i, to);
    for (const j of [...inCell[cell(h, to)]!, ...inCell[cell(a, to)]!]) touched.add(j);
    for (const j of touched) refresh(j);
    total += bestDelta;
    best = Math.min(best, total);
    tabu[i * (W + 1) + from] = iter + 8 + rng.int(0, 12);
  }
  return null;
}

/** A clash-free schedule, indexed by team and week, supporting Kempe-chain swaps. */
class WeekBoard {
  readonly week: Int16Array;
  readonly at: Int32Array;
  private readonly H: number[];
  private readonly A: number[];

  constructor(week: Int16Array, H: number[], A: number[], T: number) {
    this.week = week;
    this.H = H;
    this.A = A;
    this.at = new Int32Array(T * (REGULAR_SEASON_WEEKS + 1)).fill(-1);
    week.forEach((w, i) => {
      this.at[this.cell(H[i]!, w)] = i;
      this.at[this.cell(A[i]!, w)] = i;
    });
  }

  private cell(t: number, w: number): number {
    return t * (REGULAR_SEASON_WEEKS + 1) + w;
  }

  gameAt(t: number, w: number): number {
    return this.at[this.cell(t, w)]!;
  }

  byesOf(t: number): number[] {
    const out: number[] = [];
    for (let w = 1; w <= REGULAR_SEASON_WEEKS; w++) if (this.gameAt(t, w) < 0) out.push(w);
    return out;
  }

  /** Games and teams in the chain of weeks a/b through team t. */
  chain(t: number, a: number, b: number): { games: number[]; teams: number[] } {
    const games = new Set<number>();
    const seen = new Set<number>([t]);
    const stack = [t];
    while (stack.length > 0) {
      const u = stack.pop()!;
      for (const w of [a, b]) {
        const g = this.gameAt(u, w);
        if (g < 0 || games.has(g)) continue;
        games.add(g);
        const other = this.H[g] === u ? this.A[g]! : this.H[g]!;
        if (!seen.has(other)) {
          seen.add(other);
          stack.push(other);
        }
      }
    }
    return { games: [...games], teams: [...seen] };
  }

  /** Swap weeks a and b for every game in the chain. */
  swap(games: number[], a: number, b: number): void {
    for (const g of games) {
      this.at[this.cell(this.H[g]!, this.week[g]!)] = -1;
      this.at[this.cell(this.A[g]!, this.week[g]!)] = -1;
    }
    for (const g of games) {
      const w = this.week[g] === a ? b : a;
      this.week[g] = w;
      this.at[this.cell(this.H[g]!, w)] = g;
      this.at[this.cell(this.A[g]!, w)] = g;
    }
  }
}

/**
 * Local search over Kempe-chain swaps. Cost = 10 per bye window a team has no
 * bye in, plus how far each week's bye count is outside BYES_PER_WEEK (weeks
 * outside the windows should have none). A swap between weeks w and x only
 * changes the byes of the two teams at the ends of the chain, so the cost
 * change is cheap to compute.
 */
function arrangeByes(rng: Rng, board: WeekBoard, T: number, maxIter = 50_000): boolean {
  const W = REGULAR_SEASON_WEEKS;
  const teamCost = (byes: number[]) => BYE_WINDOWS.reduce((c, _, k) => c + (byes.some((w) => windowOf(w) === k) ? 0 : 10), 0);
  const weekCost = (w: number, n: number) =>
    windowOf(w) < 0 ? n : Math.max(0, BYES_PER_WEEK.min - n) + Math.max(0, n - BYES_PER_WEEK.max);
  const offCount = new Array<number>(W + 1).fill(0);
  for (let t = 0; t < T; t++) for (const w of board.byesOf(t)) offCount[w]!++;
  const total = () => {
    let c = 0;
    for (let t = 0; t < T; t++) c += teamCost(board.byesOf(t));
    for (let w = 1; w <= W; w++) c += weekCost(w, offCount[w]!);
    return c;
  };

  for (let iter = 0; iter < maxIter; iter++) {
    if (iter % 500 === 0 && total() === 0) return true;
    // Work on a team with a misplaced bye, or one sitting in an over/under-full week.
    const t = rng.int(0, T - 1);
    const byes = board.byesOf(t);
    const w = rng.pick(byes);
    if (teamCost(byes) === 0 && weekCost(w, offCount[w]!) === 0 && !rng.chance(0.05)) continue;
    const x = rng.int(1, W);
    if (x === w || board.gameAt(t, x) < 0) continue;

    const c = board.chain(t, w, x);
    const ends = c.teams.filter((z) => board.gameAt(z, w) < 0 || board.gameAt(z, x) < 0);
    const before = ends.reduce((s, z) => s + teamCost(board.byesOf(z)), 0) + weekCost(w, offCount[w]!) + weekCost(x, offCount[x]!);
    const moved = ends.map((z) => (board.gameAt(z, w) < 0 ? 1 : -1)); // +1: bye goes w -> x
    board.swap(c.games, w, x);
    const shift = moved.reduce((s, m) => s + m, 0);
    offCount[w]! -= shift;
    offCount[x]! += shift;
    const after = ends.reduce((s, z) => s + teamCost(board.byesOf(z)), 0) + weekCost(w, offCount[w]!) + weekCost(x, offCount[x]!);
    if (after > before && !rng.chance(0.02)) {
      board.swap(c.games, w, x); // undo
      offCount[w]! += shift;
      offCount[x]! -= shift;
    }
  }
  return total() === 0;
}

/**
 * Separate division rematches by swapping chains between two weeks. Only closed
 * chains are used (every team in them plays both weeks), so no bye moves.
 */
function spreadRematches(rng: Rng, board: WeekBoard, twin: number[], home: number[], maxIter = 20_000): boolean {
  const W = REGULAR_SEASON_WEEKS;
  const tooClose = (g: number) => twin[g]! >= 0 && Math.abs(board.week[g]! - board.week[twin[g]!]!) < REMATCH_GAP;
  const closeIn = (gs: Iterable<number>) => {
    let n = 0;
    for (const g of gs) if (tooClose(g)) n++;
    return n;
  };
  const all = twin.map((_, g) => g);
  for (let iter = 0; iter < maxIter; iter++) {
    const offenders = all.filter(tooClose);
    if (offenders.length === 0) return true;
    const g = rng.pick(offenders);
    const w = board.week[g]!;
    const y = rng.int(1, W);
    if (y === w) continue;
    const c = board.chain(home[g]!, w, y);
    if (c.teams.some((z) => board.gameAt(z, w) < 0 || board.gameAt(z, y) < 0)) continue;
    const affected = new Set<number>(c.games);
    for (const x of c.games) if (twin[x]! >= 0) affected.add(twin[x]!);
    const before = closeIn(affected);
    board.swap(c.games, w, y);
    if (closeIn(affected) > before && !rng.chance(0.05)) board.swap(c.games, w, y); // undo
  }
  return false;
}

export function gamesForWeek(schedule: Schedule, week: number): ScheduledGame[] {
  return schedule.games.filter((g) => g.week === week);
}

export function teamSchedule(schedule: Schedule, team: string): ScheduledGame[] {
  return schedule.games.filter((g) => g.home === team || g.away === team);
}
