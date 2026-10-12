// Milestone 24 step 1: recruiting. A season of it: Ohio works on one local
// and one outside prospect (half its points each) while every other team
// recruits on its own; how the interest builds, who the top of the class
// leans to, and how much better Ohio knows its recruits.
// Usage: node scripts/recruiting.ts
import { CURRENT_FORMAT, RECRUITING, advanceScoutingWeek, allLeanings, createScouting, generateDraftClass, generateLeague, interestIn, isLocal, knowledge, recruitingPoints, regionOf, seasonWeeks, teamName } from "../src/index.ts";

const league = { ...generateLeague("recruit-demo"), format: CURRENT_FORMAT };
const cls = generateDraftClass(league);
const oh = league.teams.OH!;
const top = [...cls.prospects].sort((a, b) => a.boardRank - b.boardRank);
const local = top.find((p) => isLocal(oh, p))!;
const outside = top.find((p) => !isLocal(oh, p) && p !== local)!;
const pts = recruitingPoints(oh);
const name = (p: typeof local) => `${p.player.position} ${p.player.firstName} ${p.player.lastName} (No. ${p.boardRank}, ${p.player.home}, ${regionOf(p.player.home ?? "")})`;
console.log(`${teamName(oh)} (${oh.region ?? regionOf("OH")}): ${pts} recruiting points a week; local prospects warm ${RECRUITING.localBoost}x faster\n`);
console.log(`Targets: local ${name(local)}\n         outside ${name(outside)}\n`);

let s = createScouting(league, cls);
const half = Math.floor(pts / 2);
while (s.week < seasonWeeks(s)) {
  s = advanceScoutingWeek(s, league, cls, {}, { OH: [{ prospect: local.player.id, points: half }, { prospect: outside.player.id, points: pts - half }] });
  if (s.week % 4 === 0 || s.week === 1) {
    const lean = allLeanings(s);
    const fmt = (p: typeof local) => {
      const l = lean.get(p.player.id);
      return `${interestIn(s, "OH", p.player.id).toFixed(0).padStart(3)}${l ? ` (leans ${l.team})` : ""}`;
    };
    console.log(`week ${String(s.week).padStart(2)}: local ${fmt(local)}   outside ${fmt(outside)}`);
  }
}
const lean = allLeanings(s);
const top25 = top.slice(0, 25);
const leaning = top25.filter((p) => lean.get(p.player.id));
console.log(`\nThe top 25 at season's end: ${leaning.length} lean to a program`);
for (const p of top25.slice(0, 8)) {
  const l = lean.get(p.player.id);
  console.log(`  No. ${String(p.boardRank).padStart(2)} ${p.player.position.padEnd(2)} ${`${p.player.firstName} ${p.player.lastName}`.padEnd(20)} ${l ? `leans ${l.team} (interest ${l.interest.toFixed(0)}, ${l.margin.toFixed(0)} clear)` : "undecided"}`);
}
const know = (p: typeof local) => (knowledge(s, "OH", p.player.id) * 100).toFixed(0);
const avg = (top.slice(0, 50).reduce((t, p) => t + knowledge(s, "OH", p.player.id), 0) / 50 * 100).toFixed(0);
console.log(`\nOhio knows its recruits ${know(local)}% and ${know(outside)}% (the top 50 on average: ${avg}%)`);
