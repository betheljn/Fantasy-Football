// Contracts for a league that already exists: rookie deals for young players,
// market deals for veterans, then each team's payroll is fit under the hard cap.
import { CAP_RULES, capFloor, marketValue, minimumSalary, salaryCap } from "../contracts/cap.ts";
import { HOMEGROWN_CREDIT, capHit, type Contract, type ContractKind, type ContractYear } from "../model/contract.ts";
import { playerOverall, type Player } from "../model/player.ts";
import type { Team } from "../model/team.ts";
import { draftValue } from "../dynasty/draftclass.ts";
import { allTeams, type League } from "../league/league.ts";
import { Rng } from "../rng.ts";

/** Picks in a draft (7 rounds x 50 teams). */
export const DRAFT_PICKS = 350;
export const ROOKIE_YEARS = 4;
/** How far generation may scale a team's veteran deals to fit its payroll target. */
const FIT_SCALE = [0.6, 1.35] as const;

/** Yearly value of a rookie deal by overall pick: about 3.4% of the cap at #1, the minimum by the late rounds. */
export function rookieScale(pick: number, cap: number): number {
  const min = minimumSalary(cap);
  const top = 0.034 * cap;
  return Math.round((min + (top - min) * Math.exp(-(pick - 1) / 24)) / 10) * 10;
}

export interface ContractTerms {
  kind: ContractKind;
  signed: number;
  years: number;
  /** Average yearly value, $K. */
  annual: number;
  /** Share of the total paid as a signing bonus (prorated). */
  bonusShare: number;
  /** Number of leading seasons with guaranteed salary. */
  guaranteedYears: number;
  homegrown?: boolean;
  draftedBy?: string;
  pick?: number;
  /** League minimum: no season of the deal pays less. */
  minimum?: number;
  /** Incentives offered each year as a share of salary (not counted until earned). */
  incentiveShare?: number;
}

/** Salary rises 5% a year (back-loaded); the bonus is spread evenly. */
const RAISE = 1.05;

export function buildContract(t: ContractTerms): Contract {
  const total = t.annual * t.years;
  const bonusTotal = Math.round(total * t.bonusShare);
  const bonus = Math.round(bonusTotal / t.years);
  const salaryTotal = total - bonus * t.years;
  const weights = Array.from({ length: t.years }, (_, i) => RAISE ** i);
  const wsum = weights.reduce((s, w) => s + w, 0);
  const years: ContractYear[] = weights.map((w, i) => {
    const salary = Math.max((t.minimum ?? 0) - bonus, Math.round((salaryTotal * w) / wsum / 10) * 10);
    const year: ContractYear = { season: t.signed + i, salary, bonus, guaranteed: i < t.guaranteedYears };
    return t.incentiveShare ? { ...year, incentive: Math.round((salary * t.incentiveShare) / 10) * 10 } : year;
  });
  return {
    kind: t.kind,
    signed: t.signed,
    years,
    homegrown: t.homegrown ?? false,
    ...(t.draftedBy ? { draftedBy: t.draftedBy } : {}),
    ...(t.pick ? { pick: t.pick } : {}),
  };
}

/** A slotted rookie deal: first-rounders fully guaranteed with a big bonus, late picks at the minimum. */
export function rookieContract(pick: number, team: string, season: number, cap: number): Contract {
  const round = Math.ceil(pick / 50);
  return buildContract({
    kind: "rookie",
    signed: season,
    years: ROOKIE_YEARS,
    annual: rookieScale(pick, cap),
    bonusShare: round === 1 ? 0.55 : round <= 3 ? 0.3 : 0.1,
    guaranteedYears: round === 1 ? 4 : round === 2 ? 2 : 0,
    draftedBy: team,
    pick,
    minimum: minimumSalary(cap),
  });
}

/** Scale the part of a contract's money above the minimum by `k` (minimum-salary years stay put). */
function scaleContract(c: Contract, k: number, min: number): Contract {
  return {
    ...c,
    years: c.years.map((y) => {
      const total = y.salary + y.bonus;
      if (total <= min) return y;
      const scaled = min + (total - min) * k;
      const bonus = Math.round((y.bonus / total) * scaled);
      return { ...y, bonus, salary: Math.round((scaled - bonus) / 10) * 10 };
    }),
  };
}

/** Young players drafted in a given year form a cohort; their rank gives an implied draft slot. */
function impliedPicks(league: League): Map<string, number> {
  const byAge = new Map<number, Player[]>();
  for (const t of allTeams(league)) for (const p of t.roster) if (p.age <= 25) byAge.set(p.age, [...(byAge.get(p.age) ?? []), p]);
  const picks = new Map<string, number>();
  for (const cohort of byAge.values()) {
    const ranked = [...cohort].sort((a, b) => draftValue(b.position, playerOverall(b), b.potential) - draftValue(a.position, playerOverall(a), a.potential) || a.id.localeCompare(b.id));
    // Some of each cohort went undrafted: they signed for the minimum.
    ranked.forEach((p, i) => picks.set(p.id, i < DRAFT_PICKS ? i + 1 : DRAFT_PICKS + 1));
  }
  return picks;
}

/** How long a veteran deal runs: longer for better, younger players. */
export function contractLength(rng: Rng, p: Player): number {
  const quality = contractQuality(p);
  const maxYears = p.age >= 32 ? 2 : p.age >= 30 ? 3 : 5;
  return Math.min(maxYears, 1 + Math.round(quality * 3 + rng.next() * 1.5));
}

/** 0 for a fringe player, 1 for a star; shapes bonus, guarantees and incentives. */
const contractQuality = (p: Player) => Math.max(0, Math.min(1, (playerOverall(p) - 60) / 25));

/** Share of salary offered as incentives (earned by a playoff trip or an award) on good players' deals. */
export const INCENTIVE_SHARE = 0.1;

/** A veteran deal (new signing, re-signing or extension) at `annual` a year. */
export function veteranContract(
  p: Player,
  cap: number,
  t: { kind: ContractKind; signed: number; years: number; annual: number; homegrown?: boolean; draftedBy?: string },
): Contract {
  const quality = contractQuality(p);
  return buildContract({
    kind: t.kind,
    signed: t.signed,
    years: t.years,
    annual: Math.max(minimumSalary(cap), Math.round(t.annual)),
    bonusShare: 0.1 + 0.3 * quality,
    guaranteedYears: Math.ceil(t.years * (0.15 + 0.45 * quality)),
    homegrown: t.homegrown ?? false,
    ...(t.draftedBy ? { draftedBy: t.draftedBy } : {}),
    minimum: minimumSalary(cap),
    incentiveShare: quality >= 0.4 ? INCENTIVE_SHARE : 0,
  });
}

/** A one-year (or longer) deal at the league minimum. */
export function minimumContract(kind: ContractKind, signed: number, years: number, cap: number, draftedBy?: string): Contract {
  return buildContract({ kind, signed, years, annual: minimumSalary(cap), bonusShare: 0, guaranteedYears: 0, minimum: minimumSalary(cap), ...(draftedBy ? { draftedBy } : {}) });
}

/** A contract for one existing player, as if signed some seasons ago. */
function existingContract(rng: Rng, p: Player, team: string, season: number, cap: number, pick: number | undefined): Contract {
  const elapsedRookie = Math.max(0, Math.min(ROOKIE_YEARS - 1, p.age - 22));
  if (pick !== undefined && p.age <= 25) {
    const signed = season - elapsedRookie;
    if (pick <= DRAFT_PICKS) return rookieContract(pick, team, signed, cap);
    return minimumContract("rookie", signed, 3, cap, team);
  }
  const value = marketValue(p, cap) * Math.exp(rng.normal(0, 0.15));
  const years = contractLength(rng, p);
  const elapsed = rng.int(0, years - 1);
  const homegrown = rng.chance(0.35);
  return veteranContract(p, cap, {
    kind: homegrown ? "extension" : "veteran",
    signed: season - elapsed,
    years,
    annual: value,
    homegrown,
    ...(homegrown ? { draftedBy: team } : {}),
  });
}

/**
 * Give every player on the team a contract, then fit the team's payroll to a
 * target between the floor and the cap by scaling veteran deals (rookie deals
 * are slotted and never change).
 */
export function assignTeamContracts(team: Team, league: League, picks: Map<string, number>, cap: number): Team {
  const season = league.season;
  const rng = new Rng(`league:${league.seed}:contracts:${team.abbr}:${season}`);
  const min = minimumSalary(cap);
  let roster = team.roster.map((p) => ({ ...p, contract: existingContract(rng, p, team.abbr, season, cap, picks.get(p.id)) }));
  const target = cap * (CAP_RULES.floor + 0.02 + rng.next() * (0.98 - CAP_RULES.floor - 0.02));
  const hit = (p: Player) => capHit(p.contract!, season);
  const isVet = (p: Player) => p.contract!.kind !== "rookie";
  // Scale veteran deals toward the target, but only so far: a thin roster
  // doesn't turn its average players into stars on paper.
  let scale = 1;
  for (let pass = 0; pass < 4; pass++) {
    const rookies = roster.filter((p) => !isVet(p)).reduce((s, p) => s + hit(p), 0);
    const vets = roster.filter(isVet).reduce((s, p) => s + hit(p), 0);
    const k = Math.max(FIT_SCALE[0] / scale, Math.min(FIT_SCALE[1] / scale, (target - rookies) / vets));
    if (Math.abs(k - 1) < 0.002) break;
    scale *= k;
    roster = roster.map((p) => (isVet(p) ? { ...p, contract: scaleContract(p.contract, k, min) } : p));
  }
  // Still under the floor: front-load this season (a one-year roster bonus),
  // as a team short of the floor would.
  const floor = capFloor(cap) + Math.round(cap * 0.01);
  const shortfall = floor - roster.reduce((s, p) => s + hit(p), 0);
  if (shortfall > 0) {
    const excess = (p: Player) => Math.max(0, hit(p) - min);
    const pool = roster.filter(isVet).reduce((s, p) => s + excess(p), 0);
    roster = roster.map((p) => {
      if (!isVet(p) || pool === 0) return p;
      const add = Math.round((shortfall * excess(p)) / pool / (p.contract.homegrown ? HOMEGROWN_CREDIT : 1) / 10) * 10;
      return { ...p, contract: { ...p.contract, years: p.contract.years.map((y) => (y.season === season ? { ...y, salary: y.salary + add } : y)) } };
    });
  }
  return { ...team, roster, cap: { rollover: 0, deadMoney: 0 } };
}

/** Contracts for every player in the league (replacing any they had). */
export function assignContracts(league: League): League {
  const cap = salaryCap(league.seed, league.season);
  const picks = impliedPicks(league);
  const teams: League["teams"] = {};
  for (const t of allTeams(league)) teams[t.abbr] = assignTeamContracts(t, league, picks, cap);
  return { ...league, teams };
}
