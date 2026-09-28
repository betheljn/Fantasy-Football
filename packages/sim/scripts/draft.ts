// Milestone 3, step 4: season, playoffs, a season of scouting, then the draft.
// Usage: node scripts/draft.ts [league-seed] [team]
import {
  DEV_TRAIT_NAMES,
  draftOrder,
  draftValue,
  generateDraftClass,
  generateLeague,
  playerOverall,
  runDraft,
  scoutSeason,
  simulatePlayoffs,
  simulateSeason,
  teamName,
  type DraftPick,
} from "../src/index.ts";

const [seed = "dynasty", teamArg = "TX"] = process.argv.slice(2);
const team = teamArg.toUpperCase();
const league = generateLeague(seed);
const cls = generateDraftClass(league);
const scouting = scoutSeason(league, cls);
const playoffs = simulatePlayoffs(league, simulateSeason(league));
const draft = runDraft(league, cls, scouting, draftOrder(playoffs));
const name = (abbr: string) => teamName(league.teams[abbr]!);
// True draft value: the same formula teams use, but on the real ratings.
const trueValue = (pl: DraftPick["player"]) => draftValue(pl.position, playerOverall(pl), pl.potential);
const value = (p: DraftPick) => trueValue(p.player);
const trueRank = new Map([...cls.prospects].sort((a, b) => trueValue(b.player) - trueValue(a.player)).map((p, i) => [p.player.id, i + 1]));

const line = (p: DraftPick) =>
  `  ${String(p.overall).padStart(3)}. ${name(p.team).padEnd(26)} ${`${p.player.firstName} ${p.player.lastName}`.padEnd(20)} ${p.player.position.padEnd(3)}` +
  ` public #${String(p.publicRank).padEnd(4)} true ${String(playerOverall(p.player)).padStart(2)}/${String(p.player.potential).padEnd(2)} ${DEV_TRAIT_NAMES[p.player.devTrait]}`;

console.log(`${draft.season} draft, league "${seed}". Champion ${name(playoffs.champion)} picks last.\n`);
console.log("Round 1");
for (const p of draft.picks.filter((x) => x.round === 1)) console.log(line(p));

console.log(`\n${name(team)} haul`);
for (const p of draft.picks.filter((x) => x.team === team)) console.log(line(p) + `  (round ${p.round})`);

const steals = [...draft.picks].filter((p) => p.round >= 3).sort((a, b) => trueRank.get(a.player.id)! - trueRank.get(b.player.id)!).slice(0, 5);
console.log("\nBiggest steals (late picks who are really first-round talent):");
for (const p of steals) console.log(line(p) + `  truly #${trueRank.get(p.player.id)}`);
const busts = draft.picks.filter((p) => p.round === 1).sort((a, b) => value(a) - value(b)).slice(0, 3);
console.log("\nRiskiest first-rounders (weakest true value):");
for (const p of busts) console.log(line(p) + `  truly #${trueRank.get(p.player.id)}`);

const hidden = draft.undrafted.filter((p) => p.player.potential >= 70).length;
console.log(`\nUndrafted: ${draft.undrafted.length} prospects (${hidden} with 70+ potential still out there)`);
