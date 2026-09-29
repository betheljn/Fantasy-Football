// The contract side of the offseason: rollover and earned incentives, expiring
// deals (re-sign, fifth-year option or release), early extensions for young
// stars, rookie deals for draft picks, a simple free agency, dead money for
// cuts, and cap cuts for any team still over the hard cap.
import type { Position } from "../model/positions.ts";
import { capHit, contractYear, deadMoney, finalSeason, type Contract } from "../model/contract.ts";
import { playerOverall, type Player, type PlayerId } from "../model/player.ts";
import { buildDepthChart, ROSTER_MAX, type Team, type TeamCap } from "../model/team.ts";
import { ROSTER_TEMPLATE, pickJersey } from "../gen/team-gen.ts";
import {
  DRAFT_PICKS,
  contractLength,
  minimumContract,
  rookieContract,
  rookieScale,
  veteranContract,
} from "../gen/contract-gen.ts";
import { allTeams, type League } from "../league/league.ts";
import { Rng } from "../rng.ts";
import { CAP_RULES, capFloor, marketIndex, marketValue, minimumSalary, payroll, salaryCap } from "./cap.ts";
import { evaluationError, keepStyle } from "../dynasty/frontoffice.ts";
import { keepValue, ROSTER_MIN } from "../dynasty/roster.ts";
import type { DraftPick } from "../dynasty/draft.ts";
import type { RosterMove } from "../dynasty/roster.ts";

export type ContractMoveKind = "re-signed" | "extended" | "option" | "released" | "signed" | "cut" | "cap cut";

export interface ContractMove {
  kind: ContractMoveKind;
  team: string;
  player: Player;
  /** The new deal (re-signed, extended, option, signed). */
  contract?: Contract;
  /** Dead money left on the cap (cuts). */
  deadMoney?: number;
}

/** Who earned incentives last season. */
export interface IncentiveTriggers {
  awardWinners: ReadonlySet<PlayerId>;
  playoffTeams: ReadonlySet<string>;
}

/** Cushion teams keep under the cap when planning (share of the cap). */
const PLANNING_BUFFER = 0.01;
/** Early extensions: young stars with one year left. */
export const EXTENSION = { minOverall: 74, maxAge: 29, premium: 1.05 };
/** Fifth-year option price as a share of market value. */
export const OPTION_PRICE = 0.85;

const teamValue = (team: Team, p: Player) => keepValue(p, undefined, keepStyle(team), evaluationError(team, p.id));

function withRoster(team: Team, roster: Player[], cap?: TeamCap): Team {
  return { ...team, roster, depthChart: buildDepthChart(roster), ...(cap ? { cap } : {}) };
}

/** Each team's draft picks (overall numbers) from the draft order. */
function picksFor(order: string[]): Map<string, number[]> {
  const picks = new Map<string, number[]>();
  for (let round = 0; round * order.length < DRAFT_PICKS; round++)
    order.forEach((t, i) => picks.set(t, [...(picks.get(t) ?? []), round * order.length + i + 1]));
  return picks;
}

/**
 * Is this player one the team wants back: among the players it values most at
 * his position (as many as a full roster carries there)?
 */
function wanted(team: Team, p: Player): boolean {
  const rivals = team.roster.filter((q) => q.position === p.position);
  const v = teamValue(team, p);
  const better = rivals.filter((q) => q.id !== p.id && teamValue(team, q) > v).length;
  return better < ROSTER_TEMPLATE[p.position] && playerOverall(p) >= 50;
}

export interface OpenYearResult {
  league: League;
  freeAgents: Player[];
  moves: ContractMove[];
  /** Veteran price level this offseason (1 = the base market curve). */
  marketIndex: number;
}

/**
 * Close out season S and open S+1's books. `played` is the league as season S
 * was played (for unused cap and incentives); `league` is the same league after
 * retirements and development. Teams handle expiring deals in draft order.
 */
export function openContractYear(played: League, league: League, triggers: IncentiveTriggers, order: string[]): OpenYearResult {
  const season = played.season;
  const next = season + 1;
  const rng = new Rng(`${league.seed}:${next}:contracts`);
  const capNow = salaryCap(league.seed, season);
  const capNext = salaryCap(league.seed, next);
  const picks = picksFor(order);
  const index = marketIndex(allTeams(league), capNext, next);
  const moves: ContractMove[] = [];
  const freeAgents: Player[] = [];
  const teams: League["teams"] = { ...league.teams };

  for (const abbr of order) {
    const before = played.teams[abbr]!;
    const team = league.teams[abbr]!;
    // Unused cap rolls over (up to 10% of the cap); earned escalators come due.
    const unused = capNow + (before.cap?.rollover ?? 0) - payroll(before, season);
    const rollover = Math.round(Math.max(0, Math.min(unused, CAP_RULES.maxRollover * capNow)));
    let incentives = 0;
    for (const p of before.roster) {
      const y = p.contract && contractYear(p.contract, season);
      if (y?.incentive && (triggers.awardWinners.has(p.id) || triggers.playoffTeams.has(abbr))) incentives += y.incentive;
    }
    let accelerated = 0;

    // Budget for re-signing: the cap, minus what's committed, the rookie class and a cushion.
    const rookieBill = (picks.get(abbr) ?? []).reduce((s, pk) => s + rookieScale(pk, capNext), 0);
    const budget = capNext + rollover - incentives - rookieBill - PLANNING_BUFFER * capNext;
    const continuing = (p: Player) => !!p.contract && finalSeason(p.contract) >= next;
    let committed = team.roster.filter(continuing).reduce((s, p) => s + capHit(p.contract!, next), 0);

    let roster = [...team.roster];
    const expiring = roster
      .filter((p) => !continuing(p))
      .sort((a, b) => teamValue(team, b) - teamValue(team, a) || a.id.localeCompare(b.id));
    for (const p of expiring) {
      const c = p.contract;
      const keep = wanted(team, p);
      let deal: Contract | undefined;
      let kind: ContractMoveKind = "re-signed";
      if (keep && c?.kind === "rookie" && c.pick !== undefined && c.pick <= order.length && !c.years.some((y) => y.option)) {
        // A first-rounder finishing his rookie deal: the fifth-year option.
        const salary = Math.max(Math.round(c.years.reduce((s, y) => s + y.salary + y.bonus, 0) / c.years.length), Math.round(OPTION_PRICE * marketValue(p, capNext, index)));
        deal = { ...c, years: [...c.years, { season: next, salary: Math.round(salary / 10) * 10, bonus: 0, guaranteed: true, option: true }] };
        kind = "option";
      } else if (keep) {
        const homegrown = c?.draftedBy === abbr;
        deal = veteranContract(p, capNext, {
          kind: homegrown ? "extension" : "veteran",
          signed: next,
          years: contractLength(rng, p),
          annual: marketValue(p, capNext, index) * Math.exp(rng.normal(0, 0.1)),
          homegrown,
          ...(c?.draftedBy ? { draftedBy: c.draftedBy } : {}),
        });
      }
      if (deal && committed + capHit(deal, next) <= budget) {
        committed += capHit(deal, next);
        roster = roster.map((q) => (q.id === p.id ? { ...q, contract: deal } : q));
        moves.push({ kind, team: abbr, player: p, contract: deal });
      } else {
        roster = roster.filter((q) => q.id !== p.id);
        const { contract: _gone, ...free } = p;
        freeAgents.push(free);
        moves.push({ kind: "released", team: abbr, player: p });
      }
    }

    // Early extensions: lock up young stars entering the last year of a deal.
    for (const p of [...roster].sort((a, b) => playerOverall(b) - playerOverall(a))) {
      const c = p.contract!;
      if (finalSeason(c) !== next || contractYear(c, next)?.option) continue;
      if (playerOverall(p) < EXTENSION.minOverall || p.age > EXTENSION.maxAge) continue;
      const homegrown = c.draftedBy === abbr;
      const deal = veteranContract(p, capNext, {
        kind: "extension",
        signed: next,
        years: Math.min(5, contractLength(rng, p) + 1),
        annual: marketValue(p, capNext, index) * EXTENSION.premium,
        homegrown,
        ...(c.draftedBy ? { draftedBy: c.draftedBy } : {}),
      });
      const extra = capHit(deal, next) - capHit(c, next);
      if (committed + extra > budget) continue;
      // The unpaid bonus from the old deal accelerates onto this season's cap.
      const leftover = c.years.filter((y) => y.season >= next).reduce((s, y) => s + y.bonus, 0);
      committed += extra + leftover;
      accelerated += leftover;
      roster = roster.map((q) => (q.id === p.id ? { ...q, contract: deal } : q));
      moves.push({ kind: "extended", team: abbr, player: p, contract: deal });
    }
    teams[abbr] = withRoster(team, roster, { rollover, deadMoney: accelerated, incentives });
  }
  return { league: { ...league, teams }, freeAgents, moves, marketIndex: index };
}

/** Slotted rookie deals for this year's draft picks. */
export function signDraftPicks(league: League, picks: readonly DraftPick[], next: number): League {
  const capNext = salaryCap(league.seed, next);
  const deal = new Map(picks.map((pk) => [pk.player.id, rookieContract(pk.overall, pk.team, next, capNext)]));
  const teams: League["teams"] = {};
  for (const t of allTeams(league)) {
    teams[t.abbr] = withRoster(t, t.roster.map((p) => (deal.has(p.id) ? { ...p, contract: deal.get(p.id)! } : p)));
  }
  return { ...league, teams };
}

/** Cap room a team can spend now, keeping enough to fill the roster at the minimum. */
function spendable(team: Team, capNext: number, next: number): number {
  const open = Math.max(0, ROSTER_MAX - team.roster.length);
  return capNext + (team.cap?.rollover ?? 0) - payroll(team, next) - open * minimumSalary(capNext) - PLANNING_BUFFER * capNext;
}

export interface FreeAgencyResult {
  league: League;
  moves: ContractMove[];
  /** Free agents nobody signed (they leave the league). */
  unsigned: Player[];
}

/**
 * A simple free agency: the best free agents first, each signing with the team
 * that most wants him (he'd be among its top players at the position) and can
 * afford his market price; ties go to the team with the most cap room.
 */
export function runFreeAgency(league: League, pool: readonly Player[], next: number, index = 1): FreeAgencyResult {
  const rng = new Rng(`${league.seed}:${next}:freeagency`);
  const capNext = salaryCap(league.seed, next);
  const teams: League["teams"] = { ...league.teams };
  const moves: ContractMove[] = [];
  const unsigned: Player[] = [];
  const sorted = [...pool].sort((a, b) => marketValue(b, capNext) - marketValue(a, capNext) || a.id.localeCompare(b.id));
  for (const p of sorted) {
    const ask = marketValue(p, capNext, index) * Math.exp(rng.normal(0, 0.1));
    const deal = veteranContract(p, capNext, { kind: "veteran", signed: next, years: contractLength(rng, p), annual: ask });
    const hit = capHit(deal, next);
    let best: { team: Team; room: number } | undefined;
    for (const t of Object.values(teams)) {
      const atPos = t.roster.filter((q) => q.position === p.position);
      if (atPos.length >= ROSTER_TEMPLATE[p.position] + 2) continue;
      if (!wanted({ ...t, roster: [...t.roster, p] }, p)) continue;
      const room = spendable(t, capNext, next) - hit;
      if (room < 0) continue;
      if (!best || room > best.room) best = { team: t, room };
    }
    if (!best) {
      unsigned.push(p);
      continue;
    }
    const signed = { ...p, contract: deal, jersey: pickJersey(rng, p.position, new Set(best.team.roster.map((q) => q.jersey))) };
    teams[best.team.abbr] = withRoster(best.team, [...best.team.roster, signed]);
    moves.push({ kind: "signed", team: best.team.abbr, player: signed, contract: deal });
  }
  return { league: { ...league, teams }, moves, unsigned };
}

/**
 * After roster moves: charge dead money for this offseason's cuts, give
 * minimum deals to anyone who signed without one (undrafted rookies,
 * replacement players), then make cap cuts for any team over the hard cap.
 * Returns the cap cuts so the caller can refill those roster spots.
 */
export function settleCap(league: League, cuts: readonly RosterMove[], next: number): { league: League; moves: ContractMove[] } {
  const capNext = salaryCap(league.seed, next);
  const moves: ContractMove[] = [];
  const dead = new Map<string, number>();
  for (const cut of cuts) {
    const c = cut.player.contract;
    if (!c) continue;
    const d = deadMoney(c, next);
    dead.set(cut.team, (dead.get(cut.team) ?? 0) + d);
    moves.push({ kind: "cut", team: cut.team, player: cut.player, deadMoney: d });
  }
  const teams: League["teams"] = {};
  for (const t of allTeams(league)) {
    const cap: TeamCap = { rollover: t.cap?.rollover ?? 0, deadMoney: (t.cap?.deadMoney ?? 0) + (dead.get(t.abbr) ?? 0), incentives: t.cap?.incentives ?? 0, floorPayment: 0 };
    let roster = t.roster.map((p) => (p.contract ? p : { ...p, contract: p.age <= 23 ? minimumContract("rookie", next, 3, capNext) : minimumContract("veteran", next, 1, capNext) }));
    let team = withRoster(t, roster, cap);
    // Over the hard cap: release the players whose savings hurt least.
    const count = (pos: Position) => team.roster.filter((p) => p.position === pos).length;
    while (payroll(team, next) > capNext + cap.rollover) {
      const options = team.roster
        .filter((p) => count(p.position) > ROSTER_MIN[p.position])
        .map((p) => ({ p, savings: capHit(p.contract!, next) - deadMoney(p.contract!, next) }))
        .filter((x) => x.savings > minimumSalary(capNext));
      if (options.length === 0) break;
      const score = (x: (typeof options)[number]) => teamValue(team, x.p) - x.savings / 1_000;
      const victim = options.reduce((a, b) => (score(b) < score(a) ? b : a));
      const d = deadMoney(victim.p.contract!, next);
      roster = team.roster.filter((p) => p.id !== victim.p.id);
      team = withRoster(team, roster, { ...team.cap!, deadMoney: team.cap!.deadMoney + d });
      moves.push({ kind: "cap cut", team: t.abbr, player: victim.p, deadMoney: d });
    }
    // Under the floor: the shortfall is paid out to the roster and counts against the cap.
    const shortfall = capFloor(capNext) - (payroll(team, next) - (team.cap?.floorPayment ?? 0));
    team = { ...team, cap: { ...team.cap!, floorPayment: Math.max(0, shortfall) } };
    teams[t.abbr] = team;
  }
  return { league: { ...league, teams }, moves };
}

/** One offseason's contract activity, for the history books. */
export interface ContractSummary {
  counts: Record<ContractMoveKind, number>;
  /** Total dead money charged to next season. */
  deadMoney: number;
  /** Biggest new deals (re-signings, extensions, free agents), by average value. */
  biggestDeals: Array<{ team: string; player: string; position: string; kind: ContractMoveKind; years: number; total: number }>;
  /** Teams under the cap floor after the offseason, with the shortfall paid out to their players. */
  floorShortfalls: Array<{ team: string; shortfall: number }>;
}

export function summarizeContracts(league: League, moves: readonly ContractMove[], next: number): ContractSummary {
  const counts = Object.fromEntries((["re-signed", "extended", "option", "released", "signed", "cut", "cap cut"] as const).map((k) => [k, 0])) as Record<ContractMoveKind, number>;
  for (const m of moves) counts[m.kind]++;
  const deals = moves.filter((m) => m.contract && m.kind !== "option");
  const total = (c: Contract) => c.years.filter((y) => y.season >= next).reduce((s, y) => s + y.salary + y.bonus, 0);
  const capNext = salaryCap(league.seed, next);
  return {
    counts,
    deadMoney: allTeams(league).reduce((s, t) => s + (t.cap?.deadMoney ?? 0), 0),
    biggestDeals: deals
      .sort((a, b) => total(b.contract!) / b.contract!.years.length - total(a.contract!) / a.contract!.years.length)
      .slice(0, 5)
      .map((m) => ({ team: m.team, player: `${m.player.firstName} ${m.player.lastName}`, position: m.player.position, kind: m.kind, years: m.contract!.years.filter((y) => y.season >= next).length, total: total(m.contract!) })),
    floorShortfalls: allTeams(league)
      .filter((t) => (t.cap?.floorPayment ?? 0) > 0)
      .map((t) => ({ team: t.abbr, shortfall: t.cap!.floorPayment! })),
  };
}

