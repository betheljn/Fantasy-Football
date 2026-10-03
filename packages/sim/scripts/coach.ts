// Milestone 17, steps 1-2: coach the home team's offense. The game pauses
// before each of its snaps with the coaches' suggestion; this script takes
// it, except that it always goes for it on 4th down, lines up heavy (13
// personnel, under center) to run on 3rd and short, and hands its third
// drive to the offensive coordinator.
// Usage: node scripts/coach.ts [seed]
import { Rng, describePlay, formatClock, formatDownDistance, generateTeams, lookupFor, simulateGame, startCoachedGame, type CoachCall, type Team } from "../src/index.ts";

const seed = process.argv[2] ?? "coach";
const [home, away] = generateTeams(new Rng(`${seed}:teams`), 2) as [Team, Team];
const game = startCoachedGame(home, away, seed, home.abbr);

let shown = 0;
let overrides = 0;
let myDrives = 0;
let lastDrive = -1;
while (game.prompt) {
  const p = game.prompt;
  const s = p.situation;
  if (p.drive !== lastDrive) {
    lastDrive = p.drive;
    if (++myDrives === 3) {
      console.log(`Q${s.quarter} ${formatClock(s.clock)}  drive ${p.drive + 1}: handed to the coordinator`);
      game.autoDrive();
      continue;
    }
  }
  const gamble = s.down === 4 && (p.suggestion === "punt" || p.suggestion === "field_goal");
  const heavy = s.down === 3 && s.distance <= 2 && (p.suggestion === "run" || p.suggestion === "pass") && p.personnelOptions.includes("13");
  const call: CoachCall | undefined = gamble
    ? { call: s.distance <= 3 ? "run" : "pass" }
    : heavy
      ? { call: "run", personnel: "13", set: "under_center" }
      : undefined;
  if (shown < 4 || call) {
    const mine = call ? `${call.call}${call.personnel ? ` from ${call.personnel} ${call.set}` : ""}${gamble ? " (going for it)" : ""}` : "ok";
    console.log(
      `Q${s.quarter} ${formatClock(s.clock)}  ${formatDownDistance(s, p.team, p.opponent).padEnd(18)} coaches: ${p.suggestion.padEnd(10)} from ${p.formation.personnel} ${p.formation.set.padEnd(12)} -> ${mine}`,
    );
    shown++;
  }
  if (call) overrides++;
  game.answer(call);
}

const coached = game.result!;
const plain = simulateGame(home, away, seed);
const line = (g: typeof coached) => `${away.abbr} ${g.score[away.abbr]} - ${home.abbr} ${g.score[home.abbr]}`;
console.log(`\nYour game (${coached.coached!.calls.length} calls, ${overrides} changed): ${line(coached)}`);
console.log(`The coaches' game:                 ${line(plain)}`);
console.log(`Replayed from the calls: ${JSON.stringify(simulateGame(home, away, seed, { coach: home.abbr, calls: coached.coached!.calls })) === JSON.stringify(coached) ? "identical" : "DIFFERENT"}`);
const last4th = coached.plays.filter((p) => p.event.start.down === 4 && p.event.offense === home.abbr && (p.event.kind === "run" || p.event.kind === "pass")).at(-1);
if (last4th) console.log(`\nLast 4th-down try: ${describePlay(last4th.event, lookupFor(home, away))}`);
