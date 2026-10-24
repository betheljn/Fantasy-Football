// Times every heavy step the app runs, in the order a player meets them.
// A phone runs Hermes, which has no JIT: `pnpm bench:phone` compiles the sim
// to JavaScript and runs this without the JIT to approximate one (Node can't
// strip TypeScript without the JIT). `node scripts/bench.ts` runs it with it.
import {
  addGameToSeason,
  allTeams,
  beginOffseason,
  buildDynasty,
  completeOffseason,
  createScouting,
  createSeasonStats,
  advanceScoutingWeek,
  aiInSeasonMoves,
  aiTradeWeek,
  boardGames,
  choreograph,
  closeSeasonBooks,
  coachScheduledGame,
  collectWeek,
  computeRankings,
  computeRecords,
  filmStudy,
  injuryNews,
  linesSteps,
  emptyRecords,
  playWeek,
  pregameEdge,
  radioShow,
  rivalries,
  rivalryGames,
  rivalryNews,
  seasonWindow,
  startCollection,
  startLeagueBusiness,
  weeklyNews,
  winChances,
  type GameSummary,
  type League,
  type Story,
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
const results: GameSummary[] = [];
let scouting = createScouting(dynasty.league, draftClass);
let league: League = dynasty.league;
let collection = startCollection(dynasty.recordBook);
const told: Story[] = [];
const rivals = rivalries(league.seed);
// The app's week, piece by piece (the slowest week of the season for each).
const weekly = new Map<string, number>();
const piece = <T>(label: string, f: () => T): T => {
  const t0 = performance.now();
  const r = f();
  weekly.set(label, Math.max(weekly.get(label) ?? 0, performance.now() - t0));
  return r;
};
let weekTotal = 0;
for (let w = 1; w <= schedule.weeks; w++) {
  const t0 = performance.now();
  const before = league;
  const played = piece("Games (25) and practice", () => playWeek(league, schedule, w, (g) => addGameToSeason(stats, g)));
  collection = piece("Moments and records", () => collectWeek(collection, before, schedule.season, played.games, team));
  const injuries = piece("Injury news", () => injuryNews(before, [...played.games.flatMap((g) => g.result.injuries), ...played.practiceInjuries], w));
  const ai = piece("AI in-season moves", () => aiInSeasonMoves(played.league, schedule.season, w, new Set([team])));
  const talks = piece("AI trade talks", () => aiTradeWeek(ai.league, seasonWindow(ai.league, w), new Set([team])));
  league = talks.league;
  scouting = piece("Scouting and recruiting (50 teams)", () => advanceScoutingWeek(scouting, league, draftClass));
  const prior = [...results];
  results.push(...played.games.map((g) => g.summary));
  const [rankBefore, rankAfter] = piece("Rankings (before and after)", () => {
    const b = computeRankings(before, prior);
    return [b, computeRankings(league, results, b)] as const;
  });
  const stories = piece("The week's news", () => [
    ...weeklyNews({ league, schedule, season: schedule.season, week: w, games: played.games, results, before: rankBefore, after: rankAfter, stats, injuries, trades: talks.trades, userTeam: team, careers: dynasty.careers, told }),
    ...rivalryNews(league, rivals, rivalryGames(rivals, prior, schedule.season), rivalryGames(rivals, played.games.map((g) => g.summary), schedule.season)),
  ]);
  told.push(...stories);
  const total = performance.now() - t0;
  weekTotal = Math.max(weekTotal, total);
}
const standings = divisionStandings(league, results);
const season = { season: schedule.season, schedule, results, standings };
const playoffs = time("Playoffs (all 15 games)", () => simulatePlayoffs(league, season));
time("Season books (50 teams)", () => closeSeasonBooks(league, startLeagueBusiness(league), schedule.season, results, computeRecords(league, results), new Map(), new Set([team])));
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

// The picks board: run a step at a time between frames (the longest step is what you'd feel).
const board = boardGames(dynasty.league, schedule, 2, team);
const steps = linesSteps(dynasty.league, board, undefined, team);
let longest = 0;
let n = 0;
const b0 = performance.now();
let r = steps.next();
for (;;) {
  const s0 = performance.now();
  r = steps.next();
  longest = Math.max(longest, performance.now() - s0);
  n++;
  if (r.done) break;
}
const boardTotal = performance.now() - b0;
const lines = r.value;
time("Radio show", () => radioShow({ leagueSeed: dynasty.league.seed, season: schedule.season, week: 2, board: lines, stats, stories: told, lastWeek: [], records: emptyRecords(), own: team }));

// Coaching your own game: each snap (the call, then the field's drawing, the
// win chance and film study), and picking a game back up from its calls.
const mine = schedule.games.find((g) => g.week === 2 && (g.home === team || g.away === team))!;
const coached = coachScheduledGame(dynasty.league, mine, team);
const you = dynasty.league.teams[team]!;
const them = dynasty.league.teams[mine.home === team ? mine.away : mine.home]!;
const edge = pregameEdge(dynasty.league.teams[mine.home]!, dynasty.league.teams[mine.away]!);
let snapMax = 0;
let snapSum = 0;
let snaps = 0;
while (coached.prompt) {
  const s0 = performance.now();
  coached.answer();
  const sofar = coached.sofar;
  const last = sofar.plays[sofar.plays.length - 1];
  if (last) choreograph(last.event, `${sofar.seed}:${last.seq}`);
  winChances(sofar, edge);
  const q = coached.prompt;
  if (q?.kind === "offense") filmStudy(3, you, them, "offense", q.situation, { personnel: q.formation.personnel, set: q.formation.set }, sofar.plays);
  else if (q?.kind === "defense") filmStudy(3, you, them, "defense", q.situation, q.offense, sofar.plays);
  const ms = performance.now() - s0;
  snapMax = Math.max(snapMax, ms);
  snapSum += ms;
  snaps++;
}
time(`Pick up a coached game (${coached.calls.length} calls)`, () => coachScheduledGame(dynasty.league, mine, team, coached.calls));

const jit = process.execArgv.includes("--jitless") ? "jitless" : "JIT";
console.log(`Timings (${jit}):`);
const row = (label: string, ms: number) => console.log(`  ${label.padEnd(44)} ${ms.toFixed(0).padStart(7)} ms`);
for (const [label, ms] of times) row(label, ms);
console.log("A week of the season (its slowest week, all in one go):");
for (const [label, ms] of weekly) row(label, ms);
row("The whole week", weekTotal);
console.log("The picks board (a step between frames):");
row(`All ${board.length} games' lines (${n} steps)`, boardTotal);
row("Longest step", longest);
console.log(`Coaching a game (${snaps} calls):`);
row("Each snap, on average", snapSum / Math.max(1, snaps));
row("The slowest snap", snapMax);
