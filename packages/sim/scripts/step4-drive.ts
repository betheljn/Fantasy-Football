// Milestone step 4 demo: simulate one full drive with play-by-play, then summarise
// the results of many drives from the same starting point.
// Usage: node scripts/step4-drive.ts [seed]
import {
  Rng,
  describePlay,
  formatClock,
  formatSituation,
  generateTeams,
  getPlayer,
  simulateDrive,
  teamName,
  type DriveInput,
  type DriveResult,
  type DriveResultType,
  type Team,
} from "../src/index.ts";

const seed = process.argv[2] ?? "2031";
const [home, away] = generateTeams(new Rng(seed), 2) as [Team, Team];
const who = (id: string) => (id.startsWith(home.abbr) ? getPlayer(home, id) : getPlayer(away, id));

function printDrive(d: DriveResult): void {
  for (const p of d.plays) {
    const e = p.event;
    const pre = e.kind === "conversion" ? "".padEnd(28) : formatSituation(e.start, e.offense, e.defense).padEnd(28);
    console.log(`  ${pre} ${describePlay(e, who)}`);
  }
  const pts = Object.entries(d.points).filter(([, v]) => v > 0).map(([t, v]) => `${t} +${v}`).join(", ") || "no points";
  console.log(
    `  => ${d.result.toUpperCase()} (${pts}). ${d.scrimmagePlays} plays, ${d.yards} yards, ${formatClock(d.seconds)}. ` +
      `Ends Q${d.end.quarter} ${formatClock(d.end.clock)}. Next: ${JSON.stringify(d.next)}\n`,
  );
}

const rng = new Rng(`${seed}:drive`);
const opening: DriveInput = {
  offense: home,
  defense: away,
  quarter: 1,
  clock: 900,
  yardline: 25,
  score: { [home.abbr]: 0, [away.abbr]: 0 },
  timeouts: { [home.abbr]: 3, [away.abbr]: 3 },
};

console.log(`Seed ${seed}: ${teamName(home)} offense vs ${teamName(away)} defense\n`);
console.log("Opening drive, own 25:");
printDrive(simulateDrive(rng, opening));

console.log("Two-minute drill: trailing by 4, 1:50 left in Q4, own 30, 1 timeout:");
printDrive(
  simulateDrive(rng, { ...opening, quarter: 4, clock: 110, yardline: 30, score: { [home.abbr]: 17, [away.abbr]: 21 }, timeouts: { [home.abbr]: 1, [away.abbr]: 2 } }),
);

console.log("Protecting a lead: up 3, 2:30 left in Q4, own 40, defense has 2 timeouts:");
printDrive(
  simulateDrive(rng, { ...opening, quarter: 4, clock: 150, yardline: 40, score: { [home.abbr]: 20, [away.abbr]: 17 }, timeouts: { [home.abbr]: 3, [away.abbr]: 2 } }),
);

// --- many drives, both directions, from the own 25 early in the game ---
const N = 10000;
const tally = new Map<DriveResultType, number>();
let pts = 0, plays = 0, yards = 0, secs = 0;
for (let i = 0; i < N; i++) {
  const [o, d] = i % 2 ? [home, away] : [away, home];
  const res = simulateDrive(rng, { offense: o, defense: d, quarter: 1, clock: 900, yardline: 25, score: { [o.abbr]: 0, [d.abbr]: 0 }, timeouts: { [o.abbr]: 3, [d.abbr]: 3 } });
  tally.set(res.result, (tally.get(res.result) ?? 0) + 1);
  pts += res.points[o.abbr]! - res.points[d.abbr]!;
  plays += res.scrimmagePlays;
  yards += res.yards;
  secs += res.seconds;
}
console.log(`${N} drives from own 25 (both teams on offense):`);
console.log(`  net points/drive ${(pts / N).toFixed(2)}   plays/drive ${(plays / N).toFixed(1)}   yards/drive ${(yards / N).toFixed(1)}   time/drive ${formatClock(secs / N)}`);
console.log(
  "  " +
    [...tally.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([r, c]) => `${r} ${((100 * c) / N).toFixed(1)}%`)
      .join(", "),
);
