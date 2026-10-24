import { describe, expect, it } from "vitest";
import {
  FANTASY_ROUNDS,
  POSITIONS,
  ROSTER_MIN,
  ROSTER_POSITION_MAX,
  allTeams,
  capFloor,
  fantasyDraftOrder,
  fantasyDraftSteps,
  fantasyPickTeam,
  generateLeague,
  payroll,
  playerOverall,
  runFantasyDraft,
  salaryCap,
  simulateGame,
  teamRatings,
  validateTeam,
  type FantasyDraftResult,
  type FantasyTurn,
} from "../src/index.ts";

const LEAGUE = generateLeague("fantasy-test");
const AI = runFantasyDraft(LEAGUE);

/** Drive a draft with a chooser for the human turns. */
function drive(humans: Record<string, number>, choose: (t: FantasyTurn) => string): { result: FantasyDraftResult; turns: FantasyTurn[] } {
  const steps = fantasyDraftSteps(LEAGUE, { humans });
  const turns: FantasyTurn[] = [];
  let r = steps.next();
  while (!r.done) {
    turns.push(r.value);
    r = steps.next(choose(r.value));
  }
  return { result: r.value, turns };
}

describe("fantasy draft order", () => {
  it("snakes: round 1 in order, round 2 reversed", () => {
    const order = fantasyDraftOrder(LEAGUE);
    expect(new Set(order).size).toBe(50);
    expect(fantasyPickTeam(order, 1)).toEqual({ team: order[0], round: 1, pick: 1 });
    expect(fantasyPickTeam(order, 50).team).toBe(order[49]);
    expect(fantasyPickTeam(order, 51)).toEqual({ team: order[49], round: 2, pick: 1 });
    expect(fantasyPickTeam(order, 100).team).toBe(order[0]);
    expect(fantasyPickTeam(order, 101).team).toBe(order[0]);
  });
});

describe("an all-AI fantasy draft", () => {
  it("gives every team a legal 72-man roster and drafts nobody twice", () => {
    const seen = new Set<string>();
    for (const t of allTeams(AI.league)) {
      expect(t.roster).toHaveLength(FANTASY_ROUNDS);
      expect(validateTeam(t)).toEqual([]);
      for (const pos of POSITIONS) {
        const n = t.roster.filter((p) => p.position === pos).length;
        expect(n).toBeGreaterThanOrEqual(ROSTER_MIN[pos]);
        expect(n).toBeLessThanOrEqual(ROSTER_POSITION_MAX[pos]);
      }
      for (const p of t.roster) {
        expect(seen.has(p.id)).toBe(false);
        seen.add(p.id);
      }
    }
    expect(AI.picks).toHaveLength(50 * FANTASY_ROUNDS);
    for (const p of AI.league.freeAgents ?? []) expect(seen.has(p.id)).toBe(false);
  });

  it("writes every contract to fit between the cap floor and the hard cap", () => {
    const cap = salaryCap(AI.league.seed, AI.league.season);
    for (const t of allTeams(AI.league)) {
      for (const p of t.roster) expect(p.contract).toBeDefined();
      const pay = payroll(t, AI.league.season);
      expect(pay).toBeLessThanOrEqual(cap);
      expect(pay).toBeGreaterThanOrEqual(capFloor(cap) - 10);
    }
  });

  it("spreads talent about as evenly as a generated league (no super teams)", () => {
    const spread = (l: typeof LEAGUE) => {
      const r = allTeams(l).map((t) => teamRatings(t).overall);
      return Math.max(...r) - Math.min(...r);
    };
    expect(spread(AI.league)).toBeLessThan(spread(LEAGUE) + 4);
    // Early picks are the league's best players.
    const ovr = (id: string) => playerOverall(allTeams(AI.league).flatMap((t) => t.roster).find((p) => p.id === id)!);
    const first = AI.picks.slice(0, 50).reduce((s, p) => s + ovr(p.player), 0) / 50;
    const last = AI.picks.slice(-50).reduce((s, p) => s + ovr(p.player), 0) / 50;
    expect(first).toBeGreaterThan(last + 15);
  });

  it("is deterministic and the league plays", () => {
    const again = runFantasyDraft(LEAGUE);
    expect(again.picks).toEqual(AI.picks);
    const [a, b] = allTeams(AI.league);
    expect(simulateGame(a!, b!, "after-fantasy").score).toBeDefined();
  });
});

describe("a human in the fantasy draft", () => {
  const me = fantasyDraftOrder(LEAGUE)[7]!;

  it("is on the clock for exactly their rounds, then the AI picks for them", () => {
    const { result, turns } = drive({ [me]: 10 }, (t) => t.suggestion);
    expect(turns).toHaveLength(10);
    expect(turns.map((t) => t.round)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const mine = result.picks.filter((p) => p.team === me);
    expect(mine).toHaveLength(FANTASY_ROUNDS);
    expect(mine.filter((p) => p.auto)).toHaveLength(FANTASY_ROUNDS - 10);
    // Taking the AI's suggestion every time is the all-AI draft.
    expect(result.picks.map((p) => p.player)).toEqual(AI.picks.map((p) => p.player));
  });

  it("gets the player they pick, and can't take one who's gone or break the roster rules", () => {
    const { result, turns } = drive({ [me]: 25 }, (t) => t.available.find((p) => t.allowed.includes(p.position))!.id);
    const roster = result.league.teams[me]!.roster.map((p) => p.id);
    for (const t of turns) expect(roster).toContain(t.available.find((p) => t.allowed.includes(p.position))!.id);
    expect(validateTeam(result.league.teams[me]!)).toEqual([]);

    const steps = fantasyDraftSteps(LEAGUE, { humans: { [me]: 3 } });
    const turn = steps.next().value as FantasyTurn;
    const gone = turn.picks[0]!.player;
    expect(() => steps.next(gone)).toThrow(/isn't available/);
  });

  it("drafting all 72 rounds, the allowed positions always lead to a legal roster", () => {
    // Greedy: always the best player allowed, whatever the position.
    const { result, turns } = drive({ [me]: FANTASY_ROUNDS }, (t) => t.available.find((p) => t.allowed.includes(p.position))!.id);
    expect(turns).toHaveLength(FANTASY_ROUNDS);
    const team = result.league.teams[me]!;
    expect(team.roster).toHaveLength(FANTASY_ROUNDS);
    expect(validateTeam(team)).toEqual([]);
    for (const pos of POSITIONS) expect(team.roster.filter((p) => p.position === pos).length).toBeGreaterThanOrEqual(ROSTER_MIN[pos]);
  });
});
