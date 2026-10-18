// Times weeks of scouting and recruiting for all 50 teams (the heaviest weekly step after the games).
import { advanceScoutingWeek, buildDynasty, createScouting, generateDraftClass } from "../src/index.ts";

const steps = buildDynasty("scout-bench", 2);
let r = steps.next();
while (!r.done) r = steps.next();
const d = r.value;
const dc = generateDraftClass(d.league);
let s = createScouting(d.league, dc);
const times: number[] = [];
for (let w = 0; w < 8; w++) {
  const t0 = performance.now();
  s = advanceScoutingWeek(s, d.league, dc);
  times.push(performance.now() - t0);
}
console.log(`scouting weeks (ms): ${times.map((t) => Math.round(t)).join(" ")}, mean ${Math.round(times.reduce((a, b) => a + b, 0) / times.length)}`);
console.log(`fingerprint ${JSON.stringify(s).length}:${[...JSON.stringify(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)}`);
