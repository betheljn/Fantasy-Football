// Milestone 20 step 1: regional talent. Where a settled league's players
// grew up, and which skill groups each region turns out.
import { REGION_CORES, SKILL_GROUPS, SKILL_GROUP_KEYS, allTeams, playerOverall, regionOf, regions, skillGroupOf, startDynasty, type SkillGroup } from "../src/index.ts";

const league = startDynasty("regions-demo").league;
const players = allTeams(league).flatMap((t) => [...t.roster, ...(t.reserve ?? [])]);
const good = players.filter((p) => playerOverall(p) >= 70);
console.log(`${players.length} rostered players, ${good.length} rated 70+\n`);

// For each region: its share of the league's good players in each group, against a fair share (1 in 10).
const pad = (s: string, n: number) => s.padEnd(n);
console.log(`${pad("Region", 12)} ${pad("Core (strongest first)", 52)} Most over-represented among 70+ players`);
for (const r of regions()) {
  const core = REGION_CORES[r.name]!.map((g) => SKILL_GROUPS[g].label).join(", ");
  const lift = SKILL_GROUP_KEYS.map((g) => {
    const inGroup = good.filter((p) => skillGroupOf(p) === g);
    const here = inGroup.filter((p) => regionOf(p.home!) === r.name).length;
    return { g, share: inGroup.length ? here / inGroup.length : 0, n: here };
  })
    .sort((a, b) => b.share - a.share)
    .slice(0, 3)
    .map((x) => `${SKILL_GROUPS[x.g as SkillGroup].label} ${(x.share * 100).toFixed(0)}%`);
  console.log(`${pad(r.name, 12)} ${pad(core, 52)} ${lift.join(", ")}`);
}

// The best at a few groups and where they're from.
for (const g of ["speed", "bigMen", "passers"] as SkillGroup[]) {
  const top = players.filter((p) => skillGroupOf(p) === g).sort((a, b) => playerOverall(b) - playerOverall(a)).slice(0, 10);
  const from = new Map<string, number>();
  for (const p of top) from.set(regionOf(p.home!)!, (from.get(regionOf(p.home!)!) ?? 0) + 1);
  console.log(`\nTop 10 ${SKILL_GROUPS[g].label.toLowerCase()}: ${[...from.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`).join(", ")}`);
}
console.log("\n(A fair share is 10%: each region is one of ten.)");
