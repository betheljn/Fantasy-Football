import { describe, expect, it } from "vitest";
import {
  SLATE_RULES,
  allTeams,
  createSeasonStats,
  gameLines,
  hostPicks,
  memberBoard,
  memberSlate,
  picksLeaderboard,
  radioShow,
  seasonSchedule,
  sharedBoardGames,
  startDynasty,
  type GameLines,
  type SettledSlate,
} from "../src/index.ts";

const DYNASTY = startDynasty("shared-picks", 2);
const SCHEDULE = seasonSchedule(DYNASTY);
const WEEK = 1;
const teams = allTeams(DYNASTY.league).map((t) => t.abbr);
// Two friends who play each other this week, and a third who doesn't.
const meeting = SCHEDULE.games.find((g) => g.week === WEEK)!;
const [A, B] = [meeting.home, meeting.away];
const C = teams.find((t) => t !== A && t !== B && SCHEDULE.games.some((g) => g.week === WEEK && (g.home === t || g.away === t)))!;
const HUMANS = new Set([A, B, C]);
const GAMES = sharedBoardGames(DYNASTY.league, SCHEDULE, WEEK, HUMANS);
const LINES: GameLines[] = GAMES.map((g) => gameLines(DYNASTY.league, g, 12));
const involves = (g: { home: string; away: string }, t: string) => g.home === t || g.away === t;

describe("the shared board", () => {
  it("has every friend's game once, then AI-only featured games", () => {
    const friendly = GAMES.filter((g) => [...HUMANS].some((t) => involves(g, t)));
    expect(friendly.filter((g) => g.id === meeting.id)).toHaveLength(1);
    expect(friendly).toHaveLength(2);
    const featured = GAMES.filter((g) => !friendly.includes(g));
    expect(featured).toHaveLength(8);
    for (const g of featured) for (const t of HUMANS) expect(involves(g, t)).toBe(false);
  });

  it("shows each friend the featured games whole and only their own players in their own game", () => {
    const mine = memberBoard(LINES, A, HUMANS);
    const own = mine.filter((l) => involves(l.game, A));
    expect(own).toHaveLength(1);
    expect(own[0]!.props.length).toBeGreaterThan(0);
    for (const p of own[0]!.props) expect([p.kind, p.team]).toEqual(["player", A]);
    // C's game isn't on A's board at all.
    expect(mine.some((l) => involves(l.game, C))).toBe(false);
    expect(mine.filter((l) => ![...HUMANS].some((t) => involves(l.game, t)))).toHaveLength(8);
  });
});

describe("a friend's slate", () => {
  const view = memberBoard(LINES, A, HUMANS);
  const featured = view.filter((l) => !involves(l.game, A));
  const total = (i: number) => featured[i]!.props.find((p) => p.kind === "total")!;

  it("takes its lines from the board, not the phone", () => {
    const r = memberSlate(view, [{ prop: total(0).id, side: "over" }, { prop: total(1).id, side: "under" }], 50, SLATE_RULES.startingBalance, A);
    expect(r.problems).toEqual([]);
    expect(r.picks.map((p) => p.prop)).toEqual([total(0), total(1)]);
  });

  it("turns away picks off their board and the usual mistakes", () => {
    const theirs = LINES.find((l) => involves(l.game, C))!.props[0]!;
    expect(memberSlate(view, [{ prop: total(0).id, side: "over" }, { prop: theirs.id, side: "over" }], 50, 1000, A).problems).toContain("That pick isn't on your board.");
    const myPlayer = view.find((l) => involves(l.game, A))!.props[0]!;
    expect(memberSlate(view, [{ prop: total(0).id, side: "over" }, { prop: myPlayer.id, side: "under" }], 50, 1000, A).problems).toContain("On your own players, only overs.");
    expect(memberSlate(view, [{ prop: total(0).id, side: "over" }, { prop: total(1).id, side: "over" }], 5000, 1000, A).problems).toContain("Not enough points.");
  });
});

describe("the show and the leaderboard", () => {
  it("leaves every friend's game off the radio show", () => {
    for (const p of hostPicks(LINES, createSeasonStats(), HUMANS)) {
      const game = GAMES.find((g) => g.id === p.prop.game)!;
      for (const t of HUMANS) expect(involves(game, t)).toBe(false);
    }
    const show = radioShow({ leagueSeed: DYNASTY.league.seed, season: DYNASTY.league.season, week: WEEK, board: LINES, stats: createSeasonStats(), stories: [], lastWeek: [], records: { numbers: { won: 0, lost: 0 }, hottake: { won: 0, lost: 0 }, veteran: { won: 0, lost: 0 } }, friends: HUMANS });
    expect(show.picks.length).toBeGreaterThan(0);
    for (const p of show.picks) for (const t of HUMANS) expect(involves(GAMES.find((g) => g.id === p.prop.game)!, t)).toBe(false);
  });

  it("ranks friends by points, then the season's net", () => {
    const slate = (season: number, won: boolean, stake: number, payout: number): SettledSlate => ({ id: `${season}-${stake}`, season, week: 1, stake, picks: [], won, payout });
    const board = picksLeaderboard(
      [
        { member: "Ada", team: A, balance: 1200, history: [slate(2031, true, 100, 300), slate(2030, false, 50, 0)] },
        { member: "Bo", team: B, balance: 1200, history: [slate(2031, true, 50, 150)] },
        { member: "Cy", team: C, balance: 900, history: [slate(2031, false, 100, 0)] },
      ],
      2031,
    );
    expect(board.map((b) => [b.member, b.won, b.lost, b.net])).toEqual([
      ["Ada", 1, 0, 200],
      ["Bo", 1, 0, 100],
      ["Cy", 0, 1, -100],
    ]);
  });
});
