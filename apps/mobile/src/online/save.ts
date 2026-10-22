// An online league's save, as the server sends it, turned into the app's own
// save state so every league screen (standings, teams, box scores, replays)
// works on it unchanged. Read-only: nothing here is ever saved on the phone.
import { type FriendGame, SLATE_RULES, memberBoard, type GameLines, type GradedHostPick, type HostRecords, type RadioShow, type SettledSlate, type Slate, fromSaveJson, type CoachCall, type Collection, type Dynasty, type OffseasonStage, type StagedChoices, type GameSummary, type InjuryNews, type InSeasonMove, type LineupLog, type PlayoffResult, type SeasonStats, type TradeRecord, postseasonStages, type ScoutingState, type Story } from "@dynasty/sim";
import { SAVE_VERSION, type SaveState } from "../dynasty/save";

/** The server's league state (apps/server/src/state.ts and season.ts). */
interface ServerState {
  seed: string;
  dynasty: Dynasty;
  humans: Record<string, string>;
  weeksPlayed: number;
  offseason?: { stage: OffseasonStage; choices: StagedChoices };
  /** Your calls in your game this week (the server sends only yours). */
  coaching?: Record<string, { game: string; calls: Array<CoachCall | null> }>;
  /** Your scouting points for this week (the server sends only yours). */
  scoutPlans?: Record<string, Array<{ prospect: string; points: number }>>;
  /** Your standing recruiting plan (the server sends only yours). */
  recruiting?: Record<string, Array<{ prospect: string; points: number }>>;
  /** Picks and the radio show: the coming week's board, the shows, the hosts' records, everyone's points (open slates: yours only). */
  picks?: {
    board: { season: number; week: number; lines: GameLines[] } | null;
    shows: RadioShow[];
    records: HostRecords;
    last: GradedHostPick[];
    members: Record<string, { balance: number; open: Slate[]; history: SettledSlate[] }>;
  };
  friendGames?: FriendGame[];
  progress: {
    /** Next year's class as every team has scouted and recruited it so far. */
    scouting?: ScoutingState;
    /** The season's news (the national feed and your own stories). */
    news?: Story[];
    results: GameSummary[];
    stats: SeasonStats;
    trades: TradeRecord[];
    collection: Collection;
    injuryNews: InjuryNews[];
    moves: InSeasonMove[];
    playoffs: PlayoffResult | null;
    lineups?: LineupLog;
  };
}

/** The offseason as the server has it: the open stage and the calls so far (yours only, for the open stage). */
export type OnlineOffseason = { stage: OffseasonStage; choices: StagedChoices } | null;

/** The app's save state, the teams friends run (abbr -> member id), and the offseason if it's on. */
export function saveFromServer(text: string, userTeam: string): { save: SaveState; humans: Record<string, string>; offseason: OnlineOffseason } {
  const s = fromSaveJson<ServerState>(text);
  const p = s.progress;
  const save: SaveState = {
    version: SAVE_VERSION,
    seed: s.seed,
    userTeam,
    dynasty: s.dynasty,
    weeksPlayed: s.weeksPlayed,
    results: p.results,
    stats: p.stats,
    // The server shows the whole bracket at once.
    playoffRoundsShown: p.playoffs ? postseasonStages(s.dynasty.league).length : 0,
    report: null,
    scouting: p.scouting ?? null,
    scoutPlan: s.scoutPlans?.[userTeam] ?? [],
    recruitPlan: s.recruiting?.[userTeam] ?? [],
    trades: p.trades,
    playoffs: p.playoffs,
    ...(p.lineups ? { lineups: p.lineups } : {}),
    injuryNews: p.injuryNews,
    moves: p.moves,
    collection: p.collection,
    news: p.news ?? [],
    ...(s.coaching?.[userTeam] ? { coaching: { season: s.dynasty.league.season, ...s.coaching[userTeam]! } } : {}),
    ...(s.picks ? picksFromServer(s.picks, userTeam, new Set(Object.keys(s.humans))) : {}),
    ...(s.friendGames ? { friendGames: s.friendGames } : {}),
  };
  return { save, humans: s.humans, offseason: s.offseason ?? null };
}

/**
 * The league's picks as your save has them: your points and slates, your view
 * of the board (featured games, and your own players in your own game), the
 * shows, and every friend's points for the leaderboard.
 */
function picksFromServer(p: NonNullable<ServerState["picks"]>, userTeam: string, humans: ReadonlySet<string>): Pick<SaveState, "picks" | "radio" | "friendsPicks"> {
  const mine = p.members[userTeam] ?? { balance: SLATE_RULES.startingBalance, open: [], history: [] };
  return {
    picks: { balance: mine.balance, open: mine.open, history: mine.history, board: p.board ? { ...p.board, lines: memberBoard(p.board.lines, userTeam, humans) } : null },
    radio: { shows: p.shows, records: p.records, last: p.last },
    // Every friend, from the start (a friend with no slates yet has the starting balance).
    friendsPicks: [...humans].map((team) => ({ team, balance: p.members[team]?.balance ?? SLATE_RULES.startingBalance, history: p.members[team]?.history ?? [] })),
  };
}
