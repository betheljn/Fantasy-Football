// Milestone 3, step 3c: a season of scouting from one team's point of view.
// Usage: node scripts/scout.ts [league-seed] [team]
import {
  REGULAR_SEASON_WEEKS,
  advanceScoutingWeek,
  createScouting,
  formatScoutingReport,
  generateDraftClass,
  generateLeague,
  playerOverall,
  runCombine,
  scoutingReport,
  teamBoard,
  teamName,
} from "../src/index.ts";

const [seed = "dynasty", teamArg = "TX"] = process.argv.slice(2);
const team = teamArg.toUpperCase();
const league = generateLeague(seed);
const cls = generateDraftClass(league);
let state = createScouting(league, cls);

// Follow the prospect this team ends up focusing on most, and one it ignores.
const snapshots = new Map<number, typeof state>();
snapshots.set(0, state);
while (state.week < REGULAR_SEASON_WEEKS) {
  state = advanceScoutingWeek(state, league, cls);
  if ([8, 16, REGULAR_SEASON_WEEKS].includes(state.week)) snapshots.set(state.week, state);
}
const final = runCombine(state);
const focus = Object.entries(final.focus[team]!).sort((a, b) => b[1] - a[1]);
const target = cls.prospects.find((p) => p.player.id === focus[0]![0])!;

console.log(`${teamName(league.teams[team]!)} scouting the ${cls.season} class (league "${seed}")`);
console.log(`Focused on ${focus.length} prospects; most points on ${target.player.firstName} ${target.player.lastName} (${focus[0]![1]} pts)\n`);
for (const [week, s] of snapshots) {
  const r = scoutingReport(s, team, target);
  console.log(`Week ${week}: OVR ${r.overall.low}-${r.overall.high}, POT ${r.potential.low}-${r.potential.high}, ${Math.round(r.knowledge * 100)}% known, dev ${r.devTrait ?? "?"}`);
}
console.log(`\nAfter the combine:\n${formatScoutingReport(scoutingReport(final, team, target))}`);
console.log(`  (truth: OVR ${playerOverall(target.player)}, POT ${target.player.potential}, dev ${target.player.devTrait})`);

const ignored = cls.prospects.find((p) => p.boardRank <= 60 && !(p.player.id in final.focus[team]!))!;
console.log(`\nA top prospect ${team} never focused on:\n${formatScoutingReport(scoutingReport(final, team, ignored))}`);
console.log(`  (truth: OVR ${playerOverall(ignored.player)}, POT ${ignored.player.potential}, dev ${ignored.player.devTrait})`);

console.log(`\n${team}'s own big board (top 10)          est ovr/pot   known   truth ovr/pot   public rank`);
for (const e of teamBoard(final, cls, team).slice(0, 10)) {
  const p = e.prospect.player;
  console.log(
    `  ${String(e.rank).padStart(2)}. ${`${p.firstName} ${p.lastName}`.padEnd(20)} ${p.position.padEnd(3)}  ` +
      `${e.overall.toFixed(0).padStart(3)}/${e.potential.toFixed(0).padEnd(3)}     ${String(Math.round(e.knowledge * 100)).padStart(3)}%     ` +
      `${String(playerOverall(p)).padStart(3)}/${String(p.potential).padEnd(3)}        ${e.prospect.boardRank}`,
  );
}
