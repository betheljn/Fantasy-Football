// Preview the 2D animation data for one play as ASCII snapshots. This is a
// debugging aid for the data only; the real renderer lives in the app.
// Usage: node scripts/anim-preview.ts [seed] [play-seq]
import { Rng, choreograph, describePlay, generateTeams, lookupFor, positionsAt, simulateGame, type Team } from "../src/index.ts";

const seed = process.argv[2] ?? "2031";
const [home, away] = generateTeams(new Rng(seed), 2) as [Team, Team];
const game = simulateGame(home, away, seed);
const who = lookupFor(home, away);
const wanted = process.argv[3] ? Number(process.argv[3]) : undefined;
// Default: the first completed pass of 15+ yards.
const play =
  game.plays.find((p) => p.seq === wanted) ??
  game.plays.find((p) => p.event.kind === "pass" && p.event.outcome === "complete" && p.event.yardsGained >= 15)!;
const e = play.event;
const anim = choreograph(e, `${game.seed}:${play.seq}`)!;

console.log(`Play #${play.seq}: ${describePlay(e, who)}`);
if (e.kind === "run" || e.kind === "pass") {
  const f = e.formation;
  console.log(
    `Offense ${f.offense.personnel} personnel, ${f.offense.set.replace("_", " ")} | Defense ${f.defense.package}, ` +
      `${f.defense.coverage.replace("_", " ")}, ${f.defense.rushers.length} rushers (${f.defense.blitzers.length} blitzing)`,
  );
}
console.log(`Animation: ${anim.actors.length} players, ${anim.duration.toFixed(1)}s. Offense (${anim.offense}) attacks right.`);
console.log(`Legend: offense Q R F T W O, defense d(L) l(B) c(B) s; * ball; | line of scrimmage; : first-down line\n`);

const glyph: Record<string, string> = { QB: "Q", RB: "R", FB: "F", TE: "T", WR: "W", OL: "O", DL: "d", LB: "l", CB: "c", S: "s", K: "K", P: "P", KR: "r", COVER: "x" };
const x0 = Math.floor(anim.lineOfScrimmage - 12);
const width = 48;
const snapshot = (t: number, label: string) => {
  const frame = positionsAt(anim, t);
  const rows = Array.from({ length: 27 }, () => Array.from({ length: width }, () => " "));
  const col = (x: number) => Math.round(x - x0);
  const row = (y: number) => Math.min(26, Math.max(0, Math.round(y / 2)));
  for (const r of rows) {
    const c = col(anim.lineOfScrimmage);
    if (c >= 0 && c < width) r[c] = "|";
    if (anim.firstDownLine !== null && col(anim.firstDownLine) >= 0 && col(anim.firstDownLine) < width) r[col(anim.firstDownLine)] = ":";
  }
  for (const a of anim.actors) {
    const p = frame.players[a.id]!;
    const c = col(p.x);
    if (c >= 0 && c < width) rows[row(p.y)]![c] = glyph[a.role] ?? "?";
  }
  const bc = col(frame.ball.x);
  if (bc >= 0 && bc < width) rows[row(frame.ball.y)]![bc] = "*";
  console.log(`t=${t.toFixed(1)}s ${label}  (columns = yards ${x0}..${x0 + width - 1}, rows = 2 yards)`);
  console.log("+" + "-".repeat(width) + "+");
  for (const r of rows) console.log("|" + r.join("") + "|");
  console.log("+" + "-".repeat(width) + "+\n");
};
snapshot(0, "snap");
snapshot(Math.min(2.5, anim.duration), "");
snapshot(anim.duration, "end of play");
