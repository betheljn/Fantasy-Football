import { describe, expect, it } from "vitest";
import { GAME_DAY, applyBreakouts, allTeams, playSpring, playerOverall, springPlayers, springTeams, startDynasty, validateTeam } from "../src/index.ts";

const DYNASTY = startDynasty("spring-test", 2);
const LEAGUE = DYNASTY.league;
const { spring } = playSpring(LEAGUE, LEAGUE.season);

describe("spring teams", () => {
  it("are built from the players below each team's game-day 53", () => {
    const t = allTeams(LEAGUE)[0]!;
    const mine = springPlayers(t);
    const expected = Object.entries(GAME_DAY).reduce((n, [pos, keep]) => n + Math.max(0, t.depthChart[pos as keyof typeof GAME_DAY].length - keep), 0);
    expect(mine.length).toBe(expected);
    for (const p of mine) expect(t.depthChart[p.position].indexOf(p.id)).toBeGreaterThanOrEqual(GAME_DAY[p.position]);
  });

  it("one per division, each able to field a full game", () => {
    const teams = springTeams(LEAGUE, LEAGUE.season);
    expect(teams).toHaveLength(10);
    // A pooled spring roster can run past 72; everything else must be right.
    for (const t of teams) expect(validateTeam(t).filter((e) => !/jersey|Roster has/i.test(e))).toEqual([]);
  });
});

describe("the spring season", () => {
  it("plays a round robin in each conference, then a final", () => {
    expect(spring.games).toHaveLength(21);
    for (const t of spring.teams) expect(t.wins + t.losses + t.ties).toBe(4);
    expect([spring.champion, spring.runnerUp].sort()).toEqual([spring.games.at(-1)!.home, spring.games.at(-1)!.away].sort());
  });

  it("is the same every time", () => {
    expect(playSpring(LEAGUE, LEAGUE.season).spring).toEqual(spring);
  });

  it("sends its breakouts home better, from every position group", () => {
    expect(spring.breakouts.length).toBeGreaterThan(6);
    expect(new Set(spring.breakouts.map((b) => b.position)).size).toBeGreaterThan(4);
    const after = applyBreakouts(LEAGUE, spring);
    for (const b of spring.breakouts) {
      const p = after.teams[b.team]!.roster.find((x) => x.id === b.player)!;
      expect(playerOverall(p)).toBe(b.after);
      expect(b.after).toBeGreaterThan(b.before);
    }
  });
});
