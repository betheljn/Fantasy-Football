// Staff generation: ratings around an average hire, schemes and philosophies
// by weight, ages and experience that fit the role.
import { clampRating } from "../model/ratings.ts";
import {
  DEFENSIVE_SCHEMES,
  GM_PHILOSOPHIES,
  OFFENSIVE_SCHEMES,
  type DefensiveCoordinator,
  type GeneralManager,
  type HeadCoach,
  type OffensiveCoordinator,
  type ScoutingDirector,
  type StaffRole,
  type TeamStaff,
} from "../model/staff.ts";
import type { Rng } from "../rng.ts";
import { FIRST_NAMES, LAST_NAMES } from "./names.ts";

/** Typical age range per role. */
const AGES: Record<StaffRole, [number, number]> = { HC: [40, 66], OC: [34, 60], DC: [34, 60], GM: [38, 64], SCOUT: [34, 64] };

/** A rating for a staff member: average ~58, a little better with experience. */
function staffRating(rng: Rng, experience: number): number {
  return clampRating(Math.max(30, Math.min(95, rng.normal(56 + Math.min(experience, 12) * 0.4, 10))));
}

function base(rng: Rng, id: string, role: StaffRole) {
  const [lo, hi] = AGES[role];
  const age = rng.int(lo, hi);
  const experience = Math.max(0, Math.min(age - 30, Math.round(Math.abs(rng.normal(0, 6)))));
  const tenure = rng.int(0, Math.min(experience, 6));
  return { id, firstName: rng.pick(FIRST_NAMES), lastName: rng.pick(LAST_NAMES), age, experience, tenure };
}

export function generateHeadCoach(rng: Rng, id: string): HeadCoach {
  const b = base(rng, id, "HC");
  return {
    ...b,
    role: "HC",
    gameManagement: staffRating(rng, b.experience),
    discipline: staffRating(rng, b.experience),
    development: staffRating(rng, b.experience),
    aggressiveness: clampRating(rng.normal(50, 15)),
  };
}

export function generateOffensiveCoordinator(rng: Rng, id: string): OffensiveCoordinator {
  const b = base(rng, id, "OC");
  return {
    ...b,
    role: "OC",
    scheme: rng.pick(OFFENSIVE_SCHEMES),
    playCalling: staffRating(rng, b.experience),
    passingGame: staffRating(rng, b.experience),
    runningGame: staffRating(rng, b.experience),
    tempo: clampRating(rng.normal(45, 15)),
  };
}

export function generateDefensiveCoordinator(rng: Rng, id: string): DefensiveCoordinator {
  const b = base(rng, id, "DC");
  return {
    ...b,
    role: "DC",
    scheme: rng.pick(DEFENSIVE_SCHEMES),
    playCalling: staffRating(rng, b.experience),
    passDefense: staffRating(rng, b.experience),
    runDefense: staffRating(rng, b.experience),
  };
}

export function generateGeneralManager(rng: Rng, id: string): GeneralManager {
  const b = base(rng, id, "GM");
  return { ...b, role: "GM", philosophy: rng.pick(GM_PHILOSOPHIES), talentEvaluation: staffRating(rng, b.experience) };
}

export function generateScoutingDirector(rng: Rng, id: string): ScoutingDirector {
  const b = base(rng, id, "SCOUT");
  return { ...b, role: "SCOUT", scouting: staffRating(rng, b.experience) };
}

/** A full staff for one team. `idPrefix` keeps ids unique (e.g. the team abbr). */
export function generateStaff(rng: Rng, idPrefix: string): TeamStaff {
  return {
    hc: generateHeadCoach(rng, `S-${idPrefix}-HC`),
    oc: generateOffensiveCoordinator(rng, `S-${idPrefix}-OC`),
    dc: generateDefensiveCoordinator(rng, `S-${idPrefix}-DC`),
    gm: generateGeneralManager(rng, `S-${idPrefix}-GM`),
    scout: generateScoutingDirector(rng, `S-${idPrefix}-SCOUT`),
  };
}
