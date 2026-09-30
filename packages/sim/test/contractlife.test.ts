import { describe, expect, it } from "vitest";
import {
  CAP_RULES,
  advanceSeason,
  allTeams,
  buildContract,
  capFloor,
  capHit,
  contractPlan,
  deadMoney,
  finalSeason,
  generateLeague,
  marketIndex,
  openContractYear,
  payroll,
  playerOverall,
  salaryCap,
  settleCap,
  startDynasty,
  type Contract,
  type League,
  type Player,
  type Team,
} from "../src/index.ts";

const START = startDynasty("contract-life", 4);
const ONE = advanceSeason(START);
const NEXT = ONE.league.season;
const CAP_NEXT = salaryCap(ONE.league.seed, NEXT);

const LEAGUE = generateLeague("contract-life-unit");
const SEASON = LEAGUE.season;
const ORDER = allTeams(LEAGUE).map((t) => t.abbr);
const NO_TRIGGERS = { awardWinners: new Set<string>(), playoffTeams: new Set<string>() };

/** Replace one player's contract on a team. */
function withContract(league: League, abbr: string, id: string, contract: Contract): League {
  const t = league.teams[abbr]!;
  const team: Team = { ...t, roster: t.roster.map((p) => (p.id === id ? { ...p, contract } : p)) };
  return { ...league, teams: { ...league.teams, [abbr]: team } };
}
const best = (t: Team, pos: string): Player => [...t.roster].filter((p) => p.position === pos).sort((a, b) => playerOverall(b) - playerOverall(a))[0]!;
const expiringDeal = (p: Player, over = SEASON): Contract => ({ ...p.contract!, kind: "veteran", years: p.contract!.years.filter((y) => y.season <= over).length ? p.contract!.years.filter((y) => y.season <= over) : [{ season: over, salary: 5_000, bonus: 0, guaranteed: false }] });

describe("the contract offseason in a dynasty", () => {
  it("leaves every player under contract for next season", () => {
    for (const t of allTeams(ONE.league))
      for (const p of t.roster) {
        expect(p.contract).toBeDefined();
        expect(finalSeason(p.contract!)).toBeGreaterThanOrEqual(NEXT);
        expect(capHit(p.contract!, NEXT)).toBeGreaterThan(0);
      }
  });

  it("keeps every team between the floor and the hard cap (plus rollover)", () => {
    for (const t of allTeams(ONE.league)) {
      const pay = payroll(t, NEXT);
      expect(pay).toBeLessThanOrEqual(CAP_NEXT + t.cap!.rollover);
      expect(pay).toBeGreaterThanOrEqual(capFloor(CAP_NEXT));
      expect(t.cap!.rollover).toBeLessThanOrEqual(CAP_RULES.maxRollover * salaryCap(ONE.league.seed, NEXT - 1));
    }
  });

  it("signs draft picks to slotted rookie deals", () => {
    const rookies = allTeams(ONE.league).flatMap((t) => t.roster.filter((p) => p.contract!.pick !== undefined && p.contract!.signed === NEXT).map((p) => ({ t, p })));
    expect(rookies.length).toBeGreaterThan(250);
    for (const { t, p } of rookies) {
      expect(p.contract!.kind).toBe("rookie");
      expect(p.contract!.draftedBy).toBe(t.abbr);
      expect(p.contract!.years).toHaveLength(4);
    }
    const byPick = [...rookies].sort((a, b) => a.p.contract!.pick! - b.p.contract!.pick!);
    expect(capHit(byPick[0]!.p.contract!, NEXT)).toBeGreaterThan(capHit(byPick.at(-1)!.p.contract!, NEXT));
  });

  it("records the offseason's contract activity", () => {
    const c = ONE.history[0]!.contracts;
    expect(c.counts["re-signed"]).toBeGreaterThan(100);
    expect(c.counts.released).toBeGreaterThan(0);
    expect(c.biggestDeals.length).toBe(5);
    expect(ONE.history[0]!.marketIndex).toBeGreaterThan(0.5);
  });

  it("gives the homegrown credit only to players re-signed by the team that drafted them", () => {
    for (const t of allTeams(ONE.league))
      for (const p of t.roster) if (p.contract!.homegrown && p.contract!.signed === NEXT) expect(p.contract!.draftedBy).toBe(t.abbr);
  });
});

describe("expiring deals", () => {
  const abbr = ORDER[0]!;
  const qb = best(LEAGUE.teams[abbr]!, "QB");

  it("re-signs a team's best player when his deal runs out", () => {
    const league = withContract(LEAGUE, abbr, qb.id, expiringDeal(qb));
    const r = openContractYear(league, league, NO_TRIGGERS, ORDER);
    const move = r.moves.find((m) => m.player.id === qb.id)!;
    expect(move.kind).toBe("re-signed");
    const after = r.league.teams[abbr]!.roster.find((p) => p.id === qb.id)!;
    expect(after.contract!.signed).toBe(SEASON + 1);
  });

  it("releases players the team doesn't want to free agency", () => {
    const team = LEAGUE.teams[abbr]!;
    const worst = [...team.roster].filter((p) => p.position === "WR").sort((a, b) => playerOverall(a) - playerOverall(b))[0]!;
    const league = withContract(LEAGUE, abbr, worst.id, expiringDeal(worst));
    const r = openContractYear(league, league, NO_TRIGGERS, ORDER);
    // Either re-signed cheaply or released, never kept without a deal.
    const after = r.league.teams[abbr]!.roster.find((p) => p.id === worst.id);
    if (after) expect(finalSeason(after.contract!)).toBeGreaterThan(SEASON);
    else expect(r.freeAgents.some((p) => p.id === worst.id && !p.contract)).toBe(true);
  });

  it("exercises the fifth-year option on a good first-rounder", () => {
    const rookieDeal: Contract = { kind: "rookie", signed: SEASON - 3, pick: 5, draftedBy: abbr, homegrown: false, years: [0, 1, 2, 3].map((i) => ({ season: SEASON - 3 + i, salary: 6_000, bonus: 2_000, guaranteed: true })) };
    const league = withContract(LEAGUE, abbr, qb.id, rookieDeal);
    const r = openContractYear(league, league, NO_TRIGGERS, ORDER);
    const after = r.league.teams[abbr]!.roster.find((p) => p.id === qb.id)!;
    expect(r.moves.find((m) => m.player.id === qb.id)!.kind).toBe("option");
    expect(after.contract!.years.at(-1)).toMatchObject({ season: SEASON + 1, option: true, guaranteed: true });
  });

  it("charges earned incentives to next season and rolls over unused cap", () => {
    const withIncentive: Contract = { ...qb.contract!, years: qb.contract!.years.map((y) => (y.season === SEASON ? { ...y, incentive: 3_000 } : y)) };
    const league = withContract(LEAGUE, abbr, qb.id, withIncentive);
    const earned = openContractYear(league, league, { awardWinners: new Set(), playoffTeams: new Set([abbr]) }, ORDER);
    expect(earned.league.teams[abbr]!.cap!.incentives).toBeGreaterThanOrEqual(3_000);
    // A playoff trip triggers everyone's incentives on the team; without one, nobody's.
    const due = league.teams[abbr]!.roster.reduce((s, p) => s + (p.contract!.years.find((y) => y.season === SEASON)?.incentive ?? 0), 0);
    expect(earned.league.teams[abbr]!.cap!.incentives).toBe(due);
    expect(openContractYear(league, league, NO_TRIGGERS, ORDER).league.teams[abbr]!.cap!.incentives).toBe(0);
    const unused = salaryCap(LEAGUE.seed, SEASON) - payroll(league.teams[abbr]!, SEASON);
    expect(earned.league.teams[abbr]!.cap!.rollover).toBe(Math.round(Math.min(unused, CAP_RULES.maxRollover * salaryCap(LEAGUE.seed, SEASON))));
  });

  it("prices the market so league spending targets the cap", () => {
    const i = marketIndex(allTeams(LEAGUE), salaryCap(LEAGUE.seed, SEASON), SEASON);
    expect(i).toBeGreaterThan(0.7);
    expect(i).toBeLessThan(2.5);
  });
});

describe("cuts and the cap", () => {
  const abbr = ORDER[1]!;
  const team = LEAGUE.teams[abbr]!;
  const next = SEASON + 1;
  const capNext = salaryCap(LEAGUE.seed, next);

  it("leaves dead money for a cut player with guarantees", () => {
    const victim = best(team, "WR");
    const deal = buildContract({ kind: "veteran", signed: SEASON, years: 4, annual: 20_000, bonusShare: 0.3, guaranteedYears: 2 });
    const cut = { ...victim, contract: deal };
    const league: League = { ...LEAGUE, teams: { ...LEAGUE.teams, [abbr]: { ...team, roster: team.roster.filter((p) => p.id !== victim.id) } } };
    const r = settleCap(league, [{ team: abbr, player: cut }], next);
    expect(r.league.teams[abbr]!.cap!.deadMoney).toBe(deadMoney(deal, next));
    expect(r.moves[0]).toMatchObject({ kind: "cut", deadMoney: deadMoney(deal, next) });
  });

  it("makes cap cuts until a team over the hard cap is back under it", () => {
    const star = best(team, "QB");
    const bloated = buildContract({ kind: "veteran", signed: next, years: 2, annual: capNext * 1.1, bonusShare: 0, guaranteedYears: 0 });
    const league = withContract(LEAGUE, abbr, star.id, bloated);
    const r = settleCap(league, [], next);
    expect(r.moves.some((m) => m.kind === "cap cut")).toBe(true);
    expect(payroll(r.league.teams[abbr]!, next)).toBeLessThanOrEqual(capNext + (r.league.teams[abbr]!.cap!.rollover ?? 0));
  });

  it("charges a team under the floor the shortfall", () => {
    const cheap: League = {
      ...LEAGUE,
      teams: { ...LEAGUE.teams, [abbr]: { ...team, roster: team.roster.map((p) => ({ ...p, contract: buildContract({ kind: "veteran", signed: next, years: 1, annual: 1_000, bonusShare: 0, guaranteedYears: 0 }) })) } },
    };
    const r = settleCap(cheap, [], next);
    const t = r.league.teams[abbr]!;
    expect(t.cap!.floorPayment).toBeGreaterThan(0);
    expect(payroll(t, next)).toBe(capFloor(capNext));
  });
});

describe("a team making its own re-signing calls", () => {
  const abbr = ORDER[2]!;
  // Give every player on the team an expiring deal so there are plenty of decisions.
  const expiring: League = {
    ...LEAGUE,
    teams: { ...LEAGUE.teams, [abbr]: { ...LEAGUE.teams[abbr]!, roster: LEAGUE.teams[abbr]!.roster.map((p) => ({ ...p, contract: expiringDeal(p) })) } },
  };
  const plan = contractPlan(expiring, expiring, NO_TRIGGERS, ORDER, abbr);
  const moveFor = (r: ReturnType<typeof openContractYear>, id: string) => r.moves.find((m) => m.team === abbr && m.player.id === id)!;

  it("previews every expiring player's deal, mood and odds", () => {
    expect(plan.offers).toHaveLength(72);
    expect(plan.budget).toBeGreaterThan(0);
    for (const o of plan.offers) {
      expect(o.chance).toBeGreaterThan(0);
      expect(o.chance).toBeLessThanOrEqual(1);
      expect(o.capHit).toBe(capHit(o.deal, SEASON + 1));
    }
    expect(plan.offers.some((o) => o.aiWants)).toBe(true);
    expect(plan.offers.some((o) => !o.aiWants)).toBe(true);
  });

  it("matches the AI exactly when you choose what the AI would", () => {
    const ai = openContractYear(expiring, expiring, NO_TRIGGERS, ORDER);
    const same = openContractYear(expiring, expiring, NO_TRIGGERS, ORDER, { team: abbr, keep: new Set(plan.offers.filter((o) => o.aiWants).map((o) => o.player.id)) });
    expect(same.moves).toEqual(ai.moves);
  });

  it("keeps exactly who you chose, on the previewed terms, if they agree and fit", () => {
    const keep = new Set(plan.offers.filter((o) => !o.aiWants).slice(0, 5).map((o) => o.player.id));
    const r = openContractYear(expiring, expiring, NO_TRIGGERS, ORDER, { team: abbr, keep });
    for (const o of plan.offers) {
      const m = moveFor(r, o.player.id);
      if (!keep.has(o.player.id)) expect(m.kind).toBe("released");
      else if (!o.accepts) expect(m.kind).toBe("declined");
      else {
        expect(m.kind).toBe("re-signed");
        expect(m.contract).toEqual(o.deal);
      }
    }
  });

  it("lets everyone go if you keep no one, and leaves other teams to the AI", () => {
    const r = openContractYear(expiring, expiring, NO_TRIGGERS, ORDER, { team: abbr, keep: new Set() });
    expect(r.moves.filter((m) => m.team === abbr).every((m) => m.kind === "released")).toBe(true);
    const ai = openContractYear(expiring, expiring, NO_TRIGGERS, ORDER);
    expect(r.moves.filter((m) => m.team !== abbr)).toEqual(ai.moves.filter((m) => m.team !== abbr));
  });
});
