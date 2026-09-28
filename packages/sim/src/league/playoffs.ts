// Playoffs: 7 teams per conference (5 division winners + 2 wild cards), single
// elimination, top seed on a bye. Higher seed hosts until the championship,
// which is played at a neutral site.
import { simulateGame, type GameResult } from "../game/game.ts";
import type { League } from "./league.ts";
import type { SeasonResult } from "./season.ts";
import {
  CONFERENCE_TIEBREAKERS,
  divisionStandings,
  rankTeams,
  standingsContext,
  type GameSummary,
  type TeamRecord,
} from "./standings.ts";

export const PLAYOFF_TEAMS_PER_CONFERENCE = 7;
export const WILD_CARDS_PER_CONFERENCE = 2;

export type PlayoffRound = "wild_card" | "divisional" | "conference" | "championship";

export const ROUND_NAMES: Record<PlayoffRound, string> = {
  wild_card: "Wild Card",
  divisional: "Divisional Round",
  conference: "Conference Championship",
  championship: "League Championship",
};

export interface PlayoffSeed {
  seed: number;
  team: string;
  conference: string;
  divisionWinner: boolean;
  record: TeamRecord;
}

export interface PlayoffGame {
  round: PlayoffRound;
  /** Null for the championship. */
  conference: string | null;
  homeSeed: number;
  awaySeed: number;
  neutralSite: boolean;
  summary: GameSummary;
}

export interface PlayoffResult {
  seeds: Record<string, PlayoffSeed[]>;
  games: PlayoffGame[];
  champion: string;
  runnerUp: string;
}

/**
 * Seed one conference: division winners 1-5 (by record, conference tiebreakers),
 * then wild cards. For each wild card, only the best remaining team from each
 * division is eligible, so a team never jumps a division rival that finished
 * ahead of it.
 */
export function seedConference(league: League, results: readonly GameSummary[], conferenceAbbr: string): PlayoffSeed[] {
  const ctx = standingsContext(league, results);
  const divisions = divisionStandings(league, results).filter((d) => d.conference === conferenceAbbr);
  if (divisions.length === 0) throw new Error(`No conference ${conferenceAbbr}`);

  const winners = rankTeams(divisions.map((d) => d.teams[0]!.team), ctx, CONFERENCE_TIEBREAKERS).map((r) => r.team);
  const remaining = divisions.map((d) => d.teams.slice(1).map((t) => t.team)); // in division order
  const wildCards: string[] = [];
  for (let k = 0; k < WILD_CARDS_PER_CONFERENCE; k++) {
    const candidates = remaining.filter((d) => d.length > 0).map((d) => d[0]!);
    const pick = rankTeams(candidates, ctx, CONFERENCE_TIEBREAKERS)[0]!.team;
    wildCards.push(pick);
    for (const d of remaining) if (d[0] === pick) d.shift();
  }

  return [...winners, ...wildCards].map((team, i) => ({
    seed: i + 1,
    team,
    conference: conferenceAbbr,
    divisionWinner: i < winners.length,
    record: ctx.records.get(team)!,
  }));
}

/** Week number for each round, following the regular season. */
function playoffWeek(season: SeasonResult, round: PlayoffRound): number {
  return season.schedule.weeks + { wild_card: 1, divisional: 2, conference: 3, championship: 4 }[round];
}

export interface PlayoffOptions {
  onGame?: (game: GameResult, round: PlayoffRound) => void;
}

export function simulatePlayoffs(league: League, season: SeasonResult, opts: PlayoffOptions = {}): PlayoffResult {
  const seeds: Record<string, PlayoffSeed[]> = {};
  for (const c of league.conferences) seeds[c.abbr] = seedConference(league, season.results, c.abbr);
  const games: PlayoffGame[] = [];

  const play = (round: PlayoffRound, conference: string | null, home: PlayoffSeed, away: PlayoffSeed, neutralSite = false): PlayoffSeed => {
    const id = `${season.season}-${round}-${away.team}@${home.team}`;
    const seed = `${league.seed}:${id}`;
    const result = simulateGame(league.teams[home.team]!, league.teams[away.team]!, seed, { playoff: true, neutralSite });
    opts.onGame?.(result, round);
    const summary: GameSummary = {
      id,
      week: playoffWeek(season, round),
      home: home.team,
      away: away.team,
      kind: conference ? "conference" : "interconference",
      homeScore: result.score[home.team]!,
      awayScore: result.score[away.team]!,
      overtime: result.overtime,
      winner: result.winner,
      seed,
    };
    games.push({ round, conference, homeSeed: home.seed, awaySeed: away.seed, neutralSite, summary });
    if (!result.winner) throw new Error(`Playoff game ${id} ended in a tie`);
    return result.winner === home.team ? home : away;
  };

  const champions: PlayoffSeed[] = [];
  for (const c of league.conferences) {
    const s = seeds[c.abbr]!;
    // Wild card: 2v7, 3v6, 4v5; the 1 seed rests.
    const alive = [s[0]!, ...([[1, 6], [2, 5], [3, 4]] as const).map(([h, a]) => play("wild_card", c.abbr, s[h]!, s[a]!))];
    // Divisional: 1 hosts the lowest seed left; the other two play, higher seed hosting.
    alive.sort((a, b) => a.seed - b.seed);
    const [top, second, third, lowest] = alive as [PlayoffSeed, PlayoffSeed, PlayoffSeed, PlayoffSeed];
    const semis = [play("divisional", c.abbr, top, lowest), play("divisional", c.abbr, second, third)].sort((a, b) => a.seed - b.seed);
    champions.push(play("conference", c.abbr, semis[0]!, semis[1]!));
  }

  // Championship at a neutral site; the better regular-season record is listed as "home".
  const [a, b] = champions as [PlayoffSeed, PlayoffSeed];
  const pct = (r: TeamRecord) => (r.wins + 0.5 * r.ties) / Math.max(1, r.wins + r.losses + r.ties);
  const [home, away] = pct(a.record) >= pct(b.record) ? [a, b] : [b, a];
  const winner = play("championship", null, home, away, true);
  return { seeds, games, champion: winner.team, runnerUp: winner.team === home.team ? away.team : home.team };
}
