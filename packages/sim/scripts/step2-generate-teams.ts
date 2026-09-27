// Milestone step 2 demo: generate two random teams from a seed.
// Usage: node scripts/step2-generate-teams.ts [seed]
import {
  BASE_STARTERS,
  POSITIONS,
  POSITION_UNIT,
  Rng,
  displayName,
  generateTeams,
  playerOverall,
  starters,
  teamName,
  type Team,
  type Unit,
} from "../src/index.ts";

const seed = process.argv[2] ?? "2031";
const teams = generateTeams(new Rng(seed), 2);

console.log(`Seed: ${seed}\n`);

for (const team of teams) {
  printTeam(team);
}

function printTeam(team: Team): void {
  const ages = team.roster.map((p) => p.age);
  const avgAge = (ages.reduce((s, a) => s + a, 0) / ages.length).toFixed(1);
  console.log(`=== ${teamName(team)} (${team.abbr}) - ${team.roster.length} players, avg age ${avgAge} ===`);

  const unitAvg: Record<Unit, number[]> = { offense: [], defense: [], special: [] };
  for (const pos of POSITIONS) {
    const s = starters(team, pos);
    for (const p of s) unitAvg[POSITION_UNIT[pos]].push(playerOverall(p));
    const depth = team.depthChart[pos].length;
    const names = s.map((p) => `#${p.jersey} ${displayName(p)} ${playerOverall(p)} (${p.age})`).join(", ");
    console.log(`  ${pos.padEnd(3)} ${names}${depth > BASE_STARTERS[pos] ? `  [+${depth - BASE_STARTERS[pos]} depth]` : ""}`);
  }
  const fmt = (xs: number[]) => (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1);
  console.log(
    `  Starter OVR  offense ${fmt(unitAvg.offense)} | defense ${fmt(unitAvg.defense)} | special ${fmt(unitAvg.special)}\n`,
  );
}
