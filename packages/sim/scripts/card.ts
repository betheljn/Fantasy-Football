// Player cards: every attribute, Madden-style.
// Usage: node scripts/card.ts [league-seed] [team] [position]   (default: that team's starting QB, RB, WR1, CB1)
import { POSITIONS, formatPlayerCard, generateLeague, starters, teamName, type Position } from "../src/index.ts";

const [seed = "dynasty", team = "TX", pos] = process.argv.slice(2);
const league = generateLeague(seed);
const t = league.teams[team.toUpperCase()];
if (!t) throw new Error(`No team ${team}`);
const wanted: Position[] = pos ? [pos.toUpperCase() as Position] : ["QB", "RB", "WR", "CB"];
for (const p of wanted) {
  if (!POSITIONS.includes(p)) throw new Error(`Unknown position ${p}`);
  const player = starters(t, p, 1)[0]!;
  console.log(formatPlayerCard(player, teamName(t)) + "\n");
}
