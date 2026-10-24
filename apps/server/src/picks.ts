// Picks and the radio show in an online league. The league works the coming
// week's board out once (when a season opens and after each week is played)
// and writes the show off it; friends place slates from their own view of the
// board, and they're settled when the week is played. Each friend keeps their
// own points against the house (they start with the same balance and get the
// same weekly top-up as in solo); the hosts' records are the league's.
import {
  PICKS_RULES,
  SLATE_RULES,
  addToRecords,
  buildBoxScore,
  emptyRecords,
  friendPreviews,
  gameLines,
  gradeHostPicks,
  memberBoard,
  memberSlate,
  radioShow,
  settleSlate,
  sharedBoardGames,
  topUp,
  type BoxScore,
  type GameLines,
  type GameResult,
  type GameSummary,
  type GradedHostPick,
  type HostRecords,
  type PickSide,
  type RadioShow,
  type Schedule,
  type SettledSlate,
  type Slate,
} from "@dynasty/sim";
import type { LeagueState } from "./state.ts";

export interface MemberPicks {
  balance: number;
  /** Slates waiting on the coming week. */
  open: Slate[];
  /** Every settled slate, oldest first. */
  history: SettledSlate[];
}

export interface LeaguePicks {
  /** The coming week's board (null between seasons and once the regular season is played). */
  board: { season: number; week: number; lines: GameLines[] } | null;
  /** This season's shows, one a week. */
  shows: RadioShow[];
  /** The hosts' records, and last week's graded picks (the show brags or eats crow). */
  records: HostRecords;
  last: GradedHostPick[];
  /** Each friend's points, by team. */
  members: Record<string, MemberPicks>;
}

/** Simulations per board game (PICKS_SIMS lowers it for tests). */
const sims = () => Number(process.env.PICKS_SIMS) || PICKS_RULES.sims;

const humanTeams = (s: LeagueState) => new Set(Object.keys(s.humans));

export function picksOf(s: LeagueState): LeaguePicks {
  return s.picks ?? { board: null, shows: [], records: emptyRecords(), last: [], members: {} };
}

/** A friend's points (a friend new to picks starts with the usual balance). */
export function memberPicks(p: LeaguePicks, team: string): MemberPicks {
  return p.members[team] ?? { balance: SLATE_RULES.startingBalance, open: [], history: [] };
}

/** One friend's view of the coming week's board. */
export function boardFor(s: LeagueState, team: string): GameLines[] {
  const board = picksOf(s).board;
  return board ? memberBoard(board.lines, team, humanTeams(s)) : [];
}

/**
 * The coming week's board and show: the friends' games (their own players)
 * and the featured AI games, simulated on throwaway seeds; the show is written
 * off it, with last week's national stories. No board past the regular season.
 */
export function openBoard(s: LeagueState, schedule: Schedule, week: number): LeagueState {
  const p = picksOf(s);
  const league = s.dynasty.league;
  if (week > schedule.weeks) return { ...s, picks: { ...p, board: null } };
  const humans = humanTeams(s);
  const lines = sharedBoardGames(league, schedule, week, humans).map((g) => gameLines(league, g, sims()));
  const stories = (s.progress.news ?? []).filter((x) => x.week === week - 1 && !x.for && !x.local).sort((a, b) => b.importance - a.importance);
  const upcoming = schedule.games.filter((g) => g.week === week && humans.has(g.home) && humans.has(g.away));
  const previews = friendPreviews(league, upcoming, s.friendGames ?? []);
  const show = radioShow({ leagueSeed: league.seed, season: league.season, week, board: lines, stats: s.progress.stats, stories, lastWeek: p.last, records: p.records, friends: humans, ...(previews.length ? { friendPreviews: previews } : {}) });
  return { ...s, picks: { ...p, board: { season: league.season, week, lines }, shows: [...p.shows.filter((x) => x.season === league.season), show] } };
}

/**
 * The week is played: every friend's slates on it are settled (a balance under
 * the floor is topped back up), and the hosts' picks are graded.
 */
export function settleWeek(s: LeagueState, season: number, week: number, games: ReadonlyArray<{ summary: GameSummary; result: GameResult }>): LeagueState {
  const p = picksOf(s);
  const show = p.shows.find((x) => x.season === season && x.week === week);
  const due = Object.values(p.members).flatMap((m) => m.open.filter((x) => x.season === season && x.week === week));
  if (!show && due.length === 0 && Object.keys(p.members).length === 0) return s;
  const needed = new Set([...due.flatMap((x) => x.picks.map((pk) => pk.prop.game)), ...(show?.picks ?? []).map((pk) => pk.prop.game)]);
  const boxes = new Map<string, { summary: GameSummary; box: BoxScore }>(games.filter((g) => needed.has(g.summary.id)).map((g) => [g.summary.id, { summary: g.summary, box: buildBoxScore(g.result) }]));
  const members: Record<string, MemberPicks> = {};
  for (const team of new Set([...Object.keys(p.members), ...Object.keys(s.humans)])) {
    const m = memberPicks(p, team);
    const settled = m.open.filter((x) => x.season === season && x.week === week).map((x) => settleSlate(x, boxes));
    members[team] = {
      balance: topUp(m.balance + settled.reduce((n, x) => n + x.payout, 0)),
      open: m.open.filter((x) => !(x.season === season && x.week === week)),
      history: [...m.history, ...settled],
    };
  }
  const graded = show ? gradeHostPicks(show.picks, boxes) : [];
  return { ...s, picks: { ...p, members, records: addToRecords(p.records, graded), last: graded } };
}

/** A friend places a slate on the coming week's board (picked by prop id and side; the board sets each line). */
export function placeSlate(
  s: LeagueState,
  team: string,
  choices: ReadonlyArray<{ prop: string; side: PickSide; via?: { host: string; fade: boolean } }>,
  stake: number,
): { state: LeagueState; problems: [] } | { state: null; problems: string[] } {
  const p = picksOf(s);
  const league = s.dynasty.league;
  const week = s.weeksPlayed + 1;
  if (!p.board || p.board.season !== league.season || p.board.week !== week) return { state: null, problems: ["The board isn't open."] };
  const m = memberPicks(p, team);
  const r = memberSlate(boardFor(s, team), choices, stake, m.balance, team);
  if (r.problems.length) return { state: null, problems: r.problems };
  const slate: Slate = { id: `${league.season}-${week}-${team}-${m.history.length + m.open.length + 1}`, season: league.season, week, picks: r.picks, stake };
  return { state: { ...s, picks: { ...p, members: { ...p.members, [team]: { ...m, balance: m.balance - stake, open: [...m.open, slate] } } } }, problems: [] };
}

/** What a friend may see: everyone's points and settled slates, but only their own open slates. */
export function picksForMember(p: LeaguePicks, team: string | null): LeaguePicks {
  const members = Object.fromEntries(Object.entries(p.members).map(([t, m]) => [t, t === team ? m : { ...m, open: [] }]));
  return { ...p, members };
}
