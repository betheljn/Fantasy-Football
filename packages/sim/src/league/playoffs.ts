// Playoffs: 16 teams. The 10 division winners get automatic bids; the 6
// highest-ranked other teams get at-large bids. All 16 are seeded by the final
// ranking. Fixed bracket (1v16, 8v9, ...), higher seed hosts, championship at
// a neutral site. In format 2 leagues championship week comes first: each
// division's top two meet for the title (the winner is its champion and gets
// the automatic bid), and the ranking is redone with those games in it.
import { advanceInjuries, gameDayTeam, type Injury } from "../game/injuries.ts";
import { simulateGame, type GameResult } from "../game/game.ts";
import { leagueFormat } from "./format.ts";
import type { League } from "./league.ts";
import { computeRankings, type RankingEntry } from "./rankings.ts";
import type { SeasonResult } from "./season.ts";
import type { ScheduledGame } from "./schedule.ts";
import { divisionStandings, type GameSummary, type TeamRecord } from "./standings.ts";

export const PLAYOFF_TEAMS = 16;

export type PlayoffRound = "round_of_16" | "quarterfinal" | "semifinal" | "championship";
export const PLAYOFF_ROUNDS: PlayoffRound[] = ["round_of_16", "quarterfinal", "semifinal", "championship"];

/** A step of the postseason: championship week (format 2), then each playoff round. */
export type PostseasonStage = "titles" | PlayoffRound;

/** The postseason's steps in this league, in order. */
export function postseasonStages(league: League): PostseasonStage[] {
  return leagueFormat(league).divisionTitleGames ? ["titles", ...PLAYOFF_ROUNDS] : [...PLAYOFF_ROUNDS];
}

export const STAGE_NAMES: Record<PostseasonStage, string> = {
  titles: "Championship Week",
  round_of_16: "Round of 16",
  quarterfinal: "Quarterfinals",
  semifinal: "Semifinals",
  championship: "League Championship",
};

export const ROUND_NAMES: Record<PlayoffRound, string> = {
  round_of_16: "Round of 16",
  quarterfinal: "Quarterfinals",
  semifinal: "Semifinals",
  championship: "League Championship",
};

/**
 * Bracket order: adjacent pairs meet, and winners of adjacent games meet next
 * round. 1 and 2 can only meet in the final.
 */
export const BRACKET: ReadonlyArray<readonly [number, number]> = [
  [1, 16], [8, 9], [5, 12], [4, 13],
  [6, 11], [3, 14], [7, 10], [2, 15],
];

export interface PlayoffSeed {
  seed: number;
  team: string;
  /** Final regular-season ranking. */
  rank: number;
  /** Division winner (automatic bid) or at-large. */
  bid: "division_winner" | "at_large";
  record: TeamRecord;
}

export interface PlayoffGame {
  round: PlayoffRound;
  homeSeed: number;
  awaySeed: number;
  neutralSite: boolean;
  summary: GameSummary;
}

/** A division title game (format 2): first place hosts second; the winner is the division's champion. */
export interface TitleGame {
  division: string;
  /** The division's first and second place after the regular season. */
  first: string;
  second: string;
  summary: GameSummary;
}

export interface PlayoffResult {
  /** The final ranking the field was drawn from (after championship week, if there was one). */
  ranking: RankingEntry[];
  /** Championship week (format 2): the division title games, and the ranking before them. */
  titleGames?: TitleGame[];
  regularRanking?: RankingEntry[];
  /** Format 2: the ranking after each playoff round (the Top 25 is redone as the postseason goes). */
  roundRankings?: Partial<Record<PlayoffRound, RankingEntry[]>>;
  seeds: PlayoffSeed[];
  games: PlayoffGame[];
  champion: string;
  runnerUp: string;
}

/**
 * Division winners (or title game winners, given) plus the best-ranked
 * at-large teams, seeded 1-16 by ranking.
 */
export function selectPlayoffField(league: League, results: readonly GameSummary[], ranking = computeRankings(league, results), champions?: ReadonlySet<string>): PlayoffSeed[] {
  const winners = champions ?? new Set(divisionStandings(league, results).map((d) => d.teams[0]!.team));
  const atLarge = ranking.filter((e) => !winners.has(e.team)).slice(0, PLAYOFF_TEAMS - winners.size);
  const field = new Set([...winners, ...atLarge.map((e) => e.team)]);
  return ranking
    .filter((e) => field.has(e.team))
    .map((e, i) => ({
      seed: i + 1,
      team: e.team,
      rank: e.rank,
      bid: winners.has(e.team) ? ("division_winner" as const) : ("at_large" as const),
      record: e.record,
    }));
}

/** Championship week comes right after the regular season (format 2). */
function titleWeek(season: SeasonResult): number {
  return season.schedule.weeks + 1;
}

function playoffWeek(league: League, season: SeasonResult, round: PlayoffRound): number {
  return season.schedule.weeks + (leagueFormat(league).divisionTitleGames ? 1 : 0) + PLAYOFF_ROUNDS.indexOf(round) + 1;
}

export interface PlayoffOptions {
  onGame?: (game: GameResult, round: PlayoffRound) => void;
}

export interface ChampionshipWeek {
  titleGames: TitleGame[];
  /** The league with the title games' injuries healed a week (ready for the playoffs). */
  league: League;
  injuries: Injury[];
}

/**
 * Championship week's games, known as soon as the regular season ends (for
 * lines and previews): in each division, first place hosts second.
 */
export function titleMatchups(league: League, season: SeasonResult): Array<ScheduledGame & { division: string }> {
  return divisionStandings(league, season.results).map((d) => {
    const [first, second] = [d.teams[0]!.team, d.teams[1]!.team];
    return { id: `${season.season}-title-${second}@${first}`, week: titleWeek(season), home: first, away: second, kind: "division" as const, division: d.division };
  });
}

/**
 * Championship week: in each division, first place hosts second for the
 * title. Ties can't stand (overtime until someone wins).
 */
export function playChampionshipWeek(league: League, season: SeasonResult, opts: { onGame?: (game: GameResult) => void } = {}): ChampionshipWeek {
  const titleGames: TitleGame[] = [];
  const injuries: Injury[] = [];
  for (const m of titleMatchups(league, season)) {
    const [first, second, id] = [m.home, m.away, m.id];
    const seed = `${league.seed}:${id}`;
    const h = gameDayTeam(league.teams[first]!);
    const v = gameDayTeam(league.teams[second]!);
    const result = simulateGame(h.team, v.team, seed, { playoff: true });
    if (!result.winner) throw new Error(`Title game ${id} ended in a tie`);
    injuries.push(...result.injuries);
    opts.onGame?.(result);
    titleGames.push({
      division: m.division,
      first,
      second,
      summary: {
        id,
        week: titleWeek(season),
        home: first,
        away: second,
        kind: "division",
        homeScore: result.score[first]!,
        awayScore: result.score[second]!,
        overtime: result.overtime,
        winner: result.winner,
        seed,
        rules: result.rules ?? 1,
        ...(h.out.length + v.out.length > 0 ? { out: { [first]: h.out, [second]: v.out } } : {}),
      },
    });
  }
  return { titleGames, league: advanceInjuries(league, injuries), injuries };
}

export function simulatePlayoffs(league: League, season: SeasonResult, opts: PlayoffOptions & { onTitleGame?: (game: GameResult) => void } = {}): PlayoffResult {
  // Format 2: championship week first; its winners are the champions, and its games count in the ranking.
  const titles = leagueFormat(league).divisionTitleGames ? playChampionshipWeek(league, season, opts.onTitleGame ? { onGame: opts.onTitleGame } : {}) : null;
  const regularRanking = computeRankings(league, season.results);
  const ranking = titles ? computeRankings(league, [...season.results, ...titles.titleGames.map((g) => g.summary)], regularRanking) : regularRanking;
  const champions = titles ? new Set(titles.titleGames.map((g) => g.summary.winner!)) : undefined;
  const seeds = selectPlayoffField(league, season.results, ranking, champions);
  const bySeed = new Map(seeds.map((s) => [s.seed, s]));
  const games: PlayoffGame[] = [];
  // Injuries carry from round to round (and from championship week).
  let current = titles?.league ?? league;
  let hurt: Injury[] = [];

  const play = (round: PlayoffRound, a: PlayoffSeed, b: PlayoffSeed): PlayoffSeed => {
    const [home, away] = a.seed < b.seed ? [a, b] : [b, a];
    const neutralSite = round === "championship";
    const id = `${season.season}-${round}-${away.team}@${home.team}`;
    const seed = `${league.seed}:${id}`;
    const h = gameDayTeam(current.teams[home.team]!);
    const v = gameDayTeam(current.teams[away.team]!);
    const result = simulateGame(h.team, v.team, seed, { playoff: true, neutralSite });
    hurt.push(...result.injuries);
    opts.onGame?.(result, round);
    if (!result.winner) throw new Error(`Playoff game ${id} ended in a tie`);
    games.push({
      round,
      homeSeed: home.seed,
      awaySeed: away.seed,
      neutralSite,
      summary: {
        id,
        week: playoffWeek(league, season, round),
        home: home.team,
        away: away.team,
        kind: "interconference",
        homeScore: result.score[home.team]!,
        awayScore: result.score[away.team]!,
        overtime: result.overtime,
        winner: result.winner,
        seed,
        rules: result.rules ?? 1,
        ...(h.out.length + v.out.length > 0 ? { out: { [home.team]: h.out, [away.team]: v.out } } : {}),
      },
    });
    return result.winner === home.team ? home : away;
  };

  // Format 2: the ranking is redone after every round, with every postseason game so far in it.
  const roundRankings: Partial<Record<PlayoffRound, RankingEntry[]>> = {};
  let last = ranking;
  const rerank = (round: PlayoffRound) => {
    if (!titles) return;
    last = computeRankings(league, [...season.results, ...titles.titleGames.map((g) => g.summary), ...games.map((g) => g.summary)], last);
    roundRankings[round] = last;
  };

  // Fixed bracket: winners of adjacent games meet in the next round.
  let alive = BRACKET.map(([a, b]) => play("round_of_16", bySeed.get(a)!, bySeed.get(b)!));
  rerank("round_of_16");
  for (const round of ["quarterfinal", "semifinal", "championship"] as const) {
    const next: PlayoffSeed[] = [];
    current = advanceInjuries(current, hurt);
    hurt = [];
    for (let i = 0; i < alive.length; i += 2) next.push(play(round, alive[i]!, alive[i + 1]!));
    alive = next;
    rerank(round);
  }
  const final = games[games.length - 1]!.summary;
  const champion = alive[0]!.team;
  // The final poll: the champion is No. 1 and the runner-up No. 2; the formula ranks everyone else.
  const finalRanking = roundRankings.championship;
  if (finalRanking) {
    const runnerUp = final.home === champion ? final.away : final.home;
    const top = [champion, runnerUp].map((t) => finalRanking.find((e) => e.team === t)!);
    const rest = finalRanking.filter((e) => e.team !== champion && e.team !== runnerUp);
    roundRankings.championship = [...top, ...rest].map((e, i) => ({ ...e, rank: i + 1 }));
  }
  return {
    ranking,
    ...(titles ? { titleGames: titles.titleGames, regularRanking, roundRankings } : {}),
    seeds,
    games,
    champion,
    runnerUp: final.home === champion ? final.away : final.home,
  };
}
