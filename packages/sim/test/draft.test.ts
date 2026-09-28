import { describe, expect, it } from "vitest";
import {
  DRAFT_ROUNDS,
  PLAYOFF_ROUNDS,
  buildDepthChart,
  draftOrder,
  generateDraftClass,
  generateLeague,
  runDraft,
  scoutSeason,
  simulatePlayoffs,
  simulateSeason,
  type League,
} from "../src/index.ts";

const LEAGUE = generateLeague("draft-test");
const CLASS = generateDraftClass(LEAGUE);
const SCOUTING = scoutSeason(LEAGUE, CLASS);
const PLAYOFFS = simulatePlayoffs(LEAGUE, simulateSeason(LEAGUE));
const ORDER = draftOrder(PLAYOFFS);
const DRAFT = runDraft(LEAGUE, CLASS, SCOUTING, ORDER);

describe("draftOrder", () => {
  it("has every team once: non-playoff teams worst first, the champion last", () => {
    expect(new Set(ORDER).size).toBe(50);
    expect(ORDER.at(-1)).toBe(PLAYOFFS.champion);
    expect(ORDER.at(-2)).toBe(PLAYOFFS.runnerUp);
    const inField = new Set(PLAYOFFS.seeds.map((s) => s.team));
    const missed = ORDER.slice(0, 34);
    expect(missed.every((t) => !inField.has(t))).toBe(true);
    const rank = new Map(PLAYOFFS.ranking.map((e) => [e.team, e.rank]));
    for (let i = 1; i < missed.length; i++) expect(rank.get(missed[i - 1]!)!).toBeGreaterThan(rank.get(missed[i]!)!);
    // Playoff teams pick by the round they were knocked out in: earlier exits first.
    const roundIndex = (t: string) => {
      const lost = PLAYOFFS.games.find((g) => (g.summary.home === t || g.summary.away === t) && g.summary.winner !== t);
      return lost ? PLAYOFF_ROUNDS.indexOf(lost.round) : PLAYOFF_ROUNDS.length; // champion never lost
    };
    const playoffTeams = ORDER.slice(34);
    for (let i = 1; i < playoffTeams.length; i++) expect(roundIndex(playoffTeams[i]!)).toBeGreaterThanOrEqual(roundIndex(playoffTeams[i - 1]!));
  });
});

describe("runDraft", () => {
  it("makes 350 picks in 7 rounds, following the order every round", () => {
    expect(DRAFT.picks).toHaveLength(DRAFT_ROUNDS * 50);
    for (let round = 1; round <= DRAFT_ROUNDS; round++) {
      expect(DRAFT.picks.filter((p) => p.round === round).map((p) => p.team)).toEqual(ORDER);
    }
    DRAFT.picks.forEach((p, i) => expect(p.overall).toBe(i + 1));
  });

  it("drafts each prospect once and leaves the rest undrafted", () => {
    const ids = DRAFT.picks.map((p) => p.player.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length + DRAFT.undrafted.length).toBe(CLASS.prospects.length);
    for (const u of DRAFT.undrafted) expect(ids).not.toContain(u.player.id);
  });

  it("rookies join their team with a unique jersey and a hidden trait", () => {
    for (const [abbr, team] of Object.entries(DRAFT.league.teams)) {
      expect(team.roster.length).toBe(LEAGUE.teams[abbr]!.roster.length + DRAFT_ROUNDS);
      expect(new Set(team.roster.map((p) => p.jersey)).size).toBe(team.roster.length);
    }
    for (const p of DRAFT.picks) {
      expect(DRAFT.league.teams[p.team]!.roster.some((x) => x.id === p.player.id)).toBe(true);
      expect(p.player.devTraitRevealed).toBe(false);
    }
  });

  it("earlier picks are better prospects on average", () => {
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const pot = (round: number) => mean(DRAFT.picks.filter((p) => p.round === round).map((p) => p.player.potential));
    expect(pot(1)).toBeGreaterThan(pot(4) + 5);
    expect(pot(4)).toBeGreaterThan(pot(7));
  });

  it("teams draft from their own board, which differs from the public one", () => {
    const firstRound = DRAFT.picks.filter((p) => p.round === 1);
    expect(firstRound.every((p) => p.teamRank <= 20)).toBe(true);
    expect(firstRound.some((p) => p.publicRank !== p.overall)).toBe(true);
  });

  it("a team with nobody at a position fills it", () => {
    const noKicker: League = {
      ...LEAGUE,
      teams: {
        ...LEAGUE.teams,
        TX: (() => {
          const roster = LEAGUE.teams["TX"]!.roster.filter((p) => p.position !== "K");
          return { ...LEAGUE.teams["TX"]!, roster, depthChart: buildDepthChart(roster) };
        })(),
      },
    };
    const d = runDraft(noKicker, CLASS, SCOUTING, ORDER);
    expect(d.picks.some((p) => p.team === "TX" && p.player.position === "K")).toBe(true);
  });

  it("spreads a team's picks across positions", () => {
    for (const team of ORDER) {
      const positions = DRAFT.picks.filter((p) => p.team === team).map((p) => p.player.position);
      const most = Math.max(...positions.map((pos) => positions.filter((x) => x === pos).length));
      expect(most).toBeLessThanOrEqual(4);
    }
  });

  it("honors a human team's choices", () => {
    let calls = 0;
    const d = runDraft(LEAGUE, CLASS, SCOUTING, ORDER, {
      choose: {
        [ORDER[0]!]: (board) => {
          calls++;
          return board.at(-1)!.prospect.player.id; // take the worst player left on its board
        },
      },
    });
    expect(calls).toBe(DRAFT_ROUNDS);
    const mine = d.picks.filter((p) => p.team === ORDER[0]);
    expect(mine[0]!.teamRank).toBeGreaterThan(300);
  });

  it("is deterministic", () => {
    expect(runDraft(LEAGUE, CLASS, SCOUTING, ORDER)).toEqual(DRAFT);
  });
});
