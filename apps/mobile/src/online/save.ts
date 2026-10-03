// An online league's save, as the server sends it, turned into the app's own
// save state so every league screen (standings, teams, box scores, replays)
// works on it unchanged. Read-only: nothing here is ever saved on the phone.
import { fromSaveJson, type Collection, type Dynasty, type GameSummary, type InjuryNews, type InSeasonMove, type LineupLog, type PlayoffResult, type SeasonStats, type TradeRecord } from "@dynasty/sim";
import { SAVE_VERSION, type SaveState } from "../dynasty/save";

/** The server's league state (apps/server/src/state.ts and season.ts). */
interface ServerState {
  seed: string;
  dynasty: Dynasty;
  humans: Record<string, string>;
  weeksPlayed: number;
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

export function saveFromServer(text: string, userTeam: string): SaveState {
  const s = fromSaveJson<ServerState>(text);
  const p = s.progress;
  return {
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
}
