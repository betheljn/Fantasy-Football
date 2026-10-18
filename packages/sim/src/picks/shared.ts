// Picks in a league of friends: one board for everyone, worked out once a week
// (the league does it, not each phone). The featured games are AI against AI,
// so nobody can bet against a friend's team; each friend's own game is on the
// board only for overs on their own players, as in solo. Every friend keeps
// their own points against the house, and a leaderboard ranks the season.
import type { League } from "../league/league.ts";
import type { Schedule, ScheduledGame } from "../league/schedule.ts";
import { featuredGames, isOwnGame, ownGameLines, type GameLines, type Prop } from "./lines.ts";
import { houseRecord } from "./house.ts";
import { slateProblems, type PickSide, type SettledSlate, type SlatePick } from "./slates.ts";

const friendly = (g: Pick<ScheduledGame, "home" | "away">, humans: ReadonlySet<string>) => humans.has(g.home) || humans.has(g.away);

/** The week's shared board: every game a friend plays (their own players' props), then the featured AI games. */
export function sharedBoardGames(league: League, schedule: Schedule, week: number, humans: ReadonlySet<string>): ScheduledGame[] {
  const theirs = schedule.games.filter((g) => g.week === week && friendly(g, humans));
  return [...theirs, ...featuredGames(league, schedule, week, humans)];
}

/** One friend's board: the featured games whole, their own game for their own players, nothing on other friends' games. */
export function memberBoard(lines: readonly GameLines[], own: string, humans: ReadonlySet<string>): GameLines[] {
  return lines.flatMap((l) => (!friendly(l.game, humans) ? [l] : isOwnGame(l.game, own) ? [ownGameLines(l, own)] : []));
}

/**
 * A friend's slate as the league sees it: each pick looked up on their board by
 * prop id (the line is the board's, never the phone's), then the usual slate
 * rules. Returns the picks to place, or what's wrong.
 */
export function memberSlate(
  view: readonly GameLines[],
  choices: ReadonlyArray<{ prop: string; side: PickSide; via?: SlatePick["via"] }>,
  stake: number,
  balance: number,
  own: string,
): { picks: SlatePick[]; problems: string[] } {
  const props = new Map<string, Prop>(view.flatMap((g) => g.props.map((p) => [p.id, p] as const)));
  const problems: string[] = [];
  const picks: SlatePick[] = [];
  for (const c of choices) {
    const prop = props.get(c.prop);
    if (!prop || (c.side !== "over" && c.side !== "under")) problems.push("That pick isn't on your board.");
    else picks.push({ prop, side: c.side, ...(c.via ? { via: c.via } : {}) });
  }
  const ownGames = new Set(view.filter((g) => isOwnGame(g.game, own)).map((g) => g.game.id));
  return { picks, problems: [...new Set([...problems, ...slateProblems(picks, stake, balance, own, ownGames)])] };
}

export interface PicksStanding {
  member: string;
  team: string;
  balance: number;
  /** This season against the house. */
  won: number;
  lost: number;
  net: number;
}

/** The friends' picks leaderboard: most points first (then the season's net, then name). */
export function picksLeaderboard(entries: ReadonlyArray<{ member: string; team: string; balance: number; history: readonly SettledSlate[] }>, season: number): PicksStanding[] {
  return entries
    .map((e) => ({ member: e.member, team: e.team, balance: e.balance, ...houseRecord(e.history, season) }))
    .sort((a, b) => b.balance - a.balance || b.net - a.net || a.member.localeCompare(b.member));
}
