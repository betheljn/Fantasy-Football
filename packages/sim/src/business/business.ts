// The business side of a team: its market, its stadium, its fans and its
// money. The salary cap is the same for everyone; market size only changes
// the business. Big states bring more fans and more local money but fickle
// fans; small states have fewer, more loyal fans and a bigger revenue-sharing
// check. Money is in $ thousands, like the cap.
//
// Each home game draws a crowd: die-hards show up no matter what, casual fans
// come when the team is winning, and everyone stays home when tickets cost
// too much. A season's revenue is tickets, concessions, merch, local
// sponsors and media, the national TV deal and revenue sharing; expenses are
// payroll, staff, stadium operations and debt. After each season the fan base
// moves with the results.
import { VIDEO_BOARD_MAX, stadiumNameProblem, covered, roofOf, standsOf, surfaceOf, videoBoardOf, type Roof, type Stands, type Surface } from "./stadium.ts";
import { REGION_CLIMATE } from "../game/conditions.ts";
import { regionOf } from "../gen/regions.ts";
import { Rng } from "../rng.ts";
import type { League } from "../league/league.ts";
import type { Team } from "../model/team.ts";
import type { GameSummary, TeamRecord } from "../league/standings.ts";
import { payroll, salaryCap } from "../contracts/cap.ts";
import { staffSpending } from "../contracts/staffcontracts.ts";

/** State population, in millions (roughly): the size of each market. Business only: talent comes from every state alike. */
export const POPULATION: Record<string, number> = {
  AL: 5.1, AK: 0.7, AZ: 7.4, AR: 3.1, CA: 39, CO: 5.9, CT: 3.6, DE: 1, FL: 22.6, GA: 11, HI: 1.4, ID: 1.9, IL: 12.5,
  IN: 6.9, IA: 3.2, KS: 2.9, KY: 4.5, LA: 4.6, ME: 1.4, MD: 6.2, MA: 7, MI: 10, MN: 5.7, MS: 2.9, MO: 6.2,
  MT: 1.1, NE: 2, NV: 3.2, NH: 1.4, NJ: 9.3, NM: 2.1, NY: 19.6, NC: 10.8, ND: 0.8, OH: 11.8, OK: 4, OR: 4.2,
  PA: 13, RI: 1.1, SC: 5.4, SD: 0.9, TN: 7.1, TX: 30.5, UT: 3.4, VT: 0.6, VA: 8.7, WA: 7.8, WV: 1.8, WI: 5.9, WY: 0.6,
};

export const BUSINESS_RULES = {
  homeGames: 10,
  /** National TV deal, the same for every team: this share of the season's salary cap (it grows as the league does). */
  nationalMedia: 0.9,
  /** Share of local revenue pooled and split evenly. */
  sharing: 0.4,
  /** Ticket and concession prices most teams charge ($ per fan). */
  baseTicket: 95,
  baseConcessions: 30,
  /** How much fans care about price: demand falls off with (base/price)^elasticity. */
  elasticity: 1.3,
  /** Fans who come from out of state, by hype (thousands a game). */
  regionalDraw: 22,
};

export interface Stadium {
  name: string;
  capacity: number;
  /** Amenities: suites, video board, comfort (0-100). */
  quality: number;
  /** A full dome (kept in step with `roof`: true only for a dome). */
  dome: boolean;
  /** Owed on the stadium ($K). */
  debt: number;
  /** The design (absent in older saves: read with stadium.ts's roofOf, surfaceOf, standsOf, videoBoardOf). */
  roof?: Roof;
  surface?: Surface;
  stands?: Stands;
  /** Video board level, 0-3. */
  videoBoard?: number;
  /** Levels of luxury suites (premium revenue every season). */
  suites?: number;
  /** A company's name on the stadium: what it pays a season, and through when. */
  naming?: { sponsor: string; perYear: number; through: number };
}

export type ProjectKind = "expand" | "videoBoard" | "suites" | "dome" | "retractable" | "turf" | "grass" | "steep";

/** A stadium project under way: done in time for next season. */
export interface StadiumProject {
  kind: ProjectKind;
  /** Started during this season (opens next season). */
  season: number;
  cost: number;
  financing: "cash" | "bonds";
}

export interface Fans {
  /** Thousands of fans who follow when it's going well. */
  casual: number;
  /** Thousands who come no matter what. */
  dieHard: number;
}

export interface TeamBusiness {
  stadium: Stadium;
  fans: Fans;
  /** Ticket and concession prices ($ per fan). */
  ticketPrice: number;
  concessionPrice: number;
  /** Money in the bank ($K). */
  cash: number;
  /** Stadium work under way. */
  pending?: StadiumProject[];
  /** How the fans feel (0-100; 55 is content): happy fans buy more tickets. */
  mood?: number;
}

export interface SeasonFinances {
  season: number;
  attendance: number;
  sellouts: number;
  revenue: { tickets: number; concessions: number; merch: number; sponsors: number; localMedia: number; nationalMedia: number; sharing: number; suites: number; naming: number };
  expenses: { payroll: number; staff: number; stadium: number; debt: number };
  profit: number;
  /** Fans at the end of the season. */
  fans: Fans;
}

export type MarketSize = "small" | "mid" | "large";

/** The league's economy against its first season: everything local grows with the salary cap. */
export function economy(leagueSeed: string, season: number): number {
  return salaryCap(leagueSeed, season) / 300_000;
}

export function marketSize(abbr: string): MarketSize {
  const pop = POPULATION[abbr] ?? 3;
  return pop >= 9 ? "large" : pop >= 4 ? "mid" : "small";
}

const STADIUM_WORDS = ["Field", "Stadium", "Park", "Bowl", "Coliseum", "Grounds"];

/** A team's business at the start of a dynasty: fans from its market, a stadium sized to them. */
export function startBusiness(team: Team, leagueSeed: string): TeamBusiness {
  const pop = POPULATION[team.abbr] ?? 3;
  const rng = new Rng(`${leagueSeed}:business:${team.abbr}`);
  // Small states: proportionally more die-hards (a loyal base around the team).
  const fans = { casual: Math.round(pop * 25), dieHard: Math.round(pop * 6 + 30) };
  const capacity = Math.round(Math.min(80, Math.max(45, 40 + pop * 1.2)) * 1000);
  return {
    stadium: { name: `${team.nickname} ${rng.pick(STADIUM_WORDS)}`, capacity, quality: rng.int(40, 70), dome: rng.chance(0.15), debt: 0 },
    fans,
    ticketPrice: BUSINESS_RULES.baseTicket,
    concessionPrice: BUSINESS_RULES.baseConcessions,
    cash: 50_000,
  };
}

/** Everyone's business at the start (every team gets one). */
export function startLeagueBusiness(league: League): Record<string, TeamBusiness> {
  return Object.fromEntries(Object.values(league.teams).map((t) => [t.abbr, startBusiness(t, league.seed)]));
}

/** How keen casual fans are right now (0.3-1.3): winning this season, a little of last season's glow. */
export function interest(winPct: number, lastWinPct = 0.5): number {
  return Math.max(0.3, Math.min(1.3, 0.3 + 1.2 * (0.7 * winPct + 0.3 * lastWinPct)));
}

/** The crowd for one home game, in fans (capped by the stadium). `econ`: prices people expect grow with the league. */
export function attendance(b: TeamBusiness, keen: number, econ = 1): number {
  const { regionalDraw, baseTicket, elasticity } = BUSINESS_RULES;
  const demand = (regionalDraw * keen + b.fans.dieHard * 0.1 + b.fans.casual * 0.035 * keen) * 1000;
  const price = Math.pow((baseTicket * econ) / b.ticketPrice, elasticity);
  // A better stadium draws a few more (and a dome never gets rained out); so do happy fans.
  const comfort = 1 + (b.stadium.quality - 50) / 500 + (covered(b.stadium) ? 0.02 : 0);
  const mood = 0.9 + (0.2 * (b.mood ?? 55)) / 100;
  return Math.round(Math.min(b.stadium.capacity, demand * price * comfort * mood));
}

/** One home game's gate. */
export interface Gate {
  week: number;
  opponent: string;
  attendance: number;
  sellout: boolean;
}

/** Each home game's crowd so far (fans grow keener as the team wins). */
export function homeGates(team: Team, b: TeamBusiness, results: readonly GameSummary[], lastWinPct: number, econ = 1): Gate[] {
  const gates: Gate[] = [];
  let wins = 0;
  let games = 0;
  for (const g of results.filter((r) => r.home === team.abbr || r.away === team.abbr).sort((x, y) => x.week - y.week)) {
    if (g.home === team.abbr) {
      const crowd = attendance(b, interest(games > 0 ? wins / games : lastWinPct, lastWinPct), econ);
      gates.push({ week: g.week, opponent: g.away, attendance: crowd, sellout: crowd >= b.stadium.capacity });
    }
    games++;
    if (g.winner === team.abbr) wins++;
  }
  return gates;
}

/** The season's books for one team, from its home games (in order) and its record. */
export function seasonFinances(
  league: League,
  team: Team,
  b: TeamBusiness,
  season: number,
  results: readonly GameSummary[],
  record: TeamRecord | undefined,
  lastWinPct: number,
  sharingCheck: number,
): SeasonFinances {
  const econ = economy(league.seed, season);
  const gates = homeGates(team, b, results, lastWinPct, econ);
  const attendanceTotal = gates.reduce((n, g) => n + g.attendance, 0);
  const sellouts = gates.filter((g) => g.sellout).length;
  const tickets = (attendanceTotal * b.ticketPrice) / 1000;
  const concessions = (attendanceTotal * b.concessionPrice) / 1000;
  const pct = record ? (record.wins + 0.5 * record.ties) / Math.max(1, record.wins + record.losses + record.ties) : 0.5;
  const keen = interest(pct, lastWinPct);
  const pop = POPULATION[team.abbr] ?? 3;
  const merch = (b.fans.casual * 15 * keen + b.fans.dieHard * 40) * (0.8 + 0.4 * keen) * econ;
  const sponsors = (5 + pop * 1.5) * 1000 * (0.85 + 0.3 * keen) * econ;
  const localMedia = (3 + pop * 0.8) * 1000 * econ;
  // Premium seating sells to local businesses: more in bigger markets, more when you win.
  const suites = (b.stadium.suites ?? 0) * (2_000 + pop * 400) * (0.8 + 0.3 * keen) * econ;
  const local = tickets + concessions + merch + sponsors + localMedia + suites;
  const kept = local * (1 - BUSINESS_RULES.sharing);
  const stadiumCosts = ((b.stadium.capacity / 1000) * 150 + b.stadium.quality * 60 + (roofOf(b.stadium) === "dome" ? 4_000 : roofOf(b.stadium) === "retractable" ? 5_000 : 0) + (surfaceOf(b.stadium) === "grass" ? 800 : 0)) * econ;
  const debtService = b.stadium.debt * (BOND.interest + BOND.principal);
  const naming = b.stadium.naming && b.stadium.naming.through >= season ? b.stadium.naming.perYear : 0;
  const revenue = {
    tickets: Math.round(tickets * (1 - BUSINESS_RULES.sharing)),
    concessions: Math.round(concessions * (1 - BUSINESS_RULES.sharing)),
    merch: Math.round(merch * (1 - BUSINESS_RULES.sharing)),
    sponsors: Math.round(sponsors * (1 - BUSINESS_RULES.sharing)),
    localMedia: Math.round(localMedia * (1 - BUSINESS_RULES.sharing)),
    nationalMedia: Math.round(BUSINESS_RULES.nationalMedia * salaryCap(league.seed, season)),
    sharing: Math.round(sharingCheck),
    suites: Math.round(suites * (1 - BUSINESS_RULES.sharing)),
    naming: Math.round(naming),
  };
  const expenses = { payroll: Math.round(payroll(team, season)), staff: Math.round(staffSpending(team, season)), stadium: Math.round(stadiumCosts), debt: Math.round(debtService) };
  const income = kept + revenue.nationalMedia + revenue.sharing + revenue.naming;
  const profit = Math.round(income - expenses.payroll - expenses.staff - expenses.stadium - expenses.debt);
  return { season, attendance: attendanceTotal, sellouts, revenue, expenses, profit, fans: nextFans(b.fans, team.abbr, pct) };
}

/**
 * Fans after a season: casual fans follow winning (and leave when it stops),
 * die-hards grow slowly with success and barely shrink.
 */
export function nextFans(f: Fans, abbr: string, winPct: number): Fans {
  const pop = POPULATION[abbr] ?? 3;
  const base = pop * 25;
  const target = base * (0.6 + 0.8 * winPct);
  const casual = f.casual + (target - f.casual) * 0.35;
  const dieHard = f.dieHard * (winPct >= 0.6 ? 1.03 : winPct < 0.35 ? 0.99 : 1.01);
  return { casual: Math.round(casual), dieHard: Math.round(dieHard) };
}

/** Each team's revenue-sharing check: an even split of the pooled local revenue. */
export function sharingChecks(league: League, business: Record<string, TeamBusiness>, season: number, results: readonly GameSummary[], records: ReadonlyMap<string, TeamRecord>, lastWinPct: ReadonlyMap<string, number>): number {
  let pool = 0;
  const teams = Object.values(league.teams);
  for (const t of teams) {
    const b = business[t.abbr];
    if (!b) continue;
    const f = seasonFinances(league, t, b, season, results, records.get(t.abbr), lastWinPct.get(t.abbr) ?? 0.5, 0);
    const local = (f.revenue.tickets + f.revenue.concessions + f.revenue.merch + f.revenue.sponsors + f.revenue.localMedia + f.revenue.suites) / (1 - BUSINESS_RULES.sharing);
    pool += local * BUSINESS_RULES.sharing;
  }
  return pool / teams.length;
}

/**
 * Close the books on a season for every team: finances, cash and fans; bonds
 * paid down; stadium projects open; naming deals run out. Then the AI teams
 * (all but `humans`) make their business moves for next season.
 */
export function closeSeasonBooks(
  league: League,
  business: Record<string, TeamBusiness>,
  season: number,
  results: readonly GameSummary[],
  records: ReadonlyMap<string, TeamRecord>,
  lastWinPct: ReadonlyMap<string, number>,
  humans: ReadonlySet<string> = new Set(),
): { business: Record<string, TeamBusiness>; finances: Record<string, SeasonFinances> } {
  const check = sharingChecks(league, business, season, results, records, lastWinPct);
  const next: Record<string, TeamBusiness> = {};
  const finances: Record<string, SeasonFinances> = {};
  for (const t of Object.values(league.teams)) {
    const b = business[t.abbr] ?? startBusiness(t, league.seed);
    const f = seasonFinances(league, t, b, season, results, records.get(t.abbr), lastWinPct.get(t.abbr) ?? 0.5, check);
    finances[t.abbr] = f;
    const after = openProjects({ ...b, fans: f.fans, cash: Math.round(b.cash + f.profit), stadium: { ...b.stadium, debt: Math.round(b.stadium.debt * (1 - BOND.principal)) } }, season);
    // AI teams' fans feel the way the season went (yours: what you've said and done).
    const r = records.get(t.abbr);
    const pct = r ? (r.wins + 0.5 * r.ties) / Math.max(1, r.wins + r.losses + r.ties) : 0.5;
    next[t.abbr] = humans.has(t.abbr) ? after : { ...aiBusinessMoves(after, f, t, league.seed, season + 1), mood: Math.round(40 + 40 * pct) };
  }
  return { business: next, finances };
}

/** Bonds: interest and the share of the debt paid down each season. */
export const BOND = { interest: 0.08, principal: 0.05 };

const LAND: Record<MarketSize, number> = { small: 0.75, mid: 1, large: 1.3 };

/** Stadium projects: what each does and what it costs (before the local cost of building). */
export const PROJECTS: Record<ProjectKind, { name: string; does: string; cost: number }> = {
  expand: { name: "Add 5,000 seats", does: "+5,000 capacity", cost: 60_000 },
  videoBoard: { name: "New video board", does: "+8 amenities", cost: 15_000 },
  suites: { name: "Luxury suites", does: "+10 amenities and premium revenue every season", cost: 45_000 },
  dome: { name: "Put a dome on it", does: "A roof: a few more fans every game, never a rainout", cost: 250_000 },
  retractable: { name: "Retractable roof", does: "Open on a fine day, closed against rain, snow and cold", cost: 320_000 },
  turf: { name: "Lay turf", does: "A fast field (a few more big plays, a few more injuries)", cost: 6_000 },
  grass: { name: "Grow grass", does: "A natural field (a little slower, a little kinder on the body)", cost: 9_000 },
  steep: { name: "Steeper stands", does: "Rebuild the bowl right on top of the field: louder, 3,000 fewer seats", cost: 110_000 },
};

/** What a project costs here (cheaper to build in small states). */
export function projectCost(kind: ProjectKind, abbr: string): number {
  return Math.round(PROJECTS[kind].cost * LAND[marketSize(abbr)]);
}

/** What's in the way of a project (empty = it can start). */
export function projectProblems(b: TeamBusiness, kind: ProjectKind, abbr: string, financing: "cash" | "bonds"): string[] {
  const problems: string[] = [];
  if ((b.pending ?? []).some((p) => p.kind === kind)) problems.push("That's already under way.");
  if (kind === "dome" && roofOf(b.stadium) === "dome") problems.push("The stadium already has a dome.");
  if (kind === "retractable" && roofOf(b.stadium) !== "open") problems.push("The stadium already has a roof.");
  if (kind === "turf" && surfaceOf(b.stadium) === "turf") problems.push("The field is already turf.");
  if (kind === "grass" && surfaceOf(b.stadium) === "grass") problems.push("The field is already grass.");
  if (kind === "grass" && roofOf(b.stadium) === "dome") problems.push("Grass won't grow under a dome.");
  if (kind === "steep" && standsOf(b.stadium) === "steep") problems.push("The stands are already steep.");
  if (kind === "videoBoard" && videoBoardOf(b.stadium) >= VIDEO_BOARD_MAX) problems.push("The boards don't get any bigger.");
  // Two projects on the same thing can't run at once (a roof and a dome, grass and turf).
  const clash: Partial<Record<ProjectKind, ProjectKind>> = { dome: "retractable", retractable: "dome", turf: "grass", grass: "turf" };
  if ((b.pending ?? []).some((p) => p.kind === clash[kind])) problems.push("Something else is being built there.");
  if (kind === "expand" && b.stadium.capacity >= 95_000) problems.push("The stadium can't get any bigger.");
  if (kind === "suites" && (b.stadium.suites ?? 0) >= 3) problems.push("There's no room for more suites.");
  const cost = projectCost(kind, abbr);
  if (financing === "cash" && b.cash < cost) problems.push(`Not enough cash (${Math.round(cost / 1000)}M needed).`);
  if (financing === "bonds" && b.stadium.debt + cost > 600_000) problems.push("The bank won't lend that much more.");
  return problems;
}

/** Start a project: paid now in cash, or added to the stadium's debt. It opens next season. */
export function startProject(b: TeamBusiness, kind: ProjectKind, abbr: string, financing: "cash" | "bonds", season: number): TeamBusiness {
  const cost = projectCost(kind, abbr);
  return {
    ...b,
    cash: financing === "cash" ? b.cash - cost : b.cash,
    stadium: financing === "bonds" ? { ...b.stadium, debt: b.stadium.debt + cost } : b.stadium,
    pending: [...(b.pending ?? []), { kind, season, cost, financing }],
  };
}

/** Projects started this season open for the next one. */
export function openProjects(b: TeamBusiness, season: number): TeamBusiness {
  const done = (b.pending ?? []).filter((p) => p.season <= season);
  if (done.length === 0) return b;
  const st = { ...b.stadium };
  for (const p of done) {
    if (p.kind === "expand") st.capacity += 5_000;
    if (p.kind === "videoBoard") {
      st.quality = Math.min(100, st.quality + 8);
      st.videoBoard = Math.min(VIDEO_BOARD_MAX, videoBoardOf(st) + 1);
    }
    if (p.kind === "suites") {
      st.quality = Math.min(100, st.quality + 10);
      st.suites = (st.suites ?? 0) + 1;
    }
    if (p.kind === "dome") {
      st.dome = true;
      st.roof = "dome";
      // Under a dome, it's turf.
      st.surface = "turf";
    }
    if (p.kind === "retractable") {
      st.surface = surfaceOf(st);
      st.roof = "retractable";
      st.dome = false;
    }
    if (p.kind === "turf") st.surface = "turf";
    if (p.kind === "grass") st.surface = "grass";
    if (p.kind === "steep") {
      st.stands = "steep";
      st.capacity = Math.max(30_000, st.capacity - 3_000);
    }
  }
  return { ...b, stadium: st, pending: (b.pending ?? []).filter((p) => p.season > season) };
}

export interface NamingOffer {
  sponsor: string;
  perYear: number;
  years: number;
}

const COMPANIES = ["Mutual", "Federal Savings", "Energy", "Health", "Credit Union", "Logistics", "Insurance", "Motors", "Telecom", "Grocers"];
const PLACES = ["Ridgeline", "Prairie", "Summit", "Harbor", "Pinecrest", "Redstone", "Bluewater", "Northgate", "Ironwood", "Silverlake", "Cottonwood", "Granite Peak"];

/** This season's naming-rights offers from (fictional) local companies: more money in bigger markets. */
export function namingOffers(leagueSeed: string, abbr: string, season: number): NamingOffer[] {
  const rng = new Rng(`${leagueSeed}:naming:${abbr}:${season}`);
  const pop = POPULATION[abbr] ?? 3;
  const base = 2_000 + pop * 600;
  return [0, 1, 2].map(() => {
    const years = rng.int(5, 10);
    return { sponsor: `${rng.pick(PLACES)} ${rng.pick(COMPANIES)}`, perYear: Math.round((base * (0.8 + rng.next() * 0.4) * (1 + (10 - years) * 0.03)) / 10) * 10, years };
  });
}

/** Put a sponsor's name on the stadium (from next season, for the deal's length). */
export function acceptNaming(b: TeamBusiness, offer: NamingOffer, season: number): TeamBusiness {
  const word = b.stadium.name.split(" ").at(-1);
  return { ...b, stadium: { ...b.stadium, name: `${offer.sponsor} ${word}`, naming: { sponsor: offer.sponsor, perYear: offer.perYear, through: season + offer.years } } };
}

/** Is the stadium free to sell naming rights? */
export function namingAvailable(b: TeamBusiness, season: number): boolean {
  return !b.stadium.naming || b.stadium.naming.through < season;
}

/**
 * An AI team's business moves for next season: price toward full (but not
 * turning fans away), build when the stadium's full and the money's there,
 * freshen up a tired stadium, and sell the naming rights.
 */
function aiBusinessMoves(b: TeamBusiness, f: SeasonFinances, team: Team, leagueSeed: string, next: number): TeamBusiness {
  let out = b;
  const full = f.attendance / (BUSINESS_RULES.homeGames * b.stadium.capacity);
  const price = full >= 0.98 ? b.ticketPrice * 1.06 : full < 0.7 ? b.ticketPrice * 0.95 : b.ticketPrice;
  out = { ...out, ticketPrice: Math.round(Math.max(60, Math.min(180, price))) };
  if (full >= 0.98 && projectProblems(out, "expand", team.abbr, "cash").length === 0 && out.cash > projectCost("expand", team.abbr) * 2) out = startProject(out, "expand", team.abbr, "cash", next - 1);
  if (out.stadium.quality < 50 && projectProblems(out, "videoBoard", team.abbr, "cash").length === 0 && out.cash > 60_000) out = startProject(out, "videoBoard", team.abbr, "cash", next - 1);
  // Rich teams where the weather turns bad put a roof on it (rarely: it's a big job).
  const climate = REGION_CLIMATE[team.region ?? regionOf(team.abbr) ?? ""];
  const roofCost = projectCost("retractable", team.abbr);
  const roofYear = new Rng(`${leagueSeed}:${team.abbr}:${next}:roof`).chance(0.2);
  if (climate && climate.late < 40 && roofOf(out.stadium) === "open" && out.stadium.debt === 0 && out.cash > roofCost * 0.4 && roofYear && projectProblems(out, "retractable", team.abbr, "bonds").length === 0) {
    out = startProject(out, "retractable", team.abbr, "bonds", next - 1);
  }
  if (namingAvailable(out, next)) {
    const best = namingOffers(leagueSeed, team.abbr, next).sort((x, y) => y.perYear - x.perYear)[0];
    if (best) out = acceptNaming(out, best, next - 1);
  }
  return out;
}

/** How loud a stadium gets, 0-1: its die-hards' share of the fan base and how many it holds (domes trap the sound). */
export function crowdNoise(b: TeamBusiness): number {
  const total = b.fans.casual + b.fans.dieHard;
  const dieHard = total > 0 ? b.fans.dieHard / total : 0.38;
  const size = (b.stadium.capacity - 45_000) / 35_000;
  // A typical crowd (about 38% die-hards) is 0.5.
  // A dome traps the sound; steep stands right on top of the field are louder still.
  const roof = roofOf(b.stadium) === "dome" ? 0.1 : 0;
  const stands = standsOf(b.stadium) === "steep" ? 0.12 : 0;
  return Math.round(Math.max(0.1, Math.min(1, 0.5 + (dieHard - 0.38) + 0.15 * size + roof + stands)) * 100) / 100;
}

/** Put every team's stadium (dome, crowd noise) on the team, where games see it. */
export function syncVenues<D extends { league: League; business?: Record<string, TeamBusiness> }>(dynasty: D): D {
  const business = dynasty.business ?? startLeagueBusiness(dynasty.league);
  let teams: Record<string, Team> | null = null;
  for (const [abbr, t] of Object.entries(dynasty.league.teams)) {
    const b = business[abbr];
    if (!b) continue;
    const venue = { dome: roofOf(b.stadium) === "dome", noise: crowdNoise(b), roof: roofOf(b.stadium), surface: surfaceOf(b.stadium), stands: standsOf(b.stadium) };
    if (t.venue && JSON.stringify(t.venue) === JSON.stringify(venue)) continue;
    teams ??= { ...dynasty.league.teams };
    teams[abbr] = { ...t, venue };
  }
  return teams ? { ...dynasty, league: { ...dynasty.league, teams } } : dynasty;
}

/** Why the stadium can't be renamed now, or null. */
export function renameProblem(b: TeamBusiness, name: string, season: number): string | null {
  if (b.stadium.naming && b.stadium.naming.through >= season) return `${b.stadium.naming.sponsor} has the naming rights through ${b.stadium.naming.through}`;
  return stadiumNameProblem(name);
}

/** Name the stadium yourself (free; not while a sponsor's name is on it). */
export function renameStadium(b: TeamBusiness, name: string, season: number): TeamBusiness {
  const problem = renameProblem(b, name, season);
  if (problem) throw new Error(problem);
  return { ...b, stadium: { ...b.stadium, name: name.trim().replace(/\s+/g, " ") } };
}
