// What a save holds, and turning it into text and back. Maps (careers, stats)
// don't survive plain JSON, so they're tagged and rebuilt.
import type { Dynasty, GameSummary, ScoutingState, SeasonStats } from "@dynasty/sim";
import type { OffseasonReport } from "./report";

export const SAVE_VERSION = 2;

/** Points assigned to one prospect for the coming week. */
export interface ScoutAssignment {
  prospect: string;
  points: number;
}

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
  /** Every team's scouting of next year's draft class so far (null until the season starts). */
  scouting: ScoutingState | null;
  /** Your scouting points for the coming week (empty = your scouts choose). */
  scoutPlan: ScoutAssignment[];
}

export function serialize(state: SaveState): string {
  return JSON.stringify(state, (_k, v) => (v instanceof Map ? { __map: [...v.entries()] } : v));
}

export function deserialize(text: string): SaveState | null {
  try {
    const state = JSON.parse(text, (_k, v) => (v && typeof v === "object" && Array.isArray(v.__map) ? new Map(v.__map) : v)) as SaveState;
    // Version 1 saves predate scouting; they pick it up from the next week played.
    if (state.version === 1) return { ...state, version: SAVE_VERSION, scouting: null, scoutPlan: [] };
    return state.version === SAVE_VERSION ? state : null;
  } catch {
    return null;
  }
}
