// Rivalry trophies and the trophy room.
//
// Neighboring states in the same division play for a traveling trophy every
// season (each league names its own). Whoever won the latest meeting holds
// it; a tie leaves it where it is. The series runs from the dynasty's first
// season. The trophy room gathers a team's history: titles, division crowns,
// awards, Coach of the Year, rivalry trophies and moments.
import { Rng } from "../rng.ts";
import type { League } from "../league/league.ts";
import type { GameSummary } from "../league/standings.ts";
import type { Dynasty } from "../dynasty/dynasty.ts";
import type { Story } from "../media/news.ts";
import type { Rarity } from "./moments.ts";

/** Neighbors in the same division (so they meet every season). */
const PAIRS: ReadonlyArray<[string, string]> = [
  ["ME", "NH"], ["VT", "NH"], ["MA", "RI"],
  ["NY", "NJ"], ["PA", "DE"], ["CT", "NY"],
  ["MD", "VA"], ["VA", "WV"], ["NC", "SC"],
  ["GA", "AL"], ["FL", "GA"], ["MS", "TN"],
  ["OH", "MI"], ["IN", "IL"], ["KY", "IN"],
  ["WI", "MN"], ["ND", "SD"], ["IA", "MN"],
  ["KS", "MO"], ["OK", "AR"], ["NE", "KS"],
  ["TX", "LA"], ["NM", "AZ"], ["NV", "AZ"],
  ["CO", "WY"], ["UT", "ID"], ["MT", "ID"],
  ["WA", "OR"], ["OR", "CA"], ["AK", "HI"],
];

const ADJECTIVES = ["Copper", "Silver", "Iron", "Golden", "Bronze", "Old", "Brass", "Granite", "Cedar", "Pewter", "Oak", "Steel"];
const OBJECTS = ["Kettle", "Spur", "Anvil", "Lantern", "Compass", "Plow", "Saddle", "Anchor", "Weathervane", "Horseshoe", "Pickaxe", "Rail Spike", "Paddle", "Lighthouse", "Canteen", "Sextant", "Ox Yoke", "Wagon Wheel"];

export interface Rivalry {
  id: string;
  teams: [string, string];
  /** The traveling trophy, e.g. "the Copper Kettle". */
  trophy: string;
}

/** The league's rivalries and their trophies (named once per league). */
export function rivalries(leagueSeed: string): Rivalry[] {
  const rng = new Rng(`${leagueSeed}:rivalries`);
  const names = rng.shuffle(ADJECTIVES.flatMap((a) => OBJECTS.map((o) => `${a} ${o}`)));
  return PAIRS.map(([a, b], i) => ({ id: `${a}-${b}`, teams: [a, b], trophy: `the ${names[i]!}` }));
}

/** One rivalry game. */
export interface RivalryGame {
  rivalry: string;
  season: number;
  week: number;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  winner: string | null;
}

/** The rivalry games among these results. */
export function rivalryGames(list: readonly Rivalry[], results: readonly GameSummary[], season: number): RivalryGame[] {
  const byPair = new Map(list.map((r) => [[...r.teams].sort().join("-"), r.id]));
  return results.flatMap((g) => {
    const id = byPair.get([g.home, g.away].sort().join("-"));
    return id ? [{ rivalry: id, season, week: g.week, home: g.home, away: g.away, homeScore: g.homeScore, awayScore: g.awayScore, winner: g.winner }] : [];
  });
}

export interface RivalryStatus {
  rivalry: Rivalry;
  /** Who has the trophy (null until it's first won). */
  holder: string | null;
  /** Wins for each side, and ties, all-time. */
  wins: Record<string, number>;
  ties: number;
  /** The current streak: who's won the last `n` meetings. */
  streak: { team: string; n: number } | null;
  last: RivalryGame | null;
}

/** A rivalry's standing from its games (oldest first). */
export function rivalryStatus(r: Rivalry, games: readonly RivalryGame[]): RivalryStatus {
  const mine = games.filter((g) => g.rivalry === r.id);
  const wins: Record<string, number> = { [r.teams[0]]: 0, [r.teams[1]]: 0 };
  let ties = 0;
  let holder: string | null = null;
  let streak: { team: string; n: number } | null = null;
  for (const g of mine) {
    if (!g.winner) {
      ties++;
      streak = null;
      continue;
    }
    wins[g.winner] = (wins[g.winner] ?? 0) + 1;
    holder = g.winner;
    streak = streak && streak.team === g.winner ? { team: g.winner, n: streak.n + 1 } : { team: g.winner, n: 1 };
  }
  return { rivalry: r, holder, wins, ties, streak, last: mine.at(-1) ?? null };
}

/**
 * Stories from this week's rivalry games: a trophy changing hands, kept, or
 * won for the first time. `before` are the rivalry games before this week.
 */
export function rivalryNews(league: League, list: readonly Rivalry[], before: readonly RivalryGame[], week: readonly RivalryGame[]): Story[] {
  const nick = (abbr: string) => league.teams[abbr]?.nickname ?? abbr;
  const stories: Story[] = [];
  for (const g of week) {
    const r = list.find((x) => x.id === g.rivalry)!;
    const prior = rivalryStatus(r, before);
    const after = rivalryStatus(r, [...before, g]);
    const winner = g.winner;
    const loser = winner === g.home ? g.away : g.home;
    const score = `${Math.max(g.homeScore, g.awayScore)}-${Math.min(g.homeScore, g.awayScore)}`;
    const st = (abbr: string) => league.teams[abbr]?.state ?? abbr;
    let headline: string;
    let importance = 34;
    if (!winner) headline = `${nick(g.home)} and ${nick(g.away)} tie; ${r.trophy} stays ${prior.holder ? `with the ${nick(prior.holder)}` : "on the shelf"}`;
    else if (!prior.holder) {
      headline = `${nick(winner)} win ${r.trophy} for the first time`;
      importance = 40;
    } else if (prior.holder !== winner) {
      headline = `${nick(winner)} take ${r.trophy} back from ${nick(loser)}`;
      importance = 42;
    } else headline = `${nick(winner)} keep ${r.trophy}${after.streak && after.streak.n >= 3 ? `, ${after.streak.n} straight` : ""}`;
    stories.push({
      id: `${g.season}-${g.week}-rivalry-${r.id}`,
      season: g.season,
      week: g.week,
      kind: "rivalry",
      headline,
      body: `${winner ? `${st(winner)} beat ${st(loser)} ${score}.` : `Level at ${score}.`} ${seriesLine(after, st)}`,
      teams: [g.home, g.away],
      players: [],
      importance,
    });
  }
  return stories;
}

/** "Ohio leads the series 5-3" / "The series is tied 4-4" (ties added on). */
export function seriesLine(s: RivalryStatus, name: (abbr: string) => string = (a) => a): string {
  const [a, b] = s.rivalry.teams;
  const wa = s.wins[a] ?? 0;
  const wb = s.wins[b] ?? 0;
  const ties = s.ties ? `-${s.ties}` : "";
  if (wa === wb) return `The series is tied ${wa}-${wb}${ties}.`;
  const [lead, l, w] = wa > wb ? [a, wa, wb] : [b, wb, wa];
  return `${name(lead)} leads the series ${l}-${w}${ties}.`;
}

/** A team's trophy room. */
export interface TrophyRoom {
  team: string;
  titles: number[];
  runnerUps: number[];
  divisionTitles: number[];
  awards: Array<{ season: number; award: string; name: string; position: string }>;
  coachOfTheYear: Array<{ season: number; name: string }>;
  rivalries: RivalryStatus[];
  /** Final Top 25 finishes, best first. */
  top25: Array<{ season: number; rank: number; record: string }>;
  moments: Record<Rarity, number>;
}

/** Everything a team has won since the dynasty began. `games` are all rivalry games so far. */
export function trophyRoom(dynasty: Dynasty, team: string, games: readonly RivalryGame[]): TrophyRoom {
  const h = dynasty.history;
  const moments: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (const m of dynasty.moments ?? []) if (m.team === team) moments[m.rarity]++;
  return {
    team,
    titles: h.filter((s) => s.champion === team).map((s) => s.season),
    runnerUps: h.filter((s) => s.runnerUp === team).map((s) => s.season),
    divisionTitles: h.filter((s) => s.divisionWinners.includes(team)).map((s) => s.season),
    awards: h.flatMap((s) => s.awards.filter((a) => a.team === team).map((a) => ({ season: s.season, award: a.award, name: a.name, position: a.position }))),
    coachOfTheYear: h.flatMap((s) => (s.coachOfTheYear?.team === team ? [{ season: s.season, name: s.coachOfTheYear.name }] : [])),
    rivalries: rivalries(dynasty.league.seed)
      .filter((r) => r.teams.includes(team))
      .map((r) => rivalryStatus(r, games)),
    top25: h
      .flatMap((s) => {
        const e = s.top25.find((x) => x.team === team);
        return e ? [{ season: s.season, rank: e.rank, record: e.record }] : [];
      })
      .sort((a, b) => a.rank - b.rank || b.season - a.season),
    moments,
  };
}
