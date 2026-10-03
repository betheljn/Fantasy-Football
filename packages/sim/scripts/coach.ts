// Milestone 17, steps 1-3: coach the home team. The game pauses for each of
// its calls with the coaches' suggestion; this script takes it, except that
// on offense it goes for it on 4th down and lines up heavy (13 personnel,
// under center) to run on 3rd and short; on defense it sends a Cover 0 blitz
// on 3rd and long; it goes for two whenever it trails after a touchdown; and
// it hands its third drive to the coordinators.
// Usage: node scripts/coach.ts [seed]
import { Rng, describePlay, formatClock, formatDownDistance, generateTeams, lookupFor, simulateGame, startCoachedGame, type CoachCall, type Team } from "../src/index.ts";

const seed = process.argv[2] ?? "coach";
const [home, away] = generateTeams(new Rng(`${seed}:teams`), 2) as [Team, Team];
const game = startCoachedGame(home, away, seed, home.abbr);

const lead = (m: number) => (m === 0 ? "tied" : `${m > 0 ? "up" : "down"} ${Math.abs(m)}`);
const asked: Record<string, number> = { offense: 0, defense: 0, timeout: 0, try: 0 };
let shown = 0;
let overrides = 0;
let drives = 0;
let lastDrive = -1;
while (game.prompt) {
  const p = game.prompt;
  const s = p.situation;
  const when = `Q${s.quarter} ${formatClock(s.clock).padStart(5)}`;
  if (p.drive !== lastDrive) {
    lastDrive = p.drive;
    if (++drives === 3) {
      console.log(`${when}  drive ${p.drive + 1}: handed to the coordinators`);
      game.autoDrive();
      continue;
    }
  }
  asked[p.kind]!++;
  let call: CoachCall | undefined;
  let line = "";
  if (p.kind === "offense") {
    const gamble = s.down === 4 && (p.suggestion === "punt" || p.suggestion === "field_goal");
    const heavy = s.down === 3 && s.distance <= 2 && (p.suggestion === "run" || p.suggestion === "pass") && p.personnelOptions.includes("13");
    if (gamble) call = { call: s.distance <= 3 ? "run" : "pass" };
    else if (heavy) call = { call: "run", personnel: "13", set: "under_center" };
    const down = formatDownDistance(s, p.team, p.opponent).padEnd(18);
    line = `${down} offense  coaches: ${p.suggestion} from ${p.formation.personnel} ${p.formation.set}`;
    if (call && "call" in call) line += `  -> ${call.call}${call.personnel ? ` from ${call.personnel} ${call.set}` : ""}${gamble ? " (going for it)" : ""}`;
  } else if (p.kind === "defense") {
    if (s.down === 3 && s.distance >= 7) call = { package: "dime", coverage: "cover_0", blitz: 2 };
    const f = p.formation;
    line = `${formatDownDistance(s, p.opponent, p.team).padEnd(18)} defense  vs ${p.offense.personnel} ${p.offense.set}, coordinator: ${f.package} ${f.coverage} +${f.blitzers.length}`;
    if (call) line += "  -> dime cover_0 +2";
  } else if (p.kind === "timeout") {
    line = `timeout? head coach says ${p.suggestion ? "yes" : "no"} (${p.timeouts.own} left, ${lead(p.margin)})`;
  } else {
    if (p.margin < 0 && p.suggestion === "kick") call = { try: "two_point" };
    line = `try after a TD (${lead(p.margin)}): head coach says ${p.suggestion}${call ? "  -> two_point" : ""}`;
  }
  if (call || p.kind === "timeout" || p.kind === "try" || shown < 3) {
    console.log(`${when}  ${line}`);
    shown++;
  }
  if (call) overrides++;
  game.answer(call);
}

const coached = game.result!;
const plain = simulateGame(home, away, seed);
const score = (g: typeof coached) => `${away.abbr} ${g.score[away.abbr]} - ${home.abbr} ${g.score[home.abbr]}`;
console.log(`\nYour game (${coached.coached!.calls.length} calls: ${Object.entries(asked).map(([k, n]) => `${n} ${k}`).join(", ")}; ${overrides} changed): ${score(coached)}`);
console.log(`The coaches' game:                 ${score(plain)}`);
console.log(`Replayed from the calls: ${JSON.stringify(simulateGame(home, away, seed, { coach: home.abbr, calls: coached.coached!.calls })) === JSON.stringify(coached) ? "identical" : "DIFFERENT"}`);
const last4th = coached.plays.filter((p) => p.event.start.down === 4 && p.event.offense === home.abbr && (p.event.kind === "run" || p.event.kind === "pass")).at(-1);
if (last4th) console.log(`\nLast 4th-down try: ${describePlay(last4th.event, lookupFor(home, away))}`);
