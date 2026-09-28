// Standings and tiebreakers, computed purely from game results.
import { hashString } from "../rng.ts";
import type { League } from "./league.ts";
import type { GameKind } from "./schedule.ts";

/** The outcome of one scheduled game: all standings need. */
export interface GameSummary {
  id: string;
  week: number;
  home: string;
  away: string;
  kind: GameKind;
  homeScore: number;
  awayScore: number;
  overtime: boolean;
  /** Null on a tie. */
  winner: string | null;
  /** Seed the game was simulated with: re-simulating with it replays the game exactly. */
  seed: string;
}

export interface WLT {
  wins: number;
  losses: number;
  ties: number;
}

export interface TeamRecord extends WLT {
  team: string;
  pointsFor: number;
  pointsAgainst: number;
  division: WLT;
  conference: WLT;
  home: WLT;
  away: WLT;
  /** e.g. "W3", "L1", "T1"; empty before any games. */
  streak: string;
}

export interface RankedTeam {
  team: string;
  record: TeamRecord;
  /** Tiebreaker that placed this team above the next one, if they had the same record. */
  tiebreaker?: string;
}

export interface DivisionStandings {
  conference: string;
  division: string;
  teams: RankedTeam[];
}

export function winPct(r: WLT): number {
  const games = r.wins + r.losses + r.ties;
  return games === 0 ? 0 : (r.wins + 0.5 * r.ties) / games;
}

export function formatRecord(r: WLT): string {
  return r.ties > 0 ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`;
}

const emptyWLT = (): WLT => ({ wins: 0, losses: 0, ties: 0 });

function add(r: WLT, result: "W" | "L" | "T"): void {
  if (result === "W") r.wins++;
  else if (result === "L") r.losses++;
  else r.ties++;
}

function resultFor(g: GameSummary, team: string): "W" | "L" | "T" {
  return g.winner === null ? "T" : g.winner === team ? "W" : "L";
}

function opponent(g: GameSummary, team: string): string {
  return g.home === team ? g.away : g.home;
}

export function computeRecords(league: League, results: readonly GameSummary[]): Map<string, TeamRecord> {
  const records = new Map<string, TeamRecord>();
  for (const team of Object.keys(league.teams)) {
    records.set(team, {
      team,
      ...emptyWLT(),
      pointsFor: 0,
      pointsAgainst: 0,
      division: emptyWLT(),
      conference: emptyWLT(),
      home: emptyWLT(),
      away: emptyWLT(),
      streak: "",
    });
  }
  const ordered = [...results].sort((a, b) => a.week - b.week);
  for (const g of ordered) {
    for (const team of [g.home, g.away]) {
      const r = records.get(team)!;
      const res = resultFor(g, team);
      add(r, res);
      const isHome = team === g.home;
      r.pointsFor += isHome ? g.homeScore : g.awayScore;
      r.pointsAgainst += isHome ? g.awayScore : g.homeScore;
      add(isHome ? r.home : r.away, res);
      if (g.kind === "division") add(r.division, res);
      if (g.kind !== "interconference") add(r.conference, res);
      const n = r.streak.startsWith(res) ? Number(r.streak.slice(1)) + 1 : 1;
      r.streak = `${res}${n}`;
    }
  }
  return records;
}

/** Everything the tiebreakers look at. */
export interface StandingsContext {
  league: League;
  results: readonly GameSummary[];
  records: Map<string, TeamRecord>;
  /** Team -> its games. */
  games: Map<string, GameSummary[]>;
}

type Criterion = { name: string; value: (team: string, group: string[], ctx: StandingsContext) => number };

/** Win pct in games among the tied teams. */
const headToHead: Criterion = {
  name: "head-to-head",
  value: (team, group, ctx) => {
    const r = emptyWLT();
    for (const g of ctx.games.get(team)!) if (group.includes(opponent(g, team))) add(r, resultFor(g, team));
    return winPct(r);
  },
};

/** Win pct against opponents every tied team played (only used with at least 4 of them). */
const commonGames: Criterion = {
  name: "common games",
  value: (team, group, ctx) => {
    const opps = (t: string) => new Set(ctx.games.get(t)!.map((g) => opponent(g, t)));
    const common = [...opps(group[0]!)].filter((o) => !group.includes(o) && group.every((t) => opps(t).has(o)));
    if (common.length < 4) return 0; // not applicable: every team scores the same
    const r = emptyWLT();
    for (const g of ctx.games.get(team)!) if (common.includes(opponent(g, team))) add(r, resultFor(g, team));
    return winPct(r);
  },
};

/** Combined win pct of the teams it beat. */
const strengthOfVictory: Criterion = {
  name: "strength of victory",
  value: (team, _group, ctx) => {
    const total = emptyWLT();
    for (const g of ctx.games.get(team)!) {
      if (g.winner !== team) continue;
      const o = ctx.records.get(opponent(g, team))!;
      total.wins += o.wins;
      total.losses += o.losses;
      total.ties += o.ties;
    }
    return winPct(total);
  },
};

/** Combined win pct of everyone it played. */
const strengthOfSchedule: Criterion = {
  name: "strength of schedule",
  value: (team, _group, ctx) => {
    const total = emptyWLT();
    for (const g of ctx.games.get(team)!) {
      const o = ctx.records.get(opponent(g, team))!;
      total.wins += o.wins;
      total.losses += o.losses;
      total.ties += o.ties;
    }
    return winPct(total);
  },
};

const pointDifferential: Criterion = {
  name: "point differential",
  value: (team, _group, ctx) => {
    const r = ctx.records.get(team)!;
    return r.pointsFor - r.pointsAgainst;
  },
};

/** Last resort: a coin toss, seeded by the league so it's reproducible. */
const coinToss: Criterion = {
  name: "coin toss",
  value: (team, _group, ctx) => hashString(`${ctx.league.seed}:${ctx.league.season}:coin:${team}`),
};

export const DIVISION_TIEBREAKERS: Criterion[] = [
  headToHead,
  { name: "division record", value: (t, _g, ctx) => winPct(ctx.records.get(t)!.division) },
  commonGames,
  { name: "conference record", value: (t, _g, ctx) => winPct(ctx.records.get(t)!.conference) },
  strengthOfVictory,
  strengthOfSchedule,
  pointDifferential,
  coinToss,
];

/** Between teams from different divisions (e.g. for a conference table or wild cards). */
export const CONFERENCE_TIEBREAKERS: Criterion[] = [
  headToHead,
  { name: "conference record", value: (t, _g, ctx) => winPct(ctx.records.get(t)!.conference) },
  commonGames,
  strengthOfVictory,
  strengthOfSchedule,
  pointDifferential,
  coinToss,
];

/**
 * Order teams by win pct, breaking ties with `criteria` in order. When a
 * criterion splits a tied group, each smaller group starts over from the first
 * criterion (so head-to-head is re-applied among the teams still tied).
 */
export function rankTeams(teams: string[], ctx: StandingsContext, criteria: Criterion[]): RankedTeam[] {
  const byPct = groupBy(teams, (t) => winPct(ctx.records.get(t)!));
  const out: RankedTeam[] = [];
  for (const group of byPct) out.push(...breakTie(group, ctx, criteria));
  return out;
}

function breakTie(group: string[], ctx: StandingsContext, criteria: Criterion[]): RankedTeam[] {
  if (group.length === 1) return [{ team: group[0]!, record: ctx.records.get(group[0]!)! }];
  for (const c of criteria) {
    const parts = groupBy(group, (t) => c.value(t, group, ctx));
    if (parts.length === 1) continue;
    const out: RankedTeam[] = [];
    parts.forEach((part, i) => {
      const ranked = breakTie(part, ctx, criteria);
      // The last team of this part was separated from the next part by criterion c.
      if (i < parts.length - 1) ranked[ranked.length - 1]!.tiebreaker ??= c.name;
      out.push(...ranked);
    });
    return out;
  }
  throw new Error(`Could not break tie between ${group.join(", ")}`);
}

/** Groups in descending order of key; teams with equal keys share a group. */
function groupBy(teams: string[], key: (t: string) => number): string[][] {
  const sorted = teams.map((t) => ({ t, k: key(t) })).sort((a, b) => b.k - a.k || a.t.localeCompare(b.t));
  const groups: string[][] = [];
  for (const { t, k } of sorted) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(key(last[0]!) - k) < 1e-9) last.push(t);
    else groups.push([t]);
  }
  return groups;
}

export function standingsContext(league: League, results: readonly GameSummary[]): StandingsContext {
  const games = new Map<string, GameSummary[]>(Object.keys(league.teams).map((t) => [t, []]));
  for (const g of results) {
    games.get(g.home)!.push(g);
    games.get(g.away)!.push(g);
  }
  return { league, results, records: computeRecords(league, results), games };
}

export function divisionStandings(league: League, results: readonly GameSummary[]): DivisionStandings[] {
  const ctx = standingsContext(league, results);
  return league.conferences.flatMap((c) =>
    c.divisions.map((d) => ({ conference: c.abbr, division: d.name, teams: rankTeams(d.teams, ctx, DIVISION_TIEBREAKERS) })),
  );
}

/** Every team in a conference, best record first (division ranks not applied). */
export function conferenceTable(league: League, results: readonly GameSummary[], conferenceAbbr: string): RankedTeam[] {
  const ctx = standingsContext(league, results);
  const conf = league.conferences.find((c) => c.abbr === conferenceAbbr);
  if (!conf) throw new Error(`No conference ${conferenceAbbr}`);
  return rankTeams(conf.divisions.flatMap((d) => d.teams), ctx, CONFERENCE_TIEBREAKERS);
}
