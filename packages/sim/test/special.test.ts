import { describe, expect, it } from "vitest";
import { RATING_KEYS, Rng, allTeams, blockChance, choreograph, generateTeams, playerOverall, runDynasty, simulateGame, specialUnits, startDynasty, type Team } from "../src/index.ts";

const GAMES = Array.from({ length: 60 }, (_, i) => {
  const [h, a] = generateTeams(new Rng(`st-${i}`), 2) as [Team, Team];
  return { h, a, g: simulateGame(h, a, i) };
});

describe("special teams", () => {
  it("puts eleven a side on every kick, with no one twice", () => {
    const [h, a] = [GAMES[0]!.h, GAMES[0]!.a];
    for (const kind of ["field_goal", "extra_point", "punt", "kickoff"] as const) {
      const u = specialUnits(h, a, kind);
      expect(u.kicking).toHaveLength(11);
      expect(new Set(u.kicking.map((m) => m.id)).size).toBe(11);
      expect(u.receiving.length).toBeGreaterThanOrEqual(10);
    }
    for (const { g } of GAMES)
      for (const p of g.plays) {
        const e = p.event;
        const kick = e.kind === "punt" || e.kind === "kickoff" || e.kind === "field_goal" || (e.kind === "conversion" && !e.play);
        if (!kick) continue;
        const anim = choreograph(e, `${g.seed}:${p.seq}`)!;
        for (const team of [e.offense, e.defense]) expect(anim.actors.filter((x) => x.team === team)).toHaveLength(11);
        expect(new Set(anim.actors.map((x) => x.id)).size).toBe(22);
      }
  });

  it("blocks are rare, credited to a rusher on the field, and a better rush blocks more", () => {
    let kicks = 0;
    let blocked = 0;
    for (const { g } of GAMES)
      for (const p of g.plays) {
        const e = p.event;
        if (e.kind !== "field_goal" && e.kind !== "punt" && !(e.kind === "conversion" && !e.play)) continue;
        kicks++;
        if (!e.blocked) continue;
        blocked++;
        expect(e.units!.receiving.map((m) => m.id)).toContain(e.blockedBy);
      }
    expect(blocked / kicks).toBeLessThan(0.03);
    // Same teams, the rushers made great: the odds go up.
    const { h, a } = GAMES[1]!;
    const u = specialUnits(h, a, "field_goal");
    const rushers = new Set(u.receiving.map((m) => m.id));
    const boosted: Team = { ...a, roster: a.roster.map((p) => (rushers.has(p.id) ? { ...p, ratings: { ...p.ratings, powerMoves: 99, finesseMoves: 99, jumping: 99, acceleration: 99 } } : p)) };
    expect(blockChance("field_goal", h, boosted, u, 45)).toBeGreaterThan(blockChance("field_goal", h, a, u, 45));
    // Long kicks fly lower.
    expect(blockChance("field_goal", h, a, u, 55)).toBeGreaterThan(blockChance("field_goal", h, a, u, 35));
  });
});

describe("ratings", () => {
  it("never go above 99, through seasons of development", () => {
    const check = (teams: Team[]) => {
      for (const t of teams)
        for (const p of t.roster) {
          for (const k of RATING_KEYS) expect(p.ratings[k]).toBeLessThanOrEqual(99);
          expect(playerOverall(p)).toBeLessThanOrEqual(99);
          expect(p.potential).toBeLessThanOrEqual(99);
        }
    };
    const d = startDynasty("cap-99", 3);
    check(allTeams(d.league));
    runDynasty(d, 2, (x) => check(allTeams(x.league)));
  }, 300_000);
});

describe("blocked field goals (rules 3)", () => {
  it("are recovered or returned, the defense scores the touchdown, and older rules keep the old outcome", () => {
    let returned = 0;
    let scored = 0;
    for (let i = 0; i < 400 && scored === 0; i++) {
      const [h, a] = generateTeams(new Rng(`bfg-${i}`), 2) as [Team, Team];
      const g = simulateGame(h, a, i);
      for (const p of g.plays) {
        const e = p.event;
        if (e.kind !== "field_goal" || !e.blocked) continue;
        returned++;
        expect(e.returnedBy).toBeTruthy();
        if (e.touchdown) {
          scored++;
          // The defense's six, then its try and kickoff.
          const next = g.plays[p.seq + 1]!.event;
          expect(next.kind).toBe("conversion");
          expect(next.kind === "conversion" && next.team).toBe(e.defense);
        } else expect(e.nextYardline).toBeGreaterThan(0);
      }
      for (const p of simulateGame(h, a, i, { rules: 2 }).plays) if (p.event.kind === "field_goal") expect(p.event.returnedBy).toBeUndefined();
    }
    expect(returned).toBeGreaterThan(0);
    expect(scored).toBeGreaterThan(0);
  }, 300_000);
});
