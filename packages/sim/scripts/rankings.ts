// Weekly Top 25. Usage: node scripts/rankings.ts [league-seed] [week]
import { TOP_N, formatRecord, generateLeague, simulateSeason, teamName, weeklyRankings } from "../src/index.ts";

const seed = process.argv[2] ?? "dynasty";
const league = generateLeague(seed);
const season = simulateSeason(league);
const week = Math.min(Number(process.argv[3] ?? season.schedule.weeks), season.schedule.weeks);
const ranking = weeklyRankings(league, season.results, week)[week]!;

console.log(`${season.season} Top ${TOP_N}, ${week === 0 ? "preseason" : `after week ${week}`} (league "${seed}")`);
console.log("                                   record   score   move");
for (const e of ranking.slice(0, TOP_N)) {
  const move = e.previousRank === undefined ? "" : e.previousRank === e.rank ? "  --" : e.previousRank > e.rank ? `  +${e.previousRank - e.rank}` : `  -${e.rank - e.previousRank}`;
  console.log(`  ${String(e.rank).padStart(2)}. ${teamName(league.teams[e.team]!).padEnd(28)} ${formatRecord(e.record).padStart(6)}  ${e.score.toFixed(1).padStart(6)}  ${move.padStart(5)}`);
}
const dropped = ranking.filter((e) => e.rank > TOP_N && e.previousRank !== undefined && e.previousRank <= TOP_N);
if (dropped.length) console.log(`Dropped out: ${dropped.map((e) => `${e.team} (was ${e.previousRank})`).join(", ")}`);
