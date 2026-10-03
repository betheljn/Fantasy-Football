// Player contracts. All money is in $ thousands (integers): 1_000 = $1M.

export type ContractKind = "rookie" | "veteran" | "extension";

export interface ContractYear {
  readonly season: number;
  readonly salary: number;
  /** This season's share of the signing bonus (prorated evenly over the deal). */
  readonly bonus: number;
  /** Salary owed even if the player is cut. */
  readonly guaranteed: boolean;
  /**
   * Escalator paid if he wins an award or his team makes the playoffs. Not on
   * the cap until earned; then it is charged to the next season's cap.
   */
  readonly incentive?: number;
  /** A first-rounder's fifth-year option year. */
  readonly option?: boolean;
}

export interface Contract {
  readonly kind: ContractKind;
  /** Season the deal was signed (its first year). */
  readonly signed: number;
  readonly years: readonly ContractYear[];
  /** Team that drafted him, when known. */
  readonly draftedBy?: string;
  /** Re-signed by his drafting team: counts only HOMEGROWN_CREDIT against the cap. */
  readonly homegrown: boolean;
  /** Draft slot, for rookie deals. */
  readonly pick?: number;
}

/** Share of a homegrown contract that counts against the cap. */
export const HOMEGROWN_CREDIT = 0.8;

export function contractYear(c: Contract, season: number): ContractYear | undefined {
  return c.years.find((y) => y.season === season);
}

/** What the contract counts against the cap in `season` (0 outside the deal). */
export function capHit(c: Contract, season: number): number {
  const y = contractYear(c, season);
  if (!y) return 0;
  return Math.round((y.salary + y.bonus) * (c.homegrown ? HOMEGROWN_CREDIT : 1));
}

/** Seasons left, counting `season` itself. */
export function yearsLeft(c: Contract, season: number): number {
  return c.years.filter((y) => y.season >= season).length;
}

/** Last season of the deal. */
export function finalSeason(c: Contract): number {
  return c.years.at(-1)!.season;
}

/** Average yearly value (salary + bonus) over the whole deal. */
export function averageValue(c: Contract): number {
  return Math.round(c.years.reduce((s, y) => s + y.salary + y.bonus, 0) / c.years.length);
}

/**
 * Cap charge left behind if the player is cut before `season`: every unpaid
 * bonus share plus all remaining guaranteed salary.
 */
export function deadMoney(c: Contract, season: number): number {
  const rest = c.years.filter((y) => y.season >= season);
  const owed = rest.reduce((s, y) => s + y.bonus + (y.guaranteed ? y.salary : 0), 0);
  return Math.round(owed * (c.homegrown ? HOMEGROWN_CREDIT : 1));
}

/** Money in $K as "$12.4M" or "$850K". */
export function formatMoney(k: number): string {
  // A minus sign before the dollar sign: −$1.2M.
  if (k < 0 && Math.round(Math.abs(k)) > 0) return `\u2212${formatMoney(-k)}`;
  const a = Math.abs(k);
  if (a >= 1_000) return `$${(a / 1_000).toFixed(a >= 100_000 ? 0 : 1)}M`;
  const r = Math.round(a);
  return r === 0 ? "$0" : `$${r}K`;
}
