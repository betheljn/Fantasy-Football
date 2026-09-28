// Draft classes: a new crop of prospects every offseason.
//
// Each prospect has true ratings and potential (hidden, like every player's)
// and a public projection: what the league's scouting consensus thinks he is,
// with noise. The big board ranks prospects by that projection.
import { POSITIONS, type Position } from "../model/positions.ts";
import { playerOverall, type Player } from "../model/player.ts";
import { Rng } from "../rng.ts";
import { ROSTER_TEMPLATE, generatePlayer } from "../gen/team-gen.ts";
import { DEV_TRAIT_CEILING, rollDevTrait } from "../gen/devtrait.ts";
import type { League } from "../league/league.ts";

export const DRAFT_CLASS_SIZE = 450;
/** Every class has at least this many kickers, punters and long snappers. */
export const MIN_SPECIALISTS = 6;

/** Talent of a class. Tuned so the league neither improves nor declines over the decades. */
export const DRAFT_TALENT = {
  /** Mean and spread of true potential. */
  potentialMean: 62,
  potentialSd: 9,
  /** How far below potential a 21-year-old starts, on average. */
  gapAt21: 12,
  gapSd: 4,
  /** Each extra year of age closes the gap by this much. */
  gapPerYear: 2,
};

/** Scouting consensus noise (standard deviation) on overall and on potential. */
export const PROJECTION_NOISE = { overall: 4, potential: 6 };

export interface Projection {
  overall: number;
  potential: number;
  /** Draft value used to rank the big board. */
  value: number;
}

export interface Prospect {
  player: Player;
  projection: Projection;
  /** 1 = top of the consensus big board. */
  boardRank: number;
}

export interface DraftClass {
  season: number;
  prospects: Prospect[];
}

/** Class size per position: the roster template scaled up, with a floor for specialists. */
export function classComposition(size = DRAFT_CLASS_SIZE): Record<Position, number> {
  const rosterSize = POSITIONS.reduce((s, p) => s + ROSTER_TEMPLATE[p], 0);
  const counts = {} as Record<Position, number>;
  for (const pos of POSITIONS) {
    const scaled = Math.round((ROSTER_TEMPLATE[pos] * size) / rosterSize);
    counts[pos] = pos === "K" || pos === "P" || pos === "LS" ? Math.max(MIN_SPECIALISTS, scaled) : scaled;
  }
  // Absorb rounding into the biggest group so the class is exactly `size`.
  const total = POSITIONS.reduce((s, p) => s + counts[p], 0);
  counts.OL += size - total;
  return counts;
}

/**
 * How much teams value each position when drafting: quarterbacks, pass
 * rushers, linemen and corners go early; running backs, tight ends and
 * especially specialists slide.
 */
export const POSITION_VALUE: Record<Position, number> = {
  QB: 1.08, DL: 1.03, CB: 1.02, OL: 1.01, WR: 1.0, LB: 0.97, S: 0.96, TE: 0.95, RB: 0.94, K: 0.8, P: 0.78, LS: 0.72,
};

/** Board value: a blend of what a prospect is now and what he could become, scaled by position. */
export function draftValue(position: Position, overall: number, potential: number): number {
  return (0.45 * overall + 0.55 * potential) * POSITION_VALUE[position];
}

/**
 * Generate the draft class entering the league for `season`. Deterministic per
 * league seed and season.
 */
export function generateDraftClass(league: League, season = league.season + 1, size = DRAFT_CLASS_SIZE): DraftClass {
  const rng = new Rng(`${league.seed}:${season}:draftclass`);
  const t = DRAFT_TALENT;
  const counts = classComposition(size);
  const players: Player[] = [];
  let n = 0;
  for (const pos of POSITIONS) {
    for (let i = 0; i < counts[pos]; i++) {
      n++;
      const age = rng.pick([21, 21, 22, 22, 22, 23]);
      const potential = Math.round(Math.max(40, Math.min(95, rng.normal(t.potentialMean, t.potentialSd))));
      const gap = Math.max(2, rng.normal(t.gapAt21 - t.gapPerYear * (age - 21), t.gapSd));
      const p = generatePlayer(rng, {
        id: `D${season}-${String(n).padStart(3, "0")}`,
        position: pos,
        talentMean: 0, // unused: talent is given
        talent: potential - gap,
        age,
        jersey: 0, // assigned when drafted
      });
      const devTrait = rollDevTrait(rng, potential);
      const ceiling = Math.min(99, potential + DEV_TRAIT_CEILING[devTrait]);
      players.push({ ...p, potential: Math.max(ceiling, playerOverall(p)), devTrait, devTraitRevealed: false });
    }
  }

  const prospects: Prospect[] = players.map((player) => {
    const overall = Math.round(playerOverall(player) + rng.normal(0, PROJECTION_NOISE.overall));
    const potential = Math.round(Math.max(overall, player.potential + rng.normal(0, PROJECTION_NOISE.potential)));
    return { player, projection: { overall, potential, value: draftValue(player.position, overall, potential) }, boardRank: 0 };
  });
  prospects.sort((a, b) => b.projection.value - a.projection.value || a.player.id.localeCompare(b.player.id));
  prospects.forEach((p, i) => (p.boardRank = i + 1));
  return { season, prospects };
}
