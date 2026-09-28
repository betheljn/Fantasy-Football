// Milestone 2, step 5: regular season, then the playoffs to a champion.
// Usage: node scripts/playoffs.ts [league-seed]
import { ROUND_NAMES, formatRecord, generateLeague, simulatePlayoffs, simulateSeason, teamName, type PlayoffRound } from "../src/index.ts";

const seed = process.argv[2] ?? "dynasty";
const league = generateLeague(seed);
const t0 = performance.now();
const season = simulateSeason(league);
const playoffs = simulatePlayoffs(league, season);
const secs = (performance.now() - t0) / 1000;
const name = (abbr: string) => teamName(league.teams[abbr]!);

console.log(`${season.season} season, league "${seed}" (regular season + playoffs in ${secs.toFixed(1)}s)\n`);
for (const conf of league.conferences) {
  console.log(`${conf.name} seeds`);
  for (const s of playoffs.seeds[conf.abbr]!) {
    console.log(`  ${s.seed}. ${name(s.team).padEnd(28)} ${formatRecord(s.record).padStart(6)}  ${s.divisionWinner ? "division winner" : "wild card"}`);
  }
  console.log();
}

const rounds: PlayoffRound[] = ["wild_card", "divisional", "conference", "championship"];
for (const round of rounds) {
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
