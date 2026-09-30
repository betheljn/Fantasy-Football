// Staff contracts and the staff budget. Staff pay comes from its own budget,
// separate from the player cap. Firing someone doesn't end his deal: the rest
// of it is paid out, year by year, from the budget.
import { staffOverall, type StaffContract, type StaffMember, type StaffRole, type TeamStaff } from "../model/staff.ts";
import type { Team } from "../model/team.ts";
import { STAFF_AVERAGE } from "../play/coaching.ts";
import type { League } from "../league/league.ts";
import { Rng } from "../rng.ts";
import { salaryCap } from "./cap.ts";

/** Each team's staff budget, as a share of the player cap. */
export const STAFF_BUDGET_SHARE = 0.1;

/** What an average hire in each role earns, as a share of the player cap. */
export const STAFF_PAY: Record<StaffRole, number> = { HC: 0.028, GM: 0.016, OC: 0.01, DC: 0.01, SCOUT: 0.004 };

/** Contract length range (years) by role. */
export const STAFF_YEARS: Record<StaffRole, readonly [number, number]> = { HC: [4, 5], GM: [4, 5], OC: [2, 3], DC: [2, 3], SCOUT: [2, 4] };

export const staffBudget = (cap: number) => Math.round(cap * STAFF_BUDGET_SHARE);

/**
 * What a staff member asks for a year: the role's going rate, up steeply for
 * better ratings (about double for a 75) and for a winning track record.
 */
export function staffAsk(m: StaffMember, cap: number, reputation = 0): number {
  const quality = Math.exp(((staffOverall(m) - STAFF_AVERAGE) / 15) * 0.6);
  const record = Math.max(0.7, 1 + reputation / 20);
  return Math.round((STAFF_PAY[m.role] * cap * quality * record) / 10) * 10;
}

export function staffContract(rng: Rng, m: StaffMember, signed: number, cap: number, reputation = 0): StaffContract {
  const [lo, hi] = STAFF_YEARS[m.role];
  return { signed, through: signed + rng.int(lo, hi) - 1, salary: staffAsk(m, cap, reputation) };
}

/** What firing him before `season` would cost: every remaining year's salary. */
export function staffBuyout(c: StaffContract | undefined, season: number): number {
  if (!c) return 0;
  return Math.max(0, c.through - season + 1) * c.salary;
}

/** Salaries of the current staff plus buyouts still being paid, for `season`. */
export function staffSpending(team: Team, season: number): number {
  const staff = team.staff ? (Object.values(team.staff) as StaffMember[]) : [];
  const salaries = staff.reduce((s, m) => s + (m.contract && m.contract.through >= season ? m.contract.salary : 0), 0);
  return salaries + staffDeadMoneyFor(team, season);
}

export function staffDeadMoneyFor(team: Team, season: number): number {
  return (team.staffDeadMoney ?? []).filter((d) => d.season === season).reduce((s, d) => s + d.amount, 0);
}

/**
 * Contracts for a new league's staff: each deal began when he arrived
 * (tenure seasons ago, as far back as the deal allows), so some are about to
 * expire and some have years left.
 */
export function assignStaffContracts(league: League): League {
  const cap = salaryCap(league.seed, league.season);
  const teams: League["teams"] = {};
  for (const t of Object.values(league.teams)) {
    if (!t.staff) {
      teams[t.abbr] = t;
      continue;
    }
    const rng = new Rng(`league:${league.seed}:staffcontracts:${t.abbr}`);
    const staff = {} as TeamStaff;
    for (const [slot, m] of Object.entries(t.staff) as Array<[keyof TeamStaff, StaffMember]>) {
      const [lo, hi] = STAFF_YEARS[m.role];
      const years = rng.int(lo, hi);
      const signed = league.season - Math.min(m.tenure, years - 1);
      (staff as Record<keyof TeamStaff, StaffMember>)[slot] = { ...m, contract: { signed, through: signed + years - 1, salary: staffAsk(m, cap) } };
    }
    teams[t.abbr] = { ...t, staff };
  }
  return { ...league, teams };
}
