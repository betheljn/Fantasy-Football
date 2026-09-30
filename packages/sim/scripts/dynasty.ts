// Milestone 3, step 6: run a dynasty for several seasons and print league history.
// Usage: node scripts/dynasty.ts [league-seed] [seasons]
import { allTeams, formatMoney, payroll, runDynasty, salaryCap, startDynasty, talentSnapshot, teamName, type Dynasty } from "../src/index.ts";

const seed = process.argv[2] ?? "dynasty";
const seasons = Number(process.argv[3] ?? 10);
const t0 = performance.now();
const start = startDynasty(seed);
const startTalent = talentSnapshot(start.league);
const done: Dynasty = runDynasty(start, seasons, (d) => {
  const h = d.history.at(-1)!;
  const award = (name: string) => h.awards.find((a) => a.award === name);
  const fmt = (name: string) => {
    const a = award(name);
    return a ? `${a.name} (${a.position}, ${a.team})` : "-";
  };
  console.log(`${h.season}  Champion ${teamName(start.league.teams[h.champion]!)} over ${h.runnerUp}`);
  console.log(`      MVP ${fmt("MVP")}: ${award("MVP")?.line ?? ""}`);
  console.log(`      DPOY ${fmt("Defensive Player of the Year")}   ROY ${fmt("Rookie of the Year")}`);
  console.log(`      #1 pick: ${h.topPicks[0]!.player} (${h.topPicks[0]!.position}) to ${h.topPicks[0]!.team}`);
  const coty = h.coachOfTheYear;
  if (coty) console.log(`      Coach of the Year: ${coty.name} (${coty.team}, ${coty.record}, ${coty.overExpected >= 0 ? "+" : ""}${coty.overExpected.toFixed(1)} wins over expected)`);
  const hc = h.staffChanges.filter((c) => c.role === "HC");
  const other = h.staffChanges.length - hc.length;
  for (const c of hc)
    console.log(`      ${c.team} HC: ${c.out ?? "-"} (${c.reason}${c.buyout ? `, ${formatMoney(c.buyout)} buyout` : ""}) -> ${c.in} (${c.from}${c.contract ? `, ${formatMoney(c.contract.salary)}/yr through ${c.contract.through}` : ""})`);
  if (other) console.log(`      + ${other} coordinator/front office change${other === 1 ? "" : "s"}`);
  const c = h.contracts;
  const big = c.biggestDeals[0];
  console.log(`      Contracts: ${c.counts["re-signed"]} re-signed, ${c.counts.extended} extended, ${c.counts.option} options, ${c.counts.signed} free agents signed, ${c.counts["cap cut"]} cap cuts; dead money ${formatMoney(c.deadMoney)}`);
  if (big) console.log(`      Biggest deal: ${big.player} (${big.position}, ${big.team}) ${big.years} yrs/${formatMoney(big.total)} (${big.kind})`);
  const fa = c.topFreeAgents[0];
  if (fa) console.log(`      Top free agent: ${fa.player} (${fa.position}) ${fa.from} -> ${fa.to}, ${fa.years} yrs/${formatMoney(fa.total)} from ${fa.bidders} offers${fa.hometown ? " (hometown)" : ""}; ${c.counts.declined} tested the market, ${c.hometownSignings} went home`);
});
const secs = (performance.now() - t0) / 1000;

console.log(`\n${seasons} seasons in ${secs.toFixed(0)}s (including a ${start.league.season - 15}-${start.league.season - 1} burn-in)\n`);
const titles = new Map<string, number>();
for (const h of done.history) titles.set(h.champion, (titles.get(h.champion) ?? 0) + 1);
console.log("Championships: " + [...titles.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(", "));

const careers = [...done.careers.values()];
const leader = (label: string, key: "passYds" | "rushYds" | "recYds" | "sacks" | "defInt" | "tackles") => {
  const c = careers.reduce((a, b) => (b.stats[key] > a.stats[key] ? b : a));
  console.log(`  ${label.padEnd(17)} ${c.name} (${c.position}, ${c.teams.join("/")}) ${c.stats[key]} over ${c.seasons} seasons`);
};
console.log("\nCareer leaders over these seasons:");
leader("Passing yards", "passYds");
leader("Rushing yards", "rushYds");
leader("Receiving yards", "recYds");
leader("Tackles", "tackles");
leader("Sacks", "sacks");
leader("Interceptions", "defInt");

const coaches = [...done.staffCareers.values()].filter((c) => c.record.wins + c.record.losses >= 40);
const pct = (c: (typeof coaches)[number]) => (c.record.wins + c.record.ties / 2) / (c.record.wins + c.record.losses + c.record.ties);
console.log("\nWinningest head coaches (40+ games):");
for (const c of coaches.sort((a, b) => pct(b) - pct(a)).slice(0, 5)) {
  const teams = [...new Set(c.stints.filter((s) => s.role === "HC").map((s) => s.team))].join("/");
  console.log(`  ${c.name.padEnd(20)} ${teams.padEnd(9)} ${c.record.wins}-${c.record.losses}  playoffs ${c.playoffTrips}  titles ${c.titles}  COY ${c.coachOfTheYear}  ${c.status}`);
}
const allChanges = done.history.flatMap((h) => h.staffChanges);
const count = (f: (c: (typeof allChanges)[number]) => boolean) => allChanges.filter(f).length;
console.log(`Staff turnover: ${count((c) => c.role === "HC")} head coach changes (${count((c) => c.role === "HC" && c.reason === "fired")} fired, ${count((c) => c.role === "HC" && c.from === "promoted coordinator")} coordinators promoted), ${allChanges.length} changes in all`);

const capNow = salaryCap(done.league.seed, done.league.season);
const shares = allTeams(done.league).map((t) => payroll(t, done.league.season) / capNow);
console.log(`\nCap ${done.league.season}: ${formatMoney(capNow)}; payrolls ${(Math.min(...shares) * 100).toFixed(0)}-${(Math.max(...shares) * 100).toFixed(0)}% of the cap (average ${((shares.reduce((a, b) => a + b) / shares.length) * 100).toFixed(1)}%)`);

const end = talentSnapshot(done.league);
console.log(`\nLeague talent: starters ${startTalent.starterOverall.toFixed(1)} -> ${end.starterOverall.toFixed(1)}, average age ${startTalent.averageAge.toFixed(1)} -> ${end.averageAge.toFixed(1)}, players 80+ ${startTalent.stars} -> ${end.stars}`);
