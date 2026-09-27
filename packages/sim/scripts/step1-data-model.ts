// Milestone step 1 demo: build a hand-made team and print its depth chart.
import { POSITIONS, displayName, getPlayer, playerOverall, teamName, validateTeam } from "../src/index.ts";
import { minimalTeam } from "../test/fixtures.ts";

const team = minimalTeam();
console.log(`${teamName(team)} (${team.abbr}) - ${team.roster.length} players\n`);

for (const pos of POSITIONS) {
  const row = team.depthChart[pos]
    .map((id) => {
      const p = getPlayer(team, id);
      return `#${p.jersey} ${displayName(p)} (${playerOverall(p)})`;
    })
    .join(", ");
  console.log(`${pos.padEnd(3)} ${row}`);
}

const qb = getPlayer(team, team.depthChart.QB[0]!);
console.log(`\nStarting QB ratings:`, qb.ratings);

const issues = validateTeam(team);
console.log(`\nValidation: ${issues.length === 0 ? "OK" : issues.join("; ")}`);
