// Milestone 22 step 3: the reveal after each snap and the duel recap.
// One game between two league teams: the first few reveals, then the home
// team's recap. Then a coach who leans on one call, to show the read.
// Usage: node scripts/duel-recap.ts [seed]
import { allTeams, duelRecap, generateLeague, revealCall, simulateGame, startCoachedGame, teamName, type DuelRecap, type DuelSide } from "../src/index.ts";

const seed = process.argv[2] ?? "recap";
const league = generateLeague("duel-recap");
const [home, away] = allTeams(league) as [(typeof league.teams)[string], (typeof league.teams)[string]];
const game = simulateGame(home, away, seed);
console.log(`${teamName(away)} ${game.score[away.abbr]}, ${teamName(home)} ${game.score[home.abbr]}\n`);

console.log("The first reveals:");
let shown = 0;
for (const p of game.plays) {
  const r = revealCall(p.event);
  if (!r || shown++ >= 6) continue;
  const e = p.event as { offense: string; yardsGained: number };
  console.log(`  ${e.offense} ${String(e.yardsGained).padStart(3)} yds  ${r.text}`);
}

const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : "-");
function side(name: string, s: DuelSide) {
  console.log(`  ${name}: won ${s.won} calls, lost ${s.lost}, even ${s.even}`);
  for (const k of ["won", "lost", "even"] as const) {
    const l = s.byCall[k];
    if (l.plays) console.log(`    calls ${k.padEnd(4)}: ${(l.yards / l.plays).toFixed(1)} yds/play, ${pct(l.successes, l.plays)} successful (${l.plays} snaps)`);
  }
  console.log(`    ${s.concepts.slice(0, 4).map((c) => `${c.label} ${c.plays}x ${(c.yards / c.plays).toFixed(1)} yds`).join(" · ")}`);
}
function show(r: DuelRecap) {
  console.log(`\n${r.headline}`);
  side("Offense", r.offense);
  side("Defense", r.defense);
  for (const line of r.reads) console.log(`  ${line}`);
  if (r.best) console.log(`  Best call: ${r.best.text}`);
  if (r.worst) console.log(`  Worst call: ${r.worst.text}`);
}
const possessive = (n: string) => (n.endsWith("s") ? `${n}'` : `${n}'s`);
console.log(`\n${possessive(teamName(home))} duel:`);
show(duelRecap(game, home.abbr)!);

// A coach who loves play action, against the AI.
const coached = startCoachedGame(home, away, `${seed}:pa`, home.abbr);
while (coached.prompt) {
  const p = coached.prompt;
  coached.answer(p.kind === "offense" && (p.suggestion === "run" || p.suggestion === "pass") ? (Number(p.situation.clock) % 3 === 0 ? { call: "run", concept: "inside_run" } : { call: "pass", concept: "play_action" }) : undefined);
}
console.log(`\nA coach who calls play action on two snaps in three:`);
show(duelRecap(coached.result!, home.abbr)!);
