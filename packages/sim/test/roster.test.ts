import { describe, expect, it } from "vitest";
import {
  POSITIONS,
  ROSTER_MAX,
  ROSTER_MIN,
  ROSTER_POSITION_MAX,
  buildDepthChart,
  createPlayer,
  developLeague,
  draftOrder,
  generateDraftClass,
  generateLeague,
  keepValue,
  makeRosterMoves,
  playerOverall,
  processRetirements,
  runDraft,
  scoutSeason,
  simulatePlayoffs,
  simulateSeason,
  validateTeam,
  type League,
} from "../src/index.ts";

const LEAGUE = generateLeague("roster-test");
const CLASS = generateDraftClass(LEAGUE);
const SCOUTING = scoutSeason(LEAGUE, CLASS);
const ORDER = draftOrder(simulatePlayoffs(LEAGUE, simulateSeason(LEAGUE)));
const DRAFT = runDraft(developLeague(processRetirements(LEAGUE).league), CLASS, SCOUTING, ORDER);
const MOVES = makeRosterMoves(DRAFT.league, { undrafted: DRAFT.undrafted, scouting: SCOUTING, order: ORDER });

describe("makeRosterMoves", () => {
  it("leaves every roster at exactly 72, valid, within position limits", () => {
    for (const t of Object.values(MOVES.league.teams)) {
      expect(t.roster).toHaveLength(ROSTER_MAX);
      expect(validateTeam(t)).toEqual([]);
      for (const pos of POSITIONS) {
        const n = t.roster.filter((p) => p.position === pos).length;
        expect(n).toBeGreaterThanOrEqual(ROSTER_MIN[pos]);
        expect(n).toBeLessThanOrEqual(ROSTER_POSITION_MAX[pos]);
      }
    }
  });

  it("accounts for every player: kept + cut = before + signed", () => {
    let before = 0;
    let after = 0;
    for (const [abbr, t] of Object.entries(DRAFT.league.teams)) {
      before += t.roster.length;
      after += MOVES.league.teams[abbr]!.roster.length;
    }
    expect(after).toBe(before + MOVES.signings.length - MOVES.cuts.length);
    expect(MOVES.unsigned.length + MOVES.signings.filter((s) => s.from === "undrafted").length).toBe(DRAFT.undrafted.length);
  });

  it("cuts the weakest: released players are worse than those kept, and early draft picks survive", () => {
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const kept = Object.values(MOVES.league.teams).flatMap((t) => t.roster.map(playerOverall));
    expect(mean(MOVES.cuts.map((c) => playerOverall(c.player)))).toBeLessThan(mean(kept) - 5);
    const earlyPicks = new Set(DRAFT.picks.filter((p) => p.round <= 2).map((p) => p.player.id));
    expect(MOVES.cuts.some((c) => earlyPicks.has(c.player.id))).toBe(false);
  });

  it("fills an empty position, from the undrafted pool or with a free agent", () => {
    const noPunter = (league: League): League => {
      const roster = league.teams["TX"]!.roster.filter((p) => p.position !== "P");
      return { ...league, teams: { ...league.teams, TX: { ...league.teams["TX"]!, roster, depthChart: buildDepthChart(roster) } } };
    };
    const withPool = makeRosterMoves(noPunter(DRAFT.league), { undrafted: DRAFT.undrafted, scouting: SCOUTING, order: ORDER });
    expect(withPool.league.teams["TX"]!.roster.some((p) => p.position === "P")).toBe(true);
    const noPool = makeRosterMoves(noPunter(DRAFT.league), { undrafted: [] });
    const signing = noPool.signings.find((s) => s.team === "TX" && s.player.position === "P")!;
    expect(signing.from).toBe("free_agent");
    expect(noPool.league.teams["TX"]!.roster.some((p) => p.id === signing.player.id)).toBe(true);
  });

  it("is deterministic", () => {
    expect(makeRosterMoves(DRAFT.league, { undrafted: DRAFT.undrafted, scouting: SCOUTING, order: ORDER })).toEqual(MOVES);
  });
});

describe("keepValue", () => {
  const player = (age: number, rating: number) =>
    createPlayer({ id: "x", firstName: "A", lastName: "B", position: "WR", age, ratings: { speed: rating, catching: rating, shortRouteRunning: rating, mediumRouteRunning: rating, deepRouteRunning: rating } });
  it("values youth and upside over age at the same current level", () => {
    const young = player(22, 60);
    const old = player(33, 60);
    expect(playerOverall(young)).toBe(playerOverall(old));
    expect(keepValue(young)).toBeGreaterThan(keepValue(old) + 5);
    expect(keepValue(young, 80)).toBeGreaterThan(keepValue(young, 62));
  });
});
