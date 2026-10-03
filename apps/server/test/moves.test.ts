import { describe, expect, it } from "vitest";
import { playerOverall, seasonWindow, suggestTrade, type Player, type Team } from "@dynasty/sim";
import { applyMove } from "../src/moves.ts";
import { advance, openSeason, scheduleOf } from "../src/season.ts";
import { newLeagueState, type LeagueState } from "../src/state.ts";

const opened = openSeason({ ...newLeagueState("moves-test"), humans: { OH: "m1", TX: "m2" } });
const ohio = (s: LeagueState) => s.dynasty.league.teams.OH!;

/** Ohio with one player hurt for `weeks`. */
function hurt(s: LeagueState, weeks: number): { state: LeagueState; player: Player } {
  const team = ohio(s);
  const player = team.roster.find((p) => p.position === "WR")!;
  const roster = team.roster.map((p) => (p.id === player.id ? { ...p, injury: { type: "knee", weeks } } : p));
  const updated: Team = { ...team, roster };
  return { state: { ...s, dynasty: { ...s.dynasty, league: { ...s.dynasty.league, teams: { ...s.dynasty.league.teams, OH: updated } } } }, player };
}

describe("friends' own moves", () => {
  it("depth chart: your order is kept and logged; a chart that doesn't match the roster is refused", () => {
    const qbs = ohio(opened).depthChart.QB;
    const flipped = [...qbs].reverse();
    const r = applyMove(opened, "OH", { kind: "depth", pos: "QB", ids: flipped });
    expect(r.problems).toEqual([]);
    expect(ohio(r.state!).depthChart.QB).toEqual(flipped);
    expect(r.state!.progress.lineups.entries.at(-1)).toMatchObject({ team: "OH", week: 1 });
    expect(applyMove(opened, "OH", { kind: "depth", pos: "QB", ids: [...flipped, flipped[0]!] }).problems).toHaveLength(1);
    expect(applyMove(opened, "OH", { kind: "depth", pos: "QB", ids: ["not-a-player"] }).problems).toHaveLength(1);
  });

  it("injured reserve, then a signing into the open spot", () => {
    // Short injuries can't go on IR, and a full roster can't sign anyone.
    const short = hurt(opened, 2);
    expect(applyMove(short.state, "OH", { kind: "ir", player: short.player.id }).problems[0]).toContain("injured reserve");
    const fa = opened.dynasty.league.freeAgents![0]!;
    expect(ohio(opened).roster).toHaveLength(72);
    expect(applyMove(opened, "OH", { kind: "sign", player: fa.id }).problems[0]).toContain("roster is full");

    const long = hurt(opened, 8);
    const ir = applyMove(long.state, "OH", { kind: "ir", player: long.player.id });
    expect(ir.problems).toEqual([]);
    expect(ohio(ir.state!).roster).toHaveLength(71);
    expect(ohio(ir.state!).reserve?.map((p) => p.id)).toContain(long.player.id);
    expect(ir.state!.progress.moves.at(-1)).toMatchObject({ team: "OH", kind: "injured reserve", player: long.player.id });

    const signed = applyMove(ir.state!, "OH", { kind: "sign", player: fa.id });
    expect(signed.problems).toEqual([]);
    expect(ohio(signed.state!).roster.map((p) => p.id)).toContain(fa.id);
    expect(signed.state!.dynasty.league.freeAgents?.some((p) => p.id === fa.id)).toBe(false);
  });

  it("trades: with AI teams when their GM likes it; never for someone else, never with a friend", () => {
    const league = opened.dynasty.league;
    const w = seasonWindow(league, 0);
    // Ask for one of Indiana's backups; the sim suggests what Indiana would take for him.
    const indiana = league.teams.IN!;
    const want = [...indiana.roster].filter((p) => p.position === "LB").sort((a, b) => playerOverall(a) - playerOverall(b))[0]!;
    const offer = suggestTrade(league, w, "OH", "IN", [want.id]);
    expect(offer).not.toBeNull();
    const made = applyMove(opened, "OH", { kind: "trade", proposal: offer! });
    expect(made.problems).toEqual([]);
    expect(made.verdict?.accept).toBe(true);
    expect(ohio(made.state!).roster.map((p) => p.id)).toContain(want.id);
    expect(made.state!.progress.trades.at(-1)?.teams).toEqual(["OH", "IN"]);

    // Ohio's weakest player for Indiana's best: Indiana says no (a verdict, no change).
    const byOverall = (ps: readonly Player[]) => [...ps].sort((a, b) => playerOverall(a) - playerOverall(b));
    const greedy = applyMove(opened, "OH", { kind: "trade", proposal: { from: "OH", to: "IN", give: [byOverall(ohio(opened).roster)[0]!.id], get: [byOverall(indiana.roster).at(-1)!.id] } });
    expect(greedy.state).toBeNull();
    expect(greedy.verdict?.accept).toBe(false);

    expect(applyMove(opened, "OH", { kind: "trade", proposal: { ...offer!, from: "IN", to: "OH" } }).problems[0]).toContain("your own");
    const toFriend = { from: "OH", to: "TX", give: [ohio(opened).roster[0]!.id], get: [opened.dynasty.league.teams.TX!.roster[0]!.id] };
    expect(applyMove(opened, "OH", { kind: "trade", proposal: toFriend }).problems[0]).toContain("friends");
  });

  it("closed after the regular season (trades reopen in draft week)", { timeout: 120_000 }, () => {
    let s = opened;
    for (let i = 0; i < scheduleOf(s).weeks; i++) s = advance(s, new Set(["OH", "TX"])).state;
    const qbs = ohio(s).depthChart.QB;
    expect(applyMove(s, "OH", { kind: "depth", pos: "QB", ids: [...qbs].reverse() }).problems[0]).toContain("regular season");
    expect(applyMove(s, "OH", { kind: "trade", proposal: { from: "OH", to: "IN", give: [], get: [] } }).problems[0]).toContain("closed");
    const playoffs = advance(s, new Set()).state;
    const r = applyMove(playoffs, "OH", { kind: "trade", proposal: { from: "OH", to: "IN", give: [], get: [] } });
    expect(r.problems[0]).not.toContain("closed");
  });
});
