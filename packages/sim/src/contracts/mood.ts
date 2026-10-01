// Player personas and mood. A persona (home state and what he cares about) is
// derived from the player's id, so it never changes and needs no storage.
// Mood is how happy he is with a team right now: it decides whether he'll
// re-sign, and which free agent offer he takes.
import { STATES } from "../gen/names.ts";
import { BASE_STARTERS } from "../model/positions.ts";
import { playerOverall, type Player } from "../model/player.ts";
import { staffOverall } from "../model/staff.ts";
import type { Team } from "../model/team.ts";
import { Rng } from "../rng.ts";

export type Priority = "money" | "winning" | "playingTime" | "coach" | "home";
export const PRIORITIES: readonly Priority[] = ["money", "winning", "playingTime", "coach", "home"];
export const PRIORITY_NAMES: Record<Priority, string> = {
  money: "money",
  winning: "winning",
  playingTime: "playing time",
  coach: "the head coach",
  home: "playing at home",
};

export interface Persona {
  /** State he grew up in (team abbr). */
  homeState: string;
  /** How much each thing matters to him; sums to 1. */
  weights: Record<Priority, number>;
}

/** A player's persona, the same every time for the same id. */
const personaCache = new Map<string, Persona>();

export function persona(player: Pick<Player, "id">): Persona {
  const cached = personaCache.get(player.id);
  if (cached) return cached;
  const value = makePersona(player.id);
  if (personaCache.size > 100_000) personaCache.clear();
  personaCache.set(player.id, value);
  return value;
}

function makePersona(id: string): Persona {
  const rng = new Rng(`persona:${id}`);
  // Talent isn't tied to population: every state produces players equally,
  // so small states get hometown recruits too.
  const homeState = STATES[rng.int(0, STATES.length - 1)]![1];
  // Everyone cares about money; the rest varies a lot from player to player.
  const raw: Record<Priority, number> = {
    money: 1 + rng.next() * 1.5,
    winning: rng.next() * 1.6,
    playingTime: rng.next() * 1.4,
    coach: rng.next() * 0.8,
    home: rng.next() ** 2 * 1.4,
  };
  const sum = PRIORITIES.reduce((s, k) => s + raw[k], 0);
  const weights = Object.fromEntries(PRIORITIES.map((k) => [k, raw[k] / sum])) as Record<Priority, number>;
  return { homeState, weights };
}

/** What he cares about most, e.g. ["winning", "money"]. */
export function topPriorities(p: Persona, n = 2): Priority[] {
  return [...PRIORITIES].sort((a, b) => p.weights[b] - p.weights[a]).slice(0, n);
}

/** How a team looks to a player on each count, 0 (bad) to 1 (ideal). */
export interface TeamAppeal {
  winning: number;
  playingTime: number;
  coach: number;
  home: number;
}

/** Would he start for this team (among its best at his position)? */
export function wouldStart(team: Team, player: Player): boolean {
  const others = team.roster.filter((q) => q.position === player.position && q.id !== player.id).map(playerOverall);
  const better = others.filter((o) => o > playerOverall(player)).length;
  return better < BASE_STARTERS[player.position];
}

export function teamAppeal(team: Team, player: Player, winPct: number): TeamAppeal {
  const hc = team.staff?.hc;
  return {
    winning: winPct,
    playingTime: wouldStart(team, player) ? 1 : 0.25,
    coach: hc ? Math.max(0, Math.min(1, (staffOverall(hc) - 40) / 40)) : 0.5,
    home: persona(player).homeState === team.abbr ? 1 : 0.3,
  };
}

/**
 * How happy he is with a team (0-100): what matters to him, weighted. `pay`
 * is what he earns (or is offered) as a share of his market value.
 */
export function mood(player: Player, appeal: TeamAppeal, pay: number): number {
  const w = persona(player).weights;
  const money = Math.max(0, Math.min(1, 0.5 + (pay - 1) * 1.5));
  const score = w.money * money + w.winning * appeal.winning + w.playingTime * appeal.playingTime + w.coach * appeal.coach + w.home * appeal.home;
  return Math.round(score * 100);
}

export function moodLabel(m: number): string {
  return m >= 70 ? "Thrilled" : m >= 57 ? "Happy" : m >= 45 ? "Content" : m >= 33 ? "Unhappy" : "Miserable";
}

/**
 * Hometown discount: the share off his asking price he'll take to play for
 * his home-state team (up to 20% for a player who cares most about home).
 */
export function hometownDiscount(player: Player, team: Team): number {
  const p = persona(player);
  return p.homeState === team.abbr ? Math.min(0.2, p.weights.home * 0.6) : 0;
}

/**
 * Chance he re-signs rather than testing free agency: likely when happy, a
 * coin flip around "content", rare when miserable. Players re-signing with
 * the team that drafted them are a little more loyal.
 */
export function resignChance(m: number, homegrown: boolean): number {
  const x = (m - 40 + (homegrown ? 6 : 0)) / 7;
  return 0.05 + 0.93 / (1 + Math.exp(-x));
}
