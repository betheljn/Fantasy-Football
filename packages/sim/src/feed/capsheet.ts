// Text views of contracts and team payroll.
import { capFloor, capSpace, payroll } from "../contracts/cap.ts";
import { capHit, deadMoney, finalSeason, formatMoney, type Contract } from "../model/contract.ts";
import { playerOverall, type Player } from "../model/player.ts";
import { teamName, type Team } from "../model/team.ts";

const KIND: Record<Contract["kind"], string> = { rookie: "rookie deal", veteran: "veteran deal", extension: "extension" };

/** One line: "4 yrs/$120.0M (2029-2032), $38.0M guaranteed, homegrown". */
export function formatContract(c: Contract): string {
  const total = c.years.reduce((s, y) => s + y.salary + y.bonus, 0);
  const guaranteed = c.years.reduce((s, y) => s + y.bonus + (y.guaranteed ? y.salary : 0), 0);
  const pick = c.pick ? `, pick #${c.pick}` : "";
  const hg = c.homegrown ? ", homegrown (80% cap)" : "";
  return `${c.years.length} yrs/${formatMoney(total)} (${c.signed}-${finalSeason(c)}) ${KIND[c.kind]}${pick}, ${formatMoney(guaranteed)} guaranteed${hg}`;
}

/** Year-by-year breakdown of one contract. */
export function formatContractYears(c: Contract): string {
  return c.years
    .map((y) => `  ${y.season}  salary ${formatMoney(y.salary).padStart(7)}  bonus ${formatMoney(y.bonus).padStart(7)}  cap hit ${formatMoney(capHit(c, y.season)).padStart(7)}  ${y.guaranteed ? "guaranteed" : ""}  dead if cut ${formatMoney(deadMoney(c, y.season))}`)
    .join("\n");
}

/** The team's cap sheet for `season`: totals, then the biggest cap hits. */
export function formatCapSheet(team: Team, cap: number, season: number, top = 15): string {
  const pay = payroll(team, season);
  const lines = [
    `${teamName(team)} ${season} cap sheet`,
    `  Cap ${formatMoney(cap)}  payroll ${formatMoney(pay)} (${((pay / cap) * 100).toFixed(1)}%)  space ${formatMoney(capSpace(team, cap, season))}  floor ${formatMoney(capFloor(cap))}` +
      (team.cap?.rollover ? `  rollover +${formatMoney(team.cap.rollover)}` : "") +
      (team.cap?.deadMoney ? `  dead money ${formatMoney(team.cap.deadMoney)}` : ""),
  ];
  const withDeals = team.roster.filter((p): p is Player & { contract: Contract } => !!p.contract);
  const expiring = withDeals.filter((p) => finalSeason(p.contract) === season).length;
  lines.push(`  ${withDeals.filter((p) => p.contract.kind === "rookie").length} on rookie deals, ${expiring} expiring after ${season}`);
  for (const p of [...withDeals].sort((a, b) => capHit(b.contract, season) - capHit(a.contract, season)).slice(0, top)) {
    lines.push(
      `  ${formatMoney(capHit(p.contract, season)).padStart(7)}  ${p.position.padEnd(2)} ${`${p.firstName} ${p.lastName}`.padEnd(20)} ${String(playerOverall(p)).padStart(2)} ovr  age ${p.age}  ${formatContract(p.contract)}`,
    );
  }
  return lines.join("\n");
}
