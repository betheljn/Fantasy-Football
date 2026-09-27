// Milestone step 6: simulate a game and print the full play-by-play and box score.
// Usage: node scripts/play-game.ts [seed] [--box-only]
import {
  Rng,
  buildBoxScore,
  formatBoxScore,
  formatPlayByPlay,
  generateTeams,
  lookupFor,
  simulateGame,
  teamName,
  type Team,
} from "../src/index.ts";

const args = process.argv.slice(2);
const boxOnly = args.includes("--box-only");
const seed = args.find((a) => !a.startsWith("--")) ?? "2031";

const [home, away] = generateTeams(new Rng(seed), 2) as [Team, Team];
const game = simulateGame(home, away, seed);
const who = lookupFor(home, away);

console.log(`${teamName(away)} at ${teamName(home)}  (seed ${seed})`);
console.log(`${game.openingReceiver} receives the opening kickoff.`);
if (!boxOnly) console.log(formatPlayByPlay(game, who));
console.log("\n" + "#".repeat(64) + "\n");
console.log(formatBoxScore(game, buildBoxScore(game), home, away, who));
