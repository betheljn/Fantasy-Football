import { describe, expect, it } from "vitest";
import { LEAGUE_LOGOS, LOGOS, NICKNAMES, allTeams, customizeTeam, generateLeague, identityProblem, teamLogo, teamName, teamTag } from "../src/index.ts";

const LEAGUE = generateLeague("identity-test");

describe("the logo library", () => {
  it("has 70 logos with unique ids and nicknames; a new league uses the first 50", () => {
    expect(LOGOS).toHaveLength(70);
    expect(new Set(LOGOS.map((l) => l.id)).size).toBe(70);
    expect(new Set(LOGOS.map((l) => l.nickname)).size).toBe(70);
    expect(NICKNAMES).toEqual(LOGOS.slice(0, LEAGUE_LOGOS).map((l) => l.nickname));
  });

  it("every generated team shows the logo that goes with its nickname, no two alike", () => {
    const logos = allTeams(LEAGUE).map((t) => teamLogo(t));
    for (const [i, t] of allTeams(LEAGUE).entries()) expect(logos[i]!.nickname).toBe(t.nickname);
    expect(new Set(logos.map((l) => l.id)).size).toBe(50);
  });
});

describe("customizeTeam", () => {
  it("renames the team and keeps its state, key and roster", () => {
    const l = customizeTeam(LEAGUE, "MN", { city: "Twin Cities", nickname: "Tigers", tag: "twc", logo: "tigers", colors: { primary: "#112233", trim: "#ffcc00" } });
    const mn = l.teams.MN!;
    expect(teamName(mn)).toBe("Twin Cities Tigers");
    expect(teamTag(mn)).toBe("TWC");
    expect(teamLogo(mn).id).toBe("tigers");
    expect(mn.colors).toEqual({ primary: "#112233", trim: "#FFCC00" });
    expect(mn.state).toBe("Minnesota");
    expect(mn.abbr).toBe("MN");
    expect(mn.roster).toBe(LEAGUE.teams.MN!.roster);
  });

  it("a blank city or tag shows the state and abbr", () => {
    const l = customizeTeam(LEAGUE, "OH", { city: " ", nickname: "Wolves", tag: "", logo: "wolves" });
    expect(teamName(l.teams.OH!)).toBe("Ohio Wolves");
    expect(teamTag(l.teams.OH!)).toBe("OH");
  });

  it("taking another team's nickname or logo trades yours to them, so all stay unique", () => {
    const ohio = LEAGUE.teams.OH!;
    const target = allTeams(LEAGUE).find((t) => t.abbr !== "OH")!;
    const gearTaker = customizeTeam(LEAGUE, target.abbr, { nickname: "Wolves", logo: "wolves" });
    // Ohio takes the target's original nickname and the gear logo another team now holds.
    const l = customizeTeam(gearTaker, "OH", { nickname: target.nickname, logo: "wolves" });
    expect(l.teams.OH!.nickname).toBe(target.nickname);
    expect(teamLogo(l.teams.OH!).id).toBe("wolves");
    expect(teamLogo(l.teams[target.abbr]!).id).toBe(teamLogo(ohio).id);
    const teams = allTeams(l);
    expect(new Set(teams.map((t) => t.nickname.toLowerCase())).size).toBe(50);
    expect(new Set(teams.map((t) => teamLogo(t).id)).size).toBe(50);
  });

  it("rejects bad names, tags, logos and colors", () => {
    const ok = { nickname: "Wolves", logo: "wolves" };
    expect(identityProblem(LEAGUE, "OH", ok)).toBeNull();
    expect(identityProblem(LEAGUE, "OH", { ...ok, nickname: "  " })).toMatch(/nickname/);
    expect(identityProblem(LEAGUE, "OH", { ...ok, nickname: "X".repeat(17) })).toMatch(/16/);
    expect(identityProblem(LEAGUE, "OH", { ...ok, tag: "A1" })).toMatch(/2 to 4 letters/);
    expect(identityProblem(LEAGUE, "OH", { ...ok, tag: "MI" })).toMatch(/Michigan/);
    expect(identityProblem(LEAGUE, "OH", { ...ok, logo: "nope" })).toMatch(/logo/);
    expect(identityProblem(LEAGUE, "OH", { ...ok, colors: { primary: "red", trim: "#FFFFFF" } })).toMatch(/RRGGBB/);
    expect(identityProblem(LEAGUE, "OH", { ...ok, colors: { primary: "#ffffff", trim: "#FFFFFF" } })).toMatch(/different/);
    expect(() => customizeTeam(LEAGUE, "OH", { ...ok, tag: "MI" })).toThrow();
  });
});
