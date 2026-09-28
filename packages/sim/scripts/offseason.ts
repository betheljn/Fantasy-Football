// One full offseason: season + playoffs (with scouting), retirements, development,
// the draft, and roster moves down to 72.
// Usage: node scripts/offseason.ts [league-seed] [team]
import {
  developLeague,
  displayName,
  draftOrder,
  generateDraftClass,
  generateLeague,
  makeRosterMoves,
  playerOverall,
  processRetirements,
  runDraft,
  scoutSeason,
  simulatePlayoffs,
  simulateSeason,
  teamName,
  teamRatings,
  validateTeam,
  type League,
} from "../src/index.ts";

const [seed = "dynasty", teamArg = "TX"] = process.argv.slice(2);
const team = teamArg.toUpperCase();
const league = generateLeague(seed);
const t0 = performance.now();
const cls = generateDraftClass(league);
const scouting = scoutSeason(league, cls);
const playoffs = simulatePlayoffs(league, simulateSeason(league));
const order = draftOrder(playoffs);
const retired = processRetirements(league);
const developed = developLeague(retired.league);
const draft = runDraft(developed, cls, scouting, order);
const moves = makeRosterMoves(draft.league, { undrafted: draft.undrafted, scouting, order });
const secs = (performance.now() - t0) / 1000;
const next: League = { ...moves.league, season: league.season + 1 };

console.log(`Offseason after the ${league.season} season, league "${seed}" (whole year in ${secs.toFixed(1)}s)`);
console.log(`Champion: ${teamName(league.teams[playoffs.champion]!)}`);
console.log(`Retired ${retired.retirees.length} | drafted ${draft.picks.length} | signed ${moves.signings.length} undrafted/free agents | cut ${moves.cuts.length}`);
console.log(`All 50 rosters at 72 and valid: ${Object.values(next.teams).every((t) => t.roster.length === 72 && validateTeam(t).length === 0)}\n`);

const summary = (l: League) => {
  const t = l.teams[team]!;
  const ages = t.roster.map((p) => p.age);
  const r = teamRatings(t);
  return `avg age ${(ages.reduce((s, a) => s + a, 0) / ages.length).toFixed(1)}, starters OVR ${r.overall.toFixed(1)} (off ${r.offense.toFixed(1)}, def ${r.defense.toFixed(1)})`;
};
console.log(`${teamName(league.teams[team]!)}`);
console.log(`  ${league.season}: ${summary(league)}`);
console.log(`  ${next.season}: ${summary(next)}`);
const gone = retired.retirees.filter((r) => r.team === team).map((r) => `${displayName(r.player)} ${r.player.position} (${r.player.age}, ${r.overall})`);
console.log(`  Retired: ${gone.join(", ") || "none"}`);
console.log(`  Drafted: ${draft.picks.filter((p) => p.team === team).map((p) => `R${p.round} ${displayName(p.player)} ${p.player.position}`).join(", ")}`);
const cut = moves.cuts.filter((c) => c.team === team).map((c) => `${displayName(c.player)} ${c.player.position} (${c.player.age}, ${playerOverall(c.player)})`);
console.log(`  Cut: ${cut.join(", ") || "none"}`);
const signed = moves.signings.filter((s) => s.team === team).map((s) => `${displayName(s.player)} ${s.player.position} (${s.from})`);
console.log(`  Signed: ${signed.join(", ") || "none"}`);
