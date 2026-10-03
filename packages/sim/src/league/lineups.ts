// Lineup history, so any game this season replays exactly as it was played.
// Ratings don't change during a season; what does is who's on each roster
// (trades, releases), your depth chart, and who sat out hurt (saved with each
// game). So a save keeps each team's roster at the start of the season and
// again whenever it changes, plus anyone released mid-season.
import { teamPlayers } from "../contracts/inseason.ts";
import type { TradeRecord } from "../contracts/trades.ts";
import { withOut } from "../game/injuries.ts";
import type { Player, PlayerId } from "../model/player.ts";
import { buildDepthChart, type DepthChart, type Team } from "../model/team.ts";
import type { League } from "./league.ts";
import type { GameSummary } from "./standings.ts";

/** A team's roster (and depth chart, if it isn't simply by rating) from `week`'s games on. */
export interface LineupEntry {
  week: number;
  team: string;
  ids: PlayerId[];
  depth?: DepthChart;
}

export interface LineupLog {
  entries: LineupEntry[];
  /** Players who left the league mid-season (released in a trade), for replays. */
  departed: Player[];
}

/** Draft week comes after every game of the season. */
export const DRAFT_WEEK = 100;

const sameChart = (a: DepthChart, b: DepthChart) => Object.keys(a).every((pos) => a[pos as keyof DepthChart].join() === b[pos as keyof DepthChart]?.join());

export function entryFor(team: Team, week: number): LineupEntry {
  const auto = buildDepthChart(team.roster);
  return { week, team: team.abbr, ids: team.roster.map((p) => p.id), ...(sameChart(team.depthChart, auto) ? {} : { depth: team.depthChart }) };
}

/** Every team as the season starts. */
export function startLog(league: League): LineupLog {
  return { entries: Object.values(league.teams).map((t) => entryFor(t, 0)), departed: [] };
}

/** Record the teams in these trades as they now stand (from `week`), and keep anyone released. */
export function logTrades(log: LineupLog, before: League, after: League, trades: readonly TradeRecord[], week: number): LineupLog {
  if (trades.length === 0) return log;
  const teams = new Set(trades.flatMap((t) => t.teams));
  const released = new Set(trades.flatMap((t) => (t.released ?? []).map((r) => r.id)));
  const departed = Object.values(before.teams)
    .flatMap((t) => t.roster)
    .filter((p) => released.has(p.id));
  return { entries: [...log.entries, ...[...teams].map((abbr) => entryFor(after.teams[abbr]!, week))], departed: [...log.departed, ...departed] };
}

/** Record one team's change (e.g. your depth chart) from `week`. */
export function logTeam(log: LineupLog, team: Team, week: number): LineupLog {
  return { ...log, entries: [...log.entries, entryFor(team, week)] };
}

/**
 * A game's two teams exactly as they took the field: the roster and depth
 * chart at that week, minus who sat out hurt. Null if the log doesn't cover
 * it (a save from before lineups were kept): then the current rosters stand in.
 */
export function replayTeams(log: LineupLog | undefined, league: League, game: GameSummary): { home: Team; away: Team } | null {
  if (!log) return null;
  const byId = new Map<PlayerId, Player>();
  for (const t of Object.values(league.teams)) for (const p of teamPlayers(t)) byId.set(p.id, p);
  for (const p of log.departed) if (!byId.has(p.id)) byId.set(p.id, p);
  const build = (abbr: string): Team | null => {
    const entry = [...log.entries].reverse().find((e) => e.team === abbr && e.week <= game.week);
    if (!entry) return null;
    const roster = entry.ids.map((id) => byId.get(id));
    if (roster.some((p) => !p)) return null;
    const players = roster as Player[];
    const team = { ...league.teams[abbr]!, roster: players, depthChart: entry.depth ?? buildDepthChart(players) };
    return withOut(team, new Set(game.out?.[abbr] ?? []));
  };
  const home = build(game.home);
  const away = build(game.away);
  return home && away ? { home, away } : null;
}
