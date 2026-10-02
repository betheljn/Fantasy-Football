import { describe, expect, it } from "vitest";
import {
  GAME_MIN,
  IR_MIN_WEEKS,
  ROSTER_MAX,
  SEASON_ENDING,
  advanceInjuries,
  aiInSeasonMoves,
  allTeams,
  capHit,
  endSeasonMoves,
  inSeasonContract,
  irProblems,
  minimumSalary,
  payroll,
  placeOnIR,
  salaryCap,
  signFreeAgent,
  signingProblems,
  startDynasty,
  validateTeam,
  type League,
} from "../src/index.ts";

const DYNASTY = startDynasty("inseason-test", 2);
const LEAGUE = DYNASTY.league;
const SEASON = LEAGUE.season;
const TEAM = allTeams(LEAGUE)[0]!;
const hurt = (league: League, id: string, weeks: number) => advanceInjuries(league, [{ player: id, team: TEAM.abbr, type: "knee", weeks }]);
const spareWr = TEAM.roster.filter((p) => p.position === "WR").at(-1)!;

describe("the free-agent pool", () => {
  it("has players at every position, unsigned and not on any roster", () => {
    const pool = LEAGUE.freeAgents!;
    expect(pool.length).toBeGreaterThan(100);
    for (const pos of Object.keys(GAME_MIN)) expect(pool.some((p) => p.position === pos)).toBe(true);
    const rostered = new Set(allTeams(LEAGUE).flatMap((t) => t.roster.map((p) => p.id)));
    for (const p of pool) {
      expect(p.contract).toBeUndefined();
      expect(rostered.has(p.id)).toBe(false);
    }
  });
});

describe("injured reserve", () => {
  it("is for players out a while, and never leaves a position short", () => {
    expect(irProblems(hurt(LEAGUE, spareWr.id, IR_MIN_WEEKS - 1).teams[TEAM.abbr]!, spareWr.id)).not.toEqual([]);
    expect(irProblems(hurt(LEAGUE, spareWr.id, IR_MIN_WEEKS).teams[TEAM.abbr]!, spareWr.id)).toEqual([]);
    const k = TEAM.roster.filter((p) => p.position === "K");
    if (k.length === GAME_MIN.K) expect(irProblems(hurt(LEAGUE, k[0]!.id, 10).teams[TEAM.abbr]!, k[0]!.id).join(" ")).toMatch(/sign someone/);
  });

  it("frees a roster spot for the season, still counts on the cap, and rejoins in the offseason", () => {
    const league = hurt(LEAGUE, spareWr.id, 6);
    const before = payroll(league.teams[TEAM.abbr]!, SEASON);
    const { league: after, move } = placeOnIR(league, TEAM.abbr, spareWr.id, 3);
    const team = after.teams[TEAM.abbr]!;
    expect(move.kind).toBe("injured reserve");
    expect(team.roster.some((p) => p.id === spareWr.id)).toBe(false);
    expect(team.reserve!.map((p) => p.id)).toEqual([spareWr.id]);
    expect(team.reserve![0]!.injury!.weeks).toBe(SEASON_ENDING);
    expect(payroll(team, SEASON)).toBe(before);
    expect(validateTeam(team)).toEqual([]);
    const back = endSeasonMoves(after).teams[TEAM.abbr]!;
    expect(back.reserve).toBeUndefined();
    expect(back.roster.some((p) => p.id === spareWr.id)).toBe(true);
    expect(endSeasonMoves(after).freeAgents).toBeUndefined();
  });
});

describe("signing a free agent", () => {
  const fa = LEAGUE.freeAgents![0]!;

  it("needs a roster spot and cap room", () => {
    expect(TEAM.roster.length).toBe(ROSTER_MAX);
    expect(signingProblems(LEAGUE, SEASON, TEAM.abbr, fa.id).join(" ")).toMatch(/roster is full/);
    const open = placeOnIR(hurt(LEAGUE, spareWr.id, 6), TEAM.abbr, spareWr.id, 3).league;
    expect(signingProblems(open, SEASON, TEAM.abbr, fa.id)).toEqual([]);
  });

  it("is a one-year deal at half his value, at least the minimum, and he leaves the pool", () => {
    const c = inSeasonContract(fa, LEAGUE, SEASON);
    expect(c.years).toHaveLength(1);
    expect(capHit(c, SEASON)).toBeGreaterThanOrEqual(minimumSalary(salaryCap(LEAGUE.seed, SEASON)));
    const open = placeOnIR(hurt(LEAGUE, spareWr.id, 6), TEAM.abbr, spareWr.id, 3).league;
    const { league, move } = signFreeAgent(open, SEASON, TEAM.abbr, fa.id, 3);
    const team = league.teams[TEAM.abbr]!;
    expect(team.roster.find((p) => p.id === fa.id)!.contract).toEqual(c);
    expect(league.freeAgents!.some((p) => p.id === fa.id)).toBe(false);
    expect(move.salary).toBe(capHit(c, SEASON));
    expect(validateTeam(team)).toEqual([]);
  });
});

describe("AI moves", () => {
  it("put long injuries on IR with a replacement signed, leaving full, valid rosters under the cap", () => {
    // A long injury on every AI team's first spare WR.
    const league = advanceInjuries(
      LEAGUE,
      allTeams(LEAGUE)
        .slice(1)
        .map((t) => ({ player: t.roster.filter((p) => p.position === "WR").at(-1)!.id, team: t.abbr, type: "knee", weeks: 10 })),
    );
    const { league: after, moves } = aiInSeasonMoves(league, SEASON, 4, new Set([TEAM.abbr]));
    expect(moves.filter((m) => m.kind === "injured reserve").length).toBeGreaterThan(20);
    expect(moves.filter((m) => m.kind === "signed").length).toBe(moves.filter((m) => m.kind === "injured reserve").length);
    expect(moves.some((m) => m.team === TEAM.abbr)).toBe(false);
    const cap = salaryCap(LEAGUE.seed, SEASON);
    for (const t of allTeams(after)) {
      expect(validateTeam(t)).toEqual([]);
      expect(t.roster.length).toBe(ROSTER_MAX);
      expect(payroll(t, SEASON)).toBeLessThanOrEqual(cap + (t.cap?.rollover ?? 0) + 1);
    }
  });
});
