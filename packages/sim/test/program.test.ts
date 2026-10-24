import { describe, expect, it } from "vitest";
import {
  LOCAL_SHARE,
  REGION_CORES,
  allTeams,
  assignContracts,
  capFloor,
  createProgram,
  customizeTeam,
  payroll,
  programSlot,
  regionFits,
  regionOf,
  salaryCap,
  skillChoiceProblem,
  skillGroupOf,
  startDynasty,
  teamName,
  teamRatings,
  validateTeam,
  type SkillGroup,
} from "../src/index.ts";

const DYNASTY = startDynasty("program-test", 3);

describe("skill groups to a region", () => {
  it("the best fit is the region whose core matches your order", () => {
    expect(regionFits(["speed", "coverage", "passRush"])[0]).toMatchObject({ region: "Southeast", matches: ["speed", "coverage", "passRush"] });
    expect(regionFits(["passers", "catchers", "passRush"])[0]!.region).toBe("Pacific");
    expect(regionFits(["powerRun", "bigMen", "runStop"])[0]!.region).toBe("Plains");
    expect(regionFits(["speed", "bigMen", "kicking"])).toHaveLength(10);
  });

  it("needs three different groups", () => {
    expect(skillChoiceProblem(["speed", "speed", "bigMen"])).toMatch(/different/);
    expect(skillChoiceProblem(["speed"])).toMatch(/three/);
    expect(skillChoiceProblem(["speed", "bigMen", "nope" as SkillGroup])).toMatch(/isn't/);
  });
});

describe("your program", () => {
  const made = createProgram(DYNASTY, ["speed", "coverage", "passRush"]);
  const team = made.dynasty.league.teams[made.team]!;

  it("takes a spot in the best-fit region, named for the region, with no state shown", () => {
    expect(made.region).toBe("Southeast");
    expect(regionOf(made.team)).toBe("Southeast");
    expect(made.team).toBe(programSlot("Southeast"));
    expect(team.region).toBe("Southeast");
    expect(teamName(team)).toBe(`Southeast ${team.nickname}`);
    expect(teamName(customizeTeam(made.dynasty.league, made.team, { city: "Gulf Coast", nickname: "Tigers", logo: "tigers" }).teams[made.team]!)).toBe("Gulf Coast Tigers");
  });

  it("has a fresh, legal, mostly local roster, as strong as the program it replaced", () => {
    expect(validateTeam(team)).toEqual([]);
    expect(team.roster).toHaveLength(72);
    const old = new Set(DYNASTY.league.teams[made.team]!.roster.map((p) => p.id));
    expect(team.roster.some((p) => old.has(p.id))).toBe(false);
    const local = team.roster.filter((p) => regionOf(p.home!) === "Southeast").length / team.roster.length;
    expect(local).toBeGreaterThan(LOCAL_SHARE - 0.08);
    expect(local).toBeLessThan(1);
    expect(Math.abs(teamRatings(team).overall - teamRatings(DYNASTY.league.teams[made.team]!).overall)).toBeLessThan(1.5);
    // Its best players lean to the region's core.
    const best = [...team.roster].sort((a, b) => b.potential - a.potential).slice(0, 20);
    expect(best.filter((p) => REGION_CORES.Southeast!.includes(skillGroupOf(p))).length).toBeGreaterThan(6);
  });

  it("sends the folded program's players to free agency and fits every payroll to the cap", () => {
    const freeAgents = new Set((made.dynasty.league.freeAgents ?? []).map((p) => p.id));
    const folded = DYNASTY.league.teams[made.team]!.roster;
    expect(folded.filter((p) => freeAgents.has(p.id)).length).toBeGreaterThan(10);
    const season = made.dynasty.league.season;
    const cap = salaryCap(made.dynasty.league.seed, season);
    const pay = payroll(team, season);
    expect(pay).toBeLessThanOrEqual(cap);
    expect(pay).toBeGreaterThanOrEqual(capFloor(cap) - 10);
    // Everyone else gets about the deals any new league would (rookie deals rank each age group league-wide, so the new roster nudges them).
    const fresh = assignContracts(DYNASTY.league);
    for (const t of allTeams(made.dynasty.league)) {
      if (t.abbr === made.team) continue;
      const theirs = payroll(fresh.teams[t.abbr]!, season);
      expect(Math.abs(payroll(t, season) - theirs)).toBeLessThan(theirs * 0.01);
    }
  });

  it("is the same program for the same choices", () => {
    const again = createProgram(DYNASTY, ["speed", "coverage", "passRush"]);
    expect(again.dynasty.league.teams[again.team]!.roster.map((p) => p.id)).toEqual(team.roster.map((p) => p.id));
    expect(createProgram(DYNASTY, ["bigMen", "runStop", "kicking"], "Pacific").region).toBe("Pacific");
  });
});

describe("a program's short name", () => {
  it("comes from its name when left blank, never its state's code, and stays unique", async () => {
    const { suggestedTag, teamTag } = await import("../src/index.ts");
    const made = createProgram(DYNASTY, ["passers", "catchers", "passRush"]);
    const named = customizeTeam(made.dynasty.league, made.team, { nickname: "Tigers", logo: "tigers" });
    expect(teamTag(named.teams[made.team]!)).toBe("PAC");
    const city = customizeTeam(made.dynasty.league, made.team, { city: "Bay City", nickname: "Tigers", logo: "tigers" });
    expect(teamTag(city.teams[made.team]!)).toBe("BAY");
    // Taken already (the program goes by PAC): anyone else asking for "Pacific" gets another, still unique.
    const other = Object.keys(made.dynasty.league.teams).find((t) => t !== made.team)!;
    const tag = suggestedTag(made.dynasty.league, other, "Pacific");
    expect(tag).not.toBe("PAC");
    expect(tag).toMatch(/^[A-Z]{2,4}$/);
  });
});

describe("several programs (online)", () => {
  it("friends who fit one region share it from the most typical spot down, up to five, then go to their next best", async () => {
    const { planPrograms, programSlots } = await import("../src/index.ts");
    const groups: SkillGroup[] = ["speed", "coverage", "passRush"];
    const six = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, groups }));
    const plan = planPrograms(six);
    expect([...plan.values()].slice(0, 5).map((p) => p.team)).toEqual(programSlots("Southeast"));
    expect(plan.get("f")!.region).toBe("Capital");
    // Building: each friend's program in its own spot, different rosters.
    const first = createProgram(DYNASTY, groups);
    const second = createProgram(first.dynasty, groups, { taken: new Set([first.team]) });
    expect(second.team).toBe(plan.get("b")!.team);
    expect(second.dynasty.league.teams[first.team]!.region).toBe("Southeast");
    const a = second.dynasty.league.teams[first.team]!.roster.map((p) => p.lastName);
    const b = second.dynasty.league.teams[second.team]!.roster.map((p) => p.lastName);
    expect(a).not.toEqual(b);
  });
});

describe("an unnamed program", () => {
  it("goes by its region's short name, never its spot's state code", async () => {
    const { teamTag } = await import("../src/index.ts");
    const made = createProgram(DYNASTY, ["speed", "coverage", "passRush"]);
    expect(teamTag(made.dynasty.league.teams[made.team]!)).toBe("SOU");
  });
});

describe("random regions", () => {
  it("draw a region from the seed (same seed, same region), across all ten", async () => {
    const { randomRegion, regions } = await import("../src/index.ts");
    expect(randomRegion("abc")).toBe(randomRegion("abc"));
    const seen = new Set(Array.from({ length: 200 }, (_, i) => randomRegion(`s${i}`)));
    expect(seen.size).toBe(regions().length);
  });

  it("a program goes to its set region (next best only if it's full)", async () => {
    const { planPrograms, programSlots } = await import("../src/index.ts");
    const groups: SkillGroup[] = ["speed", "coverage", "passRush"];
    const plan = planPrograms(["a", "b", "c", "d", "e", "f"].map((id) => ({ id, groups, region: "Pacific" })));
    expect([...plan.values()].slice(0, 5).map((p) => p.team)).toEqual(programSlots("Pacific"));
    expect(plan.get("f")!.region).toBe("Southeast");
    expect(createProgram(DYNASTY, groups, { region: "Pacific" }).region).toBe("Pacific");
  });

  it("your skill groups still shape the roster, wherever it is", () => {
    const count = (groups: SkillGroup[]) => {
      const made = createProgram(DYNASTY, groups, { region: "Mountain" });
      return made.dynasty.league.teams[made.team]!.roster.filter((p) => groups.includes(skillGroupOf(p))).length;
    };
    // The same region, two different sets of choices: each roster leans to its own.
    const speed: SkillGroup[] = ["speed", "coverage", "catchers"];
    const trenches: SkillGroup[] = ["bigMen", "runStop", "powerRun"];
    const made = createProgram(DYNASTY, speed, { region: "Mountain" });
    const other = createProgram(DYNASTY, trenches, { region: "Mountain" });
    const inSpeed = (r: typeof made) => r.dynasty.league.teams[r.team]!.roster.filter((p) => speed.includes(skillGroupOf(p))).length;
    expect(inSpeed(made)).toBeGreaterThan(inSpeed(other));
    expect(count(trenches)).toBeGreaterThan(0);
  });
});
