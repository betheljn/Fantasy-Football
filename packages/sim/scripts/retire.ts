// Milestone 3, step 2: one offseason of retirements.
// Usage: node scripts/retire.ts [league-seed]
import { allTeams, displayName, generateLeague, processRetirements, teamName, validateTeam } from "../src/index.ts";

const seed = process.argv[2] ?? "dynasty";
const league = generateLeague(seed);
const { league: after, retirees } = processRetirements(league);

console.log(`Retirements after the ${league.season} season, league "${seed}": ${retirees.length} players (${(retirees.length / 50).toFixed(1)} per team)\n`);

const byPos = new Map<string, number>();
for (const r of retirees) byPos.set(r.player.position, (byPos.get(r.player.position) ?? 0) + 1);
console.log("By position: " + [...byPos.entries()].sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ${n}`).join(", "));

const byAge = new Map<number, number>();
for (const r of retirees) byAge.set(r.player.age, (byAge.get(r.player.age) ?? 0) + 1);
console.log("By age:      " + [...byAge.entries()].sort((a, b) => a[0] - b[0]).map(([a, n]) => `${a}: ${n}`).join(", "));

console.log("\nNotable retirements (still the best players to hang it up):");
for (const r of [...retirees].sort((a, b) => b.overall - a.overall).slice(0, 8)) {
  console.log(`  ${`${displayName(r.player)} ${r.player.position}`.padEnd(20)} ${teamName(league.teams[r.team]!).padEnd(28)} age ${r.player.age}, overall ${r.overall}`);
}

const short = allTeams(after).filter((t) => validateTeam(t).length > 0);
console.log(`\nTeams now short at a position (the draft and roster moves will refill these): ${short.length}`);
for (const t of short) console.log(`  ${teamName(t)}: ${validateTeam(t).join("; ")}`);
