// Milestone 24 step 2: recruits fall toward the programs they lean to. The
// same draft twice (same league, class, scouting and order): once with the
// season's recruiting, once with it wiped. How often a leaning prospect lands
// with his program, and how far the ones who do are taken past where the
// consensus had them.
// Usage: node scripts/recruit-draft.ts [seed]
import { CURRENT_FORMAT, allLeanings, allTeams, generateDraftClass, generateLeague, runDraft, scoutSeason, type DraftResult } from "../src/index.ts";

const seeds = process.argv[2] ? [process.argv[2]] : ["rd-1", "rd-2", "rd-3", "rd-4"];
let lean = 0, landed = 0, landedPlain = 0, slide = 0, slidePlain = 0, early = 0, earlyLanded = 0, earlyPlain = 0;
for (const seed of seeds) {
  const league = { ...generateLeague(seed), format: CURRENT_FORMAT };
  const cls = generateDraftClass(league);
  const scouting = scoutSeason(league, cls);
  const order = allTeams(league).map((t) => t.abbr);
  const leanings = allLeanings(scouting);
  const withR = runDraft(league, cls, scouting, order);
  const { interest: _i, ...noR } = scouting;
  const without = runDraft(league, cls, noR, order);
  const where = (d: DraftResult) => new Map(d.picks.map((p) => [p.player.id, p]));
  const a = where(withR), b = where(without);
  for (const [id, l] of leanings) {
    if (!l) continue;
    const p = a.get(id), q = b.get(id);
    if (!p || !q) continue;
    lean++;
    if (p.team === l.team) (landed++, (slide += p.overall - p.publicRank));
    if (q.team === l.team) (landedPlain++, (slidePlain += q.overall - q.publicRank));
    if (p.publicRank <= 100) (early++, p.team === l.team && earlyLanded++, q.team === l.team && earlyPlain++);
  }
}
const pct = (n: number, of: number) => `${Math.round((100 * n) / of)}%`;
console.log(`${seeds.length} drafts, ${lean} drafted prospects leaning to a program\n`);
console.log(`Landed with the program he leaned to:   with recruiting ${pct(landed, lean)}   without it ${pct(landedPlain, lean)}`);
console.log(`  (consensus top 100 only:               with recruiting ${pct(earlyLanded, early)}   without it ${pct(earlyPlain, early)})`);
console.log(`Picks past his consensus rank, when he landed there: ${(slide / Math.max(1, landed)).toFixed(1)} (without recruiting: ${(slidePlain / Math.max(1, landedPlain)).toFixed(1)})`);
