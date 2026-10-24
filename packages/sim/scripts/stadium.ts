// Milestone 26 step 1: the stadium's design. The league's stadiums as they
// stand, what AI teams have built five seasons on, and a team building a
// retractable roof and steep stands (what it costs and does to the crowd).
// Usage: node scripts/stadium.ts
import { CURRENT_FORMAT, PROJECTS, crowdNoise, describeStadium, finishSeason, openProjects, playSeason, projectCost, projectProblems, roofOf, standsOf, startDynasty, startLeagueBusiness, startProject, surfaceOf, type Dynasty } from "../src/index.ts";

let d: Dynasty = startDynasty("stadium-demo");
d = { ...d, league: { ...d.league, format: CURRENT_FORMAT } };
const tally = (b: Record<string, { stadium: Parameters<typeof roofOf>[0] }>) => {
  const n = (f: (s: Parameters<typeof roofOf>[0]) => string) => {
    const m = new Map<string, number>();
    for (const x of Object.values(b)) m.set(f(x.stadium), (m.get(f(x.stadium)) ?? 0) + 1);
    return [...m].map(([k, v]) => `${k} ${v}`).join(", ");
  };
  return `roofs: ${n(roofOf)} · surfaces: ${n(surfaceOf)} · stands: ${n(standsOf)}`;
};
const start = startLeagueBusiness(d.league);
console.log(`The league's stadiums today: ${tally(start)}`);
console.log(`  e.g. ${start.OH!.stadium.name}: ${describeStadium(start.OH!.stadium)}, crowd ${crowdNoise(start.OH!)}`);

for (let i = 0; i < 5; i++) d = finishSeason(d, playSeason(d)).dynasty;
console.log(`Five seasons on (AI teams build as they go): ${tally(d.business!)}`);

console.log("\nProjects:");
for (const [k, p] of Object.entries(PROJECTS)) console.log(`  ${p.name.padEnd(20)} $${(projectCost(k as keyof typeof PROJECTS, "MN") / 1000).toFixed(0)}M in Minnesota · ${p.does}`);
// An open-air stadium builds (the project checks say what's allowed).
const team = Object.entries(d.business!).find(([, b]) => roofOf(b.stadium) === "open" && standsOf(b.stadium) === "classic" && !(b.pending ?? []).length)![0];
let mn = { ...d.business![team]!, cash: 1_000_000 };
const before = mn;
console.log(`\n${team} checks: ${projectProblems(mn, "retractable", team, "cash").join(" ") || "the roof can start"}; ${projectProblems(mn, "dome", team, "cash").join(" ") || "a dome could start"}`);
mn = startProject(mn, "retractable", team, "cash", 2035);
console.log(`  with the roof under way, a dome: ${projectProblems(mn, "dome", team, "cash").join(" ")}`);
mn = startProject(mn, "steep", team, "bonds", 2035);
mn = openProjects(mn, 2035);
console.log(`${team} builds a retractable roof (cash) and steep stands (bonds):`);
console.log(`  before: ${describeStadium(before.stadium)}, crowd ${crowdNoise(before)}`);
console.log(`  after:  ${describeStadium(mn.stadium)}, crowd ${crowdNoise(mn)}; cash $${(mn.cash / 1000).toFixed(0)}M, debt $${(mn.stadium.debt / 1000).toFixed(0)}M`);
