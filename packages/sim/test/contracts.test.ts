import { describe, expect, it } from "vitest";
import {
  CAP_RULES,
  HOMEGROWN_CREDIT,
  RATING_KEYS,
  allTeams,
  buildContract,
  capFloor,
  capHit,
  capSpace,
  createPlayer,
  deadMoney,
  formatCapSheet,
  formatMoney,
  generateLeague,
  marketValue,
  minimumSalary,
  payroll,
  playerOverall,
  rookieContract,
  rookieScale,
  salaryCap,
  yearsLeft,
} from "../src/index.ts";

const LEAGUE = generateLeague("contracts-test");
const CAP = salaryCap(LEAGUE.seed, LEAGUE.season);
const SEASON = LEAGUE.season;

describe("the salary cap", () => {
  it("starts at the base cap and grows 3-6% a year, the same for the same seed", () => {
    expect(salaryCap("a", CAP_RULES.baseSeason)).toBe(CAP_RULES.baseCap);
    for (let s = 2032; s < 2045; s++) {
      const g = salaryCap("a", s) / salaryCap("a", s - 1);
      expect(g).toBeGreaterThan(1.029);
      expect(g).toBeLessThan(1.061);
    }
    expect(salaryCap("a", 2040)).toBe(salaryCap("a", 2040));
    expect(salaryCap("a", 2040)).not.toBe(salaryCap("b", 2040));
  });
});

describe("contracts", () => {
  const deal = buildContract({ kind: "veteran", signed: 2031, years: 4, annual: 20_000, bonusShare: 0.25, guaranteedYears: 2 });

  it("spreads the bonus evenly, back-loads salary and keeps the total", () => {
    expect(deal.years.map((y) => y.season)).toEqual([2031, 2032, 2033, 2034]);
    const total = deal.years.reduce((s, y) => s + y.salary + y.bonus, 0);
    expect(Math.abs(total - 80_000)).toBeLessThan(50);
    expect(new Set(deal.years.map((y) => y.bonus)).size).toBe(1);
    expect(deal.years[3]!.salary).toBeGreaterThan(deal.years[0]!.salary);
    expect(capHit(deal, 2030)).toBe(0);
    expect(yearsLeft(deal, 2033)).toBe(2);
  });

  it("leaves unpaid bonus and guaranteed salary as dead money", () => {
    const [y1, y2, y3, y4] = deal.years;
    expect(deadMoney(deal, 2031)).toBe(y1!.salary + y2!.salary + 4 * y1!.bonus);
    expect(deadMoney(deal, 2033)).toBe(y3!.bonus + y4!.bonus);
    expect(deadMoney(deal, 2035)).toBe(0);
  });

  it("counts a homegrown deal at 80% against the cap", () => {
    const hg = { ...deal, homegrown: true };
    expect(capHit(hg, 2032)).toBe(Math.round(capHit(deal, 2032) * HOMEGROWN_CREDIT));
  });

  it("slots rookie deals by pick: early picks paid and guaranteed, late picks at the minimum", () => {
    expect(rookieScale(1, CAP)).toBeGreaterThan(rookieScale(10, CAP));
    expect(rookieScale(1, CAP)).toBeCloseTo(0.034 * CAP, -2);
    expect(rookieScale(300, CAP)).toBeLessThan(minimumSalary(CAP) + 20);
    const first = rookieContract(3, "OH", 2031, CAP);
    expect(first.years).toHaveLength(4);
    expect(first.years.every((y) => y.guaranteed)).toBe(true);
    expect(rookieContract(200, "OH", 2031, CAP).years.some((y) => y.guaranteed)).toBe(false);
  });
});

describe("market value", () => {
  const player = (position: "QB" | "K", ovr: number, age = 27) =>
    createPlayer({ id: "x", firstName: "A", lastName: "B", position, age, ratings: Object.fromEntries(RATING_KEYS.map((k) => [k, ovr])) });

  it("is built from real overalls", () => {
    expect(playerOverall(player("QB", 90))).toBe(90);
  });

  it("rises with overall, pays quarterbacks far more than kickers, and discounts age", () => {
    const qb70 = marketValue(player("QB", 70), CAP);
    const qb90 = marketValue(player("QB", 90), CAP);
    expect(qb90).toBeGreaterThan(3 * qb70);
    expect(qb90).toBeGreaterThan(0.12 * CAP);
    expect(marketValue(player("K", 90), CAP)).toBeLessThan(0.025 * CAP);
    expect(marketValue(player("QB", 90, 34), CAP)).toBeLessThan(qb90);
    expect(marketValue(player("QB", 40), CAP)).toBe(minimumSalary(CAP));
  });
});

describe("a new league's contracts", () => {
  it("gives every player a current contract", () => {
    for (const t of allTeams(LEAGUE))
      for (const p of t.roster) {
        expect(p.contract).toBeDefined();
        expect(capHit(p.contract!, SEASON)).toBeGreaterThanOrEqual(Math.round(minimumSalary(CAP) * HOMEGROWN_CREDIT) - 10);
      }
  });

  it("fits every team between the floor and the hard cap", () => {
    for (const t of allTeams(LEAGUE)) {
      const pay = payroll(t, SEASON);
      expect(pay).toBeLessThanOrEqual(CAP);
      expect(pay).toBeGreaterThanOrEqual(capFloor(CAP));
      expect(capSpace(t, CAP, SEASON)).toBe(CAP - pay);
    }
  });

  it("pays the best players the most", () => {
    const all = allTeams(LEAGUE).flatMap((t) => t.roster).filter((p) => p.contract!.kind !== "rookie");
    const avg = (xs: typeof all) => xs.reduce((s, p) => s + capHit(p.contract!, SEASON), 0) / xs.length;
    expect(avg(all.filter((p) => playerOverall(p) >= 78))).toBeGreaterThan(4 * avg(all.filter((p) => playerOverall(p) < 62)));
  });

  it("is deterministic and prints a cap sheet", () => {
    expect(generateLeague("contracts-test").teams).toEqual(LEAGUE.teams);
    const sheet = formatCapSheet(allTeams(LEAGUE)[0]!, CAP, SEASON);
    expect(sheet).toContain("cap sheet");
    expect(sheet).toContain(formatMoney(CAP));
  });
});
