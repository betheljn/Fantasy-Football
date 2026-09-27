import {
  BASE_STARTERS,
  OVERALL_WEIGHTS,
  POSITIONS,
  buildDepthChart,
  createPlayer,
  type Player,
  type RatingKey,
  type Team,
} from "../src/index.ts";

/**
 * A hand-built minimal team: base starters at every position plus one backup
 * QB. Each position's key ratings step down by 6 per depth slot, so the
 * expected depth order is known. Not random; generation is milestone step 2.
 */
export function minimalTeam(): Team {
  const roster: Player[] = [];
  let jersey = 1;
  for (const pos of POSITIONS) {
    const count = BASE_STARTERS[pos] + (pos === "QB" ? 1 : 0);
    const keys = Object.keys(OVERALL_WEIGHTS[pos]) as RatingKey[];
    for (let i = 0; i < count; i++) {
      const ratings: Partial<Record<RatingKey, number>> = {};
      for (const k of keys) ratings[k] = 80 - i * 6;
      roster.push(
        createPlayer({
          // ids listed in reverse of skill so the depth chart has to actually sort
          id: `${pos}-${String.fromCharCode(90 - i)}`,
          firstName: "Test",
          lastName: `${pos}${i + 1}`,
          position: pos,
          jersey: jersey++,
          ratings,
        }),
      );
    }
  }
  return {
    id: "fixture",
    state: "Vermont",
    nickname: "Maples",
    abbr: "VT",
    roster,
    depthChart: buildDepthChart(roster),
  };
}
