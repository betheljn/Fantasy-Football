import { describe, expect, it } from "vitest";
import { HOF_RULES, PLAYER_STAT_KEYS, hofBallot, hofVote, inductees, retiredNumbers, startDynasty, type CareerLine, type Dynasty } from "../src/index.ts";

const START = startDynasty("hof-test", 1);
const SEASON = 2040;
const zeros = () => Object.fromEntries(PLAYER_STAT_KEYS.map((k) => [k, 0])) as CareerLine["stats"];

/** A retired QB with a career of `yards`, last playing in `last`. */
function qb(id: string, yards: number, last: number, seasons = 10): CareerLine {
  return { id, name: `QB ${id}`, position: "QB", teams: ["OH"], seasons, games: seasons * 20, stats: { ...zeros(), passYds: yards, passTd: Math.round(yards / 140) }, lastSeason: last, jersey: 12, teamSeasons: { OH: seasons } };
}

function dynastyWith(lines: CareerLine[]): Dynasty {
  // A field of ordinary careers sets the bar; the stars stand out.
  const field = Array.from({ length: 120 }, (_, i) => qb(`f${i}`, 8000 + i * 100, SEASON - 4, 6));
  return { ...START, careers: new Map([...field, ...lines].map((c) => [c.id, c])) };
}

describe("the Hall of Fame ballot", () => {
  const star = qb("star", 60000, SEASON - 2);
  const tooSoon = qb("soon", 60000, SEASON - 1);
  const short = qb("short", 60000, SEASON - 2, 3);
  const d = dynastyWith([star, tooSoon, short]);
  const ballot = hofBallot(d, SEASON);

  it("takes long careers once the player has sat out a season", () => {
    const ids = ballot.map((c) => c.id);
    expect(ids).toContain("star");
    expect(ids).not.toContain("soon");
    expect(ids).not.toContain("short");
    expect(ballot.length).toBeLessThanOrEqual(HOF_RULES.ballotSize);
  });

  it("puts a clear-cut star in, and his team retires his number", () => {
    const vote = hofVote(d.league.seed, SEASON, ballot);
    expect(vote.results.find((r) => r.candidate.id === "star")!.inducted).toBe(true);
    expect(vote.results.filter((r) => r.inducted).length).toBeLessThanOrEqual(HOF_RULES.maxClass);
    const [inducted] = inductees(vote, d.careers);
    expect(inducted!.team).toBe("OH");
    expect(inducted!.jersey).toBe(12);
    const after = { ...d, hallOfFame: inductees(vote, d.careers) };
    expect(retiredNumbers(after, "OH").map((i) => i.id)).toContain("star");
    expect(hofBallot(after, SEASON + 1).map((c) => c.id)).not.toContain("star");
  });

  it("counts your ballot as one more voter, and is the same every time", () => {
    const a = hofVote(d.league.seed, SEASON, ballot, ["star"]);
    expect(a).toEqual(hofVote(d.league.seed, SEASON, ballot, ["star"]));
    const pct = (v: typeof a) => v.results.find((r) => r.candidate.id === "star")!.pct;
    expect(pct(a)).toBeGreaterThanOrEqual(pct(hofVote(d.league.seed, SEASON, ballot)) - 0.03);
  });
});
