import { describe, expect, it } from "vitest";
import { acceptNaming, advanceSeason, attendance, namingAvailable, namingOffers, projectCost, projectProblems, startProject, interest, marketSize, nextFans, startBusiness, startDynasty, startLeagueBusiness } from "../src/index.ts";

const DYNASTY = startDynasty("business-test", 1);
const CA = DYNASTY.league.teams.CA!;
const WY = DYNASTY.league.teams.WY!;

describe("markets and fans", () => {
  it("big states have more fans; small states have proportionally more die-hards", () => {
    const big = startBusiness(CA, DYNASTY.league.seed);
    const small = startBusiness(WY, DYNASTY.league.seed);
    expect(marketSize("CA")).toBe("large");
    expect(marketSize("WY")).toBe("small");
    expect(big.fans.casual).toBeGreaterThan(10 * small.fans.casual);
    expect(small.fans.dieHard / small.fans.casual).toBeGreaterThan(big.fans.dieHard / big.fans.casual);
    expect(big.stadium.capacity).toBeGreaterThan(small.stadium.capacity);
  });

  it("crowds grow with winning, shrink with price, and never pass capacity", () => {
    const b = startBusiness(CA, DYNASTY.league.seed);
    expect(attendance(b, interest(0.9))).toBeGreaterThan(attendance(b, interest(0.1)) - 1);
    const pricey = { ...b, ticketPrice: 200 };
    expect(attendance(pricey, interest(0.5))).toBeLessThan(attendance(b, interest(0.5)));
    expect(attendance(b, 1.3)).toBeLessThanOrEqual(b.stadium.capacity);
  });

  it("casual fans follow winning; die-hards stay", () => {
    const f = { casual: 100, dieHard: 50 };
    expect(nextFans(f, "OH", 0.9).casual).toBeGreaterThan(nextFans(f, "OH", 0.1).casual);
    expect(nextFans(f, "OH", 0.1).dieHard).toBeGreaterThanOrEqual(49);
  });
});

describe("the books", () => {
  const next = advanceSeason(DYNASTY);

  it("close every season for every team: revenue, expenses, profit, cash", () => {
    const start = startLeagueBusiness(DYNASTY.league);
    for (const abbr of Object.keys(DYNASTY.league.teams)) {
      const f = next.finances![abbr]!.at(-1)!;
      const rev = Object.values(f.revenue).reduce((a, b) => a + b, 0);
      const exp = Object.values(f.expenses).reduce((a, b) => a + b, 0);
      expect(Math.abs(f.profit - (rev - exp))).toBeLessThan(5);
      // Cash: last season's plus the profit, less anything the team paid for in cash for next season.
      const spent = (next.business![abbr]!.pending ?? []).filter((p) => p.financing === "cash").reduce((n, p) => n + p.cost, 0);
      expect(next.business![abbr]!.cash).toBe(start[abbr]!.cash + f.profit - spent);
      expect(f.attendance).toBeGreaterThan(0);
    }
  }, 30_000);

  it("give big markets more to spend, though the cap is the same for everyone", () => {
    const profit = (abbr: string) => next.finances![abbr]!.at(-1)!.profit;
    const big = ["CA", "TX", "NY", "FL"].reduce((n, a) => n + profit(a), 0) / 4;
    const small = ["WY", "VT", "AK", "ND"].reduce((n, a) => n + profit(a), 0) / 4;
    expect(big).toBeGreaterThan(small);
  });
});

describe("your levers", () => {
  const b = startBusiness(CA, DYNASTY.league.seed);

  it("cost less to build in small states", () => {
    expect(projectCost("expand", "WY")).toBeLessThan(projectCost("expand", "CA"));
  });

  it("pay for projects in cash or with bonds, and they open next season", () => {
    const rich = { ...b, cash: 500_000 };
    const cash = startProject(rich, "suites", "CA", "cash", 2031);
    expect(cash.cash).toBe(rich.cash - projectCost("suites", "CA"));
    expect(projectProblems(cash, "suites", "CA", "cash").join(" ")).toMatch(/under way/);
    const bonds = startProject(b, "expand", "CA", "bonds", 2031);
    expect(bonds.stadium.debt).toBe(projectCost("expand", "CA"));
    expect(bonds.cash).toBe(b.cash);
    expect(projectProblems({ ...b, cash: 0 }, "dome", "CA", "cash").join(" ")).toMatch(/Not enough cash/);
  });

  it("sell naming rights: a new name and a check every season", () => {
    const [offer] = namingOffers(DYNASTY.league.seed, "CA", 2031);
    const named = acceptNaming(b, offer!, 2031);
    expect(named.stadium.name.startsWith(offer!.sponsor)).toBe(true);
    expect(namingAvailable(named, 2031)).toBe(false);
    expect(namingAvailable(named, 2031 + offer!.years + 1)).toBe(true);
    expect(namingOffers(DYNASTY.league.seed, "CA", 2031)[0]!.perYear).toBeGreaterThan(namingOffers(DYNASTY.league.seed, "WY", 2031)[0]!.perYear * 0);
  });

  it("AI teams sell naming rights and keep prices sensible", () => {
    const next = advanceSeason(DYNASTY);
    for (const x of Object.values(next.business!)) {
      expect(x.stadium.naming).toBeDefined();
      expect(x.ticketPrice).toBeGreaterThanOrEqual(60);
      expect(x.ticketPrice).toBeLessThanOrEqual(180);
    }
  }, 30_000);
});
