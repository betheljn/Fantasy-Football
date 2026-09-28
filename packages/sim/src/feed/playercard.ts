// A Madden-style player card as console text: identity, overall, the
// attributes that matter most for his position, then every attribute by group.
import { playerOverall, type Player } from "../model/player.ts";
import { OVERALL_WEIGHTS, RATING_INFO, RATING_KEYS, type RatingGroup, type RatingKey } from "../model/ratings.ts";

const GROUP_ORDER: RatingGroup[] = ["Physical", "Mental", "Passing", "Ball Carrier", "Receiving", "Blocking", "Defense", "Special Teams"];

/** The attributes that weigh most in this player's overall, heaviest first. */
export function keyAttributes(player: Player, count = 8): RatingKey[] {
  return (Object.entries(OVERALL_WEIGHTS[player.position]) as [RatingKey, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([k]) => k);
}

export function formatPlayerCard(player: Player, teamLabel = ""): string {
  const r = player.ratings;
  const cell = (k: RatingKey) => `${RATING_INFO[k].abbr.padEnd(4)}${String(r[k]).padStart(3)}`;
  const lines: string[] = [];
  lines.push(
    `#${player.jersey} ${player.firstName} ${player.lastName}  ${player.position}${player.archetype ? ` (${player.archetype})` : ""}` +
      `  age ${player.age}${teamLabel ? `  ${teamLabel}` : ""}  OVR ${playerOverall(player)}`,
  );
  lines.push(`  Key:  ${keyAttributes(player).map(cell).join("  ")}`);
  for (const group of GROUP_ORDER) {
    const keys = RATING_KEYS.filter((k) => RATING_INFO[k].group === group);
    const cells = keys.map(cell);
    for (let i = 0; i < cells.length; i += 8) {
      lines.push(`  ${(i === 0 ? group : "").padEnd(14)}${cells.slice(i, i + 8).join("  ")}`);
    }
  }
  return lines.join("\n");
}
