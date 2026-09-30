// What a save holds, and turning it into text and back. Maps (careers, stats)
// don't survive plain JSON, so they're tagged and rebuilt.
import type { Dynasty, GameSummary, SeasonStats } from "@dynasty/sim";
import type { OffseasonReport } from "./report";

export const SAVE_VERSION = 1;

export interface SaveState {
  version: number;
  seed: string;
  /** The team you run. */
  userTeam: string;
  /** The league as it stands (league.season is the season being played). */
  dynasty: Dynasty;
  /** Regular-season weeks played this season, their results, and season stats. */
  weeksPlayed: number;
  results: GameSummary[];
  stats: SeasonStats;
  /** Playoff rounds revealed (0-4). */
  playoffRoundsShown: number;
  /** The last offseason, until you start the new season. */
  report: OffseasonReport | null;
}

export function serialize(state: SaveState): string {
  return JSON.stringify(state, (_k, v) => (v instanceof Map ? { __map: [...v.entries()] } : v));
}

export function deserialize(text: string): SaveState | null {
  try {
    const state = JSON.parse(text, (_k, v) => (v && typeof v === "object" && Array.isArray(v.__map) ? new Map(v.__map) : v)) as SaveState;
    return state.version === SAVE_VERSION ? state : null;
  } catch {
    return null;
  }
}
