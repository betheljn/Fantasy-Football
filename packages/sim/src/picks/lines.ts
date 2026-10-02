// Lines for picks. Each week's featured games (the strongest matchups, never
// a human's own) are simulated many times on throwaway seeds, never the real
// one, with the teams exactly as they'll take the field. The middle result of
// those runs sets each line, so lines need no hand-tuning and the real game
// is as likely to go over as under. Every line ends in .5: no pushes.
import type { PlayerId } from "../model/player.ts";
import type { Position } from "../model/positions.ts";
import type { Team } from "../model/team.ts";
import type { League } from "../league/league.ts";
import { teamRatings } from "../league/league.ts";
import type { Schedule, ScheduledGame } from "../league/schedule.ts";
import { gameSeed } from "../league/season.ts";
import { simulateGame } from "../game/game.ts";
import { gameDayTeam } from "../game/injuries.ts";
import { buildBoxScore, type BoxScore } from "../stats/boxscore.ts";
import type { GameSummary } from "../league/standings.ts";

export const PICKS_RULES = {
  /** Featured games a week. */
  featured: 8,
  /** Simulations per featured game. */
  sims: 80,
};

export type PropStat = "passYds" | "rushYds" | "recYds";

export const PROP_STAT_NAMES: Record<PropStat, string> = { passYds: "passing yards", rushYds: "rushing yards", recYds: "receiving yards" };

/** One over/under. */
export interface Prop {
  id: string;
  /** Scheduled game id. */
  game: string;
  /** total: both teams' points; spread: the home team's winning margin; player: one player's yards. */
  kind: "total" | "spread" | "player";
  line: number;
  /** For player props: his team, id, name, position and the stat. */
  team?: string;
  player?: PlayerId;
  name?: string;
  position?: Position;
  stat?: PropStat;
  /** Share of the simulations that went over (about half, by design). */
  overShare: number;
}

export interface GameLines {
  game: ScheduledGame;
  props: Prop[];
  sims: number;
}

/**
 * The week's featured games: the strongest matchups (by both rosters), with
 * games involving `exclude` (your team) left off the board.
 */
export function featuredGames(league: League, schedule: Schedule, week: number, exclude: ReadonlySet<string> = new Set(), count = PICKS_RULES.featured): ScheduledGame[] {
  const strength = (abbr: string) => teamRatings(league.teams[abbr]!).overall;
  return schedule.games
    .filter((g) => g.week === week && !exclude.has(g.home) && !exclude.has(g.away))
    .map((g) => ({ g, score: strength(g.home) + strength(g.away) - 0.5 * Math.abs(strength(g.home) - strength(g.away)) }))
    .sort((a, b) => b.score - a.score || a.g.id.localeCompare(b.g.id))
    .slice(0, count)
    .map((x) => x.g);
}

/** The players with props: each side's starting QB, lead back, top two receivers and top tight end. */
function propPlayers(team: Team): Array<{ id: PlayerId; stat: PropStat }> {
  const first = (pos: Position, n = 1) => team.depthChart[pos].slice(0, n);
  return [
    ...first("QB").map((id) => ({ id, stat: "passYds" as const })),
    ...first("RB").map((id) => ({ id, stat: "rushYds" as const })),
    ...first("WR", 2).map((id) => ({ id, stat: "recYds" as const })),
    ...first("TE").map((id) => ({ id, stat: "recYds" as const })),
  ];
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
/** A line just above the middle result: x.5, so there's never a push. */
const lineAt = (xs: number[]) => Math.floor(median(xs)) + 0.5;
const overShare = (xs: number[], line: number) => xs.filter((x) => x > line).length / xs.length;

/** What a game's box score says for a prop. */
export function propValue(prop: Prop, summary: Pick<GameSummary, "home" | "away" | "homeScore" | "awayScore">, box: BoxScore | null): number {
  if (prop.kind === "total") return summary.homeScore + summary.awayScore;
  if (prop.kind === "spread") return summary.homeScore - summary.awayScore;
  return box?.players[prop.player!]?.[prop.stat!] ?? 0;
}

/** Simulate one game `sims` times on throwaway seeds and set its lines. */
export function gameLines(league: League, game: ScheduledGame, sims = PICKS_RULES.sims): GameLines {
  const steps = gameLinesSteps(league, game, sims);
  let r = steps.next();
  while (!r.done) r = steps.next();
  return r.value;
}

/** Simulations done between yields (keeps an app responsive at phone speed). */
const CHUNK = 10;

/** gameLines a few simulations at a time: yields how many are done. */
function* gameLinesSteps(league: League, game: ScheduledGame, sims: number): Generator<number, GameLines, void> {
  const home = gameDayTeam(league.teams[game.home]!).team;
  const away = gameDayTeam(league.teams[game.away]!).team;
  const seed = gameSeed(league, game);
  const players = [...propPlayers(home).map((p) => ({ ...p, team: home })), ...propPlayers(away).map((p) => ({ ...p, team: away }))];
  const totals: number[] = [];
  const margins: number[] = [];
  const yards = new Map<string, number[]>(players.map((p) => [p.id, []]));
  for (let k = 0; k < sims; k++) {
    const r = simulateGame(home, away, `${seed}:line:${k}`);
    const h = r.score[game.home]!;
    const a = r.score[game.away]!;
    totals.push(h + a);
    margins.push(h - a);
    const box = buildBoxScore(r);
    for (const p of players) yards.get(p.id)!.push(box.players[p.id]?.[p.stat] ?? 0);
    if ((k + 1) % CHUNK === 0 || k + 1 === sims) yield k + 1;
  }
  const props: Prop[] = [];
  const total = lineAt(totals);
  props.push({ id: `${game.id}:total`, game: game.id, kind: "total", line: total, overShare: overShare(totals, total) });
  const spread = lineAt(margins);
  props.push({ id: `${game.id}:spread`, game: game.id, kind: "spread", line: spread, overShare: overShare(margins, spread) });
  for (const p of players) {
    const xs = yards.get(p.id)!;
    const line = lineAt(xs);
    if (line < 10) continue; // barely plays: no prop
    const pl = p.team.roster.find((x) => x.id === p.id)!;
    props.push({
      id: `${game.id}:${p.id}:${p.stat}`,
      game: game.id,
      kind: "player",
      line,
      team: p.team.abbr,
      player: p.id,
      name: `${pl.firstName} ${pl.lastName}`,
      position: pl.position,
      stat: p.stat,
      overShare: overShare(xs, line),
    });
  }
  return { game, props, sims };
}

/**
 * Lines for these games, a few simulations at a time so an app can show
 * progress and stay responsive (yields the share done, 0-1). A game of
 * `own` (your team) keeps only the props on your own players: nothing on
 * the result or the other side, so you never have a reason to lose.
 */
export function* linesSteps(league: League, games: readonly ScheduledGame[], sims = PICKS_RULES.sims, own?: string): Generator<number, GameLines[], void> {
  const out: GameLines[] = [];
  for (const [i, g] of games.entries()) {
    const steps = gameLinesSteps(league, g, sims);
    let r = steps.next();
    while (!r.done) {
      yield (i + r.value / sims) / games.length;
      r = steps.next();
    }
    out.push(own && (g.home === own || g.away === own) ? ownGameLines(r.value, own) : r.value);
  }
  return out;
}

/** Your own game's board: just your players' props (to be taken over only). */
export function ownGameLines(lines: GameLines, own: string): GameLines {
  return { ...lines, props: lines.props.filter((p) => p.kind === "player" && p.team === own) };
}

/** Is this one of `own`'s games? */
export const isOwnGame = (game: Pick<ScheduledGame, "home" | "away">, own: string) => game.home === own || game.away === own;

/** The week's board: the featured games, plus your own game (your players' overs only) if you play. */
export function boardGames(league: League, schedule: Schedule, week: number, own: string): ScheduledGame[] {
  const mine = schedule.games.find((g) => g.week === week && isOwnGame(g, own));
  return [...(mine ? [mine] : []), ...featuredGames(league, schedule, week, new Set([own]))];
}

/** "BUF -3.5" style label for a spread, from the home team's side. */
export function spreadLabel(prop: Prop, home: string, away: string): string {
  // Over = home wins by more than the line.
  return prop.line > 0 ? `${home} -${prop.line}` : `${away} -${Math.abs(prop.line)}`;
}

/** A short description: "Total points 44.5", "OH -3.5", "QB Jalen Moss passing yards 247.5". */
export function propLabel(prop: Prop, home: string, away: string): string {
  if (prop.kind === "total") return `Total points ${prop.line}`;
  if (prop.kind === "spread") return `Spread: ${spreadLabel(prop, home, away)}`;
  return `${prop.position} ${prop.name} ${PROP_STAT_NAMES[prop.stat!]} ${prop.line}`;
}

/**
 * How one side of a prop reads: "Over" / "Under", or for a spread, the team
 * you're backing ("NY +0.5" is the over on a home margin of -0.5).
 */
export function sideLabel(prop: Prop, side: "over" | "under", home: string, away: string): string {
  if (prop.kind !== "spread") return side === "over" ? "Over" : "Under";
  const l = Math.abs(prop.line);
  if (side === "over") return `${home} ${prop.line > 0 ? "-" : "+"}${l}`;
  return `${away} ${prop.line > 0 ? "+" : "-"}${l}`;
}
