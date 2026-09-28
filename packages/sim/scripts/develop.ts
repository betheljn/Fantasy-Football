// Milestone 3, step 1: one offseason of development.
// Usage: node scripts/develop.ts [league-seed]
import { developLeague, displayName, generateLeague, playerOverall, type Player } from "../src/index.ts";

const seed = process.argv[2] ?? "dynasty";
const before = generateLeague(seed);
const after = developLeague(before);

const pairs: Array<{ b: Player; a: Player; team: string }> = [];
for (const [abbr, t] of Object.entries(after.teams)) {
  const old = new Map(before.teams[abbr]!.roster.map((p) => [p.id, p]));
  for (const p of t.roster) pairs.push({ b: old.get(p.id)!, a: p, team: abbr });
}
const delta = (x: (typeof pairs)[number]) => playerOverall(x.a) - playerOverall(x.b);

console.log(`Offseason development, league "${seed}" (${before.season} -> ${before.season + 1})\n`);
console.log("Average change in overall by age:");
const buckets: Array<[string, number, number]> = [["21-22", 21, 22], ["23-25", 23, 25], ["26-28", 26, 28], ["29-31", 29, 31], ["32-34", 32, 34], ["35+", 35, 99]];
for (const [label, lo, hi] of buckets) {
  const xs = pairs.filter((x) => x.b.age >= lo && x.b.age <= hi).map(delta);
  const m = xs.reduce((s, v) => s + v, 0) / xs.length;
  console.log(`  ${label.padEnd(6)} ${(m >= 0 ? "+" : "") + m.toFixed(1)}  (${xs.length} players)`);
}
const line = (x: (typeof pairs)[number]) =>
  `  ${`${displayName(x.a)} ${x.a.position}, ${x.team}`.padEnd(24)} age ${x.a.age}  ${playerOverall(x.b)} -> ${playerOverall(x.a)}  (${delta(x) >= 0 ? "+" : ""}${delta(x)})`;
const sorted = [...pairs].sort((p, q) => delta(q) - delta(p));
console.log("\nBiggest risers:");
for (const x of sorted.slice(0, 5)) console.log(line(x));
console.log("\nBiggest fallers:");
for (const x of sorted.slice(-5).reverse()) console.log(line(x));
