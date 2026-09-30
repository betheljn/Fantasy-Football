import { describe, expect, it } from "vitest";
import {
  Rng,
  aggression,
  clockMistakeChance,
  coachingEdges,
  defenseProfile,
  disciplineFactor,
  generateStaff,
  generateTeams,
  goForTwo,
  isNullified,
  offenseProfile,
  simulateGame,
  type DefensiveScheme,
  type GameResult,
  type OffensiveScheme,
  type Team,
  type TeamStaff,
} from "../src/index.ts";

const [A, B] = generateTeams(new Rng("coaching-test"), 2) as [Team, Team];
const BASE: TeamStaff = generateStaff(new Rng("staff"), "X");
// An average, neutral staff: Pro Style / Multiple, average ratings, middle dials.
const NEUTRAL: TeamStaff = {
  hc: { ...BASE.hc, gameManagement: 58, discipline: 58, development: 58, aggressiveness: 50 },
  oc: { ...BASE.oc, scheme: "Pro Style", playCalling: 58, passingGame: 58, runningGame: 58, tempo: 45 },
  dc: { ...BASE.dc, scheme: "Multiple", playCalling: 58, passDefense: 58, runDefense: 58 },
  gm: BASE.gm,
  scout: BASE.scout,
};
const withStaff = (t: Team, patch: Partial<{ [K in keyof TeamStaff]: Partial<TeamStaff[K]> }> = {}): Team => ({
  ...t,
  staff: {
    hc: { ...NEUTRAL.hc, ...patch.hc },
    oc: { ...NEUTRAL.oc, ...patch.oc },
    dc: { ...NEUTRAL.dc, ...patch.dc },
    gm: { ...NEUTRAL.gm, ...patch.gm },
    scout: { ...NEUTRAL.scout, ...patch.scout },
  } as TeamStaff,
});

function games(home: Team, away: Team, n = 150): GameResult[] {
  return Array.from({ length: n }, (_, i) => simulateGame(home, away, `c${i}`));
}
function offenseStats(gs: GameResult[], team: string) {
  let snaps = 0, passes = 0, fourth = 0, go = 0, pens = 0, plays = 0;
  for (const g of gs) {
    for (const { event: e } of g.plays) {
      if (e.kind === "penalty" && e.penalty.team === team) pens++;
      if ((e.kind === "run" || e.kind === "pass") && e.penalty?.accepted && e.penalty.team === team) pens++;
      if (e.offense !== team) continue;
      if ((e.kind === "punt" || e.kind === "field_goal") && e.start.down === 4) fourth++;
      if (e.kind !== "run" && e.kind !== "pass") continue;
      if (isNullified(e)) continue;
      snaps++;
      plays++;
      if (e.kind === "pass") passes++;
      if (e.start.down === 4) { fourth++; go++; }
    }
  }
  return { passRate: passes / snaps, goRate: go / fourth, pensPerGame: pens / gs.length, playsPerGame: plays / gs.length };
}
function blitzRate(gs: GameResult[], defense: string) {
  let drop = 0, blitz = 0;
  for (const g of gs) for (const { event: e } of g.plays) {
    if (e.kind !== "pass" || e.defense !== defense) continue;
    drop++;
    if (e.formation.defense.blitzers.length) blitz++;
  }
  return blitz / drop;
}

describe("coaching is neutral without staff", () => {
  it("returns neutral effects for a team with no staff", () => {
    expect(offenseProfile(A)).toEqual({ passLean: 0, personnel: {}, shotgun: 0, deep: 1, qbRun: 1 });
    expect(defenseProfile(A)).toEqual({ blitz: 1, man: 1, twoHigh: 1, cover3: 1 });
    expect(coachingEdges(A, B)).toEqual({ run: 0, completion: 0 });
    expect([aggression(A), disciplineFactor(A), clockMistakeChance(A)]).toEqual([0, 1, 0]);
  });

  it("an average, neutral staff has no quality edge", () => {
    expect(coachingEdges(withStaff(A), withStaff(B))).toEqual({ run: 0, completion: 0 });
  });
});

describe("coaching changes how teams play", () => {
  const scheme = (s: OffensiveScheme) => offenseStats(games(withStaff(A, { oc: { scheme: s } }), withStaff(B)), A.abbr);

  it("offensive schemes set the run/pass mix", () => {
    expect(scheme("Air Raid").passRate).toBeGreaterThan(scheme("Power Run").passRate + 0.15);
  });

  it("defensive schemes set the blitz rate", () => {
    const rate = (s: DefensiveScheme) => blitzRate(games(withStaff(A), withStaff(B, { dc: { scheme: s } })), B.abbr);
    expect(rate("Blitz Heavy")).toBeGreaterThan(rate("Two-High Zone") * 2);
  }, 30_000);

  it("up-tempo coordinators run more plays", () => {
    const fast = offenseStats(games(withStaff(A, { oc: { tempo: 90 } }), withStaff(B)), A.abbr);
    const slow = offenseStats(games(withStaff(A, { oc: { tempo: 20 } }), withStaff(B)), A.abbr);
    expect(fast.playsPerGame).toBeGreaterThan(slow.playsPerGame + 2);
  }, 30_000);

  it("aggressive head coaches go for it more on 4th down", () => {
    const bold = offenseStats(games(withStaff(A, { hc: { aggressiveness: 95 } }), withStaff(B), 250), A.abbr);
    const timid = offenseStats(games(withStaff(A, { hc: { aggressiveness: 5 } }), withStaff(B), 250), A.abbr);
    expect(bold.goRate).toBeGreaterThan(timid.goRate + 0.05);
  }, 30_000);

  it("disciplined head coaches draw fewer flags", () => {
    const clean = offenseStats(games(withStaff(A, { hc: { discipline: 95 } }), withStaff(B), 250), A.abbr);
    const sloppy = offenseStats(games(withStaff(A, { hc: { discipline: 25 } }), withStaff(B), 250), A.abbr);
    expect(clean.pensPerGame).toBeLessThan(sloppy.pensPerGame - 1);
  }, 30_000);

  it("better coordinators give their unit an edge", () => {
    const great = withStaff(A, { oc: { playCalling: 90, passingGame: 90, runningGame: 90 } });
    const poor = withStaff(A, { oc: { playCalling: 30, passingGame: 30, runningGame: 30 } });
    const e1 = coachingEdges(great, withStaff(B));
    const e2 = coachingEdges(poor, withStaff(B));
    expect(e1.run).toBeGreaterThan(0.2);
    expect(e2.run).toBeLessThan(-0.2);
    expect(e1.completion).toBeGreaterThan(0.02);
    const pts = (t: Team) => games(t, withStaff(B), 200).reduce((s, g) => s + g.score[A.abbr]!, 0) / 200;
    expect(pts(great)).toBeGreaterThan(pts(poor));
  }, 30_000);
});

describe("two-point decisions", () => {
  it("follow the chart, earlier for aggressive coaches, rarely for cautious ones", () => {
    expect(goForTwo(4, -2)).toBe(true);
    expect(goForTwo(3, -2)).toBe(false);
    expect(goForTwo(3, -2, 80)).toBe(true);
    expect(goForTwo(4, -5, 20)).toBe(false);
    expect(goForTwo(4, -2, 20)).toBe(true);
    expect(goForTwo(4, 0, 90)).toBe(false);
  });
});
