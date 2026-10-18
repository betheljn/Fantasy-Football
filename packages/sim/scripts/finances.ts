// The league's money over many seasons (AI teams): average revenue and expense lines, and teams in the red.
// Usage: node scripts/finances.ts [seasons] [seed]
import { economy, runDynasty, startDynasty, type SeasonFinances } from "../src/index.ts";

const seasons = Number(process.argv[2] ?? 25);
const seed = process.argv[3] ?? "finances";
const k = (x: number) => (x / 1000).toFixed(0).padStart(5);
console.log("season  econ  tickets conc  merch spons lmed  natTV share suite naming | payroll staff stad  debt | profit  in red  avg cash($M) ticket$");
runDynasty(startDynasty(seed), seasons, (d) => {
  const fs = Object.values(d.finances ?? {}).map((xs) => xs.at(-1)!).filter(Boolean) as SeasonFinances[];
  const avg = (f: (x: SeasonFinances) => number) => fs.reduce((n, x) => n + f(x), 0) / fs.length;
  const b = Object.values(d.business ?? {});
  const season = fs[0]!.season;
  console.log(
    `${season}   ${economy(seed, season).toFixed(2)}  ${k(avg((x) => x.revenue.tickets))} ${k(avg((x) => x.revenue.concessions))} ${k(avg((x) => x.revenue.merch))} ${k(avg((x) => x.revenue.sponsors))} ${k(avg((x) => x.revenue.localMedia))} ${k(avg((x) => x.revenue.nationalMedia))} ${k(avg((x) => x.revenue.sharing))} ${k(avg((x) => x.revenue.suites))} ${k(avg((x) => x.revenue.naming))} | ${k(avg((x) => x.expenses.payroll))} ${k(avg((x) => x.expenses.staff))} ${k(avg((x) => x.expenses.stadium))} ${k(avg((x) => x.expenses.debt))} | ${k(avg((x) => x.profit))}  ${String(b.filter((x) => x.cash < 0).length).padStart(4)}   ${(b.reduce((n, x) => n + x.cash, 0) / b.length / 1000).toFixed(0).padStart(6)}      ${(b.reduce((n, x) => n + x.ticketPrice, 0) / b.length).toFixed(0)}`,
  );
});
