// The league as the server holds it: the dynasty (in the sim's compact save
// format) and who runs which team. Built and changed only by the sim.
import { allTeams, computeRecords, conferenceOf, divisionOf, fromSaveJson, startDynasty, teamRatings, toSaveJson, type Dynasty, type OffseasonStage, type StagedChoices, type CoachCall } from "@dynasty/sim";
import { emptyProgress, type SeasonProgress } from "./season.ts";

export const STATE_VERSION = 1;

export interface LeagueState {
  version: number;
  seed: string;
  dynasty: Dynasty;
  /** Teams run by members (abbr -> member id), fixed when the league starts; everyone else is AI. */
  humans: Record<string, string>;
  /** Regular-season weeks played this season, and everything played so far. */
  weeksPlayed: number;
  progress: SeasonProgress;
  /** The offseason, while it's on: the stage friends' calls are due for, and everyone's calls so far. */
  offseason?: { stage: OffseasonStage; choices: StagedChoices };
  /** Friends coaching their game this week: their calls so far, by team (private until the week is played). */
  coaching?: Record<string, { game: string; calls: Array<CoachCall | null> }>;
}

export function newLeagueState(seed: string): LeagueState {
  return { version: STATE_VERSION, seed, dynasty: startDynasty(seed), humans: {}, weeksPlayed: 0, progress: emptyProgress() };
}

export const encodeState = (s: LeagueState): string => toSaveJson(s);
export const decodeState = (text: string): LeagueState => fromSaveJson<LeagueState>(text);

/** Every team: who they are, how good they look, and their record this season. */
export function teamList(s: LeagueState) {
  const league = s.dynasty.league;
  const records = computeRecords(league, s.progress.results);
  return allTeams(league).map((t) => ({
    abbr: t.abbr,
    name: `${t.state} ${t.nickname}`,
    conference: conferenceOf(league, t.abbr).name,
    division: divisionOf(league, t.abbr).name,
    overall: Math.round(teamRatings(t).overall * 10) / 10,
    wins: records.get(t.abbr)?.wins ?? 0,
    losses: records.get(t.abbr)?.losses ?? 0,
    ties: records.get(t.abbr)?.ties ?? 0,
  }));
}
