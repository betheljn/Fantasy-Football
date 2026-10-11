// Milestone 23 step 2a: owner upgrades. The tree, what a level-12 owner can
// buy, facilities' effect on a season of player growth, and film study.
// Usage: node scripts/upgrades.ts
import { UPGRADES, UPGRADE_TRACKS, Rng, buyUpgrade, developLeague, filmStudy, generateTeams, playerOverall, simulateGame, startDynasty, upgradeCost, upgradePoints, withOwners, xpForLevel, type Team } from "../src/index.ts";

console.log("The upgrade tree (tier n costs n points; a point per level):");
for (const t of UPGRADE_TRACKS) console.log(`  ${UPGRADES[t].label}: ${UPGRADES[t].tiers.map((x, i) => `[${upgradeCost(i + 1)}] ${x}`).join(" · ")}`);

let d = withOwners(startDynasty("upgrade-demo", 2), ["OH"]);
const xp = Array.from({ length: 11 }, (_, i) => xpForLevel(i + 1)).reduce((a, b) => a + b, 0);
d = { ...d, owners: { OH: { ...d.owners!.OH!, xp } } };
console.log(`\nA level-12 owner has ${upgradePoints(d.owners!.OH)} points. Buying facilities 1-3, recruiting 1, analytics 1-2:`);
for (const t of ["facilities", "facilities", "facilities", "recruiting", "analytics", "analytics"] as const) d = buyUpgrade(d, "OH", t);
const left = upgradePoints(d.owners!.OH);
console.log(`  ${JSON.stringify(d.league.teams.OH!.upgrades)}, ${left} point${left === 1 ? "" : "s"} left`);

const gain = (team: Team) => {
  const after = developLeague({ ...d.league, teams: { ...d.league.teams, OH: team } }).teams.OH!;
  const was = new Map(team.roster.map((p) => [p.id, playerOverall(p)]));
  return after.roster.reduce((s, p) => s + Math.max(0, playerOverall(p) - was.get(p.id)!), 0);
};
const oh = d.league.teams.OH!;
const { upgrades: _u, ...plain } = oh;
console.log(`\nOne offseason of growth for Ohio's roster (overall points gained):`);
console.log(`  no facilities: ${gain(plain)}   facilities 3: ${gain(oh)}   facilities 5: ${gain({ ...oh, upgrades: { facilities: 5 } })}`);

const [A, B] = generateTeams(new Rng("film-demo"), 2) as [Team, Team];
const g = simulateGame(A, B, "film-demo");
const late = g.plays.filter((p) => p.quarter <= 3);
const sit = { quarter: 4, clock: 600, down: 1 as const, distance: 10, yardline: 40 };
const f = filmStudy(3, A, B, "offense", sit, { personnel: "11", set: "shotgun" }, late)!;
const pct = (x: number) => `${Math.round(x * 100)}%`;
console.log(`\nFilm study (analytics 3), ${A.abbr} on offense, ${f.situation.toLowerCase()} in the 4th:`);
console.log(`  Their playbook: ${f.playbook.slice(0, 4).map((x) => `${x.label} ${pct(x.share)}`).join(", ")}`);
console.log(`  This game (${f.film!.snaps} snaps): ${f.film!.calls.slice(0, 4).map((x) => `${x.label} ${pct(x.share)}`).join(", ")}`);
console.log(`  You, as they see you: ${f.self!.calls.slice(0, 4).map((x) => `${x.label} ${pct(x.share)}`).join(", ")}`);
