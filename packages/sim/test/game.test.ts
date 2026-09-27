import { describe, expect, it } from "vitest";
import {
  Rng,
  describePlay,
  generateTeams,
  getPlayer,
  pointsForEvent,
  simulateGame,
  simulateKickoff,
  type GameResult,
  type Team,
} from "../src/index.ts";

const [HOME, AWAY] = generateTeams(new Rng("game-test"), 2) as [Team, Team];

/** Many games across varied matchups, generated once for the invariant tests. */
const GAMES: GameResult[] = Array.from({ length: 300 }, (_, i) => {
  const [h, a] = generateTeams(new Rng(`game-test-${i}`), 2) as [Team, Team];
  return simulateGame(h, a, i);
});

describe("simulateGame", () => {
  it("is deterministic: same teams + seed = same game", () => {
    expect(simulateGame(HOME, AWAY, "abc")).toEqual(simulateGame(HOME, AWAY, "abc"));
    expect(simulateGame(HOME, AWAY, "abc")).not.toEqual(simulateGame(HOME, AWAY, "abd"));
  });

  it("the score is exactly the sum of scoring events, and per-play scores add up", () => {
    for (const g of GAMES) {
      const total: Record<string, number> = { [g.home]: 0, [g.away]: 0 };
      for (const p of g.plays) {
        for (const [t, pts] of Object.entries(pointsForEvent(p.event))) total[t]! += pts;
        expect(p.score).toEqual(total);
      }
      expect(total).toEqual(g.score);
      for (const t of [g.home, g.away]) {
        expect(g.periodScores[t]!.reduce((s, x) => s + x, 0)).toBe(g.score[t]);
      }
    }
  });

  it("time only moves forward", () => {
    for (const g of GAMES) {
      let q = 1;
      let clock = 900;
      for (const p of g.plays) {
        expect(p.quarter).toBeGreaterThanOrEqual(q);
        if (p.quarter > q) {
          q = p.quarter;
          clock = q >= 5 ? 600 : 900;
        }
        expect(p.clockAfter).toBeLessThanOrEqual(clock);
        clock = p.clockAfter;
      }
    }
  });

  it("follows game structure: opening kickoff, second-half kickoff, overtime only when tied", () => {
    for (const g of GAMES) {
      const first = g.plays[0]!.event;
      expect(first.kind).toBe("kickoff");
      expect(first.kind === "kickoff" && first.defense).toBe(g.openingReceiver);

      const q3 = g.plays.find((p) => p.quarter === 3)!.event;
      expect(q3.kind).toBe("kickoff");
      // The team that received first kicks off the second half.
      expect(q3.kind === "kickoff" && q3.offense).toBe(g.openingReceiver);

      const regulation = (t: string) => g.periodScores[t]!.slice(0, 4).reduce((s, x) => s + x, 0);
      if (g.overtime) {
        expect(regulation(g.home)).toBe(regulation(g.away));
        expect(g.periodScores[g.home]!.length).toBe(5);
      } else {
        expect(g.winner).not.toBeNull();
      }
      const diff = g.score[g.home]! - g.score[g.away]!;
      expect(g.winner).toBe(diff === 0 ? null : diff > 0 ? g.home : g.away);
    }
  });

  it("drives alternate sensibly and index into the play log", () => {
    for (const g of GAMES) {
      for (const d of g.drives) {
        expect(d.plays.to).toBeGreaterThan(d.plays.from);
        const events = g.plays.slice(d.plays.from, d.plays.to).map((p) => p.event);
        expect(events.every((e) => e.offense === d.offense || e.kind === "conversion")).toBe(true);
        for (const t of Object.values(d.timeouts)) expect(t).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("overtime gives the trailing team its possession before ending", () => {
    for (const g of GAMES.filter((x) => x.overtime && x.winner)) {
      const loser = g.winner === g.home ? g.away : g.home;
      // The loser must have had the ball in OT: a drive, or (rarely) a kickoff return TD.
      const hadDrive = g.drives.some((d) => d.start.quarter >= 5 && d.offense === loser);
      const returnTd = g.plays.some(
        (p) => p.quarter >= 5 && p.event.kind === "kickoff" && p.event.touchdown && p.event.defense === loser,
      );
      expect(hadDrive || returnTd).toBe(true);
    }
  });

  it("league-wide results are in a realistic range", () => {
    const n = GAMES.length * 2;
    const points = GAMES.reduce((s, g) => s + g.score[g.home]! + g.score[g.away]!, 0) / n;
    const plays = GAMES.reduce((s, g) => s + g.drives.reduce((x, d) => x + d.scrimmagePlays, 0), 0) / n;
    const drives = GAMES.reduce((s, g) => s + g.drives.length, 0) / n;
    expect(points).toBeGreaterThan(18);
    expect(points).toBeLessThan(27);
    expect(plays).toBeGreaterThan(58);
    expect(plays).toBeLessThan(70);
    expect(drives).toBeGreaterThan(9.5);
    expect(drives).toBeLessThan(13.5);
    expect(GAMES.filter((g) => g.overtime).length / GAMES.length).toBeLessThan(0.12);
  });

  it("every event has feed text", () => {
    const g = simulateGame(HOME, AWAY, 7);
    const who = (id: string) => (id.startsWith(HOME.abbr) ? getPlayer(HOME, id) : getPlayer(AWAY, id));
    for (const p of g.plays) expect(describePlay(p.event, who)).not.toContain("?");
  });
});

describe("simulateKickoff", () => {
  it("produces sane starting spots", () => {
    const rng = new Rng(2);
    for (let i = 0; i < 2000; i++) {
      const onside = i % 10 === 0;
      const freeKick = i % 10 === 5;
      const k = simulateKickoff(rng, { kicking: HOME, receiving: AWAY, quarter: 1, clock: 900, onside, freeKick });
      expect(k.nextYardline).toBeGreaterThan(0);
      expect(k.nextYardline).toBeLessThanOrEqual(100);
      expect(k.touchdown).toBe(k.nextYardline === 100);
      if (k.touchback) expect(k.nextYardline).toBe(30);
      // Off a normal kick, the kicking team only keeps it on a lost return fumble.
      if (!onside) expect(k.recoveredByKickingTeam).toBe(!!k.fumble?.lost);
      if (freeKick) expect(k.touchback).toBe(false);
    }
  });
});
