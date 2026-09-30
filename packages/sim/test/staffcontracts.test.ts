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
  staffDeadMoneyFor,
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
