// Milestone 22 step 2: the play duel across a league. The same games under
// rules 3 (no calls) and rules 4 (both sides call concepts): league-wide
// numbers should barely move; what moves is who wins the calls.
// Usage: node scripts/duel-balance.ts [games]
import { generateLeague, simulateGame, allTeams, conceptMatchup, OFFENSE_CONCEPT_INFO, DEFENSE_CONCEPT_INFO, type GameResult } from "../src/index.ts";

const N = Number(process.argv[2] ?? 300);
const league = generateLeague("duel-balance");
const teams = allTeams(league);

function stats(games: GameResult[]) {
  let pts = 0, plays = 0, yards = 0, runs = 0, runYds = 0, att = 0, comp = 0, passYds = 0, sacks = 0, ints = 0, fum = 0, homeWins = 0, decided = 0;
  for (const g of games) {
    pts += g.score[g.home]! + g.score[g.away]!;
    if (g.winner) { decided++; if (g.winner === g.home) homeWins++; }
    for (const p of g.plays) {
      const e = p.event;
      if (e.kind !== "run" && e.kind !== "pass") continue;
      if (e.penalty?.accepted && !e.penalty.playStands) continue;
      plays++; yards += e.yardsGained;
      if (e.kind === "run") { runs++; runYds += e.yardsGained; }
      else if (e.outcome === "sack") sacks++;
      else { att++; passYds += e.yardsGained; if (e.outcome === "complete") comp++; if (e.outcome === "interception") ints++; }
      if (e.fumble?.lost) fum++;
    }
  }
  const g = games.length;
  return {
    "points/game": (pts / g).toFixed(1),
    "yards/play": (yards / plays).toFixed(2),
    "yards/carry": (runYds / runs).toFixed(2),
    "comp %": ((100 * comp) / att).toFixed(1),
    "yards/att": (passYds / att).toFixed(2),
    "sack %": ((100 * sacks) / (att + sacks)).toFixed(1),
    "int %": ((100 * ints) / att).toFixed(2),
    "pass share": ((100 * (att + sacks)) / plays).toFixed(1),
    "home win %": ((100 * homeWins) / decided).toFixed(1),
  };
}

const pairs = Array.from({ length: N }, (_, i) => [teams[(i * 7) % teams.length]!, teams[(i * 13 + 5) % teams.length]!] as const).filter(([a, b]) => a.abbr !== b.abbr);
const t3 = pairs.map(([h, a], i) => simulateGame(h, a, `bal-${i}`, { rules: 3 }));
const t0 = performance.now();
const t4 = pairs.map(([h, a], i) => simulateGame(h, a, `bal-${i}`, { rules: 4 }));
const ms = (performance.now() - t0) / pairs.length;
const s3 = stats(t3), s4 = stats(t4);
console.log(`${pairs.length} games, same teams and seeds (rules 4: ${ms.toFixed(1)} ms a game)\n`);
console.log("".padEnd(14) + "rules 3".padStart(9) + "rules 4".padStart(9));
for (const k of Object.keys(s3) as (keyof typeof s3)[]) console.log(k.padEnd(14) + s3[k].padStart(9) + s4[k].padStart(9));

// Calls and how they went.
const offCount: Record<string, number> = {}, defCount: Record<string, number> = {};
let snaps = 0, edgeSum = 0, won = 0, lost = 0;
for (const g of t4) for (const p of g.plays) {
  const e = p.event;
  if ((e.kind !== "run" && e.kind !== "pass") || !e.calls) continue;
  snaps++;
  offCount[e.calls.offense] = (offCount[e.calls.offense] ?? 0) + 1;
  defCount[e.calls.defense] = (defCount[e.calls.defense] ?? 0) + 1;
  const ed = conceptMatchup(e.calls.offense, e.calls.defense).edge;
  edgeSum += ed; if (ed > 0) won++; if (ed < 0) lost++;
}
const pct = (n: number) => `${((100 * n) / snaps).toFixed(0)}%`;
console.log(`\nOffense calls: ${Object.entries(offCount).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${OFFENSE_CONCEPT_INFO[k as keyof typeof OFFENSE_CONCEPT_INFO].label} ${pct(n)}`).join(", ")}`);
console.log(`Defense calls: ${Object.entries(defCount).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${DEFENSE_CONCEPT_INFO[k as keyof typeof DEFENSE_CONCEPT_INFO].label} ${pct(n)}`).join(", ")}`);
console.log(`Offense won the call on ${pct(won)} of snaps, lost ${pct(lost)}, even ${pct(snaps - won - lost)}; average edge ${(edgeSum / snaps).toFixed(2)}`);

// Reading tendencies: a coach who only ever runs inside, against the AI defense.
import { startCoachedGame } from "../src/index.ts";
const [me, them] = [teams[0]!, teams[1]!];
const byQ: Record<number, { snaps: number; blitz: number; yards: number }> = {};
for (let i = 0; i < 40; i++) {
  const game = startCoachedGame(me, them, `tend-${i}`, me.abbr);
  while (game.prompt) {
    const p = game.prompt;
    game.answer(p.kind === "offense" && (p.suggestion === "run" || p.suggestion === "pass") ? { call: "run", concept: "inside_run" } : undefined);
  }
  for (const p of game.result!.plays) {
    const e = p.event;
    if (e.kind !== "run" || e.offense !== me.abbr || !e.calls) continue;
    const q = (byQ[Math.min(p.quarter, 4)] ??= { snaps: 0, blitz: 0, yards: 0 });
    q.snaps++;
    q.yards += e.yardsGained;
    if (e.calls.defense === "run_blitz") q.blitz++;
  }
}
console.log(`\nA coach who runs inside on every snap (40 games vs the AI):`);
for (const [q, x] of Object.entries(byQ)) console.log(`  Q${q}: run blitz on ${((100 * x.blitz) / x.snaps).toFixed(0)}% of snaps, ${(x.yards / x.snaps).toFixed(1)} yards a carry`);
