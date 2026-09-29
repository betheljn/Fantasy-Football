// Milestone 5, step 1: contracts and the salary cap for a settled league.
// Usage: node scripts/cap.ts [league-seed] [team-abbr]
import {
  allTeams,
  capHit,
  formatCapSheet,
  formatContractYears,
  formatMoney,
  formatPlayerCard,
  payroll,
  playerOverall,
  salaryCap,
  startDynasty,
} from "../src/index.ts";

const seed = process.argv[2] ?? "dynasty";
const league = startDynasty(seed).league;
const season = league.season;
const cap = salaryCap(league.seed, season);
const team = league.teams[process.argv[3] ?? "OH"]!;

console.log(`Salary cap: ${[season, season + 1, season + 2, season + 5, season + 10].map((s) => `${s} ${formatMoney(salaryCap(league.seed, s))}`).join("  ")}\n`);
console.log(formatCapSheet(team, cap, season));

const star = [...team.roster].sort((a, b) => capHit(b.contract!, season) - capHit(a.contract!, season))[0]!;
console.log(`\n${formatPlayerCard(star, team.abbr).split("\n").slice(0, 3).join("\n")}`);
console.log(formatContractYears(star.contract!));

const pays = allTeams(league).map((t) => ({ t: t.abbr, pay: payroll(t, season) })).sort((a, b) => b.pay - a.pay);
console.log(`\nPayrolls: highest ${pays.slice(0, 3).map((x) => `${x.t} ${formatMoney(x.pay)}`).join(", ")}; lowest ${pays.slice(-3).map((x) => `${x.t} ${formatMoney(x.pay)}`).join(", ")}`);

const all = allTeams(league).flatMap((t) => t.roster.map((p) => ({ p, t: t.abbr, hit: capHit(p.contract!, season) })));
console.log("\nHighest paid by position:");
for (const pos of ["QB", "DL", "WR", "CB", "OL", "LB", "S", "TE", "RB", "K"]) {
  const xs = all.filter((x) => x.p.position === pos).sort((a, b) => b.hit - a.hit);
  const top = xs[0]!;
  const median = xs[Math.floor(xs.length / 2)]!.hit;
  console.log(`  ${pos.padEnd(3)} ${formatMoney(top.hit).padStart(7)}  ${top.p.firstName} ${top.p.lastName} (${top.t}, ${playerOverall(top.p)} ovr, age ${top.p.age})   median ${formatMoney(median)}`);
}
const rookies = all.filter((x) => x.p.contract!.kind === "rookie").length;
const homegrown = all.filter((x) => x.p.contract!.homegrown).length;
console.log(`\n${all.length} contracts: ${rookies} rookie deals, ${homegrown} homegrown (80% cap credit)`);
