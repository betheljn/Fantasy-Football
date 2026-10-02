// Times every heavy step the app runs, in the order a player meets them.
// Run with `node --jitless` to approximate a phone (Hermes has no JIT).
// Usage: node [--jitless] scripts/bench.ts
import {
  addGameToSeason,
  allTeams,
  beginOffseason,
  buildDynasty,
  completeOffseason,
  createScouting,
  createSeasonStats,
  advanceScoutingWeek,
  divisionStandings,
  generateDraftClass,
  offseasonContractPlan,
  offseasonFreeAgencyPlan,
  offseasonRosterPlan,
  offseasonStaffReleases,
  playGame,
  resolveContracts,
  runDraft,
  runOffseasonFreeAgency,
  seasonSchedule,
  simulatePlayoffs,
  staffCandidates,
  staffOverview,
  toSaveJson,
} from "../src/index.ts";

const times: Array<[string, number]> = [];
const time = <T>(label: string, f: () => T): T => {
  const t0 = performance.now();
  const r = f();
  times.push([label, performance.now() - t0]);
  return r;
};

const dynasty = time("New dynasty (15 settling offseasons)", () => {
  const steps = buildDynasty("bench");
  let r = steps.next();
  while (!r.done) r = steps.next();
  return r.value;
});
const team = allTeams(dynasty.league)[0]!.abbr;
const schedule = time("Season schedule", () => seasonSchedule(dynasty));
const draftClass = time("Draft class", () => generateDraftClass(dynasty.league));
const stats = createSeasonStats();
const results = [];
let scouting = createScouting(dynasty.league, draftClass);
for (let w = 1; w <= schedule.weeks; w++) {
  const label = w === 1 ? "Week 1: 25 games" : null;
  const t0 = performance.now();
  for (const g of schedule.games.filter((x) => x.week === w)) {
    const { summary, result } = playGame(dynasty.league, g);
    addGameToSeason(stats, result);
    results.push(summary);
  }
  const t1 = performance.now();
  scouting = advanceScoutingWeek(scouting, dynasty.league, draftClass);
  const t2 = performance.now();
  if (label) {
    times.push([label, t1 - t0]);
    times.push(["Week 1: scouting (50 teams)", t2 - t1]);
  }
}
const standings = divisionStandings(dynasty.league, results);
const season = { season: schedule.season, schedule, results, standings };
const playoffs = time("Playoffs (all 15 games)", () => simulatePlayoffs(dynasty.league, season));
const played = { season, stats, playoffs, scouting };
time("Staff screen (overview)", () => staffOverview(dynasty.league, dynasty.staffCareers, team));
const rel = time("Staff releases (for hiring)", () => offseasonStaffReleases(dynasty, played));
time("Hiring candidates", () => staffCandidates(rel, team));
const begun = time("Begin offseason (staff, retire, develop)", () => beginOffseason(dynasty, played));
time("Re-signing screen (contract plan)", () => offseasonContractPlan(begun, team));
const contracts = time("Resolve contracts", () => resolveContracts(begun));
const draft = time("Draft (all 350 picks)", () => runDraft(contracts.contracts!.league, contracts.draftClass, contracts.scouting, contracts.order));
time("Free agency screen (market plan)", () => offseasonFreeAgencyPlan(contracts, draft, team));
const fa = time("Free agency", () => runOffseasonFreeAgency(contracts, draft));
time("Cuts screen (roster plan)", () => offseasonRosterPlan(fa, team));
const done = time("Complete offseason (cuts, cap, records)", () => completeOffseason(fa, draft));
time("Serialize save (compact)", () => toSaveJson(done.dynasty).length);

const jit = process.execArgv.includes("--jitless") ? "jitless" : "JIT";
console.log(`Timings (${jit}):`);
for (const [label, ms] of times) console.log(`  ${label.padEnd(44)} ${ms.toFixed(0).padStart(7)} ms`);
