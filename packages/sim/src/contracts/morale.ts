// The locker room: each team's captains (an offensive and a defensive leader
// among its starters) and every player's morale through the season. Morale
// is worked out from what's happened (record, recent form, playing time, pay,
// the head coach, the captains), never stored, so it can't drift from the
// games. It doesn't change how games play; it sways whether players want to
// stay when their deals are up, and it makes the news.
import { capHit } from "../model/contract.ts";
import { playerOverall, type Player, type PlayerId } from "../model/player.ts";
import type { Position } from "../model/positions.ts";
import { starters, type Team } from "../model/team.ts";
import type { GameSummary } from "../league/standings.ts";
import { marketValue } from "./cap.ts";
import { mood, moodLabel, persona, teamAppeal, wouldStart } from "./mood.ts";

const OFFENSE: Position[] = ["QB", "RB", "WR", "TE", "OL"];
const DEFENSE: Position[] = ["DL", "LB", "CB", "S"];

/** Morale points for being a captain, for a strong captain in the room, and per game of recent form. */
export const MORALE = { captain: 6, leader: 2, perStreak: 2, maxForm: 8, lateGames: 5 };

/** How much his teammates follow him: talent, years in the league and football sense. */
export function leadership(p: Player): number {
  return playerOverall(p) + 1.5 * Math.min(10, Math.max(0, p.age - 22)) + 0.2 * p.ratings.awareness;
}

export interface Captains {
  offense: Player | null;
  defense: Player | null;
}

/** A team's captains: the starters on each side of the ball its players follow most. */
export function teamCaptains(team: Team): Captains {
  const pick = (positions: Position[]) => {
    const pool = positions.flatMap((pos) => starters(team, pos));
    return pool.reduce<Player | null>((best, p) => (!best || leadership(p) > leadership(best) || (leadership(p) === leadership(best) && p.id < best.id) ? p : best), null);
  };
  return { offense: pick(OFFENSE), defense: pick(DEFENSE) };
}

export function isCaptain(c: Captains, id: PlayerId): boolean {
  return c.offense?.id === id || c.defense?.id === id;
}

/** A team's games so far, oldest first. */
function gamesOf(results: readonly GameSummary[], abbr: string): GameSummary[] {
  return results.filter((g) => g.home === abbr || g.away === abbr).sort((a, b) => a.week - b.week);
}

/** Win share so far (0.5 before any games) and the current streak (+n wins, -n losses). */
export function teamForm(results: readonly GameSummary[], abbr: string): { winPct: number; streak: number; games: number } {
  const games = gamesOf(results, abbr);
  let w = 0;
  for (const g of games) w += g.winner === abbr ? 1 : g.winner === null ? 0.5 : 0;
  let streak = 0;
  for (let i = games.length - 1; i >= 0; i--) {
    const g = games[i]!;
    const won = g.winner === abbr;
    const lost = g.winner !== null && !won;
    if (!won && !lost) break;
    if (streak === 0) streak = won ? 1 : -1;
    else if ((streak > 0) === won) streak += won ? 1 : -1;
    else break;
  }
  return { winPct: games.length ? w / games.length : 0.5, streak, games: games.length };
}

export interface Morale {
  /** 0-100, on the same scale as mood. */
  value: number;
  label: string;
  /** What's lifting him or weighing on him, biggest first. */
  reasons: string[];
}

/** One player's morale on his team now, in `season` (whose salary cap is `cap`). */
export function playerMorale(player: Player, team: Team, results: readonly GameSummary[], season: number, cap: number, captains: Captains = teamCaptains(team)): Morale {
  const form = teamForm(results, team.abbr);
  // What he's paid against what he's worth (no deal: treated as fair).
  const hit = player.contract ? capHit(player.contract, season) : 0;
  const share = hit ? hit / Math.max(1, marketValue(player, cap)) : 1;
  const base = mood(player, teamAppeal(team, player, form.winPct), share);
  const w = persona(player).weights;
  const reasons: Array<[number, string]> = [];
  let value = base;
  // Recent form, felt more by players who care about winning.
  const formPts = Math.max(-MORALE.maxForm, Math.min(MORALE.maxForm, form.streak * MORALE.perStreak * (0.5 + w.winning * 2)));
  value += formPts;
  if (form.streak >= 3) reasons.push([formPts, `${form.streak} straight wins`]);
  if (form.streak <= -3) reasons.push([formPts, `${-form.streak} straight losses`]);
  if (isCaptain(captains, player.id)) {
    value += MORALE.captain;
    reasons.push([MORALE.captain, "team captain"]);
  } else if ([captains.offense, captains.defense].some((c) => c && leadership(c) >= 100)) {
    value += MORALE.leader;
    reasons.push([MORALE.leader, "follows a strong captain"]);
  }
  if (!wouldStart(team, player) && w.playingTime >= 0.25) reasons.push([-10, "wants more playing time"]);
  if (share < 0.6 && playerOverall(player) >= 70) reasons.push([-8, "feels underpaid"]);
  if (form.games >= 3 && form.winPct >= 0.7) reasons.push([5, "winning"]);
  if (form.games >= 3 && form.winPct <= 0.3) reasons.push([-5, "losing"]);
  const v = Math.round(Math.max(0, Math.min(100, value)));
  return { value: v, label: moodLabel(v), reasons: reasons.sort((a, b) => Math.abs(b[0]) - Math.abs(a[0])).map(([, r]) => r) };
}

/** A team's morale: its starters' average, and the most and least happy of them. */
export function teamMorale(team: Team, results: readonly GameSummary[], season: number, cap: number): { value: number; label: string; captains: Captains; low: Array<{ player: Player; morale: Morale }> } {
  const captains = teamCaptains(team);
  const lineup = [...OFFENSE, ...DEFENSE].flatMap((pos) => starters(team, pos));
  const all = lineup.map((p) => ({ player: p, morale: playerMorale(p, team, results, season, cap, captains) }));
  const value = Math.round(all.reduce((s, x) => s + x.morale.value, 0) / Math.max(1, all.length));
  return { value, label: moodLabel(value), captains, low: all.filter((x) => x.morale.value < 40).sort((a, b) => a.morale.value - b.morale.value) };
}

/**
 * How the season ended sways who wants to stay: captains are more loyal, and
 * a strong finish (or a collapse) lingers. Mood points, by player, for the
 * re-signing talks.
 */
export function seasonEndMorale(teams: readonly Team[], results: readonly GameSummary[]): Map<PlayerId, number> {
  const out = new Map<PlayerId, number>();
  for (const t of teams) {
    const late = gamesOf(results, t.abbr).slice(-MORALE.lateGames);
    const finish = late.reduce((s, g) => s + (g.winner === t.abbr ? 1 : g.winner === null ? 0 : -1), 0);
    const c = teamCaptains(t);
    for (const p of t.roster) {
      const d = finish * 1.5 + (isCaptain(c, p.id) ? MORALE.captain : 0);
      if (d) out.set(p.id, d);
    }
  }
  return out;
}
