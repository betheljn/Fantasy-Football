// Milestone 25 step 3: training camp. A season, then the next preseason's
// camp: how many close spots were fought for, who won, and the stories.
// Usage: node scripts/camp.ts
import { CURRENT_FORMAT, campStories, finishSeason, playSeason, playerOverall, startDynasty, teamName } from "../src/index.ts";

let d = startDynasty("camp-demo");
d = { ...d, league: { ...d.league, format: CURRENT_FORMAT } };
const before = d;
d = finishSeason(d, playSeason(d)).dynasty;
const b = d.camp!;
console.log(`${d.league.season} training camp: ${b.length} battles on ${new Set(b.map((x) => x.team)).size} teams; ${b.filter((x) => x.upset).length} won by the backup`);
const byPos = new Map<string, number>();
for (const x of b) byPos.set(x.position, (byPos.get(x.position) ?? 0) + 1);
console.log(`  by position: ${[...byPos].sort((x, y) => y[1] - x[1]).map(([p, n]) => `${p} ${n}`).join(", ")}`);
const qb = b.find((x) => x.position === "QB");
if (qb) {
  const w = d.league.teams[qb.team]!.roster.find((p) => p.id === qb.winner)!;
  console.log(`  e.g. ${qb.team} QB: ${qb.winnerName} over ${qb.loserName}${qb.upset ? " (the backup won)" : ""}; ${qb.winnerName} is now ${playerOverall(w)} overall, starting: ${d.league.teams[qb.team]!.depthChart.QB[0] === qb.winner}`);
}
console.log("\nCamp stories (the national feed's top five):");
for (const s of campStories(b, d.league.season, (a) => teamName(d.league.teams[a]!)).slice(0, 5)) console.log(`  ${s.headline}\n    ${s.body}`);
void before;
