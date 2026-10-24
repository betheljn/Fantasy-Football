import { describe, expect, it } from "vitest";
import { BASE_STARTERS, CAMP, Rng, campStories, finishSeason, generateTeams, playSeason, playerOverall, startDynasty, teamCamp, trainingCamp, type Team } from "../src/index.ts";

const [T] = generateTeams(new Rng("camp-test"), 1) as [Team];

/** The team with its QB2 made exactly as good as QB1 (a battle for sure). */
function qbBattle(team: Team): Team {
  const [q1, q2] = team.depthChart.QB;
  const starter = team.roster.find((p) => p.id === q1)!;
  const roster = team.roster.map((p) => (p.id === q2 ? { ...p, ratings: { ...starter.ratings }, age: starter.age } : p));
  return { ...team, roster };
}

describe("training camp", () => {
  it("settles close spots: the winner starts and comes out a little better", () => {
    let upsets = 0;
    for (let i = 0; i < 30; i++) {
      const team = qbBattle(T);
      const r = teamCamp(team, `camp-${i}`);
      const b = r.battles.find((x) => x.position === "QB")!;
      expect(b).toBeDefined();
      expect(r.battles.length).toBeLessThanOrEqual(CAMP.perTeam);
      expect(r.team.depthChart.QB[0]).toBe(b.winner);
      const before = team.roster.find((p) => p.id === b.winner)!;
      const after = r.team.roster.find((p) => p.id === b.winner)!;
      expect(playerOverall(after)).toBeGreaterThan(playerOverall(before));
      if (b.upset) upsets++;
    }
    // Dead even: either can win it.
    expect(upsets).toBeGreaterThan(5);
    expect(upsets).toBeLessThan(25);
  });

  it("leaves clear starters and the injured alone, and is the same every time", () => {
    const team = qbBattle(T);
    const [q1] = team.depthChart.QB;
    const hurt = { ...team, roster: team.roster.map((p) => (p.id === q1 ? { ...p, injury: { type: "ankle", weeks: 2 } } : p)) };
    expect(teamCamp(hurt, "s").battles.some((b) => b.position === "QB")).toBe(false);
    expect(teamCamp(team, "s")).toEqual(teamCamp(team, "s"));
    for (const b of teamCamp(T, "s").battles) expect(b.spot).toBe(BASE_STARTERS[b.position]);
  });

  it("stories: quarterbacks, upsets, and everything on your team", () => {
    const { battles } = trainingCamp({ ...startDynasty("camp-stories", 1).league });
    const yours = battles[0]!.team;
    const stories = campStories(battles, 2032, (a) => a, yours);
    expect(stories.filter((s) => s.local).length).toBe(battles.filter((b) => b.team === yours).length);
    expect(stories.every((s) => s.kind === "camp" && s.week === 0)).toBe(true);
    for (let i = 1; i < stories.length; i++) expect(stories[i - 1]!.importance).toBeGreaterThanOrEqual(stories[i]!.importance);
  });

  it("runs as the offseason finishes, recorded on the dynasty", { timeout: 120_000 }, () => {
    const d = startDynasty("camp-season", 2);
    const after = finishSeason(d, playSeason(d)).dynasty;
    expect(after.camp!.length).toBeGreaterThan(50);
    const b = after.camp![0]!;
    const n = BASE_STARTERS[b.position];
    expect(after.league.teams[b.team]!.depthChart[b.position][n - 1]).toBe(b.winner);
  });
});
