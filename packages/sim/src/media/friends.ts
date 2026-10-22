// Friends against friends (online leagues): every game two friends' teams
// play, kept across seasons; the head-to-head series between any two; a story
// for each friends' game this week ("takes a 3-1 series lead"), and lines for
// the radio show about next week's.
import type { League } from "../league/league.ts";
import type { GameSummary } from "../league/standings.ts";
import { teamName } from "../model/team.ts";
import type { Story } from "./news.ts";

/** A game between two friends' teams, as the league keeps it. */
export interface FriendGame {
  season: number;
  week: number;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  /** Both coaches called it (a duel). */
  duel: boolean;
}

/** This week's games between friends' teams. */
export function friendGamesOf(games: readonly GameSummary[], friends: ReadonlySet<string>, season: number, week: number): FriendGame[] {
  return games
    .filter((g) => friends.has(g.home) && friends.has(g.away))
    .map((g) => ({ season, week, home: g.home, away: g.away, homeScore: g.homeScore, awayScore: g.awayScore, duel: !!g.coached?.rival }));
}

const winnerOf = (g: FriendGame) => (g.homeScore > g.awayScore ? g.home : g.awayScore > g.homeScore ? g.away : null);

/** Two friends' head-to-head: wins each, ties, and who's on a streak. */
export interface FriendSeries {
  teams: [string, string];
  wins: Record<string, number>;
  ties: number;
  games: number;
  /** The current run of wins by one side (null: the last game was a tie, or none played). */
  streak: { team: string; n: number } | null;
}

export function friendSeries(history: readonly FriendGame[], a: string, b: string): FriendSeries {
  const games = history.filter((g) => (g.home === a && g.away === b) || (g.home === b && g.away === a));
  const wins: Record<string, number> = { [a]: 0, [b]: 0 };
  let ties = 0;
  let streak = null as FriendSeries["streak"];
  for (const g of games) {
    const w = winnerOf(g);
    if (w === null) {
      ties++;
      streak = null;
    } else {
      wins[w]!++;
      streak = streak?.team === w ? { team: w, n: streak.n + 1 } : { team: w, n: 1 };
    }
  }
  return { teams: [a, b], wins, ties, games: games.length, streak };
}

/** "Ohio leads the series 3-1", "The series is even at 2-2", "First meeting". */
export function friendSeriesLine(s: FriendSeries, name: (abbr: string) => string): string {
  const [a, b] = s.teams;
  const wa = s.wins[a]!;
  const wb = s.wins[b]!;
  const tie = s.ties ? `-${s.ties}` : "";
  if (s.games === 0) return "First meeting";
  if (wa === wb) return `The series is even at ${wa}-${wb}${tie}`;
  const [lead, hi, lo] = wa > wb ? [a, wa, wb] : [b, wb, wa];
  return `${name(lead)} lead the series ${hi}-${lo}${tie}`;
}

/**
 * A story for each game between friends this week: the result (a duel when
 * both coaches called it) and what it did to the series. `before` is every
 * friends' game before this week.
 */
export function friendStories(league: League, played: readonly FriendGame[], before: readonly FriendGame[]): Story[] {
  const name = (abbr: string) => teamName(league.teams[abbr]!);
  return played.map((g) => {
    const prior = friendSeries(before, g.home, g.away);
    const after = friendSeries([...before, g], g.home, g.away);
    const w = winnerOf(g);
    const [hs, as] = [g.homeScore, g.awayScore];
    const score = `${Math.max(hs, as)}-${Math.min(hs, as)}`;
    const how = g.duel ? " in a duel" : "";
    let headline: string;
    let series: string;
    if (w === null) {
      headline = `${name(g.away)} and ${name(g.home)} tie ${hs}-${as}${how}`;
      series = friendSeriesLine(after, name);
    } else {
      const l = w === g.home ? g.away : g.home;
      headline = `${name(w)} beat ${name(l)} ${score}${how}`;
      const [ww, wl] = [after.wins[w]!, after.wins[l]!];
      const ledBefore = prior.wins[w]! > prior.wins[l]!;
      const trailedBefore = prior.wins[w]! < prior.wins[l]!;
      series =
        prior.games === 0
          ? `${name(w)} take the first meeting`
          : ww === wl
            ? `The series is even again at ${ww}-${wl}`
            : ledBefore
              ? `${name(w)} stretch the series lead to ${ww}-${wl}`
              : trailedBefore
                ? `${name(w)} pull within ${ww}-${wl}`
                : `${name(w)} take a ${ww}-${wl} series lead`;
      if (after.streak && after.streak.team === w && after.streak.n >= 3) series += `, ${after.streak.n} straight`;
    }
    const duelNote = g.duel ? " Both coaches called every snap." : "";
    return {
      id: `friends-${g.season}-${g.week}-${g.away}-${g.home}`,
      season: g.season,
      week: g.week,
      kind: "friends" as const,
      headline,
      body: `${series}.${duelNote}`,
      teams: [g.home, g.away],
      players: [],
      // Friends' games are what a league of friends talks about.
      importance: g.duel ? 62 : 56,
    };
  });
}

/** For the radio show: next week's games between friends, with each series so far. */
export function friendPreviews(league: League, upcoming: ReadonlyArray<{ home: string; away: string }>, history: readonly FriendGame[]): string[] {
  const name = (abbr: string) => teamName(league.teams[abbr]!);
  return upcoming.map((g) => {
    const s = friendSeries(history, g.home, g.away);
    return `${name(g.away)} at ${name(g.home)}. ${s.games === 0 ? "First time these two meet." : `${friendSeriesLine(s, name)}.`}`;
  });
}
