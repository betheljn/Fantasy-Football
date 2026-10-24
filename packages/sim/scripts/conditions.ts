// Milestone 25 step 1: game-day conditions. Forecasts by region through the
// season, then a season's games played twice (rules 5: no weather or crowd;
// rules 6: both), with what the weather did, by kind of day.
// Usage: node scripts/conditions.ts
import { CURRENT_FORMAT, describeConditions, gameConditions, gameDayTeam, gameSeed, generateLeague, generateSchedule, simulateGame, syncVenues, type GameConditions, type GameResult } from "../src/index.ts";

const base = { ...generateLeague("conditions-demo"), format: CURRENT_FORMAT };
const league = syncVenues({ league: base }).league;
const schedule = generateSchedule(league);
console.log("Forecasts (home team's region):");
for (const abbr of ["FL", "MN", "KS", "CA", "NY"]) {
  const lines = [1, 8, 15].map((w) => {
    const g = schedule.games.find((x) => x.week === w && x.home === abbr) ?? { id: `${abbr}-${w}`, week: w, home: abbr };
    return `wk ${w}: ${describeConditions(gameConditions(league, g))}`;
  });
  console.log(`  ${abbr.padEnd(3)} ${lines.join("  |  ")}`);
}

type Line = { games: number; pts: number; att: number; comp: number; fum: number; fga: number; fgm: number; fs: number };
const buckets = new Map<string, [Line, Line]>();
const bucketOf = (c: GameConditions) => (c.dome ? "dome" : c.precip !== "none" ? c.precip : c.wind >= 16 ? "windy" : c.temp < 32 ? "frozen" : "fair");
const tally = (g: GameResult, l: Line) => {
  l.games++;
  l.pts += g.score[g.home]! + g.score[g.away]!;
  for (const p of g.plays) {
    const e = p.event;
    if (e.kind === "pass" && e.outcome !== "sack") (l.att++, e.outcome === "complete" && l.comp++);
    if ((e.kind === "run" || e.kind === "pass") && e.fumble) l.fum++;
    if (e.kind === "field_goal") (l.fga++, e.made && l.fgm++);
    if (e.kind === "penalty" && e.penalty.type === "false_start" && e.offense === g.away) l.fs++;
  }
};
const empty = (): Line => ({ games: 0, pts: 0, att: 0, comp: 0, fum: 0, fga: 0, fgm: 0, fs: 0 });
for (const game of schedule.games) {
  const c = gameConditions(league, game);
  const home = gameDayTeam(league.teams[game.home]!).team;
  const away = gameDayTeam(league.teams[game.away]!).team;
  const b = buckets.get(bucketOf(c)) ?? [empty(), empty()];
  buckets.set(bucketOf(c), b);
  for (const [i, rules] of [5, 6].entries()) tally(simulateGame(home, away, gameSeed(league, game), { rules, conditions: c }), b[i]!);
}
const f = (l: Line) => `${(l.pts / l.games).toFixed(1).padStart(5)} pts  ${((100 * l.comp) / l.att).toFixed(1)}% comp  ${(l.fum / l.games).toFixed(2)} fum  ${l.fga ? ((100 * l.fgm) / l.fga).toFixed(0) : "-"}% FG  ${(l.fs / l.games).toFixed(2)} visitor false starts`;
console.log(`\n${schedule.games.length} games, each played under rules 5 (no conditions) and rules 6:`);
for (const [k, [a, b]] of [...buckets].sort((x, y) => y[1][0].games - x[1][0].games)) {
  console.log(`  ${k.padEnd(6)} (${String(a.games).padStart(3)} games)\n    rules 5: ${f(a)}\n    rules 6: ${f(b)}`);
}
const all = [...buckets.values()].reduce(([a, b], [x, y]) => [Object.fromEntries(Object.keys(a).map((k) => [k, (a as never)[k] + (x as never)[k]])) as Line, Object.fromEntries(Object.keys(b).map((k) => [k, (b as never)[k] + (y as never)[k]])) as Line], [empty(), empty()]);
console.log(`  all\n    rules 5: ${f(all[0])}\n    rules 6: ${f(all[1])}`);
