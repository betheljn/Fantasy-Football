import { describe, expect, it } from "vitest";
import {
  TRADE_DEADLINE_WEEK,
  aiTradeWeek,
  allTeams,
  applyTrade,
  capHit,
  checkTrade,
  judgeTrade,
  payroll,
  playSeason,
  playerOverall,
  salaryCap,
  startDynasty,
  suggestTrade,
  tradeValue,
  tradesOpen,
  validateTeam,
  type Player,
} from "../src/index.ts";

const DYNASTY = startDynasty("trades-test", 3);
const LEAGUE = DYNASTY.league;
const SEASON = LEAGUE.season;
const [A, B] = allTeams(LEAGUE);
const best = (roster: readonly Player[], pos?: string) => [...roster].filter((p) => !pos || p.position === pos).sort((x, y) => playerOverall(y) - playerOverall(x))[0]!;

describe("trade value", () => {
  it("prizes cheap young talent over the same player on a big contract", () => {
    const p = best(A!.roster, "WR");
    const cheap = { ...p, age: 24, contract: { ...p.contract!, years: [0, 1, 2].map((k) => ({ season: SEASON + k, salary: 1_000, bonus: 0, guaranteed: false })) } };
    const pricey = { ...cheap, contract: { ...cheap.contract, years: cheap.contract.years.map((y) => ({ ...y, salary: 40_000 })) } };
    expect(tradeValue(LEAGUE, SEASON, A!, cheap)).toBeGreaterThan(tradeValue(LEAGUE, SEASON, A!, pricey) + 50_000);
  });
});

describe("checking a trade", () => {
  it("must be player-for-player, from the right rosters", () => {
    expect(checkTrade(LEAGUE, SEASON, { from: A!.abbr, to: B!.abbr, give: [A!.roster[0]!.id], get: [] })).not.toEqual([]);
    expect(checkTrade(LEAGUE, SEASON, { from: A!.abbr, to: B!.abbr, give: [A!.roster[0]!.id, A!.roster[1]!.id], get: [B!.roster[0]!.id] })).not.toEqual([]);
    expect(checkTrade(LEAGUE, SEASON, { from: A!.abbr, to: B!.abbr, give: [B!.roster[0]!.id], get: [A!.roster[0]!.id] })).not.toEqual([]);
  });

  it("keeps every position at its minimum", () => {
    const ks = A!.roster.filter((p) => p.position === "K");
    const qb = B!.roster.find((p) => p.position === "QB")!;
    if (ks.length === 1) expect(checkTrade(LEAGUE, SEASON, { from: A!.abbr, to: B!.abbr, give: [ks[0]!.id], get: [qb.id] }).join(" ")).toMatch(/K/);
  });

  it("won't put a team over the cap", () => {
    const cap = salaryCap(LEAGUE.seed, SEASON);
    const star = best(B!.roster);
    // Make A's room tiny, then ask it to take on a big salary for a minimum one.
    const filler = A!.roster.find((p) => p.position === star.position && p.contract && capHit(p.contract, SEASON) < 1_500)!;
    const tight = { ...A!, cap: { rollover: 0, deadMoney: cap - payroll(A!, SEASON) + (A!.cap?.deadMoney ?? 0) - 100 } };
    const league = { ...LEAGUE, teams: { ...LEAGUE.teams, [A!.abbr]: tight } };
    if (filler && capHit(star.contract!, SEASON) > 2_000) expect(checkTrade(league, SEASON, { from: A!.abbr, to: B!.abbr, give: [filler.id], get: [star.id] }).join(" ")).toMatch(/over the cap/);
  });
});

describe("making a trade", () => {
  const ask = suggestTrade(LEAGUE, SEASON, A!.abbr, B!.abbr, [best(B!.roster, "WR").id]);

  it("the other GM names a price he'd accept", () => {
    expect(ask).not.toBeNull();
    expect(checkTrade(LEAGUE, SEASON, ask!)).toEqual([]);
    expect(judgeTrade(LEAGUE, SEASON, ask!, B!.abbr).accept).toBe(true);
  });

  it("turns down a lopsided offer, saying how far short it is", () => {
    const worst = [...A!.roster].filter((p) => p.position === "WR").sort((x, y) => playerOverall(x) - playerOverall(y))[0]!;
    const v = judgeTrade(LEAGUE, SEASON, { from: A!.abbr, to: B!.abbr, give: [worst.id], get: [best(B!.roster, "WR").id] }, B!.abbr);
    expect(v.accept).toBe(false);
    expect(v.short).toBeGreaterThan(0);
  });

  it("moves the players and their contracts, keeps rosters valid, and loses the homegrown credit", () => {
    const { league, record } = applyTrade(LEAGUE, SEASON, 3, ask!, new Set([A!.abbr]));
    const a = league.teams[A!.abbr]!;
    const b = league.teams[B!.abbr]!;
    for (const id of ask!.get) expect(a.roster.some((p) => p.id === id)).toBe(true);
    for (const id of ask!.give) expect(b.roster.some((p) => p.id === id)).toBe(true);
    expect(a.roster).toHaveLength(A!.roster.length);
    expect(validateTeam(a)).toEqual([]);
    expect(validateTeam(b)).toEqual([]);
    for (const p of b.roster.filter((x) => ask!.give.includes(x.id))) if (p.contract?.homegrown) expect(p.contract.draftedBy).toBe(B!.abbr);
    expect(record.players).toHaveLength(ask!.give.length + ask!.get.length);
  });
});

describe("AI trades", () => {
  it("happen between AI teams before the deadline, never after, and leave valid rosters", () => {
    const humans = new Set([A!.abbr]);
    let league = LEAGUE;
    let count = 0;
    for (let week = 1; week <= TRADE_DEADLINE_WEEK; week++) {
      const r = aiTradeWeek(league, SEASON, week, humans);
      league = r.league;
      count += r.trades.length;
      for (const t of r.trades) expect(t.teams).not.toContain(A!.abbr);
    }
    expect(count).toBeGreaterThan(3);
    expect(aiTradeWeek(league, SEASON, TRADE_DEADLINE_WEEK + 1).trades).toEqual([]);
    for (const t of allTeams(league)) expect(validateTeam(t)).toEqual([]);
    expect(tradesOpen(TRADE_DEADLINE_WEEK - 1)).toBe(true);
    expect(tradesOpen(TRADE_DEADLINE_WEEK)).toBe(false);
  });

  it("are the same every time, and part of a played season", () => {
    const a = playSeason(DYNASTY);
    const b = playSeason(DYNASTY);
    expect(a.trades!.length).toBeGreaterThan(5);
    expect(a.trades).toEqual(b.trades);
    expect(a.season.results).toEqual(b.season.results);
  });
});
