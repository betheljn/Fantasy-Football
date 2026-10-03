// The contract side of the offseason: rollover and earned incentives, expiring
// deals (re-sign, fifth-year option or release), early extensions for young
// stars, rookie deals for draft picks, a simple free agency, dead money for
// cuts, and cap cuts for any team still over the hard cap.
import { teamChoices, type PerTeam } from "../choices.ts";
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
import { hometownDiscount, mood, persona, resignChance, teamAppeal, wouldStart } from "./mood.ts";
import { keepValue, ROSTER_MIN } from "../dynasty/roster.ts";
import type { DraftPick } from "../dynasty/draft.ts";
import type { RosterMove } from "../dynasty/roster.ts";

export type ContractMoveKind = "re-signed" | "extended" | "option" | "released" | "declined" | "signed" | "cut" | "cap cut";

export interface ContractMove {
  kind: ContractMoveKind;
  team: string;
  player: Player;
  /** The new deal (re-signed, extended, option, signed). */
  contract?: Contract;
  /** Dead money left on the cap (cuts). */
  deadMoney?: number;
  /** Free agency: how many teams made offers, and whether he went home. */
  bidders?: number;
  hometown?: boolean;
}

/** Who earned incentives last season. */
export interface IncentiveTriggers {
  awardWinners: ReadonlySet<PlayerId>;
  playoffTeams: ReadonlySet<string>;
  /** Last season's win pct by team (how attractive a winner is); default .500. */
  winPct?: ReadonlyMap<string, number>;
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

/** Each team's draft picks (overall numbers) from the draft order, going to whoever owns each pick now. */
function picksFor(order: string[], league: League, draft: number): Map<string, number[]> {
  const picks = new Map<string, number[]>();
  for (let round = 0; round * order.length < DRAFT_PICKS; round++)
    order.forEach((t, i) => {
      const owner = league.pickOwners?.[`${draft}:${round + 1}:${t}`] ?? t;
      picks.set(owner, [...(picks.get(owner) ?? []), round * order.length + i + 1]);
    });
  return picks;
}

/** Dead money from mid-season releases that comes due in `season`. */
function pendingDead(team: Team, season: number): number {
  return (team.cap?.pendingDeadMoney ?? []).filter((d) => d.season === season).reduce((s, d) => s + d.amount, 0);
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

/** A team deciding its own re-signings (the user's team); everyone else is left to the AI. */
export interface ResignChoices {
  team: string;
  /**
   * Expiring players to try to keep (fifth-year option or new deal), and
   * players with a year left to extend early (see ContractPlan.extensions).
   * Expiring players left out go; players left out with a year left play it out.
   */
  keep: ReadonlySet<PlayerId>;
}

/** An early extension: a young star entering the last year of his deal, locked up now. */
export interface ExtensionOffer {
  player: Player;
  /** The new deal (replacing what's left of the old one). */
  deal: Contract;
  /** Next season's cap hit: the new deal's, and how much more that is than the old deal's. */
  capHit: number;
  extra: number;
  /** The old deal's unpaid signing bonus, which comes due on next season's cap. */
  accelerated: number;
  homegrown: boolean;
}

/** What keeping an expiring player would take. */
export interface ResignOffer {
  player: Player;
  kind: "option" | "re-sign";
  /** The deal he'd sign. */
  deal: Contract;
  /** Its cap hit next season. */
  capHit: number;
  /** How he feels about the team (0-100). */
  mood: number;
  /** Chance he agrees (1 for a fifth-year option, which he can't refuse). */
  chance: number;
  /** Whether he'd agree. Decided up front from his own random stream, so a preview and the real thing always match; show `chance`, not this. */
  accepts: boolean;
  homegrown: boolean;
  /** Whether the AI front office would try to keep him. */
  aiWants: boolean;
}

/** A team's re-signing picture before any decisions: its budget, what's committed, and every expiring player's offer. */
export interface ContractPlan {
  team: string;
  season: number;
  cap: number;
  rollover: number;
  incentives: number;
  /** Rookie class cost (its draft slots) set aside. */
  rookieBill: number;
  /** Most the team can commit to next season's roster (cap + rollover - incentives - rookies - cushion). */
  budget: number;
  /** Already committed to players under contract next season. */
  committed: number;
  /** Roster spots still open after players under contract and the draft class (each held at the minimum until filled). */
  openSpots: number;
  /** The league minimum salary next season. */
  minimum: number;
  offers: ResignOffer[];
  /** Young stars with a year left the team can extend now (the AI extends any that fit), best first. */
  extensions: ExtensionOffer[];
}

/** Money held back to fill the roster at the minimum once `kept` expiring players have re-signed. */
export function fillReserve(plan: Pick<ContractPlan, "openSpots" | "minimum">, kept: number): number {
  return Math.max(0, plan.openSpots - kept) * plan.minimum;
}

/**
 * Which of the players you'd keep or extend fit, walking them in the order the
 * team handles them (re-signings first, if all say yes, then extensions): each
 * must fit the budget while still leaving enough to fill the rest of the
 * roster at the minimum.
 */
export function resignFits(plan: ContractPlan, keep: ReadonlySet<PlayerId>): Map<PlayerId, boolean> {
  const fits = new Map<PlayerId, boolean>();
  let committed = plan.committed;
  let kept = 0;
  for (const o of plan.offers) {
    if (!keep.has(o.player.id)) continue;
    const ok = committed + o.capHit + fillReserve(plan, kept + 1) <= plan.budget;
    fits.set(o.player.id, ok);
    if (ok) {
      committed += o.capHit;
      kept++;
    }
  }
  for (const x of plan.extensions) {
    if (!keep.has(x.player.id)) continue;
    const cost = x.extra + x.accelerated;
    const ok = committed + cost + fillReserve(plan, kept) <= plan.budget;
    fits.set(x.player.id, ok);
    if (ok) committed += cost;
  }
  return fits;
}

interface OpenYearContext {
  seed: string;
  season: number;
  next: number;
  capNow: number;
  capNext: number;
  index: number;
  picks: Map<string, number[]>;
  firstRound: number;
  triggers: IncentiveTriggers;
}

function openYearContext(played: League, league: League, triggers: IncentiveTriggers, order: string[]): OpenYearContext {
  const season = played.season;
  const next = season + 1;
  const capNext = salaryCap(league.seed, next);
  return {
    seed: league.seed,
    season,
    next,
    capNow: salaryCap(league.seed, season),
    capNext,
    index: marketIndex(allTeams(league), capNext, next),
    picks: picksFor(order, league, next),
    firstRound: order.length,
    triggers,
  };
}

const continuing = (p: Player, next: number) => !!p.contract && finalSeason(p.contract) >= next;

function teamBudget(ctx: OpenYearContext, before: Team, team: Team) {
  // Unused cap rolls over (up to 10% of the cap); earned escalators come due.
  const unused = ctx.capNow + (before.cap?.rollover ?? 0) - payroll(before, ctx.season);
  const rollover = Math.round(Math.max(0, Math.min(unused, CAP_RULES.maxRollover * ctx.capNow)));
  let incentives = 0;
  for (const p of before.roster) {
    const y = p.contract && contractYear(p.contract, ctx.season);
    if (y?.incentive && (ctx.triggers.awardWinners.has(p.id) || ctx.triggers.playoffTeams.has(team.abbr))) incentives += y.incentive;
  }
  // Budget for re-signing: the cap, minus what's committed, the rookie class and a cushion.
  const rookieBill = (ctx.picks.get(team.abbr) ?? []).reduce((s, pk) => s + rookieScale(pk, ctx.capNext), 0);
  const budget = ctx.capNext + rollover - incentives - rookieBill - PLANNING_BUFFER * ctx.capNext;
  const staying = team.roster.filter((p) => continuing(p, ctx.next));
  const committed = staying.reduce((s, p) => s + capHit(p.contract!, ctx.next), 0) + pendingDead(team, ctx.next);
  // Spots the roster still needs filled; re-signings fill them first, the rest are held at the minimum.
  const openSpots = Math.max(0, ROSTER_MAX - staying.length - (ctx.picks.get(team.abbr)?.length ?? 0));
  return { rollover, incentives, rookieBill, budget, committed, openSpots, minimum: minimumSalary(ctx.capNext) };
}

/** Expiring players, most valued first (the order teams work through them). */
function expiringPlayers(team: Team, next: number): Player[] {
  return team.roster.filter((p) => !continuing(p, next)).sort((a, b) => teamValue(team, b) - teamValue(team, a) || a.id.localeCompare(b.id));
}

function resignOffer(ctx: OpenYearContext, team: Team, p: Player): ResignOffer {
  const c = p.contract;
  const homegrown = c?.draftedBy === team.abbr;
  const aiWants = wanted(team, p);
  const m = mood(p, teamAppeal(team, p, ctx.triggers.winPct?.get(team.abbr) ?? 0.5), 1);
  if (c?.kind === "rookie" && c.pick !== undefined && c.pick <= ctx.firstRound && !c.years.some((y) => y.option)) {
    // A first-rounder finishing his rookie deal: the fifth-year option.
    const salary = Math.max(Math.round(c.years.reduce((s, y) => s + y.salary + y.bonus, 0) / c.years.length), Math.round(OPTION_PRICE * marketValue(p, ctx.capNext, ctx.index)));
    const deal: Contract = { ...c, years: [...c.years, { season: ctx.next, salary: Math.round(salary / 10) * 10, bonus: 0, guaranteed: true, option: true }] };
    return { player: p, kind: "option", deal, capHit: capHit(deal, ctx.next), mood: m, chance: 1, accepts: true, homegrown, aiWants };
  }
  // Each player's own random stream: the same answer however many others were decided first.
  const rng = new Rng(`${ctx.seed}:${ctx.next}:resign:${p.id}`);
  // Would he stay? Happy players re-sign (a little cheaper); unhappy ones test the market.
  const chance = resignChance(m, homegrown);
  const accepts = rng.chance(chance);
  const happyDiscount = 0.1 * Math.max(0, Math.min(1, (m - 50) / 30));
  const deal = veteranContract(p, ctx.capNext, {
    kind: homegrown ? "extension" : "veteran",
    signed: ctx.next,
    years: contractLength(rng, p),
    annual: marketValue(p, ctx.capNext, ctx.index) * Math.exp(rng.normal(0, 0.1)) * (1 - happyDiscount - hometownDiscount(p, team)),
    homegrown,
    ...(c?.draftedBy ? { draftedBy: c.draftedBy } : {}),
  });
  return { player: p, kind: "re-sign", deal, capHit: capHit(deal, ctx.next), mood: m, chance, accepts, homegrown, aiWants };
}

/** Players under contract with one year left who qualify for an early extension, best first. */
function extensionCandidates(team: Team, next: number): Player[] {
  return team.roster
    .filter((p) => {
      const c = p.contract;
      if (!c || finalSeason(c) !== next || contractYear(c, next)?.option) return false;
      return playerOverall(p) >= EXTENSION.minOverall && p.age <= EXTENSION.maxAge;
    })
    .sort((a, b) => playerOverall(b) - playerOverall(a) || a.id.localeCompare(b.id));
}

function extensionOffer(ctx: OpenYearContext, team: Team, p: Player): ExtensionOffer {
  const c = p.contract!;
  const homegrown = c.draftedBy === team.abbr;
  // His own random stream, so the offer shown is the deal he signs.
  const rng = new Rng(`${ctx.seed}:${ctx.next}:extend:${p.id}`);
  const deal = veteranContract(p, ctx.capNext, {
    kind: "extension",
    signed: ctx.next,
    years: Math.min(5, contractLength(rng, p) + 1),
    annual: marketValue(p, ctx.capNext, ctx.index) * EXTENSION.premium,
    homegrown,
    ...(c.draftedBy ? { draftedBy: c.draftedBy } : {}),
  });
  const hit = capHit(deal, ctx.next);
  return {
    player: p,
    deal,
    capHit: hit,
    extra: hit - capHit(c, ctx.next),
    accelerated: c.years.filter((y) => y.season >= ctx.next).reduce((s, y) => s + y.bonus, 0),
    homegrown,
  };
}

/**
 * A team's re-signing picture for the coming offseason: what it can spend and
 * what each expiring player would take. Same arguments as openContractYear.
 */
export function contractPlan(played: League, league: League, triggers: IncentiveTriggers, order: string[], abbr: string): ContractPlan {
  const ctx = openYearContext(played, league, triggers, order);
  const team = league.teams[abbr]!;
  const b = teamBudget(ctx, played.teams[abbr]!, team);
  return {
    team: abbr,
    season: ctx.next,
    cap: ctx.capNext,
    ...b,
    offers: expiringPlayers(team, ctx.next).map((p) => resignOffer(ctx, team, p)),
    extensions: extensionCandidates(team, ctx.next).map((p) => extensionOffer(ctx, team, p)),
  };
}

/**
 * Close out season S and open S+1's books. `played` is the league as season S
 * was played (for unused cap and incentives); `league` is the same league after
 * retirements and development. Teams handle expiring deals in draft order; a
 * team given `choices` (one team's or several) keeps exactly the players it
 * chose (if they agree and fit).
 */
export function openContractYear(played: League, league: League, triggers: IncentiveTriggers, order: string[], choices?: PerTeam<ResignChoices>): OpenYearResult {
  const ctx = openYearContext(played, league, triggers, order);
  const chosen = teamChoices(choices);
  const { next } = ctx;
  const moves: ContractMove[] = [];
  const freeAgents: Player[] = [];
  const teams: League["teams"] = { ...league.teams };

  for (const abbr of order) {
    const team = league.teams[abbr]!;
    const plan = teamBudget(ctx, played.teams[abbr]!, team);
    const { rollover, incentives, budget } = plan;
    let committed = plan.committed;
    let kept = 0;
    let accelerated = 0;
    let roster = [...team.roster];
    const release = (p: Player, kind: ContractMoveKind) => {
      roster = roster.filter((q) => q.id !== p.id);
      const { contract: _gone, ...free } = p;
      freeAgents.push(free);
      moves.push({ kind, team: abbr, player: p });
    };

    for (const p of expiringPlayers(team, next)) {
      const offer = resignOffer(ctx, team, p);
      const mine = chosen.get(abbr);
      const keep = mine ? mine.keep.has(p.id) : offer.aiWants;
      if (!keep) {
        release(p, "released");
        continue;
      }
      if (!offer.accepts) {
        release(p, "declined");
        continue;
      }
      // Keep enough back to fill the rest of the roster at the minimum.
      if (committed + offer.capHit + fillReserve(plan, kept + 1) > budget) {
        release(p, "released");
        continue;
      }
      committed += offer.capHit;
      kept++;
      roster = roster.map((q) => (q.id === p.id ? { ...q, contract: offer.deal } : q));
      moves.push({ kind: offer.kind === "option" ? "option" : "re-signed", team: abbr, player: p, contract: offer.deal });
    }

    // Early extensions: lock up young stars entering the last year of a deal
    // (a team making its own calls extends only the ones it chose).
    for (const p of extensionCandidates(team, next)) {
      const mine = chosen.get(abbr);
      if (mine && !mine.keep.has(p.id)) continue;
      const x = extensionOffer(ctx, team, p);
      if (committed + x.extra + x.accelerated + fillReserve(plan, kept) > budget) continue;
      committed += x.extra + x.accelerated;
      accelerated += x.accelerated;
      roster = roster.map((q) => (q.id === p.id ? { ...q, contract: x.deal } : q));
      moves.push({ kind: "extended", team: abbr, player: p, contract: x.deal });
    }
    const later = (team.cap?.pendingDeadMoney ?? []).filter((d) => d.season > next);
    teams[abbr] = withRoster(team, roster, { rollover, deadMoney: accelerated + pendingDead(team, next), incentives, ...(later.length > 0 ? { pendingDeadMoney: later } : {}) });
  }
  return { league: { ...league, teams }, freeAgents, moves, marketIndex: ctx.index };
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

/** What a team can pay one more player: its room, plus the minimum held for the open spot he'd fill. */
function signingRoom(team: Team, capNext: number, next: number): number {
  return spendable(team, capNext, next) + (team.roster.length < ROSTER_MAX ? minimumSalary(capNext) : 0);
}

export interface FreeAgencyResult {
  league: League;
  moves: ContractMove[];
  /** Free agents nobody signed (they leave the league). */
  unsigned: Player[];
}

/** Your offer to a free agent: yearly value ($K) and length. */
export interface FreeAgentOffer {
  annual: number;
  years: number;
}

/** A team making its own free-agent offers (the user's team). */
export interface FreeAgencyChoices {
  team: string;
  offers: ReadonlyMap<PlayerId, FreeAgentOffer>;
  /** Let the team's front office bid (as the AI would) on players it made no offer to; otherwise it bids on no one else. */
  frontOffice?: boolean;
}

/** What a free agent is asking, from his own random stream (so previews match the real thing). */
export function freeAgentAsk(seed: string, next: number, p: Player, capNext: number, index: number): { market: number; ask: number; years: number } {
  const rng = new Rng(`${seed}:${next}:fa:${p.id}`);
  const market = marketValue(p, capNext, index);
  const ask = market * Math.exp(rng.normal(0, 0.1));
  return { market, ask, years: contractLength(rng, p) };
}

interface FreeAgencyContext {
  seed: string;
  next: number;
  capNext: number;
}

/** An AI team's bid for a free agent, or null if it doesn't want him or can't afford him. */
function aiBid(ctx: FreeAgencyContext, t: Team, p: Player, ask: number, years: number): Contract | null {
  const atPos = t.roster.filter((q) => q.position === p.position);
  if (atPos.length >= ROSTER_TEMPLATE[p.position] + 2) return null;
  // Short at his position (below the roster minimum): any capable player will do.
  const need = atPos.length < ROSTER_MIN[p.position] && playerOverall(p) >= 45;
  if (!need && !wanted({ ...t, roster: [...t.roster, p] }, p)) return null;
  const room = signingRoom(t, ctx.capNext, ctx.next);
  const noise = new Rng(`${ctx.seed}:${ctx.next}:fa:${p.id}:${t.abbr}`).normal(0, 0.05);
  const eagerness = 1 + (wouldStart(t, p) ? 0.12 : 0) + noise;
  let annual = ask * eagerness * (1 - hometownDiscount(p, t));
  let deal = veteranContract(p, ctx.capNext, { kind: "veteran", signed: ctx.next, years, annual });
  // Tight on room: a team will stretch down to 90% of his ask, no further.
  if (capHit(deal, ctx.next) > room) {
    annual = Math.min(annual, (annual * room) / capHit(deal, ctx.next));
    if (annual < ask * 0.9 * (1 - hometownDiscount(p, t))) return null;
    deal = veteranContract(p, ctx.capNext, { kind: "veteran", signed: ctx.next, years, annual });
    if (capHit(deal, ctx.next) > room) return null;
  }
  return deal;
}

/** Free agents in the order they sign (best first). */
function freeAgentOrder(pool: readonly Player[], capNext: number): Player[] {
  return [...pool].sort((a, b) => marketValue(b, capNext) - marketValue(a, capNext) || a.id.localeCompare(b.id));
}

/**
 * Free agency: the best free agents first. Every team that wants him (he'd be
 * among its top players at the position) and can afford him makes an offer:
 * more when he'd start for them, less when he's coming home (the hometown
 * discount). A team given `choices` (one team's or several) bids only its own offers. He signs where
 * he'd be happiest: money, winning, playing time, the head coach and home,
 * weighted by what he cares about.
 */
export function runFreeAgency(
  league: League,
  pool: readonly Player[],
  next: number,
  index = 1,
  winPct: ReadonlyMap<string, number> = new Map(),
  choices?: PerTeam<FreeAgencyChoices>,
): FreeAgencyResult {
  const chosen = teamChoices(choices);
  const rng = new Rng(`${league.seed}:${next}:freeagency`);
  const capNext = salaryCap(league.seed, next);
  const ctx: FreeAgencyContext = { seed: league.seed, next, capNext };
  const teams: League["teams"] = { ...league.teams };
  const moves: ContractMove[] = [];
  const unsigned: Player[] = [];
  for (const p of freeAgentOrder(pool, capNext)) {
    const { market, ask, years } = freeAgentAsk(league.seed, next, p, capNext, index);
    const offers: Array<{ team: Team; deal: Contract; mood: number }> = [];
    for (const t of Object.values(teams)) {
      let deal: Contract | null;
      const own = chosen.get(t.abbr);
      if (own) {
        const mine = own.offers.get(p.id);
        if (mine) {
          deal = veteranContract(p, capNext, { kind: "veteran", signed: next, years: mine.years, annual: mine.annual });
          if (capHit(deal, next) > signingRoom(t, capNext, next)) deal = null;
        } else deal = own.frontOffice ? aiBid(ctx, t, p, ask, years) : null;
      } else deal = aiBid(ctx, t, p, ask, years);
      if (!deal) continue;
      const offered = deal.years.reduce((s, y) => s + y.salary + y.bonus, 0) / deal.years.length;
      offers.push({ team: t, deal, mood: mood(p, teamAppeal(t, p, winPct.get(t.abbr) ?? 0.5), offered / market) });
    }
    if (offers.length === 0) {
      unsigned.push(p);
      continue;
    }
    const choice = offers.reduce((a, b) => (b.mood > a.mood || (b.mood === a.mood && b.team.abbr < a.team.abbr) ? b : a));
    const t = choice.team;
    const signed = { ...p, contract: choice.deal, jersey: pickJersey(rng, p.position, new Set(t.roster.map((q) => q.jersey))) };
    teams[t.abbr] = withRoster(t, [...t.roster, signed]);
    moves.push({ kind: "signed", team: t.abbr, player: signed, contract: choice.deal, bidders: offers.length, hometown: persona(p).homeState === t.abbr });
  }
  return { league: { ...league, teams }, moves, unsigned };
}

/** One free agent as a team sees him before free agency opens. */
export interface FreeAgentListing {
  player: Player;
  /** His market value and what he's asking ($K a year), and for how long. */
  market: number;
  ask: number;
  years: number;
  /** Teams (other than yours) that want him and can afford him as free agency opens. */
  interest: number;
  /** How he'd feel about your team at his asking price (0-100). */
  mood: number;
  /** He'd start for your team. */
  wouldStart: boolean;
  /** Your team is his home-state team. */
  hometown: boolean;
}

export interface FreeAgencyPlan {
  team: string;
  season: number;
  cap: number;
  /** What your team can spend now, keeping enough to fill the roster at the minimum. */
  room: number;
  minimum: number;
  rosterSize: number;
  /** In signing order (best first). */
  pool: FreeAgentListing[];
}

/** The free-agent market as it opens, from one team's point of view. Same league/pool/index as runFreeAgency. */
export function freeAgencyPlan(league: League, pool: readonly Player[], next: number, index: number, winPct: ReadonlyMap<string, number>, abbr: string): FreeAgencyPlan {
  const capNext = salaryCap(league.seed, next);
  const ctx: FreeAgencyContext = { seed: league.seed, next, capNext };
  const me = league.teams[abbr]!;
  const others = Object.values(league.teams).filter((t) => t.abbr !== abbr);
  return {
    team: abbr,
    season: next,
    cap: capNext,
    room: spendable(me, capNext, next),
    minimum: minimumSalary(capNext),
    rosterSize: me.roster.length,
    pool: freeAgentOrder(pool, capNext).map((p) => {
      const { market, ask, years } = freeAgentAsk(league.seed, next, p, capNext, index);
      return {
        player: p,
        market,
        ask,
        years,
        interest: others.filter((t) => aiBid(ctx, t, p, ask, years) !== null).length,
        mood: mood(p, teamAppeal(me, p, winPct.get(abbr) ?? 0.5), ask / market),
        wouldStart: wouldStart(me, p),
        hometown: persona(p).homeState === abbr,
      };
    }),
  };
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
  /** Free agents who signed with their home-state team. */
  hometownSignings: number;
  /** Most sought-after free agents: who signed where, from how many offers. */
  topFreeAgents: Array<{ player: string; position: string; from: string; to: string; bidders: number; hometown: boolean; years: number; total: number }>;
}

export function summarizeContracts(league: League, moves: readonly ContractMove[], next: number): ContractSummary {
  const counts = Object.fromEntries((["re-signed", "extended", "option", "released", "declined", "signed", "cut", "cap cut"] as const).map((k) => [k, 0])) as Record<ContractMoveKind, number>;
  for (const m of moves) counts[m.kind]++;
  const deals = moves.filter((m) => m.contract && m.kind !== "option");
  const total = (c: Contract) => c.years.filter((y) => y.season >= next).reduce((s, y) => s + y.salary + y.bonus, 0);
  const formerTeam = new Map(moves.filter((m) => m.kind === "released" || m.kind === "declined").map((m) => [m.player.id, m.team]));
  const signings = moves.filter((m) => m.kind === "signed");
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
    hometownSignings: signings.filter((m) => m.hometown).length,
    topFreeAgents: [...signings]
      .sort((a, b) => total(b.contract!) - total(a.contract!))
      .slice(0, 5)
      .map((m) => ({ player: `${m.player.firstName} ${m.player.lastName}`, position: m.player.position, from: formerTeam.get(m.player.id) ?? "-", to: m.team, bidders: m.bidders ?? 1, hometown: !!m.hometown, years: m.contract!.years.length, total: total(m.contract!) })),
  };
}

