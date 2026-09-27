// Milestone step 3 demo: one run play and one pass play, then a large sample of
// each from the same situation to sanity-check the averages.
// Usage: node scripts/step3-single-plays.ts [seed]
import {
  Rng,
  describePlay,
  formatSituation,
  generateTeams,
  getPlayer,
  simulatePass,
  simulateRun,
  teamName,
  type PassPlayEvent,
  type PlayContext,
  type RunPlayEvent,
  type Team,
} from "../src/index.ts";

const seed = process.argv[2] ?? "2031";
const [home, away] = generateTeams(new Rng(seed), 2) as [Team, Team];
const rng = new Rng(`${seed}:plays`);
const lookup = (id: string) => (id.startsWith(home.abbr) ? getPlayer(home, id) : getPlayer(away, id));

const ctx: PlayContext = {
  offense: home,
  defense: away,
  situation: { quarter: 1, clock: 900, down: 1, distance: 10, yardline: 25 },
};

console.log(`Seed ${seed}: ${teamName(home)} offense vs ${teamName(away)} defense\n`);

const run = simulateRun(rng, ctx);
console.log(`${formatSituation(run.start, run.offense, run.defense)}  ${describePlay(run, lookup)}`);
console.log(JSON.stringify(run, null, 2));

const pass = simulatePass(rng, ctx);
console.log(`\n${formatSituation(pass.start, pass.offense, pass.defense)}  ${describePlay(pass, lookup)}`);
console.log(JSON.stringify(pass, null, 2));

// --- sample 20,000 of each ---
const N = 20000;
const runs: RunPlayEvent[] = [];
const passes: PassPlayEvent[] = [];
for (let i = 0; i < N; i++) {
  runs.push(simulateRun(rng, ctx));
  passes.push(simulatePass(rng, ctx));
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const count = <T>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length;

const runYds = runs.map((r) => r.yardsGained).sort((a, b) => a - b);
console.log(`\nRuns (n=${N}) from own 25, 1st & 10`);
console.log(`  yards/carry ${mean(runYds).toFixed(2)}   median ${runYds[N / 2]}   stuffed (<=0) ${pct(count(runYds, (y) => y <= 0) / N)}`);
console.log(`  10+ yds ${pct(count(runYds, (y) => y >= 10) / N)}   20+ yds ${pct(count(runYds, (y) => y >= 20) / N)}   fumbles lost ${pct(count(runs, (r) => !!r.fumble?.lost) / N)}   TD ${pct(count(runs, (r) => r.touchdown) / N)}`);

const attempts = passes.filter((p) => p.outcome !== "sack");
const comps = attempts.filter((p) => p.outcome === "complete");
const passYds = comps.reduce((s, p) => s + p.yardsGained, 0);
console.log(`\nPasses (n=${N}) from own 25, 1st & 10`);
console.log(`  comp ${pct(comps.length / attempts.length)}   yards/att ${(passYds / attempts.length).toFixed(2)}   yards/comp ${(passYds / comps.length).toFixed(2)}`);
console.log(`  sack rate ${pct(count(passes, (p) => p.outcome === "sack") / N)}   INT rate ${pct(count(attempts, (p) => p.outcome === "interception") / attempts.length)}   20+ yd completions ${pct(count(comps, (p) => p.yardsGained >= 20) / attempts.length)} of att`);
const targets = new Map<string, number>();
for (const p of attempts) targets.set(p.target!, (targets.get(p.target!) ?? 0) + 1);
console.log(
  "  target share: " +
    [...targets.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, c]) => `${getPlayer(home, id).position} ${getPlayer(home, id).lastName} ${pct(c / attempts.length)}`)
      .join(", "),
);
