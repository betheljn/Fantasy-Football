// The league's news online: the same stories the app writes in a solo
// dynasty, written by the server as the league is played. Everyone shares
// the national feed; each friend also gets their own (their game's recap,
// a look at their next one, everything else about their team), tagged for
// them and sent only to them.
import {
  campStories,
  computeRankings,
  localFeed,
  nationalFeed,
  postseasonNews,
  postseasonStages,
  rivalries,
  rivalryGames,
  rivalryNews,
  teamName,
  weeklyNews,
  type CampBattle,
  type GameResult,
  type GameSummary,
  type InjuryNews,
  type League,
  type PlayoffResult,
  type Schedule,
  type SeasonStats,
  type Story,
  type TradeRecord,
} from "@dynasty/sim";

/** A friend's own copy of a story (its id made theirs, so friends' copies never collide). */
const forFriend = (s: Story, team: string): Story => ({ ...s, id: `${s.id}#${team}`, for: team });

/** The national feed plus each friend's own stories, from stories written for each of them. */
function feeds(national: Story[], perFriend: (team: string) => Story[], friends: readonly string[]): Story[] {
  const shared = new Set(national.map((s) => s.id));
  const own = friends.flatMap((team) => localFeed(perFriend(team), team).filter((s) => !shared.has(s.id)).map((s) => forFriend(s, team)));
  return [...national, ...own];
}

export interface WeekNewsArgs {
  /** The league before the week and after it. */
  before: League;
  after: League;
  schedule: Schedule;
  week: number;
  games: Array<{ summary: GameSummary; result: GameResult }>;
  /** Results before the week, and the season's stats with the week in. */
  resultsBefore: GameSummary[];
  stats: SeasonStats;
  injuries: InjuryNews[];
  trades: TradeRecord[];
  careers?: NonNullable<Parameters<typeof weeklyNews>[0]["careers"]>;
  /** Rivalry games played in earlier seasons. */
  rivalryHistory: Parameters<typeof rivalryNews>[2];
  friends: readonly string[];
}

/** A regular-season week's news. */
export function weekNews(a: WeekNewsArgs): Story[] {
  const season = a.schedule.season;
  const results = [...a.resultsBefore, ...a.games.map((g) => g.summary)];
  const rankBefore = computeRankings(a.before, a.resultsBefore);
  const rankAfter = computeRankings(a.after, results, rankBefore);
  const rivals = rivalries(a.after.seed);
  const rivalryBefore = [...a.rivalryHistory, ...rivalryGames(rivals, a.resultsBefore, season)];
  const rivalryStories = rivalryNews(a.after, rivals, rivalryBefore, rivalryGames(rivals, a.games.map((g) => g.summary), season));
  const write = (userTeam?: string) =>
    [
      ...weeklyNews({ league: a.after, schedule: a.schedule, season, week: a.week, games: a.games, results, before: rankBefore, after: rankAfter, stats: a.stats, injuries: a.injuries, trades: a.trades, ...(a.careers ? { careers: a.careers } : {}), ...(userTeam ? { userTeam } : {}) }),
      ...rivalryStories,
    ].sort((x, y) => y.importance - x.importance);
  // Rivalry results always make the paper, whatever else happened.
  const national = [...new Set([...nationalFeed(write()), ...rivalryStories])];
  return feeds(national, write, a.friends);
}

/** The postseason's news (championship week and every round), once it's played. */
export function postseasonStories(league: League, season: number, playoffs: PlayoffResult, friends: readonly string[]): Story[] {
  return postseasonStages(league).flatMap((stage) => {
    const write = (userTeam?: string) => postseasonNews(league, season, playoffs, stage, userTeam);
    return feeds(write(), write, friends);
  });
}

/** Training camp's stories, as the season opens. */
export function campNews(league: League, battles: readonly CampBattle[], friends: readonly string[]): Story[] {
  const write = (yours?: string) => campStories(battles, league.season, (abbr) => teamName(league.teams[abbr]!), yours);
  return feeds(write(), write, friends);
}

/** What one friend sees: the shared stories and their own (never another friend's). */
export const newsFor = (news: readonly Story[], team: string | null): Story[] => news.filter((s) => !s.for || s.for === team);
