import { describe, expect, it } from "vitest";
import {
  Rng,
  createScouting,
  developTeam,
  developmentFactor,
  draftStyle,
  draftValue,
  evaluationError,
  evaluationInsight,
  generateDraftClass,
  generateLeague,
  keepStyle,
  makeRosterMoves,
  playerOverall,
  runDraft,
  scoutSeason,
  scoutingQuality,
  type GmPhilosophy,
  type League,
  type Team,
  type TeamStaff,
} from "../src/index.ts";

const LEAGUE = generateLeague("fo-test");
const TX = LEAGUE.teams["TX"]!;

function withStaff(team: Team, patch: Partial<{ [K in keyof TeamStaff]: Partial<TeamStaff[K]> }>): Team {
  const s = team.staff!;
  return {
    ...team,
    staff: {
      hc: { ...s.hc, ...patch.hc },
      oc: { ...s.oc, ...patch.oc },
      dc: { ...s.dc, ...patch.dc },
      gm: { ...s.gm, ...patch.gm },
      scout: { ...s.scout, ...patch.scout },
    } as TeamStaff,
  };
}
const replace = (league: League, team: Team): League => ({ ...league, teams: { ...league.teams, [team.abbr]: team } });
const { staff: _unused, ...noStaff } = TX;

describe("neutral without staff", () => {
  it("has no front-office or development effect", () => {
    expect(scoutingQuality(noStaff)).toBe(1);
    expect(evaluationError(noStaff, "x")).toBe(0);
    expect(evaluationInsight(noStaff)).toBe(0);
    expect(draftStyle(noStaff)).toEqual({ needWeight: 1, overallShare: 0.45 });
    expect(keepStyle(noStaff)).toEqual({ growth: 1, aging: 1 });
    expect(developmentFactor(noStaff)).toEqual({ growth: 1, decline: 1 });
  });
});

describe("scouting director", () => {
  it("sets the team's scouting quality", () => {
    const sharp = replace(LEAGUE, withStaff(TX, { scout: { scouting: 90 } }));
    const dull = replace(LEAGUE, withStaff(TX, { scout: { scouting: 30 } }));
    const cls = generateDraftClass(LEAGUE);
    expect(createScouting(sharp, cls).quality["TX"]!).toBeGreaterThan(1.5);
    expect(createScouting(dull, cls).quality["TX"]!).toBeLessThan(0.5 + 0.3);
  });
});

describe("general manager", () => {
  it("misjudges players consistently, and poor evaluators misjudge more", () => {
    const good = withStaff(TX, { gm: { talentEvaluation: 90 } });
    const bad = withStaff(TX, { gm: { talentEvaluation: 25 } });
    expect(evaluationError(good, "p1")).toBe(evaluationError(good, "p1"));
    const spread = (t: Team) => {
      const xs = Array.from({ length: 2000 }, (_, i) => evaluationError(t, `p${i}`));
      return Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length);
    };
    expect(spread(bad)).toBeGreaterThan(spread(good) * 3);
    expect(evaluationInsight(good)).toBeGreaterThan(0.15);
    expect(evaluationInsight(bad)).toBe(0);
  });

  it("a great evaluator drafts better players from the same slot", () => {
    let great = 0;
    let poor = 0;
    for (const seed of ["fo-a", "fo-b", "fo-c"]) {
      const league = generateLeague(seed);
      const cls = generateDraftClass(league);
      const scouting = scoutSeason(league, cls);
      const order = Object.keys(league.teams);
      for (const abbr of order.slice(0, 8)) {
        const value = (evaluation: number) => {
          const t = withStaff(league.teams[abbr]!, { gm: { talentEvaluation: evaluation, philosophy: "Best Available" } });
          return runDraft(replace(league, t), cls, scouting, order)
            .picks.filter((p) => p.team === abbr && p.round <= 3)
            .reduce((s, p) => s + draftValue(p.player.position, playerOverall(p.player), p.player.potential), 0);
        };
        great += value(92);
        poor += value(25);
      }
    }
    expect(great).toBeGreaterThan(poor);
  }, 60_000);

  it("philosophy tilts roster decisions: Youth Movement keeps younger players than Win Now", () => {
    const cls = generateDraftClass(LEAGUE);
    const scouting = scoutSeason(LEAGUE, cls);
    const order = Object.keys(LEAGUE.teams);
    const ageAfter = (philosophy: GmPhilosophy) => {
      const league = replace(LEAGUE, withStaff(TX, { gm: { philosophy } }));
      const draft = runDraft(league, cls, scouting, order);
      const moves = makeRosterMoves(draft.league, { undrafted: draft.undrafted, scouting, order });
      const roster = moves.league.teams["TX"]!.roster;
      return roster.reduce((s, p) => s + p.age, 0) / roster.length;
    };
    expect(ageAfter("Youth Movement")).toBeLessThan(ageAfter("Win Now"));
  });
});

describe("head coach development", () => {
  it("a great developer grows young players faster than a poor one", () => {
    const grown = (development: number) => {
      const t = developTeam(withStaff(TX, { hc: { development } }), "dev-test");
      const before = new Map(TX.roster.map((p) => [p.id, playerOverall(p)]));
      const young = t.roster.filter((p) => p.age <= 24);
      return young.reduce((s, p) => s + playerOverall(p) - before.get(p.id)!, 0) / young.length;
    };
    expect(grown(92)).toBeGreaterThan(grown(25) + 0.5);
  });
});

describe("determinism", () => {
  it("evaluation errors come from fixed seeds", () => {
    expect(new Rng("x").next()).toBe(new Rng("x").next());
    expect(evaluationError(TX, "abc")).toBe(evaluationError(TX, "abc"));
  });
});
