// Milestone 2, step 4: season stats and league leaders.
// Usage: node scripts/leaders.ts [league-seed]
import {
  LEADER_CATEGORIES,
  addGameToSeason,
  createSeasonStats,
  displayName,
  generateLeague,
  leaders,
  lookupFor,
  simulateSeason,
} from "../src/index.ts";

const seed = process.argv[2] ?? "dynasty";
const league = generateLeague(seed);
const stats = createSeasonStats();
const t0 = performance.now();
const season = simulateSeason(league, { onGame: (g) => addGameToSeason(stats, g) });
const secs = (performance.now() - t0) / 1000;
const who = lookupFor(...Object.values(league.teams));

console.log(`${season.season} league leaders, league "${seed}" (${season.results.length} games, ${secs.toFixed(1)}s with stats)\n`);
for (const cat of LEADER_CATEGORIES) {
  const top = leaders(stats, cat, 5);
  const q = cat.qualifier ? `  (min ${cat.qualifier.perGame} ${cat.qualifier.label}/game)` : "";
  console.log(`${cat.label}${q}`);
  top.forEach((l, i) => {
    const p = who(l.player.id);
    console.log(`  ${i + 1}. ${`${displayName(p)} ${p.position}, ${l.player.team}`.padEnd(26)} ${l.display.padStart(6)}`);
  });
}

// Team rankings.
const teams = [...stats.teams.values()];
const per = (t: (typeof teams)[number], v: number) => v / t.games;
const rank = (label: string, f: (t: (typeof teams)[number]) => number, asc = false) => {
  const sorted = [...teams].sort((a, b) => (asc ? f(a) - f(b) : f(b) - f(a)));
  console.log(`\n${label}: ` + sorted.slice(0, 3).map((t) => `${t.team} ${f(t).toFixed(1)}`).join(", ") + `  ...  worst ${sorted.at(-1)!.team} ${f(sorted.at(-1)!).toFixed(1)}`);
};
rank("Points per game", (t) => per(t, t.pointsFor));
rank("Fewest points allowed per game", (t) => per(t, t.pointsAgainst), true);
rank("Yards per game", (t) => per(t, t.offense.totalYards));
rank("Fewest yards allowed per game", (t) => per(t, t.allowed.totalYards), true);
rank("Takeaways", (t) => t.allowed.turnovers);
