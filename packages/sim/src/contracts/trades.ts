// Trades: players and draft picks. Each GM values a player his own way (what
// he sees in him now and over the next few seasons, against what his contract
// costs) and a pick by where it should land, and only takes a deal that leaves
// his team better off (a human has to give him a bit more than another GM
// would). Every trade keeps each position within its limits and both teams
// under the cap. A team that ends up over 72 releases its least valuable
// players (their dead money stays with it); a team that ends up short plays
// short and fills up in the offseason. Contracts move with the player; the
// homegrown cap credit stays with the team that drafted him.
//
// Trading windows: from the end of the offseason through week 11 (the
// deadline), and a draft-week window once the playoffs are over (valued
// against next season's contracts and cap, with the draft order known).
import { capHit, deadMoney, yearsLeft, type Contract } from "../model/contract.ts";
import { playerOverall, type Player, type PlayerId } from "../model/player.ts";
import { BASE_STARTERS, POSITIONS, type Position } from "../model/positions.ts";
import { ROSTER_MAX, buildDepthChart, type DepthChart, type Team } from "../model/team.ts";
import type { League } from "../league/league.ts";
import { allTeams, teamRatings } from "../league/league.ts";
import { Rng } from "../rng.ts";
import { pickJersey } from "../gen/team-gen.ts";
import { ROSTER_MIN, ROSTER_POSITION_MAX, TRAIT_GROWTH_GUESS, keepValue } from "../dynasty/roster.ts";
import { evaluationError, keepStyle } from "../dynasty/frontoffice.ts";
import { DRAFT_ROUNDS } from "../dynasty/draft.ts";
import { marketValue, marketValueAt, salaryCap } from "./cap.ts";

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
  /** A contender's extra reluctance to give up a starter, at full contention (share of his value). */
  starterGrip: 0.35,
  /** A GM wants this share of what he gives up, on top, to say yes (and at least `minGain`). */
  margin: 0.06,
  minGain: 600,
  /** ... and more from a human, who knows exactly who he's after. */
  humanMargin: 0.12,
  humanMinGain: 1_500,
  /**
   * A first overall pick is worth this share of the cap. Value falls steeply
   * over the first picks (`steepShare` of it fades by e every `steepDecay`
   * picks), then slowly (the rest, every `pickDecay`).
   */
  topPick: 0.12,
  steepShare: 0.6,
  steepDecay: 12,
  pickDecay: 60,
  /** Rebuilding teams value picks up to this much more than the strongest team. */
  rebuildPicks: 0.3,
  /** Fewest players a team can carry during the season after a trade (it fills up in the offseason). */
  minRoster: 68,
  /** AI-to-AI: team pairs that talk each window, and most deals per window. */
  talksPerWeek: 10,
  maxPerWeek: 2,
};

/** Can trades still be made, with this many regular-season weeks played? */
export function tradesOpen(weeksPlayed: number): boolean {
  return weeksPlayed < TRADE_DEADLINE_WEEK;
}

/**
 * When a trade happens. In-season (and from the offseason report through the
 * preseason): this season's contracts and cap. Draft week (the season over,
 * before the offseason): next season's, with the draft order known.
 */
export interface TradeWindow {
  /** Season whose contracts and cap count. */
  season: number;
  /** The next draft (its class year); picks in it and the one after can be traded. */
  draft: number;
  /** That draft's order (original teams, first pick first), once the season is over. */
  order?: readonly string[];
  /** For the record: the week it's made before (0 = draft week). */
  week: number;
}

/** The window during a season, with this many weeks played (0 = preseason). */
export function seasonWindow(league: League, weeksPlayed: number): TradeWindow {
  return { season: league.season, draft: league.season + 1, week: weeksPlayed + 1 };
}

/** Draft week: the season (league.season) is over and the draft order is set. */
export function draftWeekWindow(league: League, order: readonly string[]): TradeWindow {
  return { season: league.season + 1, draft: league.season + 1, order, week: 0 };
}

/** A draft pick: `draft` class year, round, and the team it originally belonged to. */
export interface DraftPickAsset {
  id: string;
  draft: number;
  round: number;
  original: string;
}

export const pickId = (draft: number, round: number, original: string) => `${draft}:${round}:${original}`;

export function parsePickId(id: string): DraftPickAsset | null {
  const [d, r, original] = id.split(":");
  const draft = Number(d);
  const round = Number(r);
  if (!original || !Number.isInteger(draft) || !Number.isInteger(round)) return null;
  return { id, draft, round, original };
}

/** Who owns a pick now (its original team unless it was traded). */
export function pickOwner(league: League, draft: number, round: number, original: string): string {
  return league.pickOwners?.[pickId(draft, round, original)] ?? original;
}

/** The picks a team owns that can be traded in this window (the next two drafts, all rounds). */
export function tradablePicks(league: League, w: TradeWindow, abbr: string): DraftPickAsset[] {
  const out: DraftPickAsset[] = [];
  for (const draft of [w.draft, w.draft + 1])
    for (let round = 1; round <= DRAFT_ROUNDS; round++)
      for (const original of Object.keys(league.teams).sort()) if (pickOwner(league, draft, round, original) === abbr) out.push({ id: pickId(draft, round, original), draft, round, original });
  return out.sort((a, b) => a.draft - b.draft || a.round - b.round || a.original.localeCompare(b.original));
}

/** Where a pick should land within its round (1-50): known once the order is set, else guessed from the team's strength. */
export function projectedSlot(league: League, w: TradeWindow, pick: DraftPickAsset): number {
  const n = Object.keys(league.teams).length;
  if (pick.draft === w.draft && w.order) return w.order.indexOf(pick.original) + 1;
  if (pick.draft > w.draft) return Math.round((n + 1) / 2);
  return 1 + Math.round(contention(league, league.teams[pick.original]!) * (n - 1));
}

/** What a pick is worth to `team`, in $K (the same scale as tradeValue). */
export function pickValue(league: League, w: TradeWindow, team: Team, pick: DraftPickAsset): number {
  const n = Object.keys(league.teams).length;
  const overall = (pick.round - 1) * n + projectedSlot(league, w, pick);
  const cap = salaryCap(league.seed, w.season);
  const { topPick, steepShare, steepDecay, pickDecay } = TRADE_RULES;
  const base = cap * topPick * (steepShare * Math.exp(-(overall - 1) / steepDecay) + (1 - steepShare) * Math.exp(-(overall - 1) / pickDecay));
  const later = pick.draft > w.draft ? TRADE_RULES.future : 1;
  const rebuild = 1 + TRADE_RULES.rebuildPicks * (1 - contention(league, team));
  return Math.round(base * later * rebuild);
}

/** `from` sends `give` (and `givePicks`) to `to` and gets `get` (and `getPicks`) back. */
export interface TradeProposal {
  from: string;
  to: string;
  give: readonly PlayerId[];
  get: readonly PlayerId[];
  givePicks?: readonly string[];
  getPicks?: readonly string[];
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

export interface TradedPick extends DraftPickAsset {
  /** Team that gave it up. */
  from: string;
}

export interface ReleasedPlayer {
  id: PlayerId;
  name: string;
  position: Position;
  overall: number;
  team: string;
  /** Cap charge left behind ($K): this season's (in-season) and next season's. */
  deadThisSeason: number;
  deadNextSeason: number;
}

export interface TradeRecord {
  season: number;
  /** Made before this week's games (0 = draft week). */
  week: number;
  teams: [string, string];
  players: TradedPlayer[];
  picks?: TradedPick[];
  /** Players released to make room on a roster over 72. */
  released?: ReleasedPlayer[];
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
 * Contenders weigh this season more; everyone discounts later seasons. Cheap,
 * young talent is gold; an aging, overpaid star can be worth less than
 * nothing; a player whose deal is up is worth nothing. `without` are players
 * leaving the team in the same deal.
 */
export function tradeValue(league: League, w: TradeWindow, team: Team, player: Player, without: ReadonlySet<PlayerId> = new Set()): number {
  const season = w.season;
  const c = player.contract ? contractFor(team, player.contract) : undefined;
  if (c && yearsLeft(c, season) === 0) return 0;
  const cap = salaryCap(league.seed, season);
  const level = priceLevel(league, season, cap);
  const seen = playerOverall(player) + TRADE_RULES.judgment * evaluationError(team, player.id);
  const perYear = 1.5 * (player.devTraitRevealed ? TRAIT_GROWTH_GUESS[player.devTrait] : 1.2) * keepStyle(team).growth;
  const role = wouldStartFor(team, player, without) ? TRADE_RULES.starter : TRADE_RULES.backup;
  const years = c ? Math.max(1, Math.min(TRADE_RULES.horizon, yearsLeft(c, season))) : 1;
  // In draft week the next season hasn't started: its pay counts in full.
  const thisSeasonCost = season === league.season ? TRADE_RULES.costThisSeason : 1;
  const now = 1 + TRADE_RULES.winNow * contention(league, team);
  let value = 0;
  for (let k = 0; k < years; k++) {
    const growth = perYear * Math.min(k, Math.max(0, 25 - player.age));
    const worth = marketValueAt(player.position, seen + growth, player.age + k, cap, level);
    const weight = k === 0 ? now : TRADE_RULES.future ** k;
    value += worth * role * weight - (c ? capHit(c, season + k) : 0) * (k === 0 ? thisSeasonCost : TRADE_RULES.future ** k);
  }
  return Math.round(value);
}

/**
 * What the league's veterans are actually paid this season, relative to base
 * market value (the median), so a fairly paid player is worth about his salary.
 */
const priceLevels = new WeakMap<League["teams"], Map<number, number>>();
function priceLevel(league: League, season: number, cap: number): number {
  let bySeason = priceLevels.get(league.teams);
  if (!bySeason) priceLevels.set(league.teams, (bySeason = new Map()));
  let level = bySeason.get(season);
  if (level === undefined) {
    const ratios: number[] = [];
    for (const t of allTeams(league))
      for (const p of t.roster) if (p.contract && p.contract.kind !== "rookie" && capHit(p.contract, season) > 0) ratios.push(capHit(p.contract, season) / marketValue(p, cap));
    ratios.sort((a, b) => a - b);
    level = ratios.length > 0 ? ratios[Math.floor(ratios.length / 2)]! : 1;
    bySeason.set(season, level);
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
const picksOf = (ids: readonly string[] | undefined) => (ids ?? []).map(parsePickId).filter((p): p is DraftPickAsset => !!p);

/** Payroll that counts in this window: in-season, the team's cap sheet; in draft week, next season's contracts plus dead money already owed then. */
function windowPayroll(team: Team, w: TradeWindow, inSeason: boolean): number {
  const players = team.roster.reduce((s, p) => s + (p.contract ? capHit(p.contract, w.season) : 0), 0);
  const pending = (team.cap?.pendingDeadMoney ?? []).filter((d) => d.season === w.season).reduce((s, d) => s + d.amount, 0);
  if (!inSeason) return players + pending;
  return players + (team.cap?.deadMoney ?? 0) + (team.cap?.incentives ?? 0) + (team.cap?.floorPayment ?? 0);
}

function windowRoom(league: League, team: Team, w: TradeWindow): number {
  const inSeason = w.season === league.season;
  return salaryCap(league.seed, w.season) + (inSeason ? (team.cap?.rollover ?? 0) : 0) - windowPayroll(team, w, inSeason);
}

/**
 * Who a team over 72 after a trade releases: its least valuable players (to
 * its own GM) at positions with players to spare, never one just acquired.
 */
function releasesFor(team: Team, roster: readonly Player[], arrived: ReadonlySet<PlayerId>): Player[] {
  const over = roster.length - ROSTER_MAX;
  if (over <= 0) return [];
  const count = new Map<Position, number>();
  for (const p of roster) count.set(p.position, (count.get(p.position) ?? 0) + 1);
  const style = keepStyle(team);
  const ranked = roster
    .filter((p) => !arrived.has(p.id))
    .map((p) => ({ p, v: keepValue(p, undefined, style, evaluationError(team, p.id)) }))
    .sort((a, b) => a.v - b.v || a.p.id.localeCompare(b.p.id));
  const out: Player[] = [];
  for (const { p } of ranked) {
    if (out.length === over) break;
    if (count.get(p.position)! <= ROSTER_MIN[p.position]) continue;
    out.push(p);
    count.set(p.position, count.get(p.position)! - 1);
  }
  return out;
}

/** One side of a trade worked out: who leaves, who arrives, who's released to make room, and the team after. */
interface Side {
  team: Team;
  out: Player[];
  inc: Player[];
  released: Player[];
  after: Team;
}

function sides(league: League, w: TradeWindow, t: TradeProposal, keepDepth: ReadonlySet<string> = new Set()): [Side, Side] {
  const a = league.teams[t.from]!;
  const b = league.teams[t.to]!;
  const give = playersOf(a, t.give);
  const get = playersOf(b, t.get);
  const side = (team: Team, out: Player[], inc: Player[]): Side => {
    const traded = tradedTeam(team, out, inc, keepDepth.has(team.abbr));
    const released = releasesFor(team, traded.roster, new Set(inc.map((p) => p.id)));
    return { team, out, inc, released, after: released.length > 0 ? releasePlayers(traded, released, league, w, keepDepth.has(team.abbr)) : traded };
  };
  return [side(a, give, get), side(b, get, give)];
}

/** What's wrong with a trade (empty = it can be made). */
export function checkTrade(league: League, w: TradeWindow, t: TradeProposal): string[] {
  const a = league.teams[t.from];
  const b = league.teams[t.to];
  if (!a || !b || a === b) return ["Pick two different teams."];
  const problems: string[] = [];
  const givePicks = picksOf(t.givePicks);
  const getPicks = picksOf(t.getPicks);
  if (t.give.length + givePicks.length === 0 || t.get.length + getPicks.length === 0) problems.push("Each side has to send something.");
  const give = playersOf(a, t.give);
  const get = playersOf(b, t.get);
  if (give.length !== t.give.length || get.length !== t.get.length) problems.push("Every player has to be on the team trading him.");
  for (const [owner, picks] of [
    [a.abbr, givePicks],
    [b.abbr, getPicks],
  ] as const)
    for (const p of picks) {
      if (p.draft !== w.draft && p.draft !== w.draft + 1) problems.push(`Only picks in the next two drafts can be traded.`);
      else if (pickOwner(league, p.draft, p.round, p.original) !== owner) problems.push(`${owner} doesn't own that ${p.draft} round ${p.round} pick.`);
    }
  if (problems.length > 0) return problems;
  const inSeason = w.season === league.season;
  for (const p of [...give, ...get]) if (p.contract && yearsLeft(p.contract, w.season) === 0) problems.push(`${p.firstName} ${p.lastName}'s contract is up: he can't be traded.`);
  for (const s of sides(league, w, t)) {
    const abbr = s.team.abbr;
    for (const pos of POSITIONS) {
      const n = s.after.roster.filter((p) => p.position === pos).length;
      if (n < ROSTER_MIN[pos]) problems.push(`${abbr} would be down to ${n} at ${pos} (needs ${ROSTER_MIN[pos]}).`);
      if (n > ROSTER_POSITION_MAX[pos]) problems.push(`${abbr} would have ${n} at ${pos} (most ${ROSTER_POSITION_MAX[pos]}).`);
    }
    if (s.after.roster.length > ROSTER_MAX) problems.push(`${abbr} would have more than ${ROSTER_MAX} players.`);
    if (inSeason && s.after.roster.length < TRADE_RULES.minRoster && s.after.roster.length < s.team.roster.length)
      problems.push(`${abbr} would be down to ${s.after.roster.length} players (at least ${TRADE_RULES.minRoster} during the season).`);
    const room = windowRoom(league, s.after, w);
    if (room < 0 && windowRoom(league, s.after, w) < windowRoom(league, s.team, w)) problems.push(`${abbr} would be over the cap.`);
  }
  return problems;
}

export interface TradeVerdict {
  accept: boolean;
  /** Value of what the team gets, and of what it gives up (including anyone it releases), to its GM ($K). */
  valueIn: number;
  valueOut: number;
  /** How much more it wants before saying yes (0 when it accepts). */
  short: number;
}

/** What releasing a player costs a team: the value it loses, plus the dead money it still pays. */
function releaseCost(league: League, w: TradeWindow, team: Team, p: Player): number {
  const c = p.contract;
  const inSeason = w.season === league.season;
  const deadNow = c && inSeason ? capHit(c, w.season) * TRADE_RULES.costThisSeason : 0;
  const deadLater = c ? deadMoney(c, inSeason ? w.season + 1 : w.season) * TRADE_RULES.future : 0;
  return Math.max(0, tradeValue(league, w, team, p)) + deadNow + deadLater;
}

/**
 * How team `abbr` (either side) sees a trade. `vsHuman`: the other side is a
 * person, so the GM wants a bigger edge.
 */
export function judgeTrade(league: League, w: TradeWindow, t: TradeProposal, abbr: string, vsHuman = false): TradeVerdict {
  const mine = abbr === t.from;
  const [sa, sb] = sides(league, w, t);
  const s = mine ? sa : sb;
  const team = s.team;
  const leaving = new Set([...s.out, ...s.released].map((p) => p.id));
  const grip = TRADE_RULES.starterGrip * contention(league, team);
  let valueOut = 0;
  for (const p of s.out) {
    const v = tradeValue(league, w, team, p);
    valueOut += v + (wouldStartFor(team, p) ? grip * Math.max(0, v) : 0);
  }
  for (const p of s.released) valueOut += releaseCost(league, w, team, p);
  for (const p of picksOf(mine ? t.givePicks : t.getPicks)) valueOut += pickValue(league, w, team, p);
  let valueIn = s.inc.reduce((sum, p) => sum + tradeValue(league, w, team, p, leaving), 0);
  for (const p of picksOf(mine ? t.getPicks : t.givePicks)) valueIn += pickValue(league, w, team, p);
  const need = vsHuman
    ? Math.max(TRADE_RULES.humanMinGain, Math.abs(valueOut) * TRADE_RULES.humanMargin)
    : Math.max(TRADE_RULES.minGain, Math.abs(valueOut) * TRADE_RULES.margin);
  const short = Math.max(0, valueOut + need - valueIn);
  return { accept: short === 0, valueIn: Math.round(valueIn), valueOut: Math.round(valueOut), short: Math.round(short) };
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

/** The dead money a release leaves: this season's pay (in-season), and what's owed after (charged to next season). */
function releaseDead(league: League, w: TradeWindow, p: Player): { now: number; next: number; nextSeason: number } {
  const c = p.contract;
  const inSeason = w.season === league.season;
  const nextSeason = inSeason ? w.season + 1 : w.season;
  return { now: c && inSeason ? capHit(c, w.season) : 0, next: c ? deadMoney(c, nextSeason) : 0, nextSeason };
}

function releasePlayers(team: Team, released: readonly Player[], league: League, w: TradeWindow, keepOrder: boolean): Team {
  const gone = new Set(released.map((p) => p.id));
  const roster = team.roster.filter((p) => !gone.has(p.id));
  let now = 0;
  const pending = [...(team.cap?.pendingDeadMoney ?? [])];
  for (const p of released) {
    const d = releaseDead(league, w, p);
    now += d.now;
    if (d.next > 0) pending.push({ season: d.nextSeason, amount: d.next });
  }
  const cap = { rollover: team.cap?.rollover ?? 0, ...team.cap, deadMoney: (team.cap?.deadMoney ?? 0) + now, pendingDeadMoney: pending };
  return { ...team, roster, cap, depthChart: keepOrder ? mergeDepthChart(team.depthChart, roster) : buildDepthChart(roster) };
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

/** A team's cap room in this window, now and if the trade went through ($K). */
export function tradeCapRoom(league: League, w: TradeWindow, t: TradeProposal, abbr: string): { before: number; after: number } {
  const s = sides(league, w, t).find((x) => x.team.abbr === abbr)!;
  return { before: windowRoom(league, s.team, w), after: windowRoom(league, s.after, w) };
}

/** Who a team would release to make room if this trade went through (for showing before you offer it). */
export function tradeReleases(league: League, w: TradeWindow, t: TradeProposal): ReleasedPlayer[] {
  return sides(league, w, t).flatMap((s) => s.released.map((p) => releasedRecord(league, w, s.team.abbr, p)));
}

function releasedRecord(league: League, w: TradeWindow, team: string, p: Player): ReleasedPlayer {
  const d = releaseDead(league, w, p);
  return { id: p.id, name: fullName(p), position: p.position, overall: playerOverall(p), team, deadThisSeason: d.now, deadNextSeason: d.next };
}

/**
 * Make a trade (check it first). Teams in `keepDepth` (yours) keep their
 * depth-chart order, with arrivals slotted in.
 */
export function applyTrade(league: League, w: TradeWindow, t: TradeProposal, keepDepth: ReadonlySet<string> = new Set()): { league: League; record: TradeRecord } {
  const [sa, sb] = sides(league, w, t, keepDepth);
  const teams = { ...league.teams, [sa.team.abbr]: sa.after, [sb.team.abbr]: sb.after };
  const owners = { ...(league.pickOwners ?? {}) };
  const picks: TradedPick[] = [];
  for (const [ids, from, to] of [
    [t.givePicks, t.from, t.to],
    [t.getPicks, t.to, t.from],
  ] as const)
    for (const p of picksOf(ids)) {
      if (to === p.original) delete owners[p.id];
      else owners[p.id] = to;
      picks.push({ ...p, from });
    }
  const moved = (p: Player, from: string): TradedPlayer => ({ id: p.id, name: fullName(p), position: p.position, overall: playerOverall(p), age: p.age, from });
  const released = [...sa.released.map((p) => releasedRecord(league, w, sa.team.abbr, p)), ...sb.released.map((p) => releasedRecord(league, w, sb.team.abbr, p))];
  const record: TradeRecord = {
    season: league.season,
    week: w.week,
    teams: [t.from, t.to],
    players: [...sa.out.map((p) => moved(p, t.from)), ...sb.out.map((p) => moved(p, t.to))],
    ...(picks.length > 0 ? { picks } : {}),
    ...(released.length > 0 ? { released } : {}),
  };
  return { league: { ...league, teams, pickOwners: owners }, record };
}

/**
 * What `partner` would want from `team` for what `team` asks for (players
 * and/or picks): one or two of `team`'s players, or picks, or a player plus a
 * pick, that he'd accept, costing `team` the least by its own valuation. Null
 * if nothing works.
 */
export function suggestTrade(league: League, w: TradeWindow, team: string, partner: string, get: readonly PlayerId[], getPicks: readonly string[] = []): TradeProposal | null {
  const mine = league.teams[team];
  const them = league.teams[partner];
  if (!mine || !them || get.length + getPicks.length === 0) return null;
  const players = mine.roster
    .filter((p) => !p.contract || yearsLeft(p.contract, w.season) > 0)
    .map((p) => ({ p, want: tradeValue(league, w, them, p) }))
    .sort((x, y) => y.want - x.want);
  const top = players.slice(0, 20).map((x) => x.p);
  const picks = tradablePicks(league, w, team);
  const early = picks.filter((p) => p.round <= 3);
  const offers: Array<{ give: PlayerId[]; givePicks: string[] }> = [
    ...players.map((x) => ({ give: [x.p.id], givePicks: [] })),
    ...top.flatMap((x, i) => top.slice(i + 1).map((y) => ({ give: [x.id, y.id], givePicks: [] }))),
    ...picks.map((p) => ({ give: [], givePicks: [p.id] })),
    ...early.flatMap((p, i) => early.slice(i + 1).map((q) => ({ give: [], givePicks: [p.id, q.id] }))),
    ...top.slice(0, 10).flatMap((x) => picks.map((p) => ({ give: [x.id], givePicks: [p.id] }))),
  ];
  let best: { t: TradeProposal; cost: number } | null = null;
  for (const o of offers) {
    const t: TradeProposal = { from: team, to: partner, give: o.give, get, givePicks: o.givePicks, getPicks };
    if (!judgeTrade(league, w, t, partner, true).accept) continue;
    if (checkTrade(league, w, t).length > 0) continue;
    const mineView = judgeTrade(league, w, t, team);
    const cost = mineView.valueOut - mineView.valueIn;
    if (!best || cost < best.cost) best = { t, cost };
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
 * A round of AI-to-AI trade talks (before a week's games, or in draft week):
 * GMs look to fill their weakest starting spot with another team's backup,
 * giving up a backup the other team would start, plus a pick if that's what
 * it takes. A deal happens only when both GMs like it. Teams in `humans` are
 * left out. `traded` are players already moved this season (not moved again).
 */
export function aiTradeWeek(league: League, w: TradeWindow, humans: ReadonlySet<string> = new Set(), traded: ReadonlySet<PlayerId> = new Set()): { league: League; trades: TradeRecord[] } {
  if (w.week > TRADE_DEADLINE_WEEK) return { league, trades: [] };
  const rng = new Rng(`trades:${league.seed}:${league.season}:${w.week}`);
  const teams = allTeams(league).filter((t) => !humans.has(t.abbr)).map((t) => t.abbr);
  const trades: TradeRecord[] = [];
  const moved = new Set(traded);
  let current = league;
  for (let talk = 0; talk < TRADE_RULES.talksPerWeek && trades.length < TRADE_RULES.maxPerWeek; talk++) {
    const [x, y] = rng.shuffle(teams);
    if (!x || !y) break;
    const deal = findDeal(current, w, current.teams[x]!, current.teams[y]!, moved);
    if (!deal) continue;
    const r = applyTrade(current, w, deal);
    current = r.league;
    trades.push(r.record);
    for (const id of [...deal.give, ...deal.get]) moved.add(id);
  }
  return { league: current, trades };
}

/** A deal both GMs like: `a` fills a weak starting spot with a `b` backup, for a backup `b` would start (and a pick, if needed). */
function findDeal(league: League, w: TradeWindow, a: Team, b: Team, moved: ReadonlySet<PlayerId>): TradeProposal | null {
  const live = (p: Player) => !moved.has(p.id) && (!p.contract || yearsLeft(p.contract, w.season) > 0);
  for (const pos of weakestPositions(a).slice(0, 2)) {
    const targets = b.roster.filter((p) => p.position === pos && live(p) && !wouldStartFor(b, p) && wouldStartFor(a, p));
    if (targets.length === 0) continue;
    const offers = a.roster.filter((p) => live(p) && !wouldStartFor(a, p) && wouldStartFor(b, p));
    const sweeteners = tradablePicks(league, w, a.abbr).filter((p) => p.round >= 3);
    for (const target of targets.sort((p, q) => playerOverall(q) - playerOverall(p)).slice(0, 2)) {
      for (const offer of offers.sort((p, q) => playerOverall(q) - playerOverall(p)).slice(0, 4)) {
        const t: TradeProposal = { from: a.abbr, to: b.abbr, give: [offer.id], get: [target.id] };
        if (!judgeTrade(league, w, t, a.abbr).accept) continue;
        const theirs = judgeTrade(league, w, t, b.abbr);
        let deal: TradeProposal | null = theirs.accept ? t : null;
        if (!deal) {
          // Close the gap with the cheapest late pick that covers it, if a still likes the deal.
          const pick = sweeteners
            .map((p) => ({ p, v: pickValue(league, w, b, p) }))
            .filter((x) => x.v >= theirs.short)
            .sort((x, y) => x.v - y.v)[0];
          if (pick) {
            const sweetened = { ...t, givePicks: [pick.p.id] };
            if (judgeTrade(league, w, sweetened, a.abbr).accept && judgeTrade(league, w, sweetened, b.abbr).accept) deal = sweetened;
          }
        }
        if (deal && checkTrade(league, w, deal).length === 0) return deal;
      }
    }
  }
  return null;
}
