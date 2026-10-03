// An online league's save, as the server sends it, turned into the app's own
// save state so every league screen (standings, teams, box scores, replays)
// works on it unchanged. Read-only: nothing here is ever saved on the phone.
import { fromSaveJson, type Collection, type Dynasty, type OffseasonStage, type StagedChoices, type GameSummary, type InjuryNews, type InSeasonMove, type LineupLog, type PlayoffResult, type SeasonStats, type TradeRecord } from "@dynasty/sim";
import { SAVE_VERSION, type SaveState } from "../dynasty/save";

/** The server's league state (apps/server/src/state.ts and season.ts). */
interface ServerState {
  seed: string;
  dynasty: Dynasty;
  humans: Record<string, string>;
  weeksPlayed: number;
  offseason?: { stage: OffseasonStage; choices: StagedChoices };
  progress: {
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
    playoffRoundsShown: p.playoffs ? 4 : 0,
    report: null,
    scouting: null,
    scoutPlan: [],
    trades: p.trades,
    playoffs: p.playoffs,
    ...(p.lineups ? { lineups: p.lineups } : {}),
    injuryNews: p.injuryNews,
    moves: p.moves,
    collection: p.collection,
  };
  return { save, humans: s.humans, offseason: s.offseason ?? null };
}
