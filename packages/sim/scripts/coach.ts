// Milestone 17, step 1: a game you can step through. Coach the home team:
// the game pauses before each of its snaps with the coaches' suggestion;
// this script takes it, except it always goes for it on 4th down.
// Usage: node scripts/coach.ts [seed]
import { Rng, describePlay, formatClock, formatDownDistance, generateTeams, lookupFor, simulateGame, startCoachedGame, type Team } from "../src/index.ts";

const seed = process.argv[2] ?? "coach";
const [home, away] = generateTeams(new Rng(`${seed}:teams`), 2) as [Team, Team];
const game = startCoachedGame(home, away, seed, home.abbr);

let shown = 0;
let overrides = 0;
while (game.prompt) {
  const p = game.prompt;
  const s = p.situation;
  const gamble = s.down === 4 && (p.suggestion === "punt" || p.suggestion === "field_goal");
  const call = gamble ? (s.distance <= 3 ? "run" : "pass") : p.suggestion;
  if (shown < 6 || gamble) {
    console.log(
      `Q${s.quarter} ${formatClock(s.clock)}  ${formatDownDistance(s, p.team, p.opponent)}  ${p.formation.personnel} ${p.formation.set}  ` +
        `coaches say ${p.suggestion.padEnd(10)} options [${p.options.join(", ")}]  -> ${call}${gamble ? "  (going for it)" : ""}`,
    );
    shown++;
  }
  if (gamble) overrides++;
  game.answer(gamble ? { call } : undefined);
}

const coached = game.result!;
const plain = simulateGame(home, away, seed);
const line = (g: typeof coached) => `${away.abbr} ${g.score[away.abbr]} - ${home.abbr} ${g.score[home.abbr]}`;
console.log(`\nYour game (${coached.coached!.calls.length} calls, ${overrides} changed): ${line(coached)}`);
console.log(`The coaches' game:                 ${line(plain)}`);
console.log(`Replayed from the calls: ${JSON.stringify(simulateGame(home, away, seed, { coach: home.abbr, calls: coached.coached!.calls })) === JSON.stringify(coached) ? "identical" : "DIFFERENT"}`);
const last4th = coached.plays.filter((p) => p.event.start.down === 4 && p.event.offense === home.abbr && (p.event.kind === "run" || p.event.kind === "pass")).at(-1);
if (last4th) console.log(`\nLast 4th-down try: ${describePlay(last4th.event, lookupFor(home, away))}`);
