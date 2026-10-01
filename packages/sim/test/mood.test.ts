import { describe, expect, it } from "vitest";
import {
  PRIORITIES,
  allTeams,
  capHit,
  freeAgencyPlan,
  freeAgentAsk,
  generateLeague,
  hometownDiscount,
  marketValue,
  mood,
  persona,
  playerOverall,
  resignChance,
  runFreeAgency,
  salaryCap,
  teamAppeal,
  wouldStart,
  type Player,
  type Team,
} from "../src/index.ts";

const LEAGUE = generateLeague("mood-test");
const NEXT = LEAGUE.season + 1;
const TEAMS = allTeams(LEAGUE);
const PLAYERS = TEAMS.flatMap((t) => t.roster);

describe("personas", () => {
  it("are fixed per player, with weights that sum to 1", () => {
    for (const p of PLAYERS.slice(0, 200)) {
      const a = persona(p);
      expect(persona(p)).toEqual(a);
      expect(PRIORITIES.reduce((s, k) => s + a.weights[k], 0)).toBeCloseTo(1, 6);
    }
  });

  it("come from every state about equally, not by population", () => {
    const homes = new Map<string, number>();
    for (const p of PLAYERS) homes.set(persona(p).homeState, (homes.get(persona(p).homeState) ?? 0) + 1);
    expect(homes.size).toBe(50);
    const fair = PLAYERS.length / 50;
    for (const n of homes.values()) {
      expect(n).toBeGreaterThan(fair * 0.5);
      expect(n).toBeLessThan(fair * 1.6);
    }
  });
});

describe("mood", () => {
  const team = TEAMS[0]!;
  const player = team.roster[0]!;

  it("rises with winning, pay and playing time", () => {
    const base = teamAppeal(team, player, 0.5);
    expect(mood(player, { ...base, winning: 0.9 }, 1)).toBeGreaterThanOrEqual(mood(player, { ...base, winning: 0.1 }, 1));
    expect(mood(player, base, 1.2)).toBeGreaterThan(mood(player, base, 0.8));
    expect(mood(player, { ...base, playingTime: 1 }, 1)).toBeGreaterThanOrEqual(mood(player, { ...base, playingTime: 0.25 }, 1));
  });

  it("makes happy players far likelier to re-sign, homegrown ones a bit more", () => {
    expect(resignChance(75, false)).toBeGreaterThan(0.9);
    expect(resignChance(20, false)).toBeLessThan(0.15);
    expect(resignChance(40, true)).toBeGreaterThan(resignChance(40, false));
  });

  it("gives a hometown discount only to the home-state team", () => {
    const p = PLAYERS.find((q) => persona(q).weights.home > 0.2)!;
    const home = LEAGUE.teams[persona(p).homeState]!;
    const away = TEAMS.find((t) => t.abbr !== home.abbr)!;
    expect(hometownDiscount(p, home)).toBeGreaterThan(0.1);
    expect(hometownDiscount(p, home)).toBeLessThanOrEqual(0.2);
    expect(hometownDiscount(p, away)).toBe(0);
  });

  it("knows who would start", () => {
    const qb = [...team.roster].filter((p) => p.position === "QB").sort((a, b) => playerOverall(b) - playerOverall(a));
    expect(wouldStart(team, qb[0]!)).toBe(true);
    expect(wouldStart(team, qb.at(-1)!)).toBe(false);
  });
});

describe("free agency bidding", () => {
  // Free agents: the best player at a few positions from some teams, released.
  const released: Player[] = TEAMS.slice(0, 6).map((t) => {
    const p = [...t.roster].sort((a, b) => playerOverall(b) - playerOverall(a))[0]!;
    const { contract: _c, ...free } = p;
    return free;
  });
  const league = {
    ...LEAGUE,
    teams: Object.fromEntries(TEAMS.map((t) => [t.abbr, { ...t, roster: t.roster.filter((p) => !released.some((r) => r.id === p.id)) } as Team])),
  };
  const r = runFreeAgency(league, released, NEXT, 1.3);

  it("signs good free agents after several teams bid, within each team's cap", () => {
    expect(r.moves.length).toBeGreaterThan(3);
    const cap = salaryCap(LEAGUE.seed, NEXT);
    for (const m of r.moves) {
      expect(m.bidders!).toBeGreaterThan(1);
      const t = r.league.teams[m.team]!;
      expect(t.roster.some((p) => p.id === m.player.id)).toBe(true);
      expect(capHit(m.contract!, NEXT)).toBeGreaterThan(0);
      expect(capHit(m.contract!, NEXT)).toBeLessThan(cap);
      // Paid around his market value (bidding, discounts and noise aside).
      const avg = m.contract!.years.reduce((s, y) => s + y.salary + y.bonus, 0) / m.contract!.years.length;
      const mv = marketValue(m.player, cap, 1.3);
      expect(avg / mv).toBeGreaterThan(0.6);
      expect(avg / mv).toBeLessThan(1.6);
    }
  });

  it("picks the offer that makes him happiest, and is deterministic", () => {
    expect(runFreeAgency(league, released, NEXT, 1.3).moves.map((m) => [m.player.id, m.team])).toEqual(r.moves.map((m) => [m.player.id, m.team]));
    expect(new Set(r.moves.map((m) => m.player.id)).size).toBe(r.moves.length);
  });

  it("makes a discounted home-team offer beat an equal full-price offer elsewhere for a player who values home", () => {
    const homebody = PLAYERS.find((p) => persona(p).weights.home > 0.3)!;
    const home = LEAGUE.teams[persona(homebody).homeState]!;
    const away = TEAMS.find((t) => t.abbr !== home.abbr)!;
    const same = { winning: 0.5, playingTime: 1, coach: 0.5 };
    const atHome = mood(homebody, { ...same, home: teamAppeal(home, homebody, 0.5).home }, 1 - hometownDiscount(homebody, home));
    const elsewhere = mood(homebody, { ...same, home: teamAppeal(away, homebody, 0.5).home }, 1);
    expect(atHome).toBeGreaterThan(elsewhere);
  });
});

describe("your free-agent offers", () => {
  // A bigger market: the top two players from twelve teams, released.
  const released: Player[] = TEAMS.slice(0, 12).flatMap((t) =>
    [...t.roster]
      .sort((a, b) => playerOverall(b) - playerOverall(a))
      .slice(0, 2)
      .map((p) => {
        const { contract: _c, ...free } = p;
        return free;
      }),
  );
  const league = {
    ...LEAGUE,
    teams: Object.fromEntries(TEAMS.map((t) => [t.abbr, { ...t, roster: t.roster.filter((p) => !released.some((r) => r.id === p.id)) } as Team])),
  };
  const me = TEAMS[20]!.abbr;
  const plan = freeAgencyPlan(league, released, NEXT, 1.3, new Map(), me);

  it("previews the market: each player's ask, interest and mood toward you", () => {
    expect(plan.pool).toHaveLength(released.length);
    expect(plan.room).toBeGreaterThan(0);
    for (const l of plan.pool) {
      expect(l.ask).toBe(freeAgentAsk(LEAGUE.seed, NEXT, l.player, salaryCap(LEAGUE.seed, NEXT), 1.3).ask);
      expect(l.interest).toBeGreaterThanOrEqual(0);
      expect(l.mood).toBeGreaterThanOrEqual(0);
      expect(l.mood).toBeLessThanOrEqual(100);
    }
  });

  it("your team bids on no one when you make no offers", () => {
    const r = runFreeAgency(league, released, NEXT, 1.3, new Map(), { team: me, offers: new Map() });
    expect(r.moves.some((m) => m.team === me)).toBe(false);
  });

  it("a big offer lands a player, on exactly your terms", () => {
    const target = plan.pool.find((l) => l.ask * 1.6 < plan.room * 0.5)!;
    const offer = { annual: Math.round(target.ask * 1.6), years: 3 };
    const r = runFreeAgency(league, released, NEXT, 1.3, new Map(), { team: me, offers: new Map([[target.player.id, offer]]) });
    const move = r.moves.find((m) => m.player.id === target.player.id)!;
    expect(move.team).toBe(me);
    expect(move.contract!.years).toHaveLength(3);
    const avg = move.contract!.years.reduce((s, y) => s + y.salary + y.bonus, 0) / 3;
    expect(Math.abs(avg - offer.annual) / offer.annual).toBeLessThan(0.01);
  });

  it("lets your front office bid on everyone else if you ask, exactly as the AI would", () => {
    const ai = runFreeAgency(league, released, NEXT, 1.3);
    const fo = runFreeAgency(league, released, NEXT, 1.3, new Map(), { team: me, offers: new Map(), frontOffice: true });
    expect(fo.moves).toEqual(ai.moves);
  });

  it("ignores an offer you can't afford", () => {
    const target = plan.pool[0]!;
    const r = runFreeAgency(league, released, NEXT, 1.3, new Map(), { team: me, offers: new Map([[target.player.id, { annual: plan.room * 3, years: 2 }]]) });
    expect(r.moves.find((m) => m.player.id === target.player.id)?.team).not.toBe(me);
  });
});
