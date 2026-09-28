// Season stats: box scores accumulated over a season, and league leaders.
import type { PlayerId } from "../model/player.ts";
import type { GameResult } from "../game/game.ts";
import { buildBoxScore, PLAYER_STAT_KEYS, TEAM_STAT_KEYS, type PlayerStatKey, type TeamStatKey } from "../stats/boxscore.ts";

type StatLine = Record<PlayerStatKey, number>;
type TeamLine = Record<TeamStatKey, number>;

export interface PlayerSeason {
  id: PlayerId;
  team: string;
  /** Games in which the player took a snap or recorded a stat. */
  games: number;
  stats: StatLine;
}

export interface TeamSeason {
  team: string;
  games: number;
  pointsFor: number;
  pointsAgainst: number;
  /** The team's own totals. */
  offense: TeamLine;
  /** Opponents' totals against this team (i.e. what the defense allowed). */
  allowed: TeamLine;
}

export interface SeasonStats {
  players: Map<PlayerId, PlayerSeason>;
  teams: Map<string, TeamSeason>;
}

const isLong = (k: string) => k.endsWith("Long");
const zeros = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

export function createSeasonStats(): SeasonStats {
  return { players: new Map(), teams: new Map() };
}

/** Fold one game into the season totals. */
export function addGameToSeason(season: SeasonStats, game: GameResult): void {
  const box = buildBoxScore(game);

  // Who appeared: everyone on the field for a snap, plus anyone with a stat line (kickers, returners).
  const appeared = new Map<PlayerId, string>();
  for (const { event: e } of game.plays) {
    if (e.kind !== "run" && e.kind !== "pass") continue;
    for (const id of e.formation.offense.players) appeared.set(id, e.offense);
    for (const id of e.formation.defense.players) appeared.set(id, e.defense);
  }
  for (const [id, line] of Object.entries(box.players)) appeared.set(id, line.team);

  for (const [id, team] of appeared) {
    let p = season.players.get(id);
    if (!p) {
      p = { id, team, games: 0, stats: zeros(PLAYER_STAT_KEYS) };
      season.players.set(id, p);
    }
    p.games++;
    const line = box.players[id];
    if (!line) continue;
    for (const k of PLAYER_STAT_KEYS) {
      p.stats[k] = isLong(k) ? Math.max(p.stats[k], line[k]) : p.stats[k] + line[k];
    }
  }

  for (const [team, other] of [
    [game.home, game.away],
    [game.away, game.home],
  ] as const) {
    let t = season.teams.get(team);
    if (!t) {
      t = { team, games: 0, pointsFor: 0, pointsAgainst: 0, offense: zeros(TEAM_STAT_KEYS), allowed: zeros(TEAM_STAT_KEYS) };
      season.teams.set(team, t);
    }
    t.games++;
    t.pointsFor += game.score[team]!;
    t.pointsAgainst += game.score[other]!;
    for (const k of TEAM_STAT_KEYS) {
      t.offense[k] += box.teams[team]![k];
      t.allowed[k] += box.teams[other]![k];
    }
  }
}

/** NFL passer rating (0 to 158.3). */
export function passerRating(s: Pick<StatLine, "passAtt" | "passCmp" | "passYds" | "passTd" | "passInt">): number {
  if (s.passAtt === 0) return 0;
  const clamp = (x: number) => Math.max(0, Math.min(2.375, x));
  const a = clamp((s.passCmp / s.passAtt - 0.3) * 5);
  const b = clamp((s.passYds / s.passAtt - 3) * 0.25);
  const c = clamp((s.passTd / s.passAtt) * 20);
  const d = clamp(2.375 - (s.passInt / s.passAtt) * 25);
  return ((a + b + c + d) / 6) * 100;
}

export interface LeaderCategory {
  key: string;
  label: string;
  value: (p: PlayerSeason) => number;
  format?: (v: number) => string;
  /** Minimum to qualify, per team game played (rate stats only). */
  qualifier?: { stat: (p: PlayerSeason) => number; perGame: number; label: string };
  /** Lower is better (none yet, but kept for e.g. interception rate). */
  ascending?: boolean;
}

const one = (v: number) => v.toFixed(1);

export const LEADER_CATEGORIES: LeaderCategory[] = [
  { key: "passYds", label: "Passing yards", value: (p) => p.stats.passYds },
  { key: "passTd", label: "Passing TDs", value: (p) => p.stats.passTd },
  {
    key: "rating",
    label: "Passer rating",
    value: (p) => passerRating(p.stats),
    format: one,
    qualifier: { stat: (p) => p.stats.passAtt, perGame: 14, label: "attempts" },
  },
  { key: "rushYds", label: "Rushing yards", value: (p) => p.stats.rushYds },
  { key: "rushTd", label: "Rushing TDs", value: (p) => p.stats.rushTd },
  {
    key: "ypc",
    label: "Yards per carry",
    value: (p) => p.stats.rushYds / Math.max(1, p.stats.rushAtt),
    format: one,
    qualifier: { stat: (p) => p.stats.rushAtt, perGame: 6.25, label: "carries" },
  },
  { key: "rec", label: "Receptions", value: (p) => p.stats.rec },
  { key: "recYds", label: "Receiving yards", value: (p) => p.stats.recYds },
  { key: "recTd", label: "Receiving TDs", value: (p) => p.stats.recTd },
  { key: "scrimmage", label: "Yards from scrimmage", value: (p) => p.stats.rushYds + p.stats.recYds },
  { key: "tackles", label: "Tackles", value: (p) => p.stats.tackles },
  { key: "sacks", label: "Sacks", value: (p) => p.stats.sacks },
  { key: "ints", label: "Interceptions", value: (p) => p.stats.defInt },
  { key: "pd", label: "Passes defended", value: (p) => p.stats.passDefended },
  { key: "ff", label: "Forced fumbles", value: (p) => p.stats.forcedFumbles },
  { key: "fgm", label: "Field goals made", value: (p) => p.stats.fgMade },
  {
    key: "fgPct",
    label: "Field goal %",
    value: (p) => (100 * p.stats.fgMade) / Math.max(1, p.stats.fgAtt),
    format: one,
    qualifier: { stat: (p) => p.stats.fgAtt, perGame: 0.75, label: "attempts" },
  },
  {
    key: "puntAvg",
    label: "Punting average",
    value: (p) => p.stats.puntYds / Math.max(1, p.stats.punts),
    format: one,
    qualifier: { stat: (p) => p.stats.punts, perGame: 2, label: "punts" },
  },
  {
    key: "krAvg",
    label: "Kick return average",
    value: (p) => p.stats.kickRetYds / Math.max(1, p.stats.kickRet),
    format: one,
    qualifier: { stat: (p) => p.stats.kickRet, perGame: 1, label: "returns" },
  },
];

export interface Leader {
  player: PlayerSeason;
  value: number;
  display: string;
}

/**
 * Top `n` in a category. Rate stats only count players who meet the per-game
 * minimum, scaled by how many games their team has played.
 */
export function leaders(season: SeasonStats, category: LeaderCategory, n = 5): Leader[] {
  const fmt = category.format ?? ((v: number) => String(Math.round(v)));
  const out: Leader[] = [];
  for (const p of season.players.values()) {
    if (category.qualifier) {
      const teamGames = season.teams.get(p.team)?.games ?? 0;
      if (category.qualifier.stat(p) < category.qualifier.perGame * teamGames) continue;
    }
    const value = category.value(p);
    if (value <= 0 && !category.qualifier) continue;
    out.push({ player: p, value, display: fmt(value) });
  }
  out.sort((a, b) => (category.ascending ? a.value - b.value : b.value - a.value) || a.player.id.localeCompare(b.player.id));
  return out.slice(0, n);
}
