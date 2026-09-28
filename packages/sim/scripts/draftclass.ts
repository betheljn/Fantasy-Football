// Milestone 3, step 3: the incoming draft class and consensus big board.
// Usage: node scripts/draftclass.ts [league-seed]
import { classComposition, generateDraftClass, generateLeague, playerOverall } from "../src/index.ts";

const seed = process.argv[2] ?? "dynasty";
const league = generateLeague(seed);
const cls = generateDraftClass(league);
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

console.log(`${cls.season} draft class, league "${seed}": ${cls.prospects.length} prospects`);
console.log(`By position: ${Object.entries(classComposition()).map(([p, n]) => `${p} ${n}`).join(", ")}\n`);

console.log("Consensus big board (projection = what the league thinks; true = hidden)");
console.log("   #  name                    pos age   proj ovr/pot    true ovr/pot");
for (const p of cls.prospects.slice(0, 32)) {
  const pl = p.player;
  console.log(
    `  ${String(p.boardRank).padStart(2)}  ${`${pl.firstName} ${pl.lastName}`.padEnd(22)}  ${pl.position.padEnd(3)} ${pl.age}     ${String(p.projection.overall).padStart(3)}/${String(p.projection.potential).padEnd(3)}        ${String(playerOverall(pl)).padStart(3)}/${pl.potential}`,
  );
}

// How good is the board? Where do the truly best prospects sit?
const byTrue = [...cls.prospects].sort((a, b) => b.player.potential - a.player.potential);
console.log(`\nTrue top-10 potentials are at board ranks: ${byTrue.slice(0, 10).map((p) => p.boardRank).join(", ")}`);
const gems = cls.prospects.filter((p) => p.boardRank > 200 && p.player.potential >= 72);
console.log(`Hidden gems (ranked outside the top 200, true potential 72+): ${gems.length}`);
console.log(`Class averages: overall ${mean(cls.prospects.map((p) => playerOverall(p.player))).toFixed(1)}, potential ${mean(cls.prospects.map((p) => p.player.potential)).toFixed(1)}`);
