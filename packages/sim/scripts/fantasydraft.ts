// Milestone 19 step 4: the fantasy draft that starts a dynasty.
import {
  FANTASY_ROUNDS, POSITIONS, allTeams, fantasyValue, fantasyDraftOrder, fantasyDraftSteps, formatMoney, payroll, playerOverall, salaryCap, startDynasty, teamName, teamRatings, type Player,
} from "../src/index.ts";

const rounds = Number(process.argv[2] ?? 10);
const league = startDynasty("fantasy-demo").league;
const order = fantasyDraftOrder(league);
const me = order[4]!;
const ovr = (l: typeof league) => new Map(allTeams(l).map((t) => [t.abbr, teamRatings(t).overall]));
const before = ovr(league);
console.log(`You: ${teamName(league.teams[me]!)}, picking 5th (and ${51 - 5}th in round 2). Your ${rounds} rounds, then the AI.\n`);
console.log(`Round 1 order: ${order.join(" ")}\n`);

const started = performance.now();
const steps = fantasyDraftSteps(league, { humans: { [me]: rounds } });
let r = steps.next();
const name = (p: Player) => `${p.position.padEnd(2)} ${`${p.firstName} ${p.lastName}`.padEnd(22)} age ${p.age}  ovr ${playerOverall(p)}  value ${fantasyValue(p)}`;
while (!r.done) {
  const t = r.value;
  // Your strategy: the top of the board you may take, one QB, no second player at a position until round 6.
  const have = (pos: string) => t.roster.filter((p) => p.position === pos).length;
  const pick = t.available.find((p) => t.allowed.includes(p.position) && (p.position === "QB" ? have("QB") === 0 : t.round > 5 || have(p.position) === 0))!;
  const ai = t.available.find((p) => p.id === t.suggestion)!;
  console.log(`R${String(t.round).padStart(2)} #${String(t.overall).padStart(4)}  you take ${name(pick)}${pick.id === ai.id ? "" : `   (AI would: ${ai.position} ${ai.lastName} ${playerOverall(ai)})`}`);
  r = steps.next(pick.id);
}
const elapsed = performance.now() - started;
const result = r.value;
const after = ovr(result.league);

const team = result.league.teams[me]!;
console.log(`\nYour roster by position: ${POSITIONS.map((pos) => `${pos} ${team.roster.filter((p) => p.position === pos).length}`).join(", ")} = ${team.roster.length}`);
console.log(`Your starters' rating: ${before.get(me)!.toFixed(1)} before, ${after.get(me)!.toFixed(1)} after (rank ${[...after.values()].sort((a, b) => b - a).indexOf(after.get(me)!) + 1} of 50)`);
const vals = [...after.values()];
const bvals = [...before.values()];
console.log(`League team ratings: ${Math.min(...bvals).toFixed(1)}-${Math.max(...bvals).toFixed(1)} before, ${Math.min(...vals).toFixed(1)}-${Math.max(...vals).toFixed(1)} after`);
const cap = salaryCap(result.league.seed, result.league.season);
const pays = allTeams(result.league).map((t) => payroll(t, result.league.season));
console.log(`Payrolls ${formatMoney(Math.min(...pays))}-${formatMoney(Math.max(...pays))} of a ${formatMoney(cap)} cap; you ${formatMoney(payroll(team, result.league.season))}`);
console.log(`Free agents left over: ${result.league.freeAgents?.length ?? 0}`);
console.log(`\n${result.picks.length} picks (${FANTASY_ROUNDS} rounds), new contracts and depth charts in ${elapsed.toFixed(0)} ms`);
