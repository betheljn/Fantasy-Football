// Times the free-agency steps (the market screen's plan and the signing itself) and fingerprints their results.
import { beginOffseason, buildDynasty, createScouting, generateDraftClass, offseasonFreeAgencyPlan, playGame, resolveContracts, runDraft, runOffseasonFreeAgency, seasonSchedule, simulatePlayoffs, divisionStandings, createSeasonStats, addGameToSeason, allTeams, advanceScoutingWeek } from "../src/index.ts";

const steps = buildDynasty("fa-bench", 3);
let r = steps.next();
while (!r.done) r = steps.next();
const d = r.value;
const schedule = seasonSchedule(d);
const dc = generateDraftClass(d.league);
const stats = createSeasonStats();
let scouting = createScouting(d.league, dc);
const results = schedule.games.map((g) => {
  const { summary, result } = playGame(d.league, g);
  addGameToSeason(stats, result);
  return summary;
});
while (scouting.week < schedule.weeks) scouting = advanceScoutingWeek(scouting, d.league, dc);
const season = { season: schedule.season, schedule, results, standings: divisionStandings(d.league, results) };
const playoffs = simulatePlayoffs(d.league, season);
const begun = beginOffseason(d, { season, stats, playoffs, scouting });
const contracts = resolveContracts(begun);
const draft = runDraft(contracts.contracts!.league, contracts.draftClass, contracts.scouting, contracts.order);
const team = allTeams(d.league)[0]!.abbr;
const time = <T>(label: string, f: () => T): T => {
  const t0 = performance.now();
  const out = f();
  console.log(`${label} ${Math.round(performance.now() - t0)} ms`);
  return out;
};
const hash = (s: string) => `${s.length}:${[...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)}`;
const plan = time("market plan", () => offseasonFreeAgencyPlan(contracts, draft, team));
const fa = time("free agency", () => runOffseasonFreeAgency(contracts, draft));
console.log(`pool ${plan.pool.length}; plan ${hash(JSON.stringify(plan.pool.map((x) => [x.player.id, x.ask, x.interest, x.mood])))}; signed ${hash(JSON.stringify(fa.freeAgency!.result))}`);
