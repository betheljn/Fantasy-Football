import { describe, expect, it } from "vitest";
import {
  COMBINE_ATTRIBUTES,
  RATING_KEYS,
  REGULAR_SEASON_WEEKS,
  SCOUTING,
  advanceScoutingWeek,
  createScouting,
  formatScoutingReport,
  generateDraftClass,
  generateLeague,
  knowledge,
  playerOverall,
  runCombine,
  scoutSeason,
  scoutingReport,
  teamBoard,
  type ScoutingState,
} from "../src/index.ts";

const LEAGUE = generateLeague("scout-test");
const CLASS = generateDraftClass(LEAGUE);
const SEASON = scoutSeason(LEAGUE, CLASS);
const P = CLASS.prospects[0]!;

describe("knowledge", () => {
  it("grows automatically over the season, and faster with points", () => {
    let s: ScoutingState = createScouting(LEAGUE, CLASS);
    expect(knowledge(s, "TX", P.player.id)).toBe(0);
    const none = { TX: [] as Array<{ prospect: string; points: number }> };
    for (let w = 0; w < 11; w++) s = advanceScoutingWeek(s, LEAGUE, CLASS, none);
    const auto = knowledge(s, "TX", P.player.id);
    expect(auto).toBeGreaterThan(0.1);
    expect(auto).toBeLessThanOrEqual(SCOUTING.automaticBySeasonEnd);
    const focused = advanceScoutingWeek(s, LEAGUE, CLASS, { TX: [{ prospect: P.player.id, points: 12 }] });
    expect(knowledge(focused, "TX", P.player.id)).toBeGreaterThan(auto + 0.3);
  });

  it("caps a team's spending at its weekly points", () => {
    const s = advanceScoutingWeek(createScouting(LEAGUE, CLASS), LEAGUE, CLASS, { TX: [{ prospect: P.player.id, points: 999 }] });
    expect(s.focus["TX"]![P.player.id]).toBe(SCOUTING.pointsPerWeek);
  });

  it("better scouts learn more from the same points", () => {
    const base = createScouting(LEAGUE, CLASS);
    const sharp = { ...base, quality: { ...base.quality, TX: 1.5 } };
    const spend = { TX: [{ prospect: P.player.id, points: 12 }] };
    expect(knowledge(advanceScoutingWeek(sharp, LEAGUE, CLASS, spend), "TX", P.player.id)).toBeGreaterThan(
      knowledge(advanceScoutingWeek(base, LEAGUE, CLASS, spend), "TX", P.player.id),
    );
  });
});

describe("scouting reports", () => {
  it("every range contains the truth, and narrows with knowledge", () => {
    const early = createScouting(LEAGUE, CLASS);
    for (const prospect of CLASS.prospects.slice(0, 60)) {
      for (const state of [early, SEASON]) {
        const r = scoutingReport(state, "TX", prospect);
        for (const k of RATING_KEYS) {
          const a = r.attributes[k];
          expect(a.low).toBeLessThanOrEqual(prospect.player.ratings[k]);
          expect(a.high).toBeGreaterThanOrEqual(prospect.player.ratings[k]);
        }
        expect(r.potential.low).toBeLessThanOrEqual(prospect.player.potential);
        expect(r.potential.high).toBeGreaterThanOrEqual(prospect.player.potential);
      }
      const w = (s: ScoutingState) => {
        const r = scoutingReport(s, "TX", prospect);
        return r.potential.high - r.potential.low;
      };
      expect(w(SEASON)).toBeLessThan(w(early));
    }
  });

  it("the combine makes physical attributes exact for everyone", () => {
    const before = scoutingReport(runCombine(createScouting(LEAGUE, CLASS)), "ME", P);
    for (const k of COMBINE_ATTRIBUTES) {
      expect(before.attributes[k].exact).toBe(true);
      expect(before.attributes[k].estimate).toBe(P.player.ratings[k]);
    }
    expect(before.attributes.awareness.exact).toBe(false);
  });

  it("the development trait stays hidden until a team knows the prospect well", () => {
    const early = scoutingReport(createScouting(LEAGUE, CLASS), "TX", P);
    expect(early.devTrait).toBeNull();
    let s = createScouting(LEAGUE, CLASS);
    for (let w = 0; w < 6; w++) s = advanceScoutingWeek(s, LEAGUE, CLASS, { TX: [{ prospect: P.player.id, points: 12 }] });
    const deep = scoutingReport(s, "TX", P);
    expect(deep.knowledge).toBeGreaterThanOrEqual(SCOUTING.devTraitAt);
    expect(deep.devTrait).toBe(P.player.devTrait);
  });

  it("teams see the same prospect differently", () => {
    const s = createScouting(LEAGUE, CLASS);
    const a = scoutingReport(s, "TX", P);
    const b = scoutingReport(s, "ME", P);
    expect(RATING_KEYS.some((k) => a.attributes[k].low !== b.attributes[k].low)).toBe(true);
  });

  it("formats as a card with ranges", () => {
    const lineman = CLASS.prospects.find((p) => p.player.position === "OL")!;
    const text = formatScoutingReport(scoutingReport(SEASON, "TX", lineman));
    expect(text).toMatch(/\d+-\d+/);
    expect(text).toContain("STR"); // strength counts for linemen
    expect(text).toContain("*"); // combine-measured values
  });
});

describe("AI scouting and team boards", () => {
  it("AI teams focus their points, and focus sharpens their estimates", () => {
    const focused = Object.keys(SEASON.focus["TX"]!);
    expect(focused.length).toBeGreaterThan(5);
    const total = Object.values(SEASON.focus["TX"]!).reduce((s, x) => s + x, 0);
    expect(total).toBe(SCOUTING.pointsPerWeek * REGULAR_SEASON_WEEKS);
    const err = (ids: string[]) => {
      const es = CLASS.prospects.filter((p) => ids.includes(p.player.id)).map((p) => Math.abs(scoutingReport(SEASON, "TX", p).overall.estimate - playerOverall(p.player)));
      return es.reduce((s, x) => s + x, 0) / es.length;
    };
    const unfocused = CLASS.prospects.filter((p) => !focused.includes(p.player.id)).slice(0, 60).map((p) => p.player.id);
    expect(err(focused)).toBeLessThan(err(unfocused));
  });

  it("each team's board ranks by its own estimates, and can be limited to who's left", () => {
    const board = teamBoard(SEASON, CLASS, "TX");
    expect(board).toHaveLength(CLASS.prospects.length);
    for (let i = 1; i < board.length; i++) expect(board[i - 1]!.value).toBeGreaterThanOrEqual(board[i]!.value);
    const left = new Set(CLASS.prospects.slice(100).map((p) => p.player.id));
    expect(teamBoard(SEASON, CLASS, "TX", left)).toHaveLength(left.size);
    expect(teamBoard(SEASON, CLASS, "ME").map((e) => e.prospect.player.id)).not.toEqual(board.map((e) => e.prospect.player.id));
  });

  it("is deterministic", () => {
    expect(scoutSeason(LEAGUE, CLASS)).toEqual(SEASON);
  });
});
