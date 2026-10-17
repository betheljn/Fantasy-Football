import { describe, expect, it } from "vitest";
import {
  CALM,
  CURRENT_FORMAT,
  Rng,
  conditionEffects,
  crowdNoise,
  describeConditions,
  fieldGoalProbability,
  gameConditions,
  generateLeague,
  generateSchedule,
  generateTeams,
  kickerOf,
  playWeek,
  simulateGame,
  startLeagueBusiness,
  syncVenues,
  type GameConditions,
  type GameResult,
  type Team,
} from "../src/index.ts";

const league = syncVenues({ league: { ...generateLeague("conditions-test"), format: CURRENT_FORMAT } }).league;
const [A, B] = generateTeams(new Rng("conditions-teams"), 2) as [Team, Team];

describe("game-day conditions", () => {
  it("are the same every time, get colder through the season, and stay out of a dome", () => {
    const g = { id: "g1", week: 3, home: "MN" };
    expect(gameConditions(league, g)).toEqual(gameConditions(league, g));
    const temps = (week: number) => Array.from({ length: 40 }, (_, i) => gameConditions(league, { id: `t${i}`, week, home: "MN" }).temp).reduce((a, b) => a + b, 0) / 40;
    expect(temps(16)).toBeLessThan(temps(1) - 15);
    const domed = { ...league, teams: { ...league.teams, MN: { ...league.teams.MN!, venue: { dome: true, noise: 0.5 } } } };
    const c = gameConditions(domed, g);
    expect(c).toMatchObject({ dome: true, precip: "none", wind: 0 });
    expect(gameConditions(league, g, true).noise).toBe(0);
    expect(describeConditions(c)).toMatch(/^Indoors/);
  });

  it("crowd noise comes from the stadium's die-hards and size; a typical crowd is the usual road factor", () => {
    const b = startLeagueBusiness(league);
    const noises = Object.values(b).map(crowdNoise);
    const mean = noises.reduce((a, x) => a + x, 0) / noises.length;
    expect(mean).toBeGreaterThan(0.4);
    expect(mean).toBeLessThan(0.62);
    expect(conditionEffects({ ...CALM, noise: 0.5 }).visitorFalseStart).toBeCloseTo(1.3);
    expect(league.teams.OH!.venue).toBeDefined();
  });

  it("weather effects: wind, rain, snow and cold", () => {
    // Calm weather changes nothing (the crowd only matters to visitors: never at a neutral site).
    const { visitorFalseStart: _v, ...calm } = conditionEffects({ ...CALM, noise: 0 });
    const { visitorFalseStart: _n, ...none } = conditionEffects(undefined);
    expect(calm).toEqual(none);
    const windy = conditionEffects({ ...CALM, wind: 25 });
    expect(windy.deepCompletion).toBeLessThan(windy.completion);
    expect(windy.kickYards).toBeGreaterThan(0);
    expect(conditionEffects({ ...CALM, precip: "rain" }).fumble).toBeGreaterThan(1);
    expect(conditionEffects({ ...CALM, precip: "snow" }).completion).toBeLessThan(conditionEffects({ ...CALM, precip: "rain" }).completion);
    const k = kickerOf(A);
    expect(fieldGoalProbability(k, 50, conditionEffects({ ...CALM, temp: 10, wind: 25 }))).toBeLessThan(fieldGoalProbability(k, 50) - 0.1);
  });
});

describe("conditions in games", () => {
  const rain: GameConditions = { dome: false, temp: 45, precip: "rain", wind: 22, noise: 0.5 };
  const stats = (games: GameResult[]) => {
    let att = 0, comp = 0, fum = 0;
    for (const g of games)
      for (const p of g.plays) {
        const e = p.event;
        if (e.kind === "pass" && e.outcome !== "sack") (att++, e.outcome === "complete" && comp++);
        if ((e.kind === "run" || e.kind === "pass") && e.fumble) fum++;
      }
    return { comp: comp / att, fum: fum / games.length };
  };

  it("play only from rules 6, and are recorded on the game", () => {
    const plain = simulateGame(A, B, "c1", { rules: 5 });
    const { conditions: _c, ...withConditions } = simulateGame(A, B, "c1", { rules: 5, conditions: rain });
    expect(withConditions.plays).toEqual(plain.plays);
    expect(simulateGame(A, B, "c1", { conditions: rain }).conditions).toEqual(rain);
  });

  it("rain and wind cost completions and loosen the ball", { timeout: 60_000 }, () => {
    const games = (c?: GameConditions) => Array.from({ length: 60 }, (_, i) => simulateGame(A, B, `c-${i}`, c ? { conditions: c } : {}));
    const dry = stats(games({ ...CALM, noise: 0.5 }));
    const wet = stats(games(rain));
    expect(wet.comp).toBeLessThan(dry.comp - 0.02);
    expect(wet.fum).toBeGreaterThan(dry.fum);
  });

  it("every scheduled game records its conditions", () => {
    const schedule = generateSchedule(league);
    const week = playWeek(league, schedule, 1);
    for (const g of week.games) expect(g.summary.conditions).toEqual(gameConditions(league, schedule.games.find((x) => x.id === g.summary.id)!));
  });
});
