import { describe, expect, it } from "vitest";
import { forMember } from "../src/offseason.ts";
import { newsFor } from "../src/news.ts";
import { advance, openSeason } from "../src/season.ts";
import { newLeagueState } from "../src/state.ts";

describe("news online", () => {
  const opened = openSeason({ ...newLeagueState("news-online"), humans: { OH: "m1", TX: "m2" } });

  it("each week writes the national feed and each friend's own stories, sent only to them", { timeout: 120_000 }, () => {
    const after = advance(opened, new Set(["OH", "TX"])).state;
    const news = after.progress.news!;
    const shared = news.filter((s) => !s.for);
    expect(shared.length).toBeGreaterThan(3);
    expect(shared.every((s) => s.week === 1)).toBe(true);
    // Each friend gets their own recap and preview.
    for (const team of ["OH", "TX"]) {
      const own = news.filter((s) => s.for === team);
      expect(own.some((s) => s.kind === "recap")).toBe(true);
      expect(own.every((s) => s.teams.includes(team) && s.id.endsWith(`#${team}`))).toBe(true);
    }
    expect(new Set(news.map((s) => s.id)).size).toBe(news.length);
    // What each friend downloads: the shared feed and their own, never the other's.
    const oh = forMember(after, "OH").progress.news!;
    expect(oh.some((s) => s.for === "TX")).toBe(false);
    expect(oh.some((s) => s.for === "OH")).toBe(true);
    expect(newsFor(news, null).every((s) => !s.for)).toBe(true);
  });
});
