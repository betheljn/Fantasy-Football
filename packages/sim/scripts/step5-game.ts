// Milestone step 5 demo: simulate a full game (scoring summary + drive chart),
// then many games to check league-wide averages.
// Usage: node scripts/step5-game.ts [seed]
import {
  Rng,
  describePlay,
  formatClock,
  generateTeams,
  getPlayer,
  pointsForEvent,
  simulateGame,
  teamName,
  type GameResult,
  type Team,
} from "../src/index.ts";

const seed = process.argv[2] ?? "2031";
const [home, away] = generateTeams(new Rng(seed), 2) as [Team, Team];
const who = (id: string) => (id.startsWith(home.abbr) ? getPlayer(home, id) : getPlayer(away, id));
const period = (q: number) => (q <= 4 ? `Q${q}` : q === 5 ? "OT" : `OT${q - 4}`);

const game = simulateGame(home, away, seed);

console.log(`${teamName(away)} (${away.abbr}) at ${teamName(home)} (${home.abbr}) — seed ${seed}`);
console.log(`${game.openingReceiver} receives the opening kickoff.\n`);

console.log("Scoring summary:");
for (const p of game.plays) {
  if (Object.keys(pointsForEvent(p.event)).length === 0) continue;
  const s = `${away.abbr} ${p.score[away.abbr]} - ${home.abbr} ${p.score[home.abbr]}`;
  console.log(`  ${period(p.quarter)} ${formatClock(p.clockAfter).padStart(5)}  ${describePlay(p.event, who).padEnd(90)} ${s}`);
}

console.log("\nDrive chart:");
for (const d of game.drives) {
  console.log(
    `  ${d.offense}  ${period(d.start.quarter)} ${formatClock(d.start.clock).padStart(5)}  from ${String(d.start.yardline).padStart(2)}  ` +
      `${String(d.scrimmagePlays).padStart(2)} plays ${String(d.yards).padStart(3)} yds ${formatClock(d.seconds).padStart(5)}  ${d.result}`,
  );
}

const line = (t: Team) =>
  `  ${t.abbr.padEnd(4)} ${game.periodScores[t.abbr]!.map((x) => String(x).padStart(3)).join("")}  | ${String(game.score[t.abbr]).padStart(3)}`;
const periods = game.periodScores[home.abbr]!.map((_, i) => period(i + 1).padStart(3)).join("");
console.log(`\nFinal${game.overtime ? " (OT)" : ""}:\n       ${periods}  |   T\n${line(away)}\n${line(home)}`);
console.log(game.winner ? `${game.winner} wins.` : "Tie.");
console.log(`${game.plays.length} events in the log.`);

// --- league-wide check: many games across random matchups ---
const N = 2000;
let pts = 0, drives = 0, plays = 0, punts = 0, tos = 0, ot = 0, ties = 0, blowouts = 0, oneScore = 0;
const results: Record<string, number> = {};
for (let i = 0; i < N; i++) {
  const [h, a] = generateTeams(new Rng(`league-${i}`), 2) as [Team, Team];
  const g: GameResult = simulateGame(h, a, i);
  pts += g.score[h.abbr]! + g.score[a.abbr]!;
  drives += g.drives.length;
  for (const d of g.drives) {
    plays += d.scrimmagePlays;
    results[d.result] = (results[d.result] ?? 0) + 1;
  }
  punts += g.plays.filter((p) => p.event.kind === "punt").length;
  tos += g.plays.filter((p) => (p.event.kind === "run" || p.event.kind === "pass") && p.event.turnover).length;
  if (g.overtime) ot++;
  if (!g.winner) ties++;
  const diff = Math.abs(g.score[h.abbr]! - g.score[a.abbr]!);
  if (diff <= 8) oneScore++;
  if (diff >= 21) blowouts++;
}
const perTeam = (x: number) => (x / N / 2).toFixed(1);
const pct = (x: number) => `${((100 * x) / N).toFixed(1)}%`;
console.log(`\n${N} games, random matchups (per team per game):`);
console.log(`  points ${perTeam(pts)}   drives ${perTeam(drives)}   scrimmage plays ${perTeam(plays)}   punts ${perTeam(punts)}   turnovers ${perTeam(tos)}`);
console.log(`  one-score games ${pct(oneScore)}   21+ pt margins ${pct(blowouts)}   overtime ${pct(ot)}   ties ${pct(ties)}`);
console.log(
  "  drive results: " +
    Object.entries(results)
      .sort((a, b) => b[1] - a[1])
      .map(([r, c]) => `${r} ${((100 * c) / drives).toFixed(1)}%`)
      .join(", "),
);
