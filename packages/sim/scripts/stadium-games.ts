// Milestone 26 step 2: the stadium in games (rules 7). The same games on
// grass and on turf (big runs, yards after the catch, injuries), and a rainy
// day with a retractable roof open and closed.
// Usage: node scripts/stadium-games.ts
import { Rng, describeConditions, gameConditions, generateLeague, generateTeams, simulateGame, type GameConditions, type GameResult, type Team } from "../src/index.ts";

const [A, B] = generateTeams(new Rng("stadium-games"), 2) as [Team, Team];
const N = 200;
const tally = (c: GameConditions) => {
  let big = 0, yac = 0, catches = 0, hurt = 0;
  for (let i = 0; i < N; i++) {
    const g: GameResult = simulateGame(A, B, `sg-${i}`, { conditions: c });
    hurt += g.injuries.length;
    for (const p of g.plays) {
      const e = p.event;
      if (e.kind === "run" && e.yardsGained >= 20) big++;
      if (e.kind === "pass" && e.outcome === "complete") (yac += e.yardsAfterCatch), catches++;
    }
  }
  return `${(big / N).toFixed(2)} runs of 20+ a game, ${(yac / catches).toFixed(2)} yds after the catch, ${(hurt / N).toFixed(2)} injuries a game`;
};
const fair: GameConditions = { dome: false, temp: 65, precip: "none", wind: 4, noise: 0.5 };
console.log(`${N} games each, fair weather:`);
console.log(`  grass: ${tally({ ...fair, roof: "open", surface: "grass" })}`);
console.log(`  turf:  ${tally({ ...fair, roof: "open", surface: "turf" })}`);

// A retractable roof on a rainy day: the same game, roof open (old stadium) and closed.
const league = generateLeague("stadium-roof");
const withRoof = (roof: "open" | "retractable") => ({ ...league, teams: { ...league.teams, OH: { ...league.teams.OH!, venue: { dome: false, noise: 0.55, roof, surface: "grass" as const } } } });
let wet = 0;
for (let i = 1; i < 400; i++) if (gameConditions(withRoof("open"), { id: `g${i}`, week: 14, home: "OH" }).precip !== "none") { wet = i; break; }
const game = { id: `g${wet}`, week: 14, home: "OH" };
console.log(`\nA rainy week 14 in Ohio:`);
console.log(`  open-air stadium:  ${describeConditions(gameConditions(withRoof("open"), game))}`);
console.log(`  retractable roof:  ${describeConditions(gameConditions(withRoof("retractable"), game))}`);
