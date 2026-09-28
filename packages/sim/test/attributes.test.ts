import { describe, expect, it } from "vitest";
import {
  ARCHETYPES,
  RATING_INFO,
  RATING_KEYS,
  Rng,
  buildDefense,
  buildDepthChart,
  buildOffense,
  generateLeague,
  generateTeams,
  playerOverall,
  simulateKickoff,
  simulatePass,
  simulateRun,
  type PassPlayEvent,
  type Position,
  type Ratings,
  type Situation,
  type Team,
} from "../src/index.ts";

const [OFF, DEF] = generateTeams(new Rng("attr-test"), 2) as [Team, Team];
const SIT: Situation = { quarter: 1, clock: 600, down: 1, distance: 10, yardline: 35 };

function withRatings(team: Team, pos: Position, patch: Partial<Ratings>): Team {
  const roster = team.roster.map((p) => (p.position === pos ? { ...p, ratings: { ...p.ratings, ...patch } } : p));
  return { ...team, roster, depthChart: buildDepthChart(roster) };
}

function passes(o: Team, d: Team, n = 12000, coverage: "cover_1" | "cover_3" = "cover_3"): PassPlayEvent[] {
  const rng = new Rng(`p:${n}:${coverage}`);
  const formations = { offense: buildOffense(o, "11", "shotgun"), defense: buildDefense(d, "nickel", coverage) };
  return Array.from({ length: n }, () => simulatePass(rng, { offense: o, defense: d, situation: SIT, formations }));
}
const rate = (es: PassPlayEvent[], f: (e: PassPlayEvent) => boolean, of: (e: PassPlayEvent) => boolean = () => true) =>
  es.filter((e) => of(e) && f(e)).length / es.filter(of).length;
const complete = (e: PassPlayEvent) => e.outcome === "complete";

describe("attribute metadata", () => {
  it("every attribute has an abbreviation, name and group", () => {
    expect(RATING_KEYS.length).toBeGreaterThanOrEqual(45);
    for (const k of RATING_KEYS) {
      expect(RATING_INFO[k].abbr.length).toBeGreaterThan(1);
      expect(RATING_INFO[k].name.length).toBeGreaterThan(3);
    }
    expect(new Set(RATING_KEYS.map((k) => RATING_INFO[k].abbr)).size).toBe(RATING_KEYS.length);
  });
});

describe("the sim uses the detailed attributes", () => {
  it("deep accuracy drives deep completions far more than short ones", () => {
    const deep = (e: PassPlayEvent) => e.outcome !== "sack" && e.airYards >= 20;
    const short = (e: PassPlayEvent) => e.outcome !== "sack" && e.airYards > 0 && e.airYards < 10;
    const sharp = passes(withRatings(OFF, "QB", { deepAccuracy: 95 }), DEF);
    const wild = passes(withRatings(OFF, "QB", { deepAccuracy: 35 }), DEF);
    const deepGain = rate(sharp, complete, deep) - rate(wild, complete, deep);
    const shortGain = rate(sharp, complete, short) - rate(wild, complete, short);
    expect(deepGain).toBeGreaterThan(0.1);
    expect(Math.abs(shortGain)).toBeLessThan(0.03);
  });

  it("pass rush is a power/finesse matchup", () => {
    const bullRushers = withRatings(DEF, "DL", { powerMoves: 95, finesseMoves: 40 });
    const vsFinesseLine = withRatings(OFF, "OL", { passBlockPower: 40, passBlockFinesse: 90 });
    const vsPowerLine = withRatings(OFF, "OL", { passBlockPower: 90, passBlockFinesse: 40 });
    const sack = (e: PassPlayEvent) => e.outcome === "sack";
    expect(rate(passes(vsFinesseLine, bullRushers), sack)).toBeGreaterThan(rate(passes(vsPowerLine, bullRushers), sack) * 1.4);
  });

  it("slippery quarterbacks escape sacks", () => {
    const sack = (e: PassPlayEvent) => e.outcome === "sack";
    expect(rate(passes(withRatings(OFF, "QB", { breakSack: 95 }), DEF), sack)).toBeLessThan(
      rate(passes(withRatings(OFF, "QB", { breakSack: 30 }), DEF), sack) * 0.8,
    );
  });

  it("release beats press in man coverage", () => {
    const pressCorners = withRatings(DEF, "CB", { press: 95 });
    const good = passes(withRatings(OFF, "WR", { release: 95 }), pressCorners, 12000, "cover_1");
    const bad = passes(withRatings(OFF, "WR", { release: 35 }), pressCorners, 12000, "cover_1");
    const toWr = (e: PassPlayEvent) => e.outcome !== "sack" && OFF.roster.find((p) => p.id === e.target)?.position === "WR";
    expect(rate(good, complete, toWr)).toBeGreaterThan(rate(bad, complete, toWr) + 0.03);
  });

  it("ball carrier vision gains yards", () => {
    const ypc = (t: Team) => {
      const rng = new Rng("run");
      const formations = { offense: buildOffense(t, "11", "shotgun"), defense: buildDefense(DEF, "nickel", "cover_3") };
      let y = 0;
      for (let i = 0; i < 12000; i++) y += simulateRun(rng, { offense: t, defense: DEF, situation: SIT, formations }).yardsGained;
      return y / 12000;
    };
    expect(ypc(withRatings(OFF, "RB", { ballCarrierVision: 95 }))).toBeGreaterThan(ypc(withRatings(OFF, "RB", { ballCarrierVision: 35 })) + 0.4);
  });

  it("kick returners with better return skill gain more yards", () => {
    const avgReturn = (receiving: Team) => {
      const rng = new Rng("kr");
      let y = 0;
      let n = 0;
      for (let i = 0; i < 6000; i++) {
        const k = simulateKickoff(rng, { kicking: OFF, receiving, quarter: 1, clock: 900 });
        if (k.returner) {
          y += k.returnYards;
          n++;
        }
      }
      return y / n;
    };
    const boost = (pos: Position) => (t: Team) => withRatings(t, pos, { kickReturn: 95 });
    const fast = boost("CB")(boost("WR")(boost("RB")(DEF)));
    const slow = withRatings(withRatings(withRatings(DEF, "RB", { kickReturn: 30 }), "WR", { kickReturn: 30 }), "CB", { kickReturn: 30 });
    expect(avgReturn(fast)).toBeGreaterThan(avgReturn(slow) + 3);
  });
});

describe("archetypes", () => {
  const players = Object.values(generateLeague("archetype-test").teams).flatMap((t) => t.roster);

  it("every player has a valid archetype for his position", () => {
    for (const p of players) expect(ARCHETYPES[p.position].map((a) => a.name)).toContain(p.archetype);
  });

  it("shape the profile, not the overall", () => {
    const qbs = players.filter((p) => p.position === "QB");
    const group = (name: string) => qbs.filter((p) => p.archetype === name);
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const scramblers = group("Scrambler");
    const generals = group("Field General");
    expect(mean(scramblers.map((p) => p.ratings.speed))).toBeGreaterThan(mean(generals.map((p) => p.ratings.speed)) + 12);
    expect(mean(generals.map((p) => p.ratings.awareness))).toBeGreaterThan(mean(scramblers.map((p) => p.ratings.awareness)) + 6);
    // Overall is about talent: archetype averages stay within a few points.
    expect(Math.abs(mean(scramblers.map(playerOverall)) - mean(generals.map(playerOverall)))).toBeLessThan(4);
  });
});
