// In-season moves: injured reserve and signing free agents.
//
// Injured reserve is for the season: a player out at least IR_MIN_WEEKS goes
// on it, frees his spot on the 72-man roster (his cap hit still counts), and
// comes back in the offseason. Free agents are the players nobody signed in
// the offseason; a team with a spot and cap room can sign one for the rest of
// the season (a one-year deal at half his market value, never below the
// minimum). AI teams put long injuries on IR and sign the best fit at the
// thin spot; you make your own moves.
import { playerOverall, type Player, type PlayerId } from "../model/player.ts";
import { POSITIONS, type Position } from "../model/positions.ts";
import { ROSTER_MAX, buildDepthChart, type Team } from "../model/team.ts";
import type { Contract } from "../model/contract.ts";
import type { League } from "../league/league.ts";
import { allTeams } from "../league/league.ts";
import { GAME_MIN, SEASON_ENDING } from "../game/injuries.ts";
import { keepValue } from "../dynasty/roster.ts";
import { evaluationError, keepStyle } from "../dynasty/frontoffice.ts";
import { capSpace, marketValue, minimumSalary, salaryCap } from "./cap.ts";
import { mergeDepthChart } from "./trades.ts";
import { generatePlayer, pickJersey } from "../gen/team-gen.ts";
import { Rng } from "../rng.ts";

/** Fewest weeks out to go on injured reserve. */
export const IR_MIN_WEEKS = 4;
/** AI teams use IR for injuries this long or longer (it ends his season), when they can sign a replacement. */
export const AI_IR_WEEKS = 8;
/** How many free agents stay available through a season. */
export const FREE_AGENT_POOL = 240;
const POOL_PER_POSITION = 16;

/** A team's roster plus its injured reserve (everyone under contract). */
export function teamPlayers(team: Team): Player[] {
  return team.reserve && team.reserve.length > 0 ? [...team.roster, ...team.reserve] : team.roster;
}

/**
 * The free agents who stay available through the season: the best few at
 * every position, then the best of the rest. They're unsigned (no contract).
 */
export function freeAgentPool(players: readonly Player[], rostered: ReadonlySet<PlayerId> = new Set()): Player[] {
  const seen = new Set<PlayerId>(rostered);
  const unique = players.filter((p) => !seen.has(p.id) && (seen.add(p.id), true));
  const free = unique.map((p) => {
    const { contract: _c, injury: _i, ...rest } = p;
    return rest as Player;
  });
  const ranked = [...free].sort((a, b) => playerOverall(b) - playerOverall(a) || a.id.localeCompare(b.id));
  const picked = new Set<PlayerId>();
  for (const pos of POSITIONS) for (const p of ranked.filter((x) => x.position === pos).slice(0, POOL_PER_POSITION)) picked.add(p.id);
  for (const p of ranked) {
    if (picked.size >= FREE_AGENT_POOL) break;
    picked.add(p.id);
  }
  return ranked.filter((p) => picked.has(p.id));
}

/** What a free agent signs for during the season: one year, half his market value (at least the minimum). */
export function inSeasonContract(player: Player, league: League, season: number): Contract {
  const cap = salaryCap(league.seed, season);
  const salary = Math.max(minimumSalary(cap), Math.round(marketValue(player, cap) / 2 / 10) * 10);
  return { kind: "veteran", signed: season, years: [{ season, salary, bonus: 0, guaranteed: false }], homegrown: false };
}

export type InSeasonMoveKind = "injured reserve" | "signed";

export interface InSeasonMove {
  /** Made after this week's games (0 = before the season). */
  week: number;
  team: string;
  kind: InSeasonMoveKind;
  player: PlayerId;
  name: string;
  position: Position;
  overall: number;
  /** Salary for a signing, $K. */
  salary?: number;
}

const count = (team: Team, pos: Position) => team.roster.filter((p) => p.position === pos).length;

/** Can this player go on injured reserve? Empty = yes. */
export function irProblems(team: Team, id: PlayerId): string[] {
  const p = team.roster.find((x) => x.id === id);
  if (!p) return ["He isn't on the active roster."];
  if (!p.injury || p.injury.weeks < IR_MIN_WEEKS) return [`Only players out ${IR_MIN_WEEKS} weeks or more can go on injured reserve.`];
  if (count(team, p.position) - 1 < GAME_MIN[p.position]) return [`You'd be down to ${count(team, p.position) - 1} at ${p.position}: sign someone there first (a team needs ${GAME_MIN[p.position]}).`];
  return [];
}

function withTeam(league: League, team: Team): League {
  return { ...league, teams: { ...league.teams, [team.abbr]: team } };
}

const describe = (week: number, team: string, kind: InSeasonMoveKind, p: Player, salary?: number): InSeasonMove => ({
  week,
  team,
  kind,
  player: p.id,
  name: `${p.firstName} ${p.lastName}`,
  position: p.position,
  overall: playerOverall(p),
  ...(salary !== undefined ? { salary } : {}),
});

/** Put a player on injured reserve for the rest of the season. Check irProblems first. */
export function placeOnIR(league: League, abbr: string, id: PlayerId, week: number, keepDepth = false): { league: League; move: InSeasonMove } {
  const team = league.teams[abbr]!;
  const p = team.roster.find((x) => x.id === id)!;
  const roster = team.roster.filter((x) => x.id !== id);
  const reserve = [...(team.reserve ?? []), { ...p, injury: { type: p.injury!.type, weeks: SEASON_ENDING } }];
  const depthChart = keepDepth ? mergeDepthChart(team.depthChart, roster) : buildDepthChart(roster);
  return { league: withTeam(league, { ...team, roster, reserve, depthChart }), move: describe(week, abbr, "injured reserve", p) };
}

/** Can this team sign this free agent now? Empty = yes. */
export function signingProblems(league: League, season: number, abbr: string, id: PlayerId): string[] {
  const team = league.teams[abbr];
  const p = (league.freeAgents ?? []).find((x) => x.id === id);
  if (!team || !p) return ["He's no longer available."];
  const problems: string[] = [];
  if (team.roster.length >= ROSTER_MAX) problems.push(`The roster is full (${ROSTER_MAX}): put someone on injured reserve first.`);
  const hit = inSeasonContract(p, league, season).years[0]!.salary;
  if (capSpace(team, salaryCap(league.seed, season), season) < hit) problems.push("Not enough cap room.");
  return problems;
}

/** Sign a free agent for the rest of the season. Check signingProblems first. */
export function signFreeAgent(league: League, season: number, abbr: string, id: PlayerId, week: number, keepDepth = false): { league: League; move: InSeasonMove } {
  const team = league.teams[abbr]!;
  const p = league.freeAgents!.find((x) => x.id === id)!;
  const contract = inSeasonContract(p, league, season);
  // Numbers worn by players on injured reserve are taken too (they come back).
  const used = new Set(teamPlayers(team).map((x) => x.jersey));
  const jersey = used.has(p.jersey) ? pickJersey(new Rng(`jersey:${abbr}:${p.id}`), p.position, used) : p.jersey;
  const signed: Player = { ...p, jersey, contract };
  const roster = [...team.roster, signed];
  const depthChart = keepDepth ? mergeDepthChart(team.depthChart, roster) : buildDepthChart(roster);
  const next = withTeam({ ...league, freeAgents: league.freeAgents!.filter((x) => x.id !== id) }, { ...team, roster, depthChart });
  return { league: next, move: describe(week, abbr, "signed", signed, contract.years[0]!.salary) };
}

/** The free agent a team's GM likes best at a position (that it can afford), if any. */
function bestFit(league: League, season: number, team: Team, positions: readonly Position[]): Player | null {
  const room = capSpace(team, salaryCap(league.seed, season), season);
  const style = keepStyle(team);
  let best: { p: Player; v: number } | null = null;
  for (const p of league.freeAgents ?? []) {
    if (!positions.includes(p.position)) continue;
    if (inSeasonContract(p, league, season).years[0]!.salary > room) continue;
    const v = keepValue(p, undefined, style, evaluationError(team, p.id));
    if (!best || v > best.v) best = { p, v };
  }
  return best?.p ?? null;
}

/**
 * The AI's moves after a week (teams in `humans` make their own): long
 * injuries go on IR with a free agent signed in their place (a team that
 * can't sign a replacement keeps its injured player), and a team short of 72
 * fills its thinnest spot. Always within the cap.
 */
export function aiInSeasonMoves(league: League, season: number, week: number, humans: ReadonlySet<string> = new Set()): { league: League; moves: InSeasonMove[] } {
  let current = league;
  const moves: InSeasonMove[] = [];
  for (const abbr of allTeams(league).map((t) => t.abbr).sort()) {
    if (humans.has(abbr)) continue;
    // Long injuries to IR, a signing in each one's place.
    const hurt = current.teams[abbr]!.roster.filter((p) => p.injury && p.injury.weeks >= AI_IR_WEEKS).sort((a, b) => playerOverall(b) - playerOverall(a));
    for (const p of hurt.slice(0, 2)) {
      const team = current.teams[abbr]!;
      const replacement = bestFit(current, season, team, [p.position]);
      if (!replacement) continue;
      const ir = placeOnIR(current, abbr, p.id, week);
      if (signingProblems(ir.league, season, abbr, replacement.id).length > 0) continue;
      const s = signFreeAgent(ir.league, season, abbr, replacement.id, week);
      current = s.league;
      moves.push(ir.move, s.move);
    }
    // Short of a full roster (after trades): fill the thinnest spot.
    for (let n = 0; n < 2; n++) {
      const team = current.teams[abbr]!;
      if (team.roster.length >= ROSTER_MAX) break;
      const healthy = (pos: Position) => team.roster.filter((p) => p.position === pos && !(p.injury && p.injury.weeks > 0)).length;
      const thin = [...POSITIONS].sort((a, b) => healthy(a) / GAME_MIN[a] - healthy(b) / GAME_MIN[b]);
      const fit = bestFit(current, season, team, thin.slice(0, 3));
      if (!fit || signingProblems(current, season, abbr, fit.id).length > 0) break;
      const s = signFreeAgent(current, season, abbr, fit.id, week);
      current = s.league;
      moves.push(s.move);
    }
  }
  return { league: current, moves };
}

/** The offseason: everyone on injured reserve rejoins his team (healthy), and last season's free agents leave. */
export function endSeasonMoves(league: League): League {
  const teams: League["teams"] = {};
  for (const [abbr, t] of Object.entries(league.teams)) {
    if (!t.reserve || t.reserve.length === 0) {
      teams[abbr] = t;
      continue;
    }
    const { reserve, ...rest } = t;
    const roster = [...t.roster, ...reserve];
    teams[abbr] = { ...rest, roster, depthChart: buildDepthChart(roster) };
  }
  const { freeAgents: _gone, ...rest } = league;
  return { ...rest, teams };
}

/**
 * A league without a free-agent pool (a save from before there was one) gets
 * one: replacement-level players at every position, the same every time.
 */
export function ensureFreeAgents(league: League): League {
  if (league.freeAgents) return league;
  const rng = new Rng(`${league.seed}:${league.season}:free-agents`);
  const players: Player[] = [];
  for (const pos of POSITIONS)
    for (let i = 0, made = 0; made < POOL_PER_POSITION && i < POOL_PER_POSITION * 10; i++) {
      const p = generatePlayer(rng, { id: `FA${league.season}-pool-${pos}-${i}`, position: pos, talentMean: 52, jersey: 0 });
      // Replacement level: nobody a team would have kept.
      if (playerOverall(p) > 66) continue;
      players.push(p);
      made++;
    }
  return { ...league, freeAgents: freeAgentPool(players) };
}
