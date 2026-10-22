import { teamName } from "@dynasty/sim";
import { describe, expect, it } from "vitest";
import { openBoard, picksOf } from "../src/picks.ts";
import { advance, openSeason, scheduleOf } from "../src/season.ts";
import { newLeagueState } from "../src/state.ts";

process.env.PICKS_SIMS ??= "2";

describe("friends against friends online", () => {
  // Two friends who meet in week 1, and two more who meet in week 2.
  const base = openSeason(newLeagueState("friends-online"));
  const league = base.dynasty.league;
  const sched = scheduleOf(base);
  const g1 = sched.games.find((g) => g.week === 1)!;
  const g2 = sched.games.find((g) => g.week === 2 && ![g1.home, g1.away].includes(g.home) && ![g1.home, g1.away].includes(g.away))!;
  const humans = { [g1.home]: "m1", [g1.away]: "m2", [g2.home]: "m3", [g2.away]: "m4" };
  const opened = openSeason({ ...newLeagueState("friends-online"), humans });

  it("keeps their game, tells it in the news, and previews their next meeting on the radio", { timeout: 120_000 }, () => {
    const after = advance(opened, new Set(Object.keys(humans))).state;
    expect(after.friendGames).toEqual([expect.objectContaining({ season: league.season, week: 1, home: g1.home, away: g1.away })]);
    const story = after.progress.news!.find((s) => s.kind === "friends")!;
    expect(story.body).toMatch(/take the first meeting/);
    expect(story.for).toBeUndefined(); // everyone's news
    // Week 2's show (worked out when week 1 was played) previews the next friends' game.
    const matchup = `${teamName(league.teams[g2.away]!)} at ${teamName(league.teams[g2.home]!)}`;
    expect(picksOf(after).shows.at(-1)!.lines.find((l) => l.text.includes(matchup))?.text).toMatch(/First time these two meet\.$/);
    // With an earlier meeting on record, the preview gives the series.
    const met = { ...after, friendGames: [...after.friendGames!, { season: league.season - 1, week: 3, home: g2.home, away: g2.away, homeScore: 20, awayScore: 3, duel: false }] };
    const show = picksOf(openBoard(met, sched, 2)).shows.at(-1)!;
    expect(show.lines.find((l) => l.text.includes(matchup))?.text).toMatch(/lead the series 1-0\.$/);
  });
});
