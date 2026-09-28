// Milestone 2, step 5: regular season, final rankings, then the 16-team playoff.
// Usage: node scripts/playoffs.ts [league-seed]
import { ROUND_NAMES, PLAYOFF_ROUNDS, TOP_N, formatRecord, generateLeague, simulatePlayoffs, simulateSeason, teamName } from "../src/index.ts";

const seed = process.argv[2] ?? "dynasty";
const league = generateLeague(seed);
const t0 = performance.now();
const season = simulateSeason(league);
const playoffs = simulatePlayoffs(league, season);
const secs = (performance.now() - t0) / 1000;
const name = (abbr: string) => teamName(league.teams[abbr]!);
const bid = new Map(playoffs.seeds.map((s) => [s.team, s]));

console.log(`${season.season} season, league "${seed}" (regular season + playoffs in ${secs.toFixed(1)}s)\n`);
console.log(`Final rankings (top ${TOP_N})         record   score  strength  sched`);
for (const e of playoffs.ranking.slice(0, TOP_N)) {
  const s = bid.get(e.team);
  const tag = s ? `seed ${s.seed}${s.bid === "division_winner" ? ", division winner" : ", at-large"}` : "";
  console.log(
    `  ${String(e.rank).padStart(2)}. ${name(e.team).padEnd(28)} ${formatRecord(e.record).padStart(6)}  ${e.score.toFixed(1).padStart(6)}` +
      `  ${(e.strength >= 0 ? "+" : "") + e.strength.toFixed(1)}`.padStart(9) +
      `  ${(e.scheduleStrength >= 0 ? "+" : "") + e.scheduleStrength.toFixed(1)}`.padStart(7) +
      (tag ? `   ${tag}` : ""),
  );
}
const lowAuto = playoffs.seeds.filter((s) => s.rank > TOP_N);
for (const s of lowAuto) console.log(`  ${String(s.rank).padStart(2)}. ${name(s.team).padEnd(28)} ${formatRecord(s.record).padStart(6)}   seed ${s.seed}, division winner`);
const snubbed = playoffs.ranking.find((e) => !bid.has(e.team))!;
console.log(`  First team out: #${snubbed.rank} ${name(snubbed.team)} ${formatRecord(snubbed.record)}\n`);

for (const round of PLAYOFF_ROUNDS) {
  console.log(ROUND_NAMES[round]);
  for (const g of playoffs.games.filter((x) => x.round === round)) {
    const s = g.summary;
    const seedOf = (abbr: string) => (abbr === s.home ? g.homeSeed : g.awaySeed);
    const winner = s.winner!;
    const loser = winner === s.home ? s.away : s.home;
    const [ws, ls] = winner === s.home ? [s.homeScore, s.awayScore] : [s.awayScore, s.homeScore];
    const where = g.neutralSite ? "neutral site" : `at ${s.home}`;
    console.log(`  (${seedOf(winner)}) ${name(winner)} ${ws}, (${seedOf(loser)}) ${name(loser)} ${ls}${s.overtime ? " (OT)" : ""}  [${where}]`);
  }
  console.log();
}
console.log(`CHAMPION: ${name(playoffs.champion)}  (runner-up: ${name(playoffs.runnerUp)})`);
