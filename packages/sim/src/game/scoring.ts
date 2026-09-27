import type { PlayEvent } from "../play/events.ts";

/**
 * Points a single event puts on the board, keyed by team abbr. The game score
 * is always the sum of these over the event log, so replays can't drift.
 */
export function pointsForEvent(e: PlayEvent): Record<string, number> {
  switch (e.kind) {
    case "run":
    case "pass":
      if (e.turnover?.touchdown) return { [e.defense]: 6 };
      if (e.touchdown) return { [e.offense]: 6 };
      if (e.safety) return { [e.defense]: 2 };
      return {};
    case "field_goal":
      return e.made ? { [e.offense]: 3 } : {};
    case "punt":
    case "kickoff":
      // Return touchdown by the receiving team.
      return e.touchdown ? { [e.defense]: 6 } : {};
    case "conversion":
      return e.success ? { [e.team]: e.method === "kick" ? 1 : 2 } : {};
    default:
      return {};
  }
}
