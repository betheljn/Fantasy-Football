// A Madden-style player card as console text: identity, overall, the
// attributes that matter most for his position, then every attribute by group.
import { DEV_TRAIT_NAMES, playerOverall, type Player } from "../model/player.ts";
import { formatContract } from "./capsheet.ts";
import type { RangeEstimate, ScoutingReport } from "../dynasty/scouting.ts";
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
      `  age ${player.age}${teamLabel ? `  ${teamLabel}` : ""}  OVR ${playerOverall(player)}` +
      `  Dev: ${player.devTraitRevealed ? DEV_TRAIT_NAMES[player.devTrait] : "?"}`,
  );
  if (player.contract) lines.push(`  Contract: ${formatContract(player.contract)}`);
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

/** "84" when known exactly (measured), "78-86" otherwise. */
export function formatRange(r: RangeEstimate): string {
  return r.exact || r.low === r.high ? `${r.low}*` : `${r.low}-${r.high}`;
}

/**
 * What one team knows about a prospect: every attribute as a range (exact
 * values from the combine marked *), estimated overall and potential, and the
 * development trait once scouted deeply enough.
 */
export function formatScoutingReport(report: ScoutingReport): string {
  const p = report.prospect.player;
  const cell = (k: RatingKey) => `${RATING_INFO[k].abbr.padEnd(4)}${formatRange(report.attributes[k]).padStart(6)}`;
  const lines: string[] = [];
  lines.push(
    `${p.firstName} ${p.lastName}  ${p.position}${p.archetype ? ` (${p.archetype})` : ""}  age ${p.age}` +
      `  [${report.team} scouting: ${Math.round(report.knowledge * 100)}% known]` +
      `  OVR ${formatRange(report.overall)}  POT ${formatRange(report.potential)}` +
      `  Dev: ${report.devTrait ? DEV_TRAIT_NAMES[report.devTrait] : "?"}`,
  );
  lines.push(`  Key:  ${keyAttributes(p, 6).map(cell).join("  ")}`);
  for (const group of GROUP_ORDER) {
    const keys = RATING_KEYS.filter((k) => RATING_INFO[k].group === group && (OVERALL_WEIGHTS[p.position][k] ?? 0) > 0);
    if (keys.length === 0) continue;
    const cells = keys.map(cell);
    for (let i = 0; i < cells.length; i += 6) lines.push(`  ${(i === 0 ? group : "").padEnd(14)}${cells.slice(i, i + 6).join("  ")}`);
  }
  return lines.join("\n");
}
