import { POSITIONS, type Position } from "../model/positions.ts";
import { createPlayer, playerOverall, type Player } from "../model/player.ts";
import { OVERALL_WEIGHTS, RATING_KEYS, clampRating, type RatingKey, type Ratings } from "../model/ratings.ts";
import { ROSTER_MAX, buildDepthChart, type Team } from "../model/team.ts";
import type { Rng } from "../rng.ts";
import { ARCHETYPES, type Archetype } from "./archetypes.ts";

/** Awareness and play recognition gained per pro season (matches development). */
export const MENTAL_GROWTH_PER_YEAR = 0.8;
import { DEV_TRAIT_CEILING, rollDevTrait } from "./devtrait.ts";
import { FIRST_NAMES, LAST_NAMES, NICKNAMES, STATES } from "./names.ts";

/** How many players of each position a generated 72-man roster carries. */
export const ROSTER_TEMPLATE: Record<Position, number> = {
  QB: 3, RB: 5, WR: 10, TE: 5, OL: 14, DL: 11, LB: 8, CB: 8, S: 5, K: 1, P: 1, LS: 1,
};

/**
 * Baseline for attributes that are NOT part of a position's overall formula,
 * so an OL is strong but slow and a CB is fast but can't block. Anything
 * unlisted is 25.
 */
const OFF_ROLE_BASE: Partial<Record<Position, Partial<Ratings>>> = {
  QB: { acceleration: 55, strength: 50, jumping: 45, stamina: 60, carrying: 45, ballCarrierVision: 40, elusiveness: 40, breakTackle: 35, playRecognition: 45 },
  RB: { strength: 55, jumping: 55, catchInTraffic: 40, shortRouteRunning: 45, mediumRouteRunning: 35, release: 40, passBlockPower: 40, passBlockFinesse: 38, runBlockPower: 35, kickReturn: 50, playRecognition: 40 },
  WR: { strength: 45, stamina: 60, carrying: 50, breakTackle: 40, ballCarrierVision: 45, jukeMove: 45, trucking: 30, kickReturn: 50, playRecognition: 35, runBlockFinesse: 30 },
  TE: { acceleration: 55, agility: 50, jumping: 55, stamina: 60, carrying: 45, trucking: 45, deepRouteRunning: 40, spectacularCatch: 40 },
  OL: { speed: 30, acceleration: 35, jumping: 30, stamina: 60 },
  DL: { agility: 45, jumping: 45, stamina: 60, awareness: 45 },
  LB: { agility: 55, jumping: 55, stamina: 60, press: 35 },
  CB: { strength: 45, stamina: 60, shortRouteRunning: 40, mediumRouteRunning: 35, deepRouteRunning: 35, release: 35, catchInTraffic: 40, spectacularCatch: 40, hitPower: 40, pursuit: 50, blockShedding: 35, kickReturn: 50 },
  S: { strength: 55, agility: 60, stamina: 60, press: 40, blockShedding: 45 },
  K: { speed: 40, strength: 40, agility: 40, stamina: 50, jumping: 35 },
  P: { speed: 40, strength: 40, agility: 40, stamina: 50, jumping: 35 },
  LS: { speed: 35, runBlockPower: 40, runBlockFinesse: 38, passBlockPower: 40, passBlockFinesse: 38, stamina: 50 },
};

/**
 * Physical shape of each position for attributes that ARE in its overall
 * formula: linemen are stronger than their talent level, skill players faster.
 */
const PHYSICAL_PROFILE: Partial<Record<Position, Partial<Ratings>>> = {
  RB: { speed: 8, acceleration: 8, agility: 5 },
  WR: { speed: 12, acceleration: 8, agility: 5, jumping: 4 },
  TE: { strength: 8 },
  OL: { strength: 20 },
  DL: { strength: 15, acceleration: 5 },
  LB: { strength: 5, speed: 3 },
  CB: { speed: 12, acceleration: 8, agility: 5, jumping: 3 },
  S: { speed: 6 },
};

/**
 * Profile + archetype offsets. Offsets on attributes in the overall formula
 * are shifted so their weighted mean is zero: the archetype changes what kind
 * of player he is, not how good.
 */
function centredOffsets(pos: Position, archetype: Archetype): Partial<Ratings> {
  const weights = OVERALL_WEIGHTS[pos];
  const physical = PHYSICAL_PROFILE[pos] ?? {};
  const raw: Partial<Ratings> = { ...physical };
  for (const [k, v] of Object.entries(archetype.offsets) as [RatingKey, number][]) raw[k] = (raw[k] ?? 0) + v;
  let shift = 0;
  let weightSum = 0;
  for (const [key, w] of Object.entries(weights) as [RatingKey, number][]) {
    shift += (raw[key] ?? 0) * w;
    weightSum += w;
  }
  shift /= weightSum;
  const out: Partial<Ratings> = { ...raw };
  for (const key of Object.keys(weights) as RatingKey[]) out[key] = (raw[key] ?? 0) - shift;
  return out;
}

/** Preferred jersey ranges per position; falls back to any free number. */
const JERSEY_RANGES: Record<Position, Array<[number, number]>> = {
  QB: [[1, 19]],
  RB: [[20, 39], [0, 9]],
  WR: [[10, 19], [80, 89], [0, 9]],
  TE: [[80, 89], [40, 49]],
  OL: [[60, 79], [50, 59]],
  DL: [[90, 99], [50, 79]],
  LB: [[40, 59], [90, 99]],
  CB: [[20, 39], [0, 9]],
  S: [[20, 49]],
  K: [[1, 19]],
  P: [[1, 19]],
  LS: [[40, 59], [90, 99]],
};

export interface TeamIdentity {
  state: string;
  abbr: string;
  nickname: string;
}

export interface GenerateTeamOptions {
  /** Average talent of the roster; ~60 is a middling team. */
  talentMean?: number;
}

export function generateTeam(rng: Rng, identity: TeamIdentity, opts: GenerateTeamOptions = {}): Team {
  const talentMean = opts.talentMean ?? rng.normal(60, 2);
  const usedJerseys = new Set<number>();
  const usedNames = new Set<string>();
  const roster: Player[] = [];

  for (const pos of POSITIONS) {
    for (let i = 0; i < ROSTER_TEMPLATE[pos]; i++) {
      roster.push(
        generatePlayer(rng, {
          id: `${identity.abbr}-${String(roster.length + 1).padStart(3, "0")}`,
          position: pos,
          talentMean,
          jersey: pickJersey(rng, pos, usedJerseys),
          usedNames,
        }),
      );
    }
  }
  if (roster.length > ROSTER_MAX) throw new Error(`Template produced ${roster.length} players`);

  // Potentials come from their own stream, drawn after the roster, so they
  // don't change any player's name, age or ratings.
  const potentialRng = rng.fork("potential");
  for (let i = 0; i < roster.length; i++) roster[i] = rollPotential(potentialRng, roster[i]!);

  return {
    id: identity.abbr,
    state: identity.state,
    nickname: identity.nickname,
    abbr: identity.abbr,
    roster,
    depthChart: buildDepthChart(roster),
  };
}

/**
 * Give a player a development trait and ceiling. Young players have the most
 * room to grow; by the late 20s potential is close to what the player already
 * is. Better traits come with a higher ceiling. Players 22 and younger haven't
 * finished a pro season, so their trait isn't known yet.
 */
export function rollPotential(rng: Rng, player: Player): Player {
  const ovr = playerOverall(player);
  const room = Math.max(0, rng.normal(Math.max(0, 26 - player.age) * 1.6 + 2, 4));
  const devTrait = rollDevTrait(rng, ovr + room);
  const potential = Math.min(99, Math.round(ovr + room + DEV_TRAIT_CEILING[devTrait]));
  return { ...player, potential, devTrait, devTraitRevealed: player.age >= 23 };
}

interface PlayerGenInput {
  id: string;
  position: Position;
  talentMean: number;
  jersey: number;
  /** Display names ("J. Smith") already on the team; the new player gets a distinct one. */
  usedNames?: Set<string>;
  /** Fixed age (e.g. a draft prospect); otherwise drawn. */
  age?: number;
  /** Fixed talent level, before position shaping; otherwise drawn around talentMean. */
  talent?: number;
}

export function generatePlayer(rng: Rng, input: PlayerGenInput): Player {
  const { position } = input;
  // Skewed toward young players but with a real veteran tail; specialists last longer.
  const specialist = position === "K" || position === "P" || position === "LS";
  const age = input.age ?? Math.min(specialist ? 40 : 36, 21 + Math.floor(Math.abs(rng.normal(0, specialist ? 7.5 : 6.5))));
  // Young players are still developing; veterans past 31 are fading.
  const peakEnd = specialist ? 35 : 31;
  const ageAdj = age < 24 ? -(24 - age) * 2 : age > peakEnd ? -(age - peakEnd) * 2 : 0;
  const talent = input.talent ?? Math.max(35, Math.min(95, rng.normal(input.talentMean, 9) + ageAdj));

  const archetype = pickArchetype(rng, position);
  const weighted = OVERALL_WEIGHTS[position];
  const offRole = OFF_ROLE_BASE[position] ?? {};
  const offsets = centredOffsets(position, archetype);
  const ratings = {} as Ratings;
  for (const key of RATING_KEYS as readonly RatingKey[]) {
    ratings[key] =
      key in weighted
        ? clampRating(talent + (offsets[key] ?? 0) + rng.normal(0, 6))
        : clampRating((offRole[key] ?? 25) + (offsets[key] ?? 0) + (talent - 60) * 0.3 + rng.normal(0, 7));
  }

  // Experience: awareness and play recognition grow each pro season through 32
  // (the same growth development applies), so a generated veteran looks like
  // one who came up through the league.
  const experience = MENTAL_GROWTH_PER_YEAR * (Math.min(age, 32) - 22);
  ratings.awareness = clampRating(ratings.awareness + experience);
  ratings.playRecognition = clampRating(ratings.playRecognition + experience);

  const [firstName, lastName] = pickName(rng, input.usedNames);
  return createPlayer({
    id: input.id,
    firstName,
    lastName,
    position,
    age,
    jersey: input.jersey,
    ratings,
    archetype: archetype.name,
  });
}

function pickArchetype(rng: Rng, position: Position): Archetype {
  const options = ARCHETYPES[position];
  let roll = rng.next() * options.reduce((s, a) => s + a.weight, 0);
  for (const a of options) {
    roll -= a.weight;
    if (roll < 0) return a;
  }
  return options[options.length - 1]!;
}

function pickName(rng: Rng, used?: Set<string>): [string, string] {
  for (;;) {
    const first = rng.pick(FIRST_NAMES);
    const last = rng.pick(LAST_NAMES);
    const display = `${first.charAt(0)}. ${last}`;
    if (!used || !used.has(display)) {
      used?.add(display);
      return [first, last];
    }
  }
}

export function pickJersey(rng: Rng, pos: Position, used: Set<number>): number {
  for (const [lo, hi] of JERSEY_RANGES[pos]) {
    const free = [];
    for (let n = lo; n <= hi; n++) if (!used.has(n)) free.push(n);
    if (free.length > 0) {
      const n = rng.pick(free);
      used.add(n);
      return n;
    }
  }
  for (let n = 0; n <= 99; n++) {
    if (!used.has(n)) {
      used.add(n);
      return n;
    }
  }
  throw new Error("No free jersey numbers");
}

/** Generate `count` teams with distinct states and nicknames. */
export function generateTeams(rng: Rng, count: number): Team[] {
  if (count > STATES.length) throw new Error(`At most ${STATES.length} teams`);
  const states = rng.shuffle(STATES).slice(0, count);
  const nicknames = rng.shuffle(NICKNAMES);
  return states.map(([state, abbr], i) =>
    // Each team gets its own stream so one team's roster never shifts another's.
    generateTeam(rng.fork(abbr), { state, abbr, nickname: nicknames[i % nicknames.length]! }),
  );
}
