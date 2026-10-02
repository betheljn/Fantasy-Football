// Trades during the season. Each GM values a player his own way (what he sees
// in him now and next few years, against what his contract costs) and only
// takes a deal that leaves his team a little better off. Trades are
// player-for-player (rosters sit at 72 in-season), keep every position
// within its limits, and must fit both teams under the cap. Contracts move
// with the player; the homegrown cap credit stays behind with the team that
// drafted him. The trade deadline is the end of week 11.
import { capHit, yearsLeft, type Contract } from "../model/contract.ts";
import { playerOverall, type Player, type PlayerId } from "../model/player.ts";
import { BASE_STARTERS, POSITIONS, type Position } from "../model/positions.ts";
import { buildDepthChart, type DepthChart, type Team } from "../model/team.ts";
import type { League } from "../league/league.ts";
import { allTeams, teamRatings } from "../league/league.ts";
import { Rng } from "../rng.ts";
import { pickJersey } from "../gen/team-gen.ts";
import { ROSTER_MIN, ROSTER_POSITION_MAX, TRAIT_GROWTH_GUESS } from "../dynasty/roster.ts";
import { evaluationError, keepStyle } from "../dynasty/frontoffice.ts";
import { capSpace, marketValue, marketValueAt, payroll, salaryCap } from "./cap.ts";

/** Last week trades can be made before (the deadline is the end of this week's games). */
export const TRADE_DEADLINE_WEEK = 11;

export const TRADE_RULES = {
  /** Seasons of a contract a GM looks ahead. */
  horizon: 3,
  /**
   * How much this season's salary counts: cap room freed mid-season mostly
   * can't be spent until next year (only a little rolls over), so shedding
   * this year's pay is worth far less than shedding next year's.
   */
  costThisSeason: 0.35,
  /** This season counts up to this much extra for the strongest roster (contenders win now). */
  winNow: 0.6,
  /** Each later season counts this much of the one before. */
  future: 0.85,
  /** Share of a GM's usual misjudgment of a player left when he studies him for a trade. */
  judgment: 0.6,
  /** How much a player who'd start (vs. sit) is worth to a team. */
  starter: 1.15,
  backup: 0.75,
  /** A GM wants this share of what he gives up, on top, to say yes (and at least `minGain`). */
  margin: 0.06,
  minGain: 600,
  /** AI-to-AI: team pairs that talk each week, and most deals a week. */
  talksPerWeek: 10,
  maxPerWeek: 2,
};

/** Can trades still be made, with this many regular-season weeks played? */
export function tradesOpen(weeksPlayed: number): boolean {
  return weeksPlayed < TRADE_DEADLINE_WEEK;
}

/** `from` sends `give` to `to` and gets `get` back. */
export interface TradeProposal {
  from: string;
  to: string;
  give: readonly PlayerId[];
  get: readonly PlayerId[];
}

export interface TradedPlayer {
  id: PlayerId;
  name: string;
  position: Position;
  overall: number;
  age: number;
  /** Team he left. */
  from: string;
}

export interface TradeRecord {
  season: number;
  /** Made before this week's games. */
  week: number;
  teams: [string, string];
  players: TradedPlayer[];
}

/** Would he start for this team (among its best at his position, not counting himself)? */
function wouldStartFor(team: Team, player: Player, without: ReadonlySet<PlayerId> = new Set()): boolean {
  const ovr = playerOverall(player);
  let better = 0;
  for (const q of team.roster) if (q.position === player.position && q.id !== player.id && !without.has(q.id) && playerOverall(q) > ovr) better++;
  return better < BASE_STARTERS[player.position];
}

/** His contract as it would count for `team` (the homegrown credit only stays with the team that drafted him). */
function contractFor(team: Team, c: Contract): Contract {
  return c.homegrown && c.draftedBy !== team.abbr ? { ...c, homegrown: false } : c;
}

/**
 * What a player is worth to `team` in a trade, in $K: for each season of his
 * deal the GM looks ahead, what he'd earn on the market at the level the GM
 * sees him playing then (his own read of the player, plus expected growth for
 * the young; the market discounts age), minus what his contract costs that
 * season (this season's pay counts less: see TRADE_RULES.costThisSeason).
 * Contenders weigh this season more; everyone discounts later seasons. Cheap, young talent is gold; an aging, overpaid star can be worth
 * less than nothing. `without` are players leaving the team in the same deal.
 */
export function tradeValue(league: League, season: number, team: Team, player: Player, without: ReadonlySet<PlayerId> = new Set()): number {
  const cap = salaryCap(league.seed, season);
  const level = priceLevel(league, season, cap);
  const seen = playerOverall(player) + TRADE_RULES.judgment * evaluationError(team, player.id);
  const perYear = 1.5 * (player.devTraitRevealed ? TRAIT_GROWTH_GUESS[player.devTrait] : 1.2) * keepStyle(team).growth;
  const role = wouldStartFor(team, player, without) ? TRADE_RULES.starter : TRADE_RULES.backup;
  const c = player.contract ? contractFor(team, player.contract) : undefined;
  const years = c ? Math.max(1, Math.min(TRADE_RULES.horizon, yearsLeft(c, season))) : 1;
  const now = 1 + TRADE_RULES.winNow * contention(league, team);
  let value = 0;
  for (let k = 0; k < years; k++) {
    const growth = perYear * Math.min(k, Math.max(0, 25 - player.age));
    const worth = marketValueAt(player.position, seen + growth, player.age + k, cap, level);
    const weight = k === 0 ? now : TRADE_RULES.future ** k;
    value += worth * role * weight - (c ? capHit(c, season + k) : 0) * (k === 0 ? TRADE_RULES.costThisSeason : TRADE_RULES.future ** k);
  }
  return Math.round(value);
}

/**
 * What the league's veterans are actually paid this season, relative to base
 * market value (the median), so a fairly paid player is worth about his salary.
 */
const priceLevels = new WeakMap<League["teams"], number>();
function priceLevel(league: League, season: number, cap: number): number {
  let level = priceLevels.get(league.teams);
  if (level === undefined) {
    const ratios: number[] = [];
    for (const t of allTeams(league))
      for (const p of t.roster) if (p.contract && p.contract.kind !== "rookie" && capHit(p.contract, season) > 0) ratios.push(capHit(p.contract, season) / marketValue(p, cap));
    ratios.sort((a, b) => a - b);
    level = ratios.length > 0 ? ratios[Math.floor(ratios.length / 2)]! : 1;
    priceLevels.set(league.teams, level);
  }
  return level;
}

/** How strong a team's roster is next to the league's: 0 for the weakest, 1 for the strongest. */
const contenders = new WeakMap<League["teams"], Map<string, number>>();
function contention(league: League, team: Team): number {
  let ranks = contenders.get(league.teams);
  if (!ranks) {
    const order = allTeams(league)
      .map((t) => ({ abbr: t.abbr, ovr: teamRatings(t).overall }))
      .sort((a, b) => a.ovr - b.ovr || a.abbr.localeCompare(b.abbr));
    ranks = new Map(order.map((t, i) => [t.abbr, order.length > 1 ? i / (order.length - 1) : 0.5]));
    contenders.set(league.teams, ranks);
  }
  return ranks.get(team.abbr) ?? 0.5;
}

const playersOf = (team: Team, ids: readonly PlayerId[]) => ids.map((id) => team.roster.find((p) => p.id === id)).filter((p): p is Player => !!p);

/** What's wrong with a trade (empty = it can be made). */
export function checkTrade(league: League, season: number, t: TradeProposal): string[] {
  const a = league.teams[t.from];
  const b = league.teams[t.to];
  if (!a || !b || a === b) return ["Pick two different teams."];
  const problems: string[] = [];
  if (t.give.length === 0 || t.get.length === 0) problems.push("Each side has to send at least one player.");
  if (t.give.length !== t.get.length) problems.push("Trades are player-for-player: both sides send the same number.");
  const give = playersOf(a, t.give);
  const get = playersOf(b, t.get);
  if (give.length !== t.give.length || get.length !== t.get.length) problems.push("Every player has to be on the team trading him.");
  if (problems.length > 0) return problems;
  const cap = salaryCap(league.seed, season);
  for (const [team, out, inc] of [
    [a, give, get],
    [b, get, give],
  ] as const) {
    for (const pos of POSITIONS) {
      const n = team.roster.filter((p) => p.position === pos).length - out.filter((p) => p.position === pos).length + inc.filter((p) => p.position === pos).length;
      if (n < ROSTER_MIN[pos]) problems.push(`${team.abbr} would be down to ${n} at ${pos} (needs ${ROSTER_MIN[pos]}).`);
      if (n > ROSTER_POSITION_MAX[pos]) problems.push(`${team.abbr} would have ${n} at ${pos} (most ${ROSTER_POSITION_MAX[pos]}).`);
    }
    const after = tradedTeam(team, out, inc);
    if (capSpace(after, cap, season) < 0 && payroll(after, season) > payroll(team, season)) problems.push(`${team.abbr} would be over the cap.`);
  }
  return problems;
}

export interface TradeVerdict {
  accept: boolean;
  /** Value of what the team gets, and of what it gives up, to its GM ($K). */
  valueIn: number;
  valueOut: number;
  /** How much more it wants before saying yes (0 when it accepts). */
  short: number;
}

/** How team `abbr` (either side) sees a trade. */
export function judgeTrade(league: League, season: number, t: TradeProposal, abbr: string): TradeVerdict {
  const mine = abbr === t.from;
  const team = league.teams[abbr]!;
  const other = league.teams[mine ? t.to : t.from]!;
  const outIds = mine ? t.give : t.get;
  const inIds = mine ? t.get : t.give;
  const out = playersOf(team, outIds);
  const inc = playersOf(other, inIds);
  const leaving = new Set(outIds);
  const valueOut = out.reduce((s, p) => s + tradeValue(league, season, team, p), 0);
  const valueIn = inc.reduce((s, p) => s + tradeValue(league, season, team, p, leaving), 0);
  const need = Math.max(TRADE_RULES.minGain, Math.abs(valueOut) * TRADE_RULES.margin);
  const short = Math.max(0, valueOut + need - valueIn);
  return { accept: short === 0, valueIn, valueOut, short };
}

/** The team after sending `out` and taking `inc` (contracts adjusted, a free jersey number if his is taken, depth chart rebuilt). */
function tradedTeam(team: Team, out: readonly Player[], inc: readonly Player[], keepOrder = false): Team {
  const gone = new Set(out.map((p) => p.id));
  const roster = team.roster.filter((p) => !gone.has(p.id));
  const used = new Set(roster.map((p) => p.jersey));
  for (const p of inc) {
    const jersey = used.has(p.jersey) ? pickJersey(new Rng(`jersey:${team.abbr}:${p.id}`), p.position, used) : p.jersey;
    used.add(jersey);
    roster.push({ ...p, jersey, ...(p.contract ? { contract: contractFor(team, p.contract) } : {}) });
  }
  return { ...team, roster, depthChart: keepOrder ? mergeDepthChart(team.depthChart, roster) : buildDepthChart(roster) };
}

/** Keep a hand-set depth chart: departures removed, arrivals slotted in by overall. */
function mergeDepthChart(chart: DepthChart, roster: readonly Player[]): DepthChart {
  const byId = new Map(roster.map((p) => [p.id, p]));
  const auto = buildDepthChart(roster);
  const out = {} as DepthChart;
  for (const pos of POSITIONS) {
    const kept = (chart[pos] ?? []).filter((id) => byId.get(id)?.position === pos);
    const order = [...kept];
    for (const id of auto[pos]) {
      if (order.includes(id)) continue;
      const ovr = playerOverall(byId.get(id)!);
      const at = order.findIndex((x) => playerOverall(byId.get(x)!) < ovr);
      order.splice(at < 0 ? order.length : at, 0, id);
    }
    out[pos] = order;
  }
  return out;
}

const fullName = (p: Player) => `${p.firstName} ${p.lastName}`;

/**
 * Make a trade (check it first). Teams in `keepDepth` (yours) keep their
 * depth-chart order, with arrivals slotted in.
 */
export function applyTrade(league: League, season: number, week: number, t: TradeProposal, keepDepth: ReadonlySet<string> = new Set()): { league: League; record: TradeRecord } {
  const a = league.teams[t.from]!;
  const b = league.teams[t.to]!;
  const give = playersOf(a, t.give);
  const get = playersOf(b, t.get);
  const teams = {
    ...league.teams,
    [a.abbr]: tradedTeam(a, give, get, keepDepth.has(a.abbr)),
    [b.abbr]: tradedTeam(b, get, give, keepDepth.has(b.abbr)),
  };
  const moved = (p: Player, from: string): TradedPlayer => ({ id: p.id, name: fullName(p), position: p.position, overall: playerOverall(p), age: p.age, from });
  const record: TradeRecord = { season, week, teams: [a.abbr, b.abbr], players: [...give.map((p) => moved(p, a.abbr)), ...get.map((p) => moved(p, b.abbr))] };
  return { league: { ...league, teams }, record };
}

/**
 * What `partner` would want from `team` for these players of his: the
 * same number of `team`'s players that he'd accept, costing `team` the least
 * (by its own valuation). Null if nothing works.
 */
export function suggestTrade(league: League, season: number, team: string, partner: string, get: readonly PlayerId[]): TradeProposal | null {
  const mine = league.teams[team];
  if (!mine || get.length === 0 || get.length > 2) return null;
  // Candidates: every player for one-for-one; for two-for-two, pairs from the players the partner values most.
  const them = league.teams[partner]!;
  const pool = mine.roster.map((p) => ({ p, want: tradeValue(league, season, them, p) })).sort((x, y) => y.want - x.want);
  const top = pool.slice(0, 24);
  const sets: Player[][] = get.length === 1 ? pool.map((x) => [x.p]) : top.flatMap((x, i) => top.slice(i + 1).map((y) => [x.p, y.p]));
  let best: { t: TradeProposal; cost: number } | null = null;
  for (const set of sets) {
    const t = { from: team, to: partner, give: set.map((p) => p.id), get };
    if (checkTrade(league, season, t).length > 0) continue;
    if (!judgeTrade(league, season, t, partner).accept) continue;
    const cost = judgeTrade(league, season, t, team);
    const net = cost.valueOut - cost.valueIn;
    if (!best || net < best.cost) best = { t, cost: net };
  }
  return best?.t ?? null;
}

/** A team's weakest spot: the position whose starters fall furthest short of a solid starter. */
function weakestPositions(team: Team): Position[] {
  const gap = (pos: Position) => {
    const best = team.roster
      .filter((p) => p.position === pos)
      .map(playerOverall)
      .sort((a, b) => b - a)
      .slice(0, BASE_STARTERS[pos]);
    return best.length < BASE_STARTERS[pos] ? 0 : best[best.length - 1]!;
  };
  return POSITIONS.filter((p) => p !== "K" && p !== "P" && p !== "LS").sort((a, b) => gap(a) - gap(b));
}

/**
 * A week of AI-to-AI trade talks (before `week`'s games): GMs look to fill
 * their weakest starting spot with another team's backup, giving up a backup
 * the other team would start. A deal happens only when both GMs like it.
 * Teams in `humans` are left out. `traded` are players already moved this
 * season (not moved again).
 */
export function aiTradeWeek(
  league: League,
  season: number,
  week: number,
  humans: ReadonlySet<string> = new Set(),
  traded: ReadonlySet<PlayerId> = new Set(),
): { league: League; trades: TradeRecord[] } {
  if (week > TRADE_DEADLINE_WEEK) return { league, trades: [] };
  const rng = new Rng(`trades:${league.seed}:${season}:${week}`);
  const teams = allTeams(league).filter((t) => !humans.has(t.abbr)).map((t) => t.abbr);
  const trades: TradeRecord[] = [];
  const moved = new Set(traded);
  let current = league;
  for (let talk = 0; talk < TRADE_RULES.talksPerWeek && trades.length < TRADE_RULES.maxPerWeek; talk++) {
    const [x, y] = rng.shuffle(teams);
    if (!x || !y) break;
    const a = current.teams[x]!;
    const b = current.teams[y]!;
    const deal = findDeal(current, season, a, b, moved);
    if (!deal) continue;
    const r = applyTrade(current, season, week, deal);
    current = r.league;
    trades.push(r.record);
    for (const id of [...deal.give, ...deal.get]) moved.add(id);
  }
  return { league: current, trades };
}

/** A one-for-one deal both GMs like: `a` fills a weak starting spot with a `b` backup. */
function findDeal(league: League, season: number, a: Team, b: Team, moved: ReadonlySet<PlayerId>): TradeProposal | null {
  for (const pos of weakestPositions(a).slice(0, 2)) {
    // b's backups at that spot who'd start for a.
    const targets = b.roster.filter((p) => p.position === pos && !moved.has(p.id) && !wouldStartFor(b, p) && wouldStartFor(a, p));
    if (targets.length === 0) continue;
    // a's backups that b would start.
    const offers = a.roster.filter((p) => !moved.has(p.id) && !wouldStartFor(a, p) && wouldStartFor(b, p));
    for (const target of targets.sort((p, q) => playerOverall(q) - playerOverall(p)).slice(0, 2)) {
      for (const offer of offers.sort((p, q) => playerOverall(q) - playerOverall(p)).slice(0, 4)) {
        const t: TradeProposal = { from: a.abbr, to: b.abbr, give: [offer.id], get: [target.id] };
        if (checkTrade(league, season, t).length > 0) continue;
        if (judgeTrade(league, season, t, a.abbr).accept && judgeTrade(league, season, t, b.abbr).accept) return t;
      }
    }
  }
  return null;
}
