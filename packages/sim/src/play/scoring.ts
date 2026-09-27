import type { PlayEvent } from "./events.ts";

/**
 * Points a single event puts on the board, keyed by team abbr. The game score
 * is always the sum of these over the event log, so replays can't drift.
 */
export function pointsForEvent(e: PlayEvent): Record<string, number> {
  switch (e.kind) {
    case "run":
    case "pass":
      // Wiped out by an accepted penalty: nothing counts.
      if (e.penalty?.accepted && !e.penalty.playStands) return {};
      if (e.turnover?.touchdown) return { [e.defense]: 6 };
      if (e.touchdown) return { [e.offense]: 6 };
      if (e.safety) return { [e.defense]: 2 };
      return {};
    case "field_goal":
      return e.made ? { [e.offense]: 3 } : {};
    case "punt":
      if (e.touchdown) return { [e.defense]: 6 };
      if (e.safety) return { [e.defense]: 2 };
      return {};
    case "kickoff":
      // Return touchdown by the receiving team.
      return e.touchdown ? { [e.defense]: 6 } : {};
    case "conversion":
      if (e.success) return { [e.team]: e.method === "kick" ? 1 : 2 };
      if (e.defensiveReturn) return { [e.defense]: 2 };
      return {};
    default:
      return {};
  }
}
