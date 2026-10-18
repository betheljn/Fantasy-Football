// The league as the server holds it: the dynasty (in the sim's compact save
// format) and who runs which team. Built and changed only by the sim.
import { CURRENT_FORMAT, allTeams, computeRecords, conferenceOf, divisionOf, fromSaveJson, startDynasty, teamLogo, teamName, teamRatings, teamTag, toSaveJson, type CoachBuild, type Dynasty, type SkillGroup, type OffseasonStage, type StagedChoices, type CoachCall, type TeamIdentityChoice, type StadiumDesign } from "@dynasty/sim";
import { emptyProgress, type SeasonProgress } from "./season.ts";
import type { DuelEntry } from "./duels.ts";

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
  /** Friends' scouting points for the coming week (spent when it's played, then cleared), by team: private. */
  scoutPlans?: Record<string, Array<{ prospect: string; points: number }>>;
  /** Friends' standing recruiting plans (points a week per prospect), by team: private to each friend. */
  recruiting?: Record<string, Array<{ prospect: string; points: number }>>;
  /** This week's games between friends: both coaches' calls, by game id (private: each sees only their duelView). */
  duels?: Record<string, DuelEntry>;
  /** In the lobby: each friend's look and coach for the team they claimed (by member id), made when the league starts. */
  setups?: Record<string, TeamSetupChoice>;
  /** In the lobby: each friend's top three skill groups (by member id); their program is built when the league starts. */
  programs?: Record<string, { groups: SkillGroup[]; region?: string }>;
}

/** A friend's team made theirs: its identity and the head coach they built. */
export interface TeamSetupChoice {
  team: string;
  identity: TeamIdentityChoice;
  coach: CoachBuild;
  /** Their stadium's design (absent: the one the team came with). */
  stadium?: StadiumDesign;
}

export function newLeagueState(seed: string): LeagueState {
  // New leagues play the current season shape (older leagues keep theirs).
  const dynasty = startDynasty(seed);
  return { version: STATE_VERSION, seed, dynasty: { ...dynasty, league: { ...dynasty.league, format: CURRENT_FORMAT } }, humans: {}, weeksPlayed: 0, progress: emptyProgress() };
}

export const encodeState = (s: LeagueState): string => toSaveJson(s);
export const decodeState = (text: string): LeagueState => fromSaveJson<LeagueState>(text);

/** Every team: who they are, how good they look, and their record this season. */
export function teamList(s: LeagueState) {
  const league = s.dynasty.league;
  const records = computeRecords(league, s.progress.results);
  return allTeams(league).map((t) => ({
    abbr: t.abbr,
    name: teamName(t),
    nickname: t.nickname,
    tag: teamTag(t),
    logo: teamLogo(t).id,
    ...(t.colors ? { colors: t.colors } : {}),
    conference: conferenceOf(league, t.abbr).name,
    division: divisionOf(league, t.abbr).name,
    overall: Math.round(teamRatings(t).overall * 10) / 10,
    wins: records.get(t.abbr)?.wins ?? 0,
    losses: records.get(t.abbr)?.losses ?? 0,
    ties: records.get(t.abbr)?.ties ?? 0,
  }));
}
