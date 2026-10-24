// Milestone 23 step 2b: coaches level up. Five seasons of a league: where
// its coaches stand, the best of them and their abilities, your program's
// coaches waiting on your picks; then what one ability does on the field.
// Usage: node scripts/coaches.ts
import { COACH_ABILITIES, CURRENT_FORMAT, Rng, allTeams, coachLevel, finishSeason, openSlots, playSeason, simulateRun, startDynasty, withOwners, xpForCoachLevel, type Dynasty, type Team } from "../src/index.ts";

let d: Dynasty = startDynasty("coach-demo");
d = withOwners({ ...d, league: { ...d.league, format: CURRENT_FORMAT } }, ["OH"]);
console.log(`Coach levels take ${xpForCoachLevel(1)} XP at first, ${xpForCoachLevel(5)} at level 5; an ability slot at levels 3, 6 and 9\n`);
for (let i = 0; i < 5; i++) d = finishSeason(d, playSeason(d)).dynasty;

const coaches = allTeams(d.league).flatMap((t) => [t.staff!.hc, t.staff!.oc, t.staff!.dc].map((c) => ({ c, team: t.abbr })));
const byLevel = new Map<number, number>();
for (const { c } of coaches) byLevel.set(coachLevel(c.xp).level, (byLevel.get(coachLevel(c.xp).level) ?? 0) + 1);
console.log(`After 5 seasons, the league's 150 coaches by level: ${[...byLevel].sort((a, b) => a[0] - b[0]).map(([l, n]) => `L${l}: ${n}`).join(", ")}`);
console.log(`\nThe most experienced:`);
for (const { c, team } of coaches.sort((a, b) => (b.c.xp ?? 0) - (a.c.xp ?? 0)).slice(0, 5)) {
  console.log(`  ${team} ${c.role} ${c.firstName} ${c.lastName}: level ${coachLevel(c.xp).level} (${c.xp} XP) · ${(c.abilities ?? []).map((a) => COACH_ABILITIES[a].label).join(", ") || "no abilities yet"}`);
}
const oh = d.league.teams.OH!.staff!;
console.log(`\nOhio's coaches (yours: you pick their abilities before the season):`);
for (const c of [oh.hc, oh.oc, oh.dc]) console.log(`  ${c.role} ${c.lastName}: level ${coachLevel(c.xp).level}, ${openSlots(c)} open slot${openSlots(c) === 1 ? "" : "s"}`);

// One ability on the field: inside runs against Base, with and without a run game guru.
const [o, df] = [d.league.teams.CO!, d.league.teams.KS!].map((t) => ({ ...t, staff: { ...t.staff!, oc: { ...t.staff!.oc, abilities: [] }, dc: { ...t.staff!.dc, abilities: [] } } })) as unknown as [Team, Team];
const guru: Team = { ...o, staff: { ...o.staff!, oc: { ...o.staff!.oc, abilities: ["run_game_guru"] } } };
const ypc = (t: Team) => {
  const rng = new Rng("ypc");
  let y = 0;
  for (let i = 0; i < 2000; i++) y += simulateRun(rng, { offense: t, defense: df, situation: { quarter: 1, clock: 900, down: 1, distance: 10, yardline: 30 }, concepts: { offense: "inside_run", defense: "base" } }).yardsGained;
  return (y / 2000).toFixed(2);
};
console.log(`\nInside runs vs Base: ${ypc(o)} yards a carry; with a run game guru calling them: ${ypc(guru)}`);
