import { describe, expect, it } from "vitest";
import { addGameToSeason, createSeasonStats, fromSaveJson, playGame, seasonSchedule, startDynasty, toSaveJson } from "../src/index.ts";

const DYNASTY = startDynasty("compact-test", 2);
const STATS = createSeasonStats();
const SCHEDULE = seasonSchedule(DYNASTY);
const RESULTS = SCHEDULE.games
  .filter((g) => g.week <= 2)
  .map((g) => {
    const { summary, result } = playGame(DYNASTY.league, g);
    addGameToSeason(STATS, result);
    return summary;
  });
const SAVE = { version: 3, dynasty: DYNASTY, results: RESULTS, stats: STATS };
const plain = (v: unknown) => JSON.stringify(v, (_k, x) => (x instanceof Map ? { __map: [...x.entries()] } : x));

describe("compact saves", () => {
  it("round-trips a dynasty exactly", () => {
    const back = fromSaveJson<typeof SAVE>(toSaveJson(SAVE));
    expect(back).toEqual(SAVE);
    expect(back.dynasty.careers).toBeInstanceOf(Map);
  });

  it("is much smaller than plain JSON", () => {
    expect(toSaveJson(SAVE).length).toBeLessThan(plain(SAVE).length * 0.45);
  });

  it("still reads the older Map-tagged saves", () => {
    expect(fromSaveJson<typeof SAVE>(plain(SAVE))).toEqual(SAVE);
  });

  it("leaves contract years with extras (options, incentives) as they are", () => {
    const year = { season: 2031, salary: 900, bonus: 0, guaranteed: false, option: true };
    expect(fromSaveJson(toSaveJson({ years: [year] }))).toEqual({ years: [year] });
  });
});
