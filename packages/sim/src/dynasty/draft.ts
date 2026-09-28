// The draft: 7 rounds, every team picking from its own scouting board.
import type { Position } from "../model/positions.ts";
import type { Player, PlayerId } from "../model/player.ts";
import { buildDepthChart, type Team } from "../model/team.ts";
import { Rng } from "../rng.ts";
import { pickJersey } from "../gen/team-gen.ts";
import type { League } from "../league/league.ts";
import { PLAYOFF_ROUNDS, type PlayoffResult } from "../league/playoffs.ts";
import type { Prospect, DraftClass } from "./draftclass.ts";
import { positionNeeds, teamBoard, type BoardEntry, type ScoutingState } from "./scouting.ts";

export const DRAFT_ROUNDS = 7;
/** How many of the best available (on the team's own board) a team considers at each pick. */
export const DRAFT_CONSIDER = 12;
/** Need boosts: per unit of need, and for a position the team has nobody at. */
export const NEED_WEIGHT = 0.25;
export const EMPTY_POSITION_BOOST = 1.5;
/** Each rookie drafted at a position fills this much of its need (rookies aren't "solid" yet). */
export const ROOKIE_FILLS_NEED = 0.4;
/** Each rookie already taken at a position makes the next one there less appealing (no stockpiling). */
export const REPEAT_POSITION_PENALTY = 0.08;

export interface DraftPick {
  round: number;
  /** Pick within the round (1-50). */
  pick: number;
  /** Overall pick number (1-350). */
  overall: number;
  team: string;
  player: Player;
  /** Where the consensus board had him, and where this team's own board did. */
  publicRank: number;
  teamRank: number;
}

export interface DraftResult {
  season: number;
  /** Team abbrs in pick order for every round. */
  order: string[];
  picks: DraftPick[];
  /** League with the rookies on their new teams. */
  league: League;
  undrafted: Prospect[];
}

/**
 * Draft order for every round: non-playoff teams worst first (by final
 * ranking), then playoff teams by the round they were knocked out in (weaker
 * ranking first within a round), runner-up 49th, champion last.
 */
export function draftOrder(playoffs: PlayoffResult): string[] {
  const rankOf = new Map(playoffs.ranking.map((e) => [e.team, e.rank]));
  const inField = new Set(playoffs.seeds.map((s) => s.team));
  const byRankDesc = (a: string, b: string) => rankOf.get(b)! - rankOf.get(a)!;

  const missed = playoffs.ranking.map((e) => e.team).filter((t) => !inField.has(t)).sort(byRankDesc);
  const out = [...missed];
  for (const round of PLAYOFF_ROUNDS) {
    const losers = playoffs.games
      .filter((g) => g.round === round)
      .map((g) => (g.summary.winner === g.summary.home ? g.summary.away : g.summary.home))
      .sort(byRankDesc);
    out.push(...losers);
  }
  out.push(playoffs.champion);
  return out;
}

export interface DraftOptions {
  /**
   * Pick for a human-controlled team: given the team's board of available
   * prospects, return the chosen prospect's id. Teams without a chooser pick
   * automatically.
   */
  choose?: Record<string, (board: BoardEntry[]) => PlayerId>;
}

/**
 * Run the draft. Each team takes the best fit among the top of its own board:
 * value from its scouting estimates, boosted by position need (strongly where
 * it has nobody), with a little seeded variety between teams.
 */
export function runDraft(league: League, draftClass: DraftClass, scouting: ScoutingState, order: string[], opts: DraftOptions = {}): DraftResult {
  const rng = new Rng(`${league.seed}:${draftClass.season}:draft`);
  const available = new Set(draftClass.prospects.map((p) => p.player.id));
  const byId = new Map(draftClass.prospects.map((p) => [p.player.id, p]));
  const rosters = new Map<string, Player[]>(Object.entries(league.teams).map(([abbr, t]) => [abbr, [...t.roster]]));
  const picks: DraftPick[] = [];
  const drafted = new Map<string, Map<Position, number>>(Object.keys(league.teams).map((t) => [t, new Map()]));

  for (let round = 1; round <= DRAFT_ROUNDS; round++) {
    order.forEach((team, i) => {
      if (available.size === 0) return;
      const board = teamBoard(scouting, draftClass, team, available);
      const roster = rosters.get(team)!;
      let chosen: BoardEntry;
      const human = opts.choose?.[team];
      if (human) {
        const id = human(board);
        const entry = board.find((e) => e.prospect.player.id === id);
        if (!entry) throw new Error(`${team} tried to draft ${id}, who isn't available`);
        chosen = entry;
      } else {
        const needs = positionNeeds({ roster });
        const already = drafted.get(team)!;
        const has = (pos: Position) => roster.some((p) => p.position === pos);
        const fit = (e: BoardEntry) => {
          const pos = e.prospect.player.position;
          const need = Math.max(0, needs[pos] - ROOKIE_FILLS_NEED * (already.get(pos) ?? 0));
          const boost = (has(pos) ? 1 + NEED_WEIGHT * need : EMPTY_POSITION_BOOST) * (1 - REPEAT_POSITION_PENALTY * (already.get(pos) ?? 0));
          return e.value * boost * (1 + rng.normal(0, 0.02));
        };
        // Consider the top of the board, plus the best player at any empty position.
        const pool = board.slice(0, DRAFT_CONSIDER);
        for (const e of board) if (!has(e.prospect.player.position) && !pool.includes(e)) pool.push(e);
        chosen = pool.reduce((best, e) => (fit(e) > fit(best) ? e : best));
      }

      const p = chosen.prospect;
      available.delete(p.player.id);
      const counts = drafted.get(team)!;
      counts.set(p.player.position, (counts.get(p.player.position) ?? 0) + 1);
      const jersey = pickJersey(rng, p.player.position, new Set(roster.map((x) => x.jersey)));
      const player: Player = { ...p.player, jersey };
      roster.push(player);
      picks.push({
        round,
        pick: i + 1,
        overall: picks.length + 1,
        team,
        player,
        publicRank: p.boardRank,
        teamRank: chosen.rank,
      });
    });
  }

  const teams: Record<string, Team> = {};
  for (const [abbr, t] of Object.entries(league.teams)) {
    const roster = rosters.get(abbr)!;
    teams[abbr] = { ...t, roster, depthChart: buildDepthChart(roster) };
  }
  return {
    season: draftClass.season,
    order,
    picks,
    league: { ...league, teams },
    undrafted: [...available].map((id) => byId.get(id)!),
  };
}
