import { describe, expect, it } from "vitest";
import {
  STAFF_YEARS,
  allTeams,
  draftOrder,
  generateLeague,
  runStaffOffseason,
  salaryCap,
  simulatePlayoffs,
  simulateSeason,
  staffAsk,
  staffBudget,
  staffBuyout,
  staffCandidates,
  staffDeadMoneyFor,
  staffHiring,
  staffOverview,
  staffReleases,
  staffSpending,
  type League,
  type StaffMember,
  type TeamStaff,
} from "../src/index.ts";

const LEAGUE = generateLeague("staff-contracts-test");
const SEASON = LEAGUE.season;
const CAP = salaryCap(LEAGUE.seed, SEASON);
const PLAYED = simulateSeason(LEAGUE);
const PLAYOFFS = simulatePlayoffs(LEAGUE, PLAYED);
const ORDER = draftOrder(PLAYOFFS);
const run = (league: League, lastPct = new Map<string, number>()) => runStaffOffseason(league, PLAYED.results, PLAYOFFS, ORDER, [], new Map(), lastPct);
const SLOTS: (keyof TeamStaff)[] = ["hc", "oc", "dc", "gm", "scout"];

/** Every head coach judged (tenure 4) with a deal running through `through`. */
function coachesSignedThrough(through: number): League {
  const teams: League["teams"] = {};
  for (const t of allTeams(LEAGUE)) {
    const hc = t.staff!.hc;
    teams[t.abbr] = { ...t, staff: { ...t.staff!, hc: { ...hc, tenure: 4, contract: { signed: SEASON - 1, through, salary: hc.contract!.salary } } } };
  }
  return { ...LEAGUE, teams };
}

describe("staff contracts in a new league", () => {
  it("gives everyone a current deal of a sensible length, within the staff budget", () => {
    for (const t of allTeams(LEAGUE)) {
      for (const slot of SLOTS) {
        const m = t.staff![slot] as StaffMember;
        const c = m.contract!;
        expect(c.through).toBeGreaterThanOrEqual(SEASON);
        expect(c.signed).toBeLessThanOrEqual(SEASON);
        const [lo, hi] = STAFF_YEARS[m.role];
        expect(c.through - c.signed + 1).toBeGreaterThanOrEqual(lo);
        expect(c.through - c.signed + 1).toBeLessThanOrEqual(hi);
      }
      expect(staffSpending(t, SEASON)).toBeLessThanOrEqual(staffBudget(CAP) * 1.1);
    }
  });

  it("pays head coaches most, scouts least, and better staff more", () => {
    const t = allTeams(LEAGUE)[0]!.staff!;
    expect(t.hc.contract!.salary).toBeGreaterThan(t.scout.contract!.salary);
    const good = { ...t.hc, gameManagement: 80, discipline: 80, development: 80 };
    const poor = { ...t.hc, gameManagement: 40, discipline: 40, development: 40 };
    expect(staffAsk(good, CAP)).toBeGreaterThan(2 * staffAsk(poor, CAP));
    expect(staffAsk(t.hc, CAP, 8)).toBeGreaterThan(staffAsk(t.hc, CAP, 0));
  });

  it("owes the rest of a deal as a buyout", () => {
    expect(staffBuyout({ signed: 2030, through: 2034, salary: 5_000 }, 2032)).toBe(15_000);
    expect(staffBuyout({ signed: 2030, through: 2031, salary: 5_000 }, 2032)).toBe(0);
    expect(staffBuyout(undefined, 2032)).toBe(0);
  });
});

describe("staff contracts in the offseason", () => {
  it("charges a fired staff member's remaining years to the team's budget", () => {
    const r = run(coachesSignedThrough(SEASON + 3), new Map(allTeams(LEAGUE).map((t) => [t.abbr, 0.2])));
    const fired = r.changes.filter((c) => c.role === "HC" && c.reason === "fired");
    expect(fired.length).toBeGreaterThan(0);
    for (const c of fired) {
      const before = LEAGUE.teams[c.team]!.staff!.hc;
      expect(c.buyout).toBe(3 * before.contract!.salary);
      const t = r.league.teams[c.team]!;
      for (let y = SEASON + 1; y <= SEASON + 3; y++) expect(staffDeadMoneyFor(t, y)).toBeGreaterThanOrEqual(before.contract!.salary);
    }
  });

  it("makes teams slower to fire a coach with a big buyout", () => {
    const bad = new Map(allTeams(LEAGUE).map((t) => [t.abbr, 0.2]));
    const cheap = run(coachesSignedThrough(SEASON), bad).changes.filter((c) => c.role === "HC" && c.reason === "fired").length;
    const pricey = run(coachesSignedThrough(SEASON + 4), bad).changes.filter((c) => c.role === "HC" && c.reason === "fired").length;
    // Coaches whose deals just ended leave or are renewed instead of being fired.
    const lean = run(coachesSignedThrough(SEASON + 1), bad).changes.filter((c) => c.role === "HC" && c.reason === "fired").length;
    expect(pricey).toBeLessThan(lean);
    expect(cheap).toBeLessThanOrEqual(lean);
  });

  it("renews or replaces everyone whose deal ran out, and signs new hires from next season", () => {
    const r = run(coachesSignedThrough(SEASON));
    for (const t of allTeams(r.league)) {
      for (const slot of SLOTS) expect((t.staff![slot] as StaffMember).contract!.through).toBeGreaterThanOrEqual(SEASON + 1);
    }
    for (const c of r.renewals) expect(c.contract!.signed).toBe(SEASON + 1);
    for (const c of r.changes) expect(c.contract!.signed).toBe(SEASON + 1);
    const expired = r.changes.filter((c) => c.role === "HC" && c.reason === "contract expired").length;
    const renewed = r.renewals.filter((c) => c.role === "HC").length;
    expect(expired + renewed).toBeGreaterThan(20);
  });

  it("hires within the budget when it can", () => {
    const r = run(coachesSignedThrough(SEASON + 3), new Map(allTeams(LEAGUE).map((t) => [t.abbr, 0.2])));
    const budget = staffBudget(salaryCap(LEAGUE.seed, SEASON + 1));
    const over = allTeams(r.league).filter((t) => staffSpending(t, SEASON + 1) - staffDeadMoneyFor(t, SEASON + 1) > budget);
    expect(over.length).toBeLessThanOrEqual(1);
  });
});

describe("your own staff calls", () => {
  const me = ORDER[0]!; // the worst team: the AI would be most tempted to fire its coach
  const awful = new Map(allTeams(LEAGUE).map((t) => [t.abbr, 0.1]));
  const league = coachesSignedThrough(SEASON + 2);
  const release = (decisions?: Parameters<typeof staffReleases>[7]) => staffReleases(league, PLAYED.results, PLAYOFFS, ORDER, [], new Map(), awful, decisions);
  const myVacancies = (rel: ReturnType<typeof release>) => rel.vacancies.filter((v) => v.team === me);

  it("previews each seat: expiring deals, renewal asks, buyouts, the budget", () => {
    const o = staffOverview(league, new Map(), me);
    expect(o.seats).toHaveLength(5);
    const hc = o.seats.find((x) => x.slot === "hc")!;
    expect(hc.buyout).toBe(2 * hc.member.contract!.salary);
    expect(hc.expiring).toBe(false);
    expect(o.budget).toBe(staffBudget(salaryCap(LEAGUE.seed, SEASON + 1)));
  });

  it("keeps everyone you don't fire, even after a terrible season, and fires exactly who you choose", () => {
    const keepAll = release({ team: me, fire: new Set(), renew: new Set(["hc", "oc", "dc", "gm", "scout"]) });
    expect(myVacancies(keepAll).filter((v) => v.reason === "fired")).toHaveLength(0);
    const fireHc = release({ team: me, fire: new Set(["hc"]), renew: new Set(["hc", "oc", "dc", "gm", "scout"]) });
    const v = myVacancies(fireHc).find((x) => x.slot === "hc")!;
    expect(v.reason).toBe("fired");
    expect(v.buyout).toBe(2 * league.teams[me]!.staff!.hc.contract!.salary);
  });

  it("lists the same candidates every time, including new faces and coordinators to poach for head coach", () => {
    const rel = release({ team: me, fire: new Set(["hc"]), renew: new Set() });
    const a = staffCandidates(rel, me);
    const b = staffCandidates(release({ team: me, fire: new Set(["hc"]), renew: new Set() }), me);
    const hcOpening = a.openings.find((o) => o.slot === "hc")!;
    expect(hcOpening.candidates.map((c) => c.member.id)).toEqual(b.openings.find((o) => o.slot === "hc")!.candidates.map((c) => c.member.id));
    expect(hcOpening.candidates.some((c) => c.from === "new face")).toBe(true);
    expect(hcOpening.candidates.some((c) => c.from === "promoted coordinator")).toBe(true);
  });

  it("puts your pick in the seat; a poached coordinator's old team has to replace him", () => {
    const rel = release({ team: me, fire: new Set(["hc"]), renew: new Set() });
    const poach = staffCandidates(rel, me).openings.find((o) => o.slot === "hc")!.candidates.find((c) => c.from === "promoted coordinator")!;
    const result = staffHiring(rel, { team: me, picks: new Map([["hc", poach.member.id]]) });
    expect(result.league.teams[me]!.staff!.hc.id).toBe(poach.member.id);
    const replaced = result.changes.find((c) => c.team === poach.currentTeam && c.reason === "hired away");
    expect(replaced).toBeDefined();
    expect(result.league.teams[poach.currentTeam!]!.staff![poach.currentSlot!].id).not.toBe(poach.member.id);
  });

  it("changes nothing when you make no calls", () => {
    const a = run(league, awful);
    const b = staffHiring(release());
    expect(b.changes).toEqual(a.changes);
  });
});
