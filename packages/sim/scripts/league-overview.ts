// Milestone 2, step 1: generate the league and print its structure with team ratings.
// Usage: node scripts/league-overview.ts [seed]
import { allTeams, generateLeague, teamName, teamRatings } from "../src/index.ts";

const seed = process.argv[2] ?? "dynasty";
const t0 = performance.now();
const league = generateLeague(seed);
const ms = performance.now() - t0;
const teams = allTeams(league);
const players = teams.reduce((n, t) => n + t.roster.length, 0);

console.log(`League "${league.seed}", ${league.season} season: ${teams.length} teams, ${players} players (generated in ${ms.toFixed(0)}ms)\n`);
for (const conf of league.conferences) {
  console.log(`${conf.name.toUpperCase()} (${conf.abbr})`);
  for (const div of conf.divisions) {
    console.log(`  ${div.name}`);
    for (const abbr of div.teams) {
      const t = league.teams[abbr]!;
      const r = teamRatings(t);
      console.log(`    ${abbr.padEnd(3)} ${teamName(t).padEnd(28)} OVR ${r.overall.toFixed(1)}  (off ${r.offense.toFixed(1)}, def ${r.defense.toFixed(1)}, st ${r.special.toFixed(1)})`);
    }
  }
  console.log();
}

const ranked = teams.map((t) => ({ t, r: teamRatings(t).overall })).sort((a, b) => b.r - a.r);
const fmt = (x: { t: (typeof teams)[number]; r: number }) => `${teamName(x.t)} ${x.r.toFixed(1)}`;
console.log(`Strongest: ${ranked.slice(0, 3).map(fmt).join(", ")}`);
console.log(`Weakest:   ${ranked.slice(-3).reverse().map(fmt).join(", ")}`);
console.log(`Spread:    ${(ranked[0]!.r - ranked[ranked.length - 1]!.r).toFixed(1)} overall points between best and worst`);
