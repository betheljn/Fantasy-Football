// League formats: the shape of a season. A league records the format it was
// started under, so a save keeps its own season shape (and every game it
// played replays the same) after the game moves on.
//
// Format 1 (the original): 20 games over 22 weeks, two byes, a 16-team
// playoff of the 10 division winners and 6 at-large teams.
// Format 2: 15 games over 16 weeks, one bye; then championship week (each
// division's top two meet for the title and an automatic bid) before the
// same 16-team playoff.
import type { League } from "./league.ts";

export type FormatVersion = 1 | 2;

export interface LeagueFormat {
  version: FormatVersion;
  /** Regular-season weeks. */
  weeks: number;
  gamesPerTeam: number;
  /** Home games each team gets (inclusive range). */
  homeGames: { min: number; max: number };
  /** One bye per window, per team (1-indexed weeks, inclusive). */
  byeWindows: ReadonlyArray<{ first: number; last: number }>;
  /** Teams off in any one bye week (inclusive range). */
  byesPerWeek: { min: number; max: number };
  /** Division rivals' two meetings at least this many weeks apart (0: they meet once). */
  rematchGap: number;
  /** Trading closes after this week. */
  tradeDeadlineWeek: number;
  /** Division title games between each division's top two decide its automatic bid. */
  divisionTitleGames: boolean;
}

export const FORMATS: Record<FormatVersion, LeagueFormat> = {
  1: {
    version: 1,
    weeks: 22,
    gamesPerTeam: 20,
    homeGames: { min: 10, max: 10 },
    byeWindows: [
      { first: 5, last: 11 },
      { first: 12, last: 18 },
    ],
    byesPerWeek: { min: 4, max: 10 },
    rematchGap: 3,
    tradeDeadlineWeek: 11,
    divisionTitleGames: false,
  },
  2: {
    version: 2,
    weeks: 16,
    gamesPerTeam: 15,
    homeGames: { min: 7, max: 8 },
    byeWindows: [{ first: 5, last: 12 }],
    byesPerWeek: { min: 4, max: 8 },
    rematchGap: 0,
    tradeDeadlineWeek: 8,
    divisionTitleGames: true,
  },
};

/** The format new dynasties start with. */
export const CURRENT_FORMAT: FormatVersion = 2;

/** A league's format (leagues from before formats are format 1). */
export function leagueFormat(league: Pick<League, "format">): LeagueFormat {
  return FORMATS[(league.format ?? 1) as FormatVersion] ?? FORMATS[1];
}
