import { describe, expect, it } from "vitest";
import {
  ROSTER_MAX,
  ROSTER_MIN,
  TRADE_DEADLINE_WEEK,
  TRADE_RULES,
  aiTradeWeek,
  allTeams,
  applyTrade,
  capHit,
  checkTrade,
  createScouting,
  draftOrder,
  draftWeekWindow,
  generateDraftClass,
  judgeTrade,
  payroll,
  pickId,
  pickValue,
  playSeason,
  playerOverall,
  runDraft,
  salaryCap,
  seasonWindow,
  startDynasty,
  suggestTrade,
  tradablePicks,
  tradeReleases,
  tradeValue,
  tradesOpen,
  validateTeam,
  yearsLeft,
  type Player,
  type TradeProposal,
} from "../src/index.ts";

const DYNASTY = startDynasty("trades-test", 3);
const LEAGUE = DYNASTY.league;
const SEASON = LEAGUE.season;
const W = seasonWindow(LEAGUE, 2);
const [A, B] = allTeams(LEAGUE);
const best = (roster: readonly Player[], pos?: string) => [...roster].filter((p) => !pos || p.position === pos).sort((x, y) => playerOverall(y) - playerOverall(x))[0]!;
const worst = (roster: readonly Player[], pos: string) => [...roster].filter((p) => p.position === pos).sort((x, y) => playerOverall(x) - playerOverall(y))[0]!;

describe("trade value", () => {
  it("prizes cheap young talent over the same player on a big contract", () => {
    const p = best(A!.roster, "WR");
    const cheap = { ...p, age: 24, contract: { ...p.contract!, years: [0, 1, 2].map((k) => ({ season: SEASON + k, salary: 1_000, bonus: 0, guaranteed: false })) } };
    const pricey = { ...cheap, contract: { ...cheap.contract, years: cheap.contract.years.map((y) => ({ ...y, salary: 40_000 })) } };
    expect(tradeValue(LEAGUE, W, A!, cheap)).toBeGreaterThan(tradeValue(LEAGUE, W, A!, pricey) + 50_000);
  });

  it("values early picks far above late ones, and next year's a bit less", () => {
    const [r1, r7] = [1, 7].map((round) => tradablePicks(LEAGUE, W, A!.abbr).find((p) => p.round === round && p.draft === W.draft)!);
    const later = tradablePicks(LEAGUE, W, A!.abbr).find((p) => p.round === 1 && p.draft === W.draft + 1)!;
    expect(pickValue(LEAGUE, W, B!, r1!)).toBeGreaterThan(20 * pickValue(LEAGUE, W, B!, r7!));
    expect(pickValue(LEAGUE, W, B!, later)).toBeLessThan(pickValue(LEAGUE, W, B!, r1!) * 1.5);
  });
});

describe("checking a trade", () => {
  it("needs something on each side, from the right rosters", () => {
    expect(checkTrade(LEAGUE, W, { from: A!.abbr, to: B!.abbr, give: [A!.roster[0]!.id], get: [] })).not.toEqual([]);
    expect(checkTrade(LEAGUE, W, { from: A!.abbr, to: B!.abbr, give: [B!.roster[0]!.id], get: [A!.roster[0]!.id] })).not.toEqual([]);
    expect(checkTrade(LEAGUE, W, { from: A!.abbr, to: B!.abbr, give: [], get: [], givePicks: [pickId(W.draft, 1, B!.abbr)], getPicks: [pickId(W.draft, 1, A!.abbr)] })).not.toEqual([]);
  });

  it("keeps every position at its minimum", () => {
    const ks = A!.roster.filter((p) => p.position === "K");
    const qb = B!.roster.find((p) => p.position === "QB")!;
    if (ks.length === 1) expect(checkTrade(LEAGUE, W, { from: A!.abbr, to: B!.abbr, give: [ks[0]!.id], get: [qb.id] }).join(" ")).toMatch(/K/);
  });

  it("won't put a team over the cap", () => {
    const cap = salaryCap(LEAGUE.seed, SEASON);
    const star = best(B!.roster);
    const filler = A!.roster.find((p) => p.position === star.position && p.contract && capHit(p.contract, SEASON) < 1_500)!;
    const tight = { ...A!, cap: { rollover: 0, deadMoney: cap - payroll(A!, SEASON) + (A!.cap?.deadMoney ?? 0) - 100 } };
    const league = { ...LEAGUE, teams: { ...LEAGUE.teams, [A!.abbr]: tight } };
    if (filler && capHit(star.contract!, SEASON) > 2_000) expect(checkTrade(league, W, { from: A!.abbr, to: B!.abbr, give: [filler.id], get: [star.id] }).join(" ")).toMatch(/over the cap/);
  });

  it("won't let a team fall below the in-season roster minimum", () => {
    const five = A!.roster.filter((p) => p.position === "OL").slice(0, 5).map((p) => p.id);
    const wr = A!.roster.filter((p) => p.position === "WR");
    const many = [...five, ...wr.slice(0, 1).map((p) => p.id)];
    const t = { from: A!.abbr, to: B!.abbr, give: many, get: [], getPicks: [pickId(W.draft, 7, B!.abbr)] };
    expect(checkTrade(LEAGUE, W, t).join(" ")).toMatch(/players \(at least/);
  });
});

describe("uneven trades", () => {
  // Two of A's backups for one of B's: B ends up at 73 and releases someone.
  const two = A!.roster.filter((p) => p.position === "WR").slice(-2).map((p) => p.id);
  const spare = (["CB", "LB", "OL", "RB", "S", "TE", "DL"] as const).find((pos) => B!.roster.filter((p) => p.position === pos).length > ROSTER_MIN[pos])!;
  const one = worst(B!.roster, spare).id;
  const t: TradeProposal = { from: A!.abbr, to: B!.abbr, give: two, get: [one] };

  it("make the team over 72 release its least valuable player, leaving dead money", () => {
    expect(checkTrade(LEAGUE, W, t)).toEqual([]);
    const rel = tradeReleases(LEAGUE, W, t);
    expect(rel).toHaveLength(1);
    expect(rel[0]!.team).toBe(B!.abbr);
    const { league, record } = applyTrade(LEAGUE, W, t);
    const b = league.teams[B!.abbr]!;
    expect(b.roster).toHaveLength(ROSTER_MAX);
    expect(league.teams[A!.abbr]!.roster).toHaveLength(ROSTER_MAX - 1);
    expect(b.cap!.deadMoney).toBe((B!.cap?.deadMoney ?? 0) + rel[0]!.deadThisSeason);
    if (rel[0]!.deadNextSeason > 0) expect(b.cap!.pendingDeadMoney).toContainEqual({ season: SEASON + 1, amount: rel[0]!.deadNextSeason });
    expect(record.released).toEqual(rel);
    for (const team of [b, league.teams[A!.abbr]!]) expect(validateTeam(team).filter((e) => !/roster size/i.test(e))).toEqual([]);
  });
});

describe("making a trade", () => {
  const ask = suggestTrade(LEAGUE, W, A!.abbr, B!.abbr, [best(B!.roster, "WR").id]);

  it("the other GM names a price he'd accept from you", () => {
    expect(ask).not.toBeNull();
    expect(checkTrade(LEAGUE, W, ask!)).toEqual([]);
    expect(judgeTrade(LEAGUE, W, ask!, B!.abbr, true).accept).toBe(true);
  });

  it("asks more of a human than of another GM", () => {
    const vsAi = judgeTrade(LEAGUE, W, ask!, B!.abbr);
    const vsYou = judgeTrade(LEAGUE, W, ask!, B!.abbr, true);
    expect(vsAi.valueOut).toBe(vsYou.valueOut);
    const need = (v: typeof vsAi, m: number, min: number) => Math.max(min, Math.abs(v.valueOut) * m);
    expect(need(vsYou, TRADE_RULES.humanMargin, TRADE_RULES.humanMinGain)).toBeGreaterThan(need(vsAi, TRADE_RULES.margin, TRADE_RULES.minGain));
  });

  it("turns down a lopsided offer, saying how far short it is", () => {
    const v = judgeTrade(LEAGUE, W, { from: A!.abbr, to: B!.abbr, give: [worst(A!.roster, "WR").id], get: [best(B!.roster, "WR").id] }, B!.abbr, true);
    expect(v.accept).toBe(false);
    expect(v.short).toBeGreaterThan(0);
  });

  it("moves the players and their contracts, keeps rosters valid, and loses the homegrown credit", () => {
    const { league, record } = applyTrade(LEAGUE, W, ask!, new Set([A!.abbr]));
    const a = league.teams[A!.abbr]!;
    const b = league.teams[B!.abbr]!;
    for (const id of ask!.get) expect(a.roster.some((p) => p.id === id)).toBe(true);
    for (const id of ask!.give) expect(b.roster.some((p) => p.id === id)).toBe(true);
    expect(validateTeam(a).filter((e) => !/roster size/i.test(e))).toEqual([]);
    for (const p of b.roster.filter((x) => ask!.give.includes(x.id))) if (p.contract?.homegrown) expect(p.contract.draftedBy).toBe(B!.abbr);
    expect(record.players.length).toBe(ask!.give.length + ask!.get.length);
  });
});

describe("draft picks", () => {
  it("each team starts with its own picks in the next two drafts", () => {
    const picks = tradablePicks(LEAGUE, W, A!.abbr);
    expect(picks).toHaveLength(14);
    expect(new Set(picks.map((p) => p.original))).toEqual(new Set([A!.abbr]));
  });

  it("change hands in a trade, and the new owner makes the pick", () => {
    const first = pickId(W.draft, 1, A!.abbr);
    const t: TradeProposal = { from: A!.abbr, to: B!.abbr, give: [], get: [worst(B!.roster, "WR").id], givePicks: [first] };
    expect(checkTrade(LEAGUE, W, t)).toEqual([]);
    const { league } = applyTrade(LEAGUE, W, t);
    expect(tradablePicks(league, W, B!.abbr).some((p) => p.id === first)).toBe(true);
    expect(tradablePicks(league, W, A!.abbr).some((p) => p.id === first)).toBe(false);
    // The draft: B picks in A's slot.
    const order = allTeams(league).map((x) => x.abbr);
    const draftClass = generateDraftClass(league);
    expect(draftClass.season).toBe(W.draft);
    const draft = runDraft(league, draftClass, createScouting(league, draftClass), order);
    const slot = draft.picks.find((p) => p.round === 1 && p.pick === order.indexOf(A!.abbr) + 1)!;
    expect(slot.team).toBe(B!.abbr);
    expect(slot.via).toBe(A!.abbr);
    expect(draft.picks.filter((p) => p.team === B!.abbr && p.round === 1)).toHaveLength(2);
    // Used picks are cleared; next year's stay.
    expect(Object.keys(draft.league.pickOwners ?? {}).some((id) => id.startsWith(`${W.draft}:`))).toBe(false);
  });

  it("a GM can ask for picks in return", () => {
    const s = suggestTrade(LEAGUE, W, A!.abbr, B!.abbr, [], [pickId(W.draft, 2, B!.abbr)]);
    expect(s).not.toBeNull();
    expect(judgeTrade(LEAGUE, W, s!, B!.abbr, true).accept).toBe(true);
  });
});

describe("AI trades", () => {
  it("happen between AI teams before the deadline, never after, and leave valid rosters", () => {
    const humans = new Set([A!.abbr]);
    let league = LEAGUE;
    let count = 0;
    for (let week = 1; week <= TRADE_DEADLINE_WEEK; week++) {
      const r = aiTradeWeek(league, seasonWindow(league, week - 1), humans);
      league = r.league;
      count += r.trades.length;
      for (const t of r.trades) expect(t.teams).not.toContain(A!.abbr);
    }
    expect(count).toBeGreaterThan(3);
    expect(aiTradeWeek(league, seasonWindow(league, TRADE_DEADLINE_WEEK)).trades).toEqual([]);
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
  }, 30_000);
});

describe("draft week", () => {
  const played = playSeason(DYNASTY);
  const league = played.league;
  const w = draftWeekWindow(league, draftOrder(played.playoffs));

  it("values next season's contracts, and players whose deals are up can't be traded", () => {
    expect(w.season).toBe(league.season + 1);
    const a = league.teams[A!.abbr]!;
    const b = league.teams[B!.abbr]!;
    const expiring = a.roster.find((p) => p.contract && yearsLeft(p.contract, w.season) === 0);
    if (expiring) {
      expect(tradeValue(league, w, b, expiring)).toBe(0);
      expect(checkTrade(league, w, { from: a.abbr, to: b.abbr, give: [expiring.id], get: [worst(b.roster, expiring.position).id] }).join(" ")).toMatch(/contract is up/);
    }
  });

  it("knows exactly where this year's picks land", () => {
    const top = pickId(w.draft, 1, w.order![0]!);
    const last = pickId(w.draft, 1, w.order!.at(-1)!);
    const t = league.teams[A!.abbr]!;
    expect(pickValue(league, w, t, { id: top, draft: w.draft, round: 1, original: w.order![0]! })).toBeGreaterThan(
      2 * pickValue(league, w, t, { id: last, draft: w.draft, round: 1, original: w.order!.at(-1)! }),
    );
  });
});
