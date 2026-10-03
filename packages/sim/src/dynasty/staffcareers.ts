// Staff careers: records, Coach of the Year, retirements, firings, poaching
// and hiring. Runs once per offseason, before the draft (so a new GM drafts
// and a new head coach shapes development).
import { teamChoices, type PerTeam } from "../choices.ts";
import { clampRating } from "../model/ratings.ts";
import {
  staffOverall,
  type HeadCoach,
  type StaffContract,
  type StaffMember,
  type StaffRole,
  type TeamStaff,
} from "../model/staff.ts";
import { Rng } from "../rng.ts";
import { salaryCap } from "../contracts/cap.ts";
import { STAFF_PAY, staffAsk, staffBudget, staffBuyout, staffContract } from "../contracts/staffcontracts.ts";
import {
  generateDefensiveCoordinator,
  generateGeneralManager,
  generateHeadCoach,
  generateOffensiveCoordinator,
  generateScoutingDirector,
} from "../gen/staff-gen.ts";
import { allTeams, teamRatings, type League } from "../league/league.ts";
import type { PlayoffResult } from "../league/playoffs.ts";
import { computeRecords, winPct, type GameSummary, type WLT } from "../league/standings.ts";

type Slot = keyof TeamStaff;
const SLOTS: Slot[] = ["hc", "gm", "oc", "dc", "scout"];
const SLOT_ROLE: Record<Slot, StaffRole> = { hc: "HC", gm: "GM", oc: "OC", dc: "DC", scout: "SCOUT" };

export interface StaffCareer {
  id: string;
  name: string;
  /** Every job held: team, role and seasons (to = last season in the job). */
  stints: Array<{ team: string; role: StaffRole; from: number; to: number; wins: number; losses: number; titles: number }>;
  /** As a head coach. */
  record: WLT;
  playoffTrips: number;
  titles: number;
  coachOfTheYear: number;
  timesFired: number;
  status: "active" | "unemployed" | "retired";
}

export interface StaffChange {
  team: string;
  role: StaffRole;
  /** Name of the person leaving (null when filling a new vacancy). */
  out: string | null;
  in: string;
  reason: "fired" | "retired" | "hired away" | "contract expired";
  /** Buyout the team still owes a fired staff member (the rest of his deal), $K. */
  buyout?: number;
  /** The new hire's deal. */
  contract?: StaffContract;
  /** Where the new hire came from. */
  from: "free agent" | "promoted coordinator" | "new face";
}

export interface CoachOfTheYear {
  id: string;
  name: string;
  team: string;
  record: string;
  /** Wins above what the roster was expected to produce. */
  overExpected: number;
}

export interface StaffOffseasonResult {
  league: League;
  pool: StaffMember[];
  careers: Map<string, StaffCareer>;
  changes: StaffChange[];
  /** Staff whose expiring deals were renewed (same seat, new contract). */
  renewals: StaffChange[];
  coachOfTheYear: CoachOfTheYear | null;
}

/** Firing rules for head coaches (after at least this many seasons with the team). */
export const HOT_SEAT = { minTenure: 2, awful: 0.35, poorTwoYears: 0.45 };
/** Staff retire for sure at this age; from `startAge` the chance climbs yearly. */
export const STAFF_RETIREMENT = { startAge: 64, certainAge: 70 };

const fullName = (m: StaffMember) => `${m.firstName} ${m.lastName}`;

/**
 * Preseason expectation: half roster strength, half last season's record
 * (a repeat winner is expected to win again, not a surprise).
 */
function expectedWinPct(league: League, lastSeasonPct: Map<string, number>): Map<string, number> {
  const ratings = allTeams(league).map((t) => ({ t: t.abbr, r: teamRatings(t).overall }));
  const mean = ratings.reduce((s, x) => s + x.r, 0) / ratings.length;
  return new Map(
    ratings.map(({ t, r }) => {
      const roster = Math.max(0.1, Math.min(0.9, 0.5 + 0.06 * (r - mean)));
      const last = lastSeasonPct.get(t);
      return [t, last === undefined ? roster : 0.5 * roster + 0.5 * last];
    }),
  );
}

function careerFor(careers: Map<string, StaffCareer>, m: StaffMember): StaffCareer {
  let c = careers.get(m.id);
  if (!c) {
    c = { id: m.id, name: fullName(m), stints: [], record: { wins: 0, losses: 0, ties: 0 }, playoffTrips: 0, titles: 0, coachOfTheYear: 0, timesFired: 0, status: "active" };
    careers.set(m.id, c);
  } else {
    c = { ...c, stints: c.stints.map((s) => ({ ...s })), record: { ...c.record } };
    careers.set(m.id, c);
  }
  return c;
}

/** Turn a successful coordinator into a head coaching candidate (same person). */
function asHeadCoach(rng: Rng, m: StaffMember): HeadCoach {
  const calling = m.role === "OC" || m.role === "DC" ? m.playCalling : 55;
  return {
    id: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    age: m.age,
    experience: 0,
    tenure: 0,
    role: "HC",
    gameManagement: clampRating(calling + rng.normal(0, 6)),
    discipline: clampRating(rng.normal(56, 9)),
    development: clampRating(rng.normal(56, 9)),
    aggressiveness: clampRating(rng.normal(52, 15)),
  };
}

/**
 * What a candidate's track record in this role is worth when hiring, in
 * rating points: winning (weighted by how much evidence there is) and titles.
 */
export function reputation(career: StaffCareer | undefined, role: StaffRole): number {
  if (!career) return 0;
  const stints = career.stints.filter((s) => s.role === role);
  const games = stints.reduce((n, s) => n + s.wins + s.losses, 0);
  if (games === 0) return 0;
  const pct = stints.reduce((n, s) => n + s.wins, 0) / games;
  const titles = stints.reduce((n, s) => n + s.titles, 0);
  const weight = Math.min(1, games / 60);
  return Math.max(-6, Math.min(10, 25 * (pct - 0.5) * weight + 2.5 * titles));
}

const GENERATORS: Record<StaffRole, (rng: Rng, id: string) => StaffMember> = {
  HC: generateHeadCoach,
  OC: generateOffensiveCoordinator,
  DC: generateDefensiveCoordinator,
  GM: generateGeneralManager,
  SCOUT: generateScoutingDirector,
};

/** A year older; young staff improve a little, veterans past 65 fade. */
function ageStaff(rng: Rng, m: StaffMember, employed: boolean, newHire: boolean): StaffMember {
  const drift = () => (m.age < 50 ? rng.normal(0.8, 1.5) : m.age < 65 ? rng.normal(0, 1) : rng.normal(-1, 1.5));
  const r = (x: number) => clampRating(x + Math.round(drift()));
  const aged = { ...m, age: m.age + 1, experience: m.experience + (employed ? 1 : 0), tenure: employed && !newHire ? m.tenure + 1 : m.tenure };
  switch (aged.role) {
    case "HC":
      return { ...aged, gameManagement: r(aged.gameManagement), discipline: r(aged.discipline), development: r(aged.development) };
    case "OC":
      return { ...aged, playCalling: r(aged.playCalling), passingGame: r(aged.passingGame), runningGame: r(aged.runningGame) };
    case "DC":
      return { ...aged, playCalling: r(aged.playCalling), passDefense: r(aged.passDefense), runDefense: r(aged.runDefense) };
    case "GM":
      return { ...aged, talentEvaluation: r(aged.talentEvaluation) };
    case "SCOUT":
      return { ...aged, scouting: r(aged.scouting) };
  }
}

/**
 * One staff offseason. `league` is the league as the season was played (its
 * rosters set expectations); `lastSeasonPct` is each team's win pct the season
 * before (for two-year evaluations); `order` is the draft order (worst first),
 * which is also the order teams fill vacancies.
 */
export function runStaffOffseason(
  league: League,
  results: readonly GameSummary[],
  playoffs: PlayoffResult,
  order: string[],
  pool: readonly StaffMember[],
  careersIn: Map<string, StaffCareer>,
  lastSeasonPct: Map<string, number> = new Map(),
): StaffOffseasonResult {
  return staffHiring(staffReleases(league, results, playoffs, order, pool, careersIn, lastSeasonPct));
}

/** A team's own calls on its staff (the user's team); everyone else is the AI's. */
export interface StaffDecisions {
  team: string;
  /** Seats whose current holder you fire (buying out the rest of his deal). */
  fire: ReadonlySet<Slot>;
  /** Seats with an expiring deal that you renew; any other expiring deal ends. */
  renew: ReadonlySet<Slot>;
}

/** A team's own hires: seat -> candidate id (from staffCandidates). Made before the AI teams hire. */
export interface StaffHires {
  team: string;
  picks: ReadonlyMap<Slot, string>;
}

type Vacancy = { team: string; slot: Slot; out: string | null; reason: StaffChange["reason"]; buyout?: number };

/** The staff offseason after everyone who's leaving has left, before anyone is hired. */
export interface StaffReleases {
  league: League;
  order: string[];
  season: number;
  next: number;
  capNext: number;
  budget: number;
  rng: Rng;
  careers: Map<string, StaffCareer>;
  coty: CoachOfTheYear | null;
  staffs: Map<string, Partial<TeamStaff>>;
  deadMoney: Map<string, Array<{ season: number; amount: number; name: string }>>;
  vacancies: Vacancy[];
  renewals: StaffChange[];
  pool: StaffMember[];
  letGo: Set<string>;
  offenseRank: Map<string, number>;
  defenseRank: Map<string, number>;
}

export function staffReleases(
  league: League,
  results: readonly GameSummary[],
  playoffs: PlayoffResult,
  order: string[],
  pool: readonly StaffMember[],
  careersIn: Map<string, StaffCareer>,
  lastSeasonPct: Map<string, number> = new Map(),
  decisions?: PerTeam<StaffDecisions>,
): StaffReleases {
  const decided = teamChoices(decisions);
  const season = league.season;
  const rng = new Rng(`${league.seed}:${season}:staff`);
  const careers = new Map(careersIn);
  const records = computeRecords(league, results);
  const expected = expectedWinPct(league, lastSeasonPct);
  const inField = new Set(playoffs.seeds.map((s) => s.team));
  const playoffWins = new Map<string, number>();
  for (const g of playoffs.games) playoffWins.set(g.summary.winner!, (playoffWins.get(g.summary.winner!) ?? 0) + 1);

  // --- this season into the record books ---
  for (const t of allTeams(league)) {
    for (const slot of SLOTS) {
      const m = t.staff?.[slot];
      if (!m) continue;
      const c = careerFor(careers, m);
      const last = c.stints.at(-1);
      if (last && last.team === t.abbr && last.role === m.role && last.to === season - 1) last.to = season;
      else c.stints.push({ team: t.abbr, role: m.role, from: season, to: season, wins: 0, losses: 0, titles: 0 });
      c.status = "active";
      const stint = c.stints.at(-1)!;
      const r = records.get(t.abbr)!;
      stint.wins += r.wins;
      stint.losses += r.losses;
      if (playoffs.champion === t.abbr) stint.titles++;
      if (slot === "hc") {
        c.record.wins += r.wins;
        c.record.losses += r.losses;
        c.record.ties += r.ties;
        if (inField.has(t.abbr)) c.playoffTrips++;
        if (playoffs.champion === t.abbr) c.titles++;
      }
    }
  }

  // --- Coach of the Year: most above expectations (a bit extra for playoff wins) ---
  let coty: CoachOfTheYear | null = null;
  let bestScore = -Infinity;
  for (const t of allTeams(league)) {
    const hc = t.staff?.hc;
    if (!hc) continue;
    const r = records.get(t.abbr)!;
    const over = (winPct(r) - expected.get(t.abbr)!) * (r.wins + r.losses + r.ties);
    const score = over + 1.5 * (playoffWins.get(t.abbr) ?? 0);
    if (score > bestScore) {
      bestScore = score;
      coty = { id: hc.id, name: fullName(hc), team: t.abbr, record: `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ""}`, overExpected: over };
    }
  }
  if (coty) careerFor(careers, { ...allTeams(league).find((t) => t.abbr === coty!.team)!.staff!.hc }).coachOfTheYear++;

  // --- who leaves: retirements, expiring deals, firings ---
  const next = season + 1;
  const capNext = salaryCap(league.seed, next);
  const budget = staffBudget(capNext);
  const staffs = new Map<string, Partial<TeamStaff>>();
  const deadMoney = new Map<string, Array<{ season: number; amount: number; name: string }>>();
  const vacancies: Array<{ team: string; slot: Slot; out: string | null; reason: StaffChange["reason"]; buyout?: number }> = [];
  const renewals: StaffChange[] = [];
  const newPool: StaffMember[] = [...pool];
  /** Staff each team let go this offseason (it won't rehire them). */
  const letGo = new Set<string>();
  const pointsRank = (key: "pointsFor" | "pointsAgainst") =>
    new Map(
      [...records.values()]
        .sort((a, b) => (key === "pointsFor" ? b.pointsFor - a.pointsFor : a.pointsAgainst - b.pointsAgainst))
        .map((r, i) => [r.team, i + 1]),
    );
  const offenseRank = pointsRank("pointsFor");
  const defenseRank = pointsRank("pointsAgainst");

  for (const t of allTeams(league)) {
    const s: Partial<TeamStaff> = { ...t.staff };
    staffs.set(t.abbr, s);
    deadMoney.set(t.abbr, (t.staffDeadMoney ?? []).filter((d) => d.season >= next).map((d) => ({ ...d })));
    const pct = winPct(records.get(t.abbr)!);
    const prev = lastSeasonPct.get(t.abbr) ?? pct;
    const madePlayoffs = inField.has(t.abbr);
    /** Let someone go: to the unemployed pool, his seat open. Firing him leaves a buyout. */
    const release = (slot: Slot, m: StaffMember, reason: "fired" | "contract expired") => {
      const c = careerFor(careers, m);
      c.status = "unemployed";
      let buyout = 0;
      if (reason === "fired") {
        c.timesFired++;
        buyout = staffBuyout(m.contract, next);
        for (let y = next; m.contract && y <= m.contract.through; y++) deadMoney.get(t.abbr)!.push({ season: y, amount: m.contract.salary, name: fullName(m) });
      }
      const { contract: _ended, ...free } = m;
      newPool.push(free as StaffMember);
      letGo.add(`${t.abbr}:${m.id}`);
      delete s[slot];
      vacancies.push({ team: t.abbr, slot, out: fullName(m), reason, ...(buyout ? { buyout } : {}) });
    };
    /** A big buyout buys patience: the chance a team goes through with a firing. */
    const willPay = (m: StaffMember) => Math.max(0.35, Math.min(1, 1 - staffBuyout(m.contract, next) / (1.5 * budget)));

    for (const slot of SLOTS) {
      const m = s[slot];
      if (!m) continue;
      const retireChance = m.age >= STAFF_RETIREMENT.certainAge ? 1 : m.age >= STAFF_RETIREMENT.startAge ? 0.15 + 0.07 * (m.age - STAFF_RETIREMENT.startAge) : 0;
      if (retireChance > 0 && rng.chance(retireChance)) {
        careerFor(careers, m).status = "retired";
        delete s[slot];
        vacancies.push({ team: t.abbr, slot, out: fullName(m), reason: "retired" });
      }
    }

    // Deals that just ran out: renewed if the job went well, otherwise he moves on.
    for (const slot of SLOTS) {
      const m = s[slot];
      if (!m?.contract || m.contract.through > season) continue;
      const rank = slot === "oc" ? offenseRank.get(t.abbr)! : slot === "dc" ? defenseRank.get(t.abbr)! : 25;
      const doingWell =
        slot === "hc" ? madePlayoffs || pct >= 0.5 :
        slot === "gm" ? madePlayoffs || (pct + prev) / 2 >= 0.45 :
        slot === "scout" ? true : rank <= 35;
      // The raise has to fit the budget alongside everyone else and any buyouts.
      const others = SLOTS.filter((o) => o !== slot).reduce((sum, o) => sum + (s[o]?.contract && s[o]!.contract!.through >= next ? s[o]!.contract!.salary : 0), 0);
      const owed = deadMoney.get(t.abbr)!.filter((d) => d.season === next).reduce((sum, d) => sum + d.amount, 0);
      const affordable = staffAsk(m, capNext, reputation(careers.get(m.id), m.role)) <= budget - others - owed;
      const mine = decided.get(t.abbr);
      const keep = mine ? mine.renew.has(slot) : doingWell && affordable && rng.chance(0.9);
      if (keep) {
        const renewed = { ...m, contract: staffContract(rng, m, next, capNext, reputation(careers.get(m.id), m.role)) } as StaffMember;
        (s as Record<Slot, StaffMember>)[slot] = renewed;
        renewals.push({ team: t.abbr, role: m.role, out: fullName(m), in: fullName(m), reason: "contract expired", from: "free agent", contract: renewed.contract! });
      } else release(slot, m, "contract expired");
    }

    const own = decided.get(t.abbr);
    if (own) {
      // Your calls: only the seats you chose to clear.
      for (const slot of SLOTS) {
        const m = s[slot];
        if (m && own.fire.has(slot)) release(slot, m, "fired");
      }
      continue;
    }
    // Head coach on the hot seat (tenure counts seasons completed before this one).
    // A title, or a long winning run with this team, buys patience; so does a big buyout.
    const hc = s.hc;
    let hcFired = false;
    if (hc && !madePlayoffs && hc.tenure + 1 >= HOT_SEAT.minTenure) {
      const stint = careers.get(hc.id)?.stints.at(-1);
      const stintPct = stint && stint.wins + stint.losses > 0 ? stint.wins / (stint.wins + stint.losses) : 0.5;
      const secure = (stint?.titles ?? 0) > 0 || (hc.tenure >= 3 && stintPct >= 0.6);
      const awful = pct < HOT_SEAT.awful && rng.chance(secure ? 0.25 : 0.8);
      const slump = !secure && (pct + prev) / 2 < HOT_SEAT.poorTwoYears && rng.chance(0.6);
      if ((awful || slump) && rng.chance(willPay(hc))) hcFired = true;
    }
    if (hc && hcFired) release("hc", hc, "fired");
    // Coordinators: often go with a fired head coach, or after a bottom-five unit.
    for (const slot of ["oc", "dc"] as const) {
      const m = s[slot];
      if (!m) continue;
      const rank = slot === "oc" ? offenseRank.get(t.abbr)! : defenseRank.get(t.abbr)!;
      const fired = (hcFired && rng.chance(0.5)) || (rank >= 46 && m.tenure + 1 >= 2 && rng.chance(0.3));
      if (fired && rng.chance(willPay(m))) release(slot, m, "fired");
    }
    // GM after several poor years.
    const gm = s.gm;
    if (gm && gm.tenure + 1 >= 4 && (pct + prev) / 2 < 0.4 && !madePlayoffs && rng.chance(0.5) && rng.chance(willPay(gm))) release("gm", gm, "fired");
  }

  return { league, order, season, next, capNext, budget, rng, careers, coty, staffs, deadMoney, vacancies, renewals, pool: newPool, letGo, offenseRank, defenseRank };
}

type Candidate = { m: StaffMember; from: StaffChange["from"]; source?: { team: string; slot: Slot } };

/** One candidate for an open seat, as the hiring team sees him. */
export interface StaffCandidate {
  member: StaffMember;
  from: StaffChange["from"];
  /** For a coordinator being poached: his current team and seat. */
  currentTeam?: string;
  currentSlot?: "oc" | "dc";
  /** What he'd sign for a year ($K), and what his track record is worth in hiring. */
  ask: number;
  reputation: number;
  overall: number;
}

export interface StaffOpening {
  slot: Slot;
  role: StaffRole;
  out: string | null;
  reason: StaffChange["reason"];
  candidates: StaffCandidate[];
}

/** What a team's staff costs next season so far: salaries of who's staying, plus buyouts owed. */
function committedFor(rel: StaffReleases, team: string): number {
  const current = rel.staffs.get(team)!;
  return (
    (Object.values(current) as StaffMember[]).reduce((sum, m) => sum + (m.contract && m.contract.through >= rel.next ? m.contract.salary : 0), 0) +
    rel.deadMoney.get(team)!.filter((d) => d.season === rel.next).reduce((sum, d) => sum + d.amount, 0)
  );
}

/** The open seats on a team's staff and who it could hire for each (the same list every time for the same releases). */
export function staffCandidates(rel: StaffReleases, team: string): { budget: number; committed: number; openings: StaffOpening[] } {
  const openings: StaffOpening[] = rel.vacancies
    .filter((v) => v.team === team)
    .map((v) => {
      const role = SLOT_ROLE[v.slot];
      // New faces and coordinator conversions for this team come from its own stream, so the list never changes.
      const rng = new Rng(`${rel.league.seed}:${rel.season}:staffcandidates:${team}:${v.slot}`);
      const list: Candidate[] = rel.pool.filter((m) => m.role === role && m.age < 66 && !rel.letGo.has(`${team}:${m.id}`)).map((m) => ({ m, from: "free agent" as const }));
      for (let k = 1; k <= 4; k++) list.push({ m: GENERATORS[role](rng, `S-${rel.season}-${role}-${team}-${k}`), from: "new face" });
      if (role === "HC") {
        for (const [other, s] of rel.staffs) {
          if (other === team) continue;
          for (const slot of ["oc", "dc"] as const) {
            const m = s[slot];
            const rank = slot === "oc" ? rel.offenseRank.get(other)! : rel.defenseRank.get(other)!;
            if (m && rank <= 8) list.push({ m: asHeadCoach(rng, m), from: "promoted coordinator", source: { team: other, slot } });
          }
        }
      }
      return {
        slot: v.slot,
        role,
        out: v.out,
        reason: v.reason,
        candidates: list
          .map((c) => {
            const rep = reputation(rel.careers.get(c.m.id), role);
            return { member: c.m, from: c.from, ...(c.source ? { currentTeam: c.source.team, currentSlot: c.source.slot as "oc" | "dc" } : {}), ask: staffAsk(c.m, rel.capNext, rep), reputation: rep, overall: staffOverall(c.m) };
          })
          .sort((a, b) => b.overall + b.reputation - (a.overall + a.reputation)),
      };
    });
  return { budget: rel.budget, committed: committedFor(rel, team), openings };
}

/**
 * Fill every open seat (yours first, with your picks; with several teams'
 * picks, in draft order), then age everyone a year.
 */
export function staffHiring(rel: StaffReleases, hires?: PerTeam<StaffHires>): StaffOffseasonResult {
  const { league, order, season, next, capNext, budget, rng, careers, staffs, deadMoney, renewals, letGo, offenseRank, defenseRank } = rel;
  const coty = rel.coty;
  const newPool = rel.pool;
  const vacancies = rel.vacancies;
  const changes: StaffChange[] = [];
  const newHires = new Set<string>();
  let fresh = 0;
  const byOrder = (a: { team: string }, b: { team: string }) => order.indexOf(a.team) - order.indexOf(b.team);

  /** Put a hire in a seat: his deal, the pool, and a coordinator's old team now needing a replacement. */
  const place = (v: Vacancy, pick: Candidate) => {
    const role = SLOT_ROLE[v.slot];
    const contract = staffContract(rng, pick.m, next, capNext, reputation(careers.get(pick.m.id), role));
    const hire = { ...pick.m, tenure: 0, contract } as StaffMember;
    (staffs.get(v.team)! as Record<Slot, StaffMember>)[v.slot] = hire;
    newHires.add(hire.id);
    const poolIdx = newPool.findIndex((m) => m.id === pick.m.id);
    if (poolIdx >= 0) newPool.splice(poolIdx, 1);
    careerFor(careers, hire).status = "active";
    changes.push({ team: v.team, role, out: v.out, in: fullName(hire), reason: v.reason, from: pick.from, contract, ...(v.buyout ? { buyout: v.buyout } : {}) });
    if (pick.source) {
      delete staffs.get(pick.source.team)![pick.source.slot];
      vacancies.push({ team: pick.source.team, slot: pick.source.slot, out: fullName(pick.m), reason: "hired away" });
    }
  };

  // Your picks first, so nobody else takes them (several teams: in draft order).
  for (const own of [...teamChoices(hires).values()].sort(byOrder)) {
    const { openings } = staffCandidates(rel, own.team);
    for (const [slot, id] of own.picks) {
      const opening = openings.find((o) => o.slot === slot);
      const chosen = opening?.candidates.find((c) => c.member.id === id);
      const vi = vacancies.findIndex((v) => v.team === own.team && v.slot === slot);
      if (!opening || !chosen || vi < 0) continue;
      const [v] = vacancies.splice(vi, 1);
      place(v!, { m: chosen.member, from: chosen.from, ...(chosen.currentTeam && chosen.currentSlot ? { source: { team: chosen.currentTeam, slot: chosen.currentSlot } } : {}) });
    }
  }

  // --- hiring: worst teams choose first; coordinators can be hired away as head coaches ---
  vacancies.sort(byOrder);
  while (vacancies.length > 0) {
    const v = vacancies.shift()!;
    const role = SLOT_ROLE[v.slot];
    const candidates: Candidate[] = newPool.filter((m) => m.role === role && m.age < 66 && !letGo.has(`${v.team}:${m.id}`)).map((m) => ({ m, from: "free agent" as const }));
    for (let k = 0; k < 3; k++) candidates.push({ m: GENERATORS[role](rng, `S-${season}-${role}-${++fresh}`), from: "new face" });
    if (role === "HC") {
      for (const [team, s] of staffs) {
        if (team === v.team) continue;
        for (const slot of ["oc", "dc"] as const) {
          const m = s[slot];
          const rank = slot === "oc" ? offenseRank.get(team)! : defenseRank.get(team)!;
          if (m && !newHires.has(m.id) && rank <= 8 && m.tenure + 1 >= 1) candidates.push({ m: asHeadCoach(rng, m), from: "promoted coordinator", source: { team, slot } });
        }
      }
    }
    // What the team can pay: its budget, less current salaries and buyouts, less a
    // going-rate reserve for its other open seats.
    const committed = committedFor(rel, v.team);
    const reserve = vacancies.filter((o) => o.team === v.team).reduce((sum, o) => sum + 0.6 * STAFF_PAY[SLOT_ROLE[o.slot]] * capNext, 0);
    const room = budget - committed - reserve;
    const ask = (c: Candidate) => staffAsk(c.m, capNext, reputation(careers.get(c.m.id), role));
    const affordable = candidates.filter((c) => ask(c) <= room);
    const shortlist = affordable.length > 0 ? affordable : [candidates.reduce((a, b) => (ask(b) < ask(a) ? b : a))];
    const pick = shortlist.reduce((best, c) => {
      // Teams hesitate over someone just fired (a small mark against).
      const stigma = c.from === "free agent" && careers.get(c.m.id)?.status === "unemployed" ? 2 : 0;
      const score = staffOverall(c.m) + reputation(careers.get(c.m.id), role) - stigma + rng.normal(0, 3);
      return score > best.score ? { c, score } : best;
    }, { c: shortlist[0]!, score: -Infinity }).c;

    place(v, pick);
    if (pick.source) vacancies.sort(byOrder);
  }

  // --- everyone ages a year; the unemployed pool keeps its most employable ---
  const teams: League["teams"] = {};
  for (const t of allTeams(league)) {
    const s = staffs.get(t.abbr)!;
    const aged = {} as TeamStaff;
    for (const slot of SLOTS) (aged as Record<Slot, StaffMember>)[slot] = ageStaff(rng, s[slot]!, true, newHires.has(s[slot]!.id));
    const owed = deadMoney.get(t.abbr)!;
    const { staffDeadMoney: _old, ...rest } = t;
    teams[t.abbr] = { ...rest, staff: aged, ...(owed.length ? { staffDeadMoney: owed } : {}) };
  }
  const agedPool = newPool
    .map((m) => ageStaff(rng, m, false, false))
    .filter((m) => {
      if (m.age < 66) return true;
      careerFor(careers, m).status = "retired";
      return false;
    })
    .sort((a, b) => staffOverall(b) - staffOverall(a))
    .slice(0, 80);

  return { league: { ...league, teams }, pool: agedPool, careers, changes, renewals, coachOfTheYear: coty };
}

/** One seat on a team's staff as the offseason opens. */
export interface StaffSeat {
  slot: Slot;
  member: StaffMember;
  overall: number;
  /** His deal runs out now: renew it (at `renewAsk` a year) or let him go. */
  expiring: boolean;
  renewAsk: number;
  /** What firing him would cost: the rest of his deal, paid out of the staff budget. */
  buyout: number;
  /** Old enough that he may retire this offseason, whatever you decide. */
  mayRetire: boolean;
}

/** A team's staff before the offseason's staff moves: who's there, what keeping or replacing them costs, and the budget. */
export function staffOverview(league: League, careers: Map<string, StaffCareer>, team: string): { season: number; budget: number; committed: number; seats: StaffSeat[] } {
  const season = league.season;
  const next = season + 1;
  const capNext = salaryCap(league.seed, next);
  const t = league.teams[team]!;
  const seats: StaffSeat[] = SLOTS.flatMap((slot) => {
    const m = t.staff?.[slot];
    if (!m) return [];
    return [
      {
        slot,
        member: m,
        overall: staffOverall(m),
        expiring: !!m.contract && m.contract.through <= season,
        renewAsk: staffAsk(m, capNext, reputation(careers.get(m.id), m.role)),
        buyout: staffBuyout(m.contract, next),
        mayRetire: m.age >= STAFF_RETIREMENT.startAge,
      },
    ];
  });
  const owed = (t.staffDeadMoney ?? []).filter((d) => d.season === next).reduce((sum, d) => sum + d.amount, 0);
  const committed = seats.reduce((sum, x) => sum + (x.member.contract && x.member.contract.through >= next ? x.member.contract.salary : 0), 0) + owed;
  return { season: next, budget: staffBudget(capNext), committed, seats };
}

export type StaffSlot = Slot;
