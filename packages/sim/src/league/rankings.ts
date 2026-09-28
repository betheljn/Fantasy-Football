// Weekly rankings: a computed formula, not a poll.
//
//   score = 100 x win pct  +  2 x strength rating
//
// The strength rating is a simple rating system: a team's average scoring
// margin (capped at +/-21 per game, adjusted for home field) plus the average
// rating of the teams it played, solved iteratively. So margin of victory and
// strength of schedule both count, but record counts most.
//
// Before the season (and fading out over each team's first five games) a
// preseason prior from roster strength fills in for results that don't exist yet.
import { hashString } from "../rng.ts";
import { allTeams, teamRatings, type League } from "./league.ts";
import { computeRecords, winPct, type GameSummary, type TeamRecord } from "./standings.ts";

export const RANKING_WEIGHTS = { winPct: 100, strength: 2 };
/** Per-game scoring margin is capped at this many points. */
export const MARGIN_CAP = 21;
/** Home field assumed by the strength rating, in points. */
export const RANKING_HOME_EDGE = 2;
/** Games after which the preseason prior no longer counts. */
export const PRIOR_GAMES = 5;
export const TOP_N = 25;

export interface RankingEntry {
  rank: number;
  team: string;
  score: number;
  record: TeamRecord;
  /** Strength rating: points better than an average team on a neutral field. */
  strength: number;
  /** Average strength rating of opponents played. */
  scheduleStrength: number;
  /** Rank in the previous ranking, if one was given. */
  previousRank?: number;
}

/**
 * Solve the strength ratings: rating = average adjusted margin + average
 * opponent rating, re-centred on zero each pass.
 */
export function strengthRatings(teams: string[], results: readonly GameSummary[]): Map<string, number> {
  const games = new Map<string, Array<{ opp: string; margin: number }>>(teams.map((t) => [t, []]));
  for (const g of results) {
    const raw = g.homeScore - g.awayScore - RANKING_HOME_EDGE;
    const m = Math.max(-MARGIN_CAP, Math.min(MARGIN_CAP, raw));
    games.get(g.home)?.push({ opp: g.away, margin: m });
    games.get(g.away)?.push({ opp: g.home, margin: -m });
  }
  // Damped iteration: the plain update can oscillate forever (e.g. two teams
  // that only played each other), so each pass moves halfway to the new value.
  let rating = new Map(teams.map((t) => [t, 0]));
  for (let iter = 0; iter < 300; iter++) {
    const next = new Map<string, number>();
    for (const t of teams) {
      const gs = games.get(t)!;
      const target = gs.length === 0 ? 0 : gs.reduce((s, g) => s + g.margin + rating.get(g.opp)!, 0) / gs.length;
      next.set(t, 0.5 * rating.get(t)! + 0.5 * target);
    }
    const mean = [...next.values()].reduce((s, v) => s + v, 0) / teams.length;
    for (const t of teams) next.set(t, next.get(t)! - mean);
    rating = next;
  }
  return rating;
}

/** Rank every team in the league (1 = best). Pass the previous ranking to record movement. */
export function computeRankings(league: League, results: readonly GameSummary[], previous?: readonly RankingEntry[]): RankingEntry[] {
  const teams = allTeams(league).map((t) => t.abbr);
  const records = computeRecords(league, results);
  const strength = strengthRatings(teams, results);

  // Preseason prior: roster strength mapped onto the same scale as the formula.
  const overall = new Map(teams.map((t) => [t, teamRatings(league.teams[t]!).overall]));
  const meanOverall = [...overall.values()].reduce((s, v) => s + v, 0) / teams.length;
  const prevRank = new Map(previous?.map((e) => [e.team, e.rank]));

  const opponents = new Map<string, string[]>(teams.map((t) => [t, []]));
  for (const g of results) {
    opponents.get(g.home)?.push(g.away);
    opponents.get(g.away)?.push(g.home);
  }

  const entries = teams.map((team) => {
    const r = records.get(team)!;
    const played = r.wins + r.losses + r.ties;
    const formula = RANKING_WEIGHTS.winPct * (played === 0 ? 0.5 : winPct(r)) + RANKING_WEIGHTS.strength * strength.get(team)!;
    const prior = 50 + 6 * (overall.get(team)! - meanOverall);
    const w = Math.max(0, 1 - played / PRIOR_GAMES);
    const opps = opponents.get(team)!;
    const entry: RankingEntry = {
      rank: 0,
      team,
      score: w * prior + (1 - w) * formula,
      record: r,
      strength: strength.get(team)!,
      scheduleStrength: opps.length === 0 ? 0 : opps.reduce((s, o) => s + strength.get(o)!, 0) / opps.length,
    };
    const p = prevRank.get(team);
    if (p !== undefined) entry.previousRank = p;
    return entry;
  });

  // Ties (rare with a continuous score) go to win pct, then a seeded coin toss.
  const coin = (t: string) => hashString(`${league.seed}:${league.season}:rank:${t}`);
  entries.sort((a, b) => b.score - a.score || winPct(b.record) - winPct(a.record) || coin(b.team) - coin(a.team));
  entries.forEach((e, i) => (e.rank = i + 1));
  return entries;
}

/**
 * Rankings after every week: index 0 is the preseason ranking, index w is
 * after week w's games.
 */
export function weeklyRankings(league: League, results: readonly GameSummary[], weeks: number): RankingEntry[][] {
  const out: RankingEntry[][] = [];
  let previous: RankingEntry[] | undefined;
  for (let w = 0; w <= weeks; w++) {
    const ranking = computeRankings(
      league,
      results.filter((g) => g.week <= w),
      previous,
    );
    out.push(ranking);
    previous = ranking;
  }
  return out;
}
