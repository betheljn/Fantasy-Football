// Development traits: rolled with potential, correlated with it.
import type { DevTrait } from "../model/player.ts";
import type { Rng } from "../rng.ts";

/** Base frequency of each trait for an average prospect. */
export const DEV_TRAIT_WEIGHTS: Record<DevTrait, number> = { normal: 70, impact: 20, star: 8, elite: 2 };
/** Extra ceiling a trait adds when potential is rolled. */
export const DEV_TRAIT_CEILING: Record<DevTrait, number> = { normal: 0, impact: 2, star: 5, elite: 9 };

/**
 * Roll a trait. `promise` is the player's ceiling before the trait bonus (about
 * 62 for an average prospect); higher promise makes the better traits likelier.
 */
export function rollDevTrait(rng: Rng, promise: number): DevTrait {
  const z = (promise - 62) / 9;
  const w: Record<DevTrait, number> = {
    normal: DEV_TRAIT_WEIGHTS.normal,
    impact: DEV_TRAIT_WEIGHTS.impact * Math.exp(0.3 * z),
    star: DEV_TRAIT_WEIGHTS.star * Math.exp(0.6 * z),
    elite: DEV_TRAIT_WEIGHTS.elite * Math.exp(0.9 * z),
  };
  let roll = rng.next() * (w.normal + w.impact + w.star + w.elite);
  for (const t of ["elite", "star", "impact", "normal"] as const) {
    roll -= w[t];
    if (roll < 0) return t;
  }
  return "normal";
}
