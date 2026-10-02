import { describe, expect, it } from "vitest";
import { addGameToSeason, allTeams, computeRankings, createSeasonStats, localFeed, nationalFeed, playWeek, seasonSchedule, startDynasty, weeklyNews, type GameSummary } from "../src/index.ts";

const DYNASTY = startDynasty("news-test", 2);
const SCHEDULE = seasonSchedule(DYNASTY);
const ME = allTeams(DYNASTY.league)[3]!.abbr;

function weeks(n: number) {
  let league = DYNASTY.league;
  const stats = createSeasonStats();
  const results: GameSummary[] = [];
  let ranks = computeRankings(league, []);
  let last = null as ReturnType<typeof weeklyNews> | null;
  for (let w = 1; w <= n; w++) {
    const week = playWeek(league, SCHEDULE, w, (g) => addGameToSeason(stats, g));
    results.push(...week.games.map((g) => g.summary));
    const after = computeRankings(week.league, results, ranks);
    last = weeklyNews({ league: week.league, schedule: SCHEDULE, season: SCHEDULE.season, week: w, games: week.games, results, before: ranks, after, stats, userTeam: ME });
    ranks = after;
    league = week.league;
  }
  return last!;
}
const NEWS = weeks(5);

describe("weekly news", () => {
  it("writes stories ranked biggest first, with no blanks", () => {
    expect(NEWS.length).toBeGreaterThan(8);
    for (let i = 1; i < NEWS.length; i++) expect(NEWS[i - 1]!.importance).toBeGreaterThanOrEqual(NEWS[i]!.importance);
    for (const s of NEWS) {
      expect(s.headline).not.toMatch(/undefined|\{|NaN/);
      expect(s.body).not.toMatch(/undefined|\{|NaN/);
      expect(s.week).toBe(5);
    }
  });

  it("is the same every time", () => {
    expect(weeks(5)).toEqual(NEWS);
  });

  it("keeps your recap and preview local; the national feed is the biggest of the rest", () => {
    const national = nationalFeed(NEWS);
    expect(national.length).toBeLessThanOrEqual(12);
    expect(national.some((s) => s.local)).toBe(false);
    const local = localFeed(NEWS, ME);
    for (const s of local) expect(s.teams).toContain(ME);
    expect(local.some((s) => s.kind === "preview" || s.kind === "recap")).toBe(true);
  });

  it("covers the MVP race once it's under way", () => {
    expect(NEWS.some((s) => s.kind === "mvp")).toBe(true);
  });
});
