// Milestone 2, step 2: build a season schedule and print highlights.
// Usage: node scripts/schedule.ts [league-seed] [team]
import { generateLeague, generateSchedule, gamesForWeek, teamName, teamSchedule } from "../src/index.ts";

const seed = process.argv[2] ?? "dynasty";
const league = generateLeague(seed);
const t0 = performance.now();
const schedule = generateSchedule(league);
const ms = performance.now() - t0;
const team = (process.argv[3] ?? "TX").toUpperCase();
const name = (abbr: string) => teamName(league.teams[abbr]!);

console.log(`${league.season} schedule for league "${seed}": ${schedule.games.length} games over ${schedule.weeks} weeks (built in ${ms.toFixed(0)}ms)\n`);

console.log("Week 1:");
for (const g of gamesForWeek(schedule, 1)) console.log(`  ${g.away.padEnd(3)} at ${g.home.padEnd(3)}  (${g.kind})`);

console.log("\nByes:");
for (let w = 1; w <= schedule.weeks; w++) {
  const off = Object.entries(schedule.byes).filter(([, b]) => b.includes(w)).map(([t]) => t).sort();
  if (off.length > 0) console.log(`  Week ${String(w).padStart(2)}: ${off.join(", ")}`);
}

console.log(`\n${name(team)} schedule:`);
const games = teamSchedule(schedule, team);
for (let w = 1; w <= schedule.weeks; w++) {
  const g = games.find((x) => x.week === w);
  if (!g) {
    console.log(`  Week ${String(w).padStart(2)}  BYE`);
    continue;
  }
  const home = g.home === team;
  const opp = home ? g.away : g.home;
  console.log(`  Week ${String(w).padStart(2)}  ${home ? "vs" : "at"} ${name(opp).padEnd(28)} ${g.kind}`);
}
