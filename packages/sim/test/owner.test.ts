import { describe, expect, it } from "vitest";
import { FIRED_BELOW, afterReview, answerPress, jobOffers, pressConference, seasonReview, startFrontOffice, teamOwner, type SeasonContext } from "../src/index.ts";

const SEED = "owner-test";
const ctx = (over: Partial<SeasonContext>): SeasonContext => ({ season: 2031, wins: 10, losses: 10, ties: 0, expectedWins: 10, playoffs: false, champion: false, profit: 10_000, ratingBefore: 60, ratingAfter: 60, starterAge: 27, ...over });

describe("owners", () => {
  it("each team has one, with a goal, the same every time", () => {
    const o = teamOwner(SEED, "OH");
    expect(teamOwner(SEED, "OH")).toEqual(o);
    expect(["win", "profit", "build"]).toContain(o.goal);
  });

  it("grade a season against their goal", () => {
    const winner = { ...teamOwner(SEED, "OH"), goal: "win" as const, patience: 2 as const };
    const great = seasonReview(winner, startFrontOffice("gm"), ctx({ wins: 16, losses: 4, playoffs: true, champion: true }), SEED);
    const bad = seasonReview(winner, startFrontOffice("gm"), ctx({ wins: 4, losses: 16 }), SEED);
    expect(great.grade).toBe("A");
    expect(great.trustChange).toBeGreaterThan(0);
    expect(bad.trustChange).toBeLessThan(0);
    const counter = { ...winner, goal: "profit" as const };
    expect(seasonReview(counter, startFrontOffice("gm"), ctx({ profit: 60_000 }), SEED).trustChange).toBeGreaterThan(seasonReview(counter, startFrontOffice("gm"), ctx({ profit: -40_000 }), SEED).trustChange);
  });

  it("fire a GM whose trust runs out, but never an owner", () => {
    const o = { ...teamOwner(SEED, "OH"), goal: "win" as const, patience: 1 as const };
    const shaky = { ...startFrontOffice("gm"), trust: FIRED_BELOW + 5 };
    const r = seasonReview(o, shaky, ctx({ wins: 3, losses: 17 }), SEED);
    expect(r.fired).toBe(true);
    expect(seasonReview(o, { ...shaky, role: "owner" }, ctx({ wins: 3, losses: 17 }), SEED).fired).toBe(false);
    expect(afterReview(shaky, r).reviews).toHaveLength(1);
    expect(jobOffers(["AK", "WY", "VT", "OH"], "OH", SEED, 2031)).toHaveLength(3);
  });
});

describe("press conferences", () => {
  it("ask about what just happened, and answers move mood and trust once", () => {
    const p = pressConference(SEED, 2031, { week: 4, won: false, tied: false, margin: 3, opponent: "Ironclads", streak: -4 });
    expect(p.question).toMatch(/4 straight losses/);
    const fo = startFrontOffice("gm");
    const after = answerPress(fo, p, 1);
    expect(after.fanMood).toBe(fo.fanMood + p.answers[1]!.fans);
    expect(answerPress(after, p, 0)).toEqual(after);
    const rivalry = pressConference(SEED, 2031, { week: 5, won: true, tied: false, margin: 7, opponent: "X", streak: 1, rivalry: { trophy: "the Copper Kettle", won: true } });
    expect(rivalry.question).toMatch(/Copper Kettle/);
  });
});
