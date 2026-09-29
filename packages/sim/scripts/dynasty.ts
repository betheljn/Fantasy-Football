// Milestone 3, step 6: run a dynasty for several seasons and print league history.
// Usage: node scripts/dynasty.ts [league-seed] [seasons]
import { runDynasty, startDynasty, talentSnapshot, teamName, type Dynasty } from "../src/index.ts";

const seed = process.argv[2] ?? "dynasty";
const seasons = Number(process.argv[3] ?? 10);
const t0 = performance.now();
const start = startDynasty(seed);
const startTalent = talentSnapshot(start.league);
const done: Dynasty = runDynasty(start, seasons, (d) => {
  const h = d.history.at(-1)!;
  const award = (name: string) => h.awards.find((a) => a.award === name);
  const fmt = (name: string) => {
    const a = award(name);
    return a ? `${a.name} (${a.position}, ${a.team})` : "-";
  };
  console.log(`${h.season}  Champion ${teamName(start.league.teams[h.champion]!)} over ${h.runnerUp}`);
  console.log(`      MVP ${fmt("MVP")}: ${award("MVP")?.line ?? ""}`);
  console.log(`      DPOY ${fmt("Defensive Player of the Year")}   ROY ${fmt("Rookie of the Year")}`);
  console.log(`      #1 pick: ${h.topPicks[0]!.player} (${h.topPicks[0]!.position}) to ${h.topPicks[0]!.team}`);
});
const secs = (performance.now() - t0) / 1000;

console.log(`\n${seasons} seasons in ${secs.toFixed(0)}s (including a ${start.league.season - 15}-${start.league.season - 1} burn-in)\n`);
const titles = new Map<string, number>();
for (const h of done.history) titles.set(h.champion, (titles.get(h.champion) ?? 0) + 1);
console.log("Championships: " + [...titles.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(", "));

const careers = [...done.careers.values()];
const leader = (label: string, key: "passYds" | "rushYds" | "recYds" | "sacks" | "defInt" | "tackles") => {
  const c = careers.reduce((a, b) => (b.stats[key] > a.stats[key] ? b : a));
  console.log(`  ${label.padEnd(17)} ${c.name} (${c.position}, ${c.teams.join("/")}) ${c.stats[key]} over ${c.seasons} seasons`);
};
console.log("\nCareer leaders over these seasons:");
leader("Passing yards", "passYds");
leader("Rushing yards", "rushYds");
leader("Receiving yards", "recYds");
leader("Tackles", "tackles");
leader("Sacks", "sacks");
leader("Interceptions", "defInt");

const end = talentSnapshot(done.league);
console.log(`\nLeague talent: starters ${startTalent.starterOverall.toFixed(1)} -> ${end.starterOverall.toFixed(1)}, average age ${startTalent.averageAge.toFixed(1)} -> ${end.averageAge.toFixed(1)}, players 80+ ${startTalent.stars} -> ${end.stars}`);
