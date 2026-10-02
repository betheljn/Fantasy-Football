// What a save holds, and turning it into text and back (the sim's compact save
// format: ratings and stat lines packed as arrays, Maps tagged).
import { fromSaveJson, toSaveJson, type Dynasty, type FreeAgentOffer, type GameSummary, type ScoutingState, type SeasonStats, type PlayoffResult, type StaffSlot, type TradeRecord } from "@dynasty/sim";
import type { OffseasonReport } from "./report";

export const SAVE_VERSION = 3;

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
  /** Trades made this season (yours and the AI's), oldest first. */
  trades: TradeRecord[];
  /** The playoffs, decided when the regular season ends (null before). */
  playoffs?: PlayoffResult | null;
}

/**
 * Your calls so far in an offseason that's under way. The sim is deterministic,
 * so replaying these on the saved league rebuilds the offseason exactly where
 * you left it. Saved on its own (it's small) after every call.
 */
export interface OffseasonProgress {
  /** The season that just ended (a checkpoint from another season is ignored). */
  season: number;
  /** Your fire/renew calls on the staff screen. */
  staff?: { fire: StaffSlot[]; renew: StaffSlot[] };
  /** Your hires; set once the rest of the offseason has begun. */
  hires?: [StaffSlot, string][];
  /** Expiring players you kept; set once re-signings are settled. */
  keep?: string[];
  /** Your draft picks so far, in order. */
  picks: string[];
  /** Free-agent offers so far, and whether your front office bids on the rest. */
  offers: [string, FreeAgentOffer][];
  frontOffice: boolean;
  /** Free agency has run (you're making cuts). */
  freeAgencyDone?: boolean;
}

export function serialize(state: SaveState): string {
  return toSaveJson(state);
}

export function deserialize(text: string): SaveState | null {
  try {
    const state = fromSaveJson<SaveState>(text);
    // Saves from before trades.
    state.trades ??= [];
    // Version 1 saves predate scouting; they pick it up from the next week played.
    if (state.version === 1) return { ...state, version: SAVE_VERSION, scouting: null, scoutPlan: [] };
    // Version 2 is the same data in plain JSON.
    if (state.version === 2) return { ...state, version: SAVE_VERSION };
    return state.version === SAVE_VERSION ? state : null;
  } catch {
    return null;
  }
}

export function serializeProgress(p: OffseasonProgress): string {
  return JSON.stringify(p);
}

export function deserializeProgress(text: string | null): OffseasonProgress | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as OffseasonProgress;
  } catch {
    return null;
  }
}

/** What the save list shows for a slot. */
export interface SlotInfo {
  slot: number;
  team: string;
  season: number;
  /** Where the dynasty is, e.g. "Week 6", "Playoffs", "Offseason". */
  stage: string;
  /** When it was last saved (ms since epoch). */
  savedAt: number;
}

export const SLOT_COUNT = 3;
