// Milestone 20 step 2: your top three skill groups pick your region; a new
// program starts there with a fresh, mostly local roster.
import { SKILL_GROUPS, STATES, createProgram, playerOverall, regionFits, regionOf, rosterNorms, rosterReport, skillGroupOf, startDynasty, teamName, teamRatings, type SkillGroup } from "../src/index.ts";

const groups = (process.argv[2]?.split(",") ?? ["speed", "coverage", "passRush"]) as SkillGroup[];
const dynasty = startDynasty("program-demo");
console.log(`Your top three: ${groups.map((g, i) => `${i + 1}. ${SKILL_GROUPS[g].label}`).join("  ")}\n`);
console.log("Region fit:");
for (const f of regionFits(groups).slice(0, 5)) console.log(`  ${f.region.padEnd(12)} ${f.score.toFixed(1).padStart(5)}  core matches: ${f.matches.map((g) => SKILL_GROUPS[g].label).join(", ") || "none"}`);

const started = performance.now();
const made = createProgram(dynasty, groups);
const ms = performance.now() - started;
const team = made.dynasty.league.teams[made.team]!;
const old = dynasty.league.teams[made.team]!;
console.log(`\nYour program: ${teamName(team)} (${made.region}), in place of the ${made.replaced.name}, whose players are now free agents`);
console.log(`Starters' rating ${teamRatings(team).overall.toFixed(1)} (the program it replaced: ${teamRatings(old).overall.toFixed(1)})`);

const local = team.roster.filter((p) => regionOf(p.home!) === made.region);
console.log(`Local talent: ${local.length} of ${team.roster.length}; from elsewhere: ${team.roster.length - local.length}`);
const byGroup = new Map<SkillGroup, number>();
for (const p of team.roster) byGroup.set(skillGroupOf(p), (byGroup.get(skillGroupOf(p)) ?? 0) + 1);

const state = new Map(STATES.map(([n, a]) => [a, n]));
console.log("\nBest ten (by potential):");
for (const p of [...team.roster].sort((a, b) => b.potential - a.potential).slice(0, 10)) {
  console.log(`  ${p.position.padEnd(2)} ${`${p.firstName} ${p.lastName}`.padEnd(20)} age ${p.age}  ovr ${playerOverall(p)}  pot ${p.potential}  ${SKILL_GROUPS[skillGroupOf(p)].label.padEnd(22)} from ${state.get(p.home!)} (${regionOf(p.home!)})`);
}
const report = rosterReport(team.roster, rosterNorms(made.dynasty.league));
console.log(`\nStrengths: ${[...report.traits].sort((a, b) => b.score - a.score).slice(0, 4).map((x) => `${x.label} ${x.grade}`).join(", ")}`);
console.log(`Needs: ${report.needs.slice(0, 4).join(", ") || "none"}`);
console.log(`\nBuilt in ${ms.toFixed(0)} ms`);
