import { describe, expect, it } from "vitest";
import {
  withSpring,
  aiInSeasonMoves,
  aiTradeWeek,
  playWeek,
  draftWeekTrades,
  seasonWindow,
  addGameToSeason,
  advanceScoutingWeek,
  advanceSeason,
  beginOffseason,
  completeOffseason,
  createScouting,
  generateDraftClass,
  knowledge,
  draftWithBoards,
  offseasonContractPlan,
  offseasonDraft,
  offseasonFreeAgencyPlan,
  offseasonRosterPlan,
  resignFits,
  resolveContracts,
  runDraft,
  runOffseasonFreeAgency,
  allTeams,
  buildDynasty,
  createSeasonStats,
  divisionStandings,
  finishSeason,
  playGame,
  seasonSchedule,
  simulateGame,
  simulatePlayoffs,
  startDynasty,
  talentSnapshot,
  validateTeam,
  type Dynasty,
} from "../src/index.ts";

// A short burn-in keeps the test quick; the real default is 15 offseasons.
const START: Dynasty = startDynasty("dynasty-test", 4);
const ONE = advanceSeason(START);
const TWO = advanceSeason(ONE);

describe("startDynasty", () => {
  it("starts in the first season, with valid 72-man rosters and no history", () => {
    expect(START.league.season).toBe(2031);
    expect(START.history).toHaveLength(0);
    for (const t of allTeams(START.league)) {
      expect(t.roster).toHaveLength(72);
      expect(validateTeam(t)).toEqual([]);
    }
  });
});

describe("advanceSeason", () => {
  it("plays a season and returns the league a year later, still valid", () => {
    expect(ONE.league.season).toBe(2032);
    expect(TWO.league.season).toBe(2033);
    for (const t of allTeams(TWO.league)) {
      expect(t.roster).toHaveLength(72);
      expect(validateTeam(t)).toEqual([]);
    }
    const ids = allTeams(TWO.league).flatMap((t) => t.roster.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("records the season in history", () => {
    const h = ONE.history[0]!;
    expect(h.season).toBe(2031);
    expect(Object.keys(START.league.teams)).toContain(h.champion);
    expect(h.runnerUp).not.toBe(h.champion);
    expect(h.top25).toHaveLength(25);
    expect(h.divisionWinners).toHaveLength(10);
    expect(h.topPicks).toHaveLength(10);
    expect(h.awards.map((a) => a.award)).toEqual(
      expect.arrayContaining(["MVP", "Offensive Player of the Year", "Defensive Player of the Year"]),
    );
    // The second season has rookies from the first draft, so a Rookie of the Year.
    expect(TWO.history[1]!.awards.some((a) => a.award === "Rookie of the Year")).toBe(true);
    expect(h.talent.starterOverall).toBeGreaterThan(50);
  });

  it("builds careers across seasons", () => {
    const veteran = [...TWO.careers.values()].find((c) => c.seasons === 2 && c.stats.passAtt > 200)!;
    expect(veteran).toBeDefined();
    expect(veteran.games).toBeGreaterThan(20);
    expect(veteran.stats.passYds).toBeGreaterThan(ONE.careers.get(veteran.id)!.stats.passYds);
  });

  it("carries staff careers, the unemployed pool and last season's records forward", () => {
    expect(ONE.history[0]!.coachOfTheYear).not.toBeNull();
    expect(ONE.lastWinPct!.size).toBe(50);
    const hc = allTeams(TWO.league)[0]!.staff!.hc;
    const career = TWO.staffCareers.get(hc.id);
    if (hc.tenure >= 1) expect(career!.record.wins + career!.record.losses).toBeGreaterThan(0);
    for (const m of TWO.staffPool) expect(TWO.staffCareers.get(m.id)!.status).toBe("unemployed");
  });

  it("uses last season's division finish for the next schedule", () => {
    expect(Object.keys(ONE.slotOrder!)).toHaveLength(10);
    for (const teams of Object.values(ONE.slotOrder!)) expect(teams).toHaveLength(5);
  });

  it("never changes the league it was given, so old seasons can be replayed", () => {
    const before = JSON.stringify(START.league);
    advanceSeason(START);
    expect(JSON.stringify(START.league)).toBe(before);
    const [h, a] = Object.values(START.league.teams);
    expect(simulateGame(h!, a!, "replay")).toEqual(simulateGame(h!, a!, "replay"));
  });

  it("is deterministic", () => {
    expect(advanceSeason(START).history).toEqual(ONE.history);
  });

  it("keeps league talent steady from season to season", () => {
    const [a, b] = [talentSnapshot(START.league), talentSnapshot(TWO.league)];
    expect(Math.abs(a.starterOverall - b.starterOverall)).toBeLessThan(2);
    expect(Math.abs(a.averageAge - b.averageAge)).toBeLessThan(1);
  });
}, 60_000);

describe("playing a season week by week", () => {
  it("gives exactly the same dynasty as advanceSeason, plus a full offseason log", () => {
    const schedule = seasonSchedule(START);
    const stats = createSeasonStats();
    const results = [];
    let league = START.league;
    const traded = new Set<string>();
    for (let week = 1; week <= schedule.weeks; week++) {
      // Trade talks before the week, as the app does.
      const talks = aiTradeWeek(league, seasonWindow(league, week - 1), new Set(), traded);
      league = talks.league;
      for (const t of talks.trades) for (const p of t.players) traded.add(p.id);
      const played = playWeek(league, schedule, week, (g) => addGameToSeason(stats, g));
      league = aiInSeasonMoves(played.league, schedule.season, week).league;
      for (const g of played.games) results.push(g.summary);
    }
    const season = { season: schedule.season, schedule, results, standings: divisionStandings(league, results) };
    const playoffs = simulatePlayoffs(league, season);
    league = draftWeekTrades(league, playoffs, new Set(), traded).league;
    const { dynasty: finished, log } = finishSeason({ ...START, league }, { season, stats, playoffs });
    // advanceSeason also plays the spring season before the next one.
    const dynasty = withSpring(finished);
    expect(dynasty.history).toEqual(ONE.history);
    expect(dynasty.league).toEqual(ONE.league);
    expect(log.draft).toHaveLength(350);
    expect(log.retirees.length).toBeGreaterThan(0);
    expect(log.contractMoves.length).toBeGreaterThan(100);
  }, 60_000);

  it("builds a dynasty step by step, reporting progress", () => {
    const steps = buildDynasty("dynasty-test", 4);
    const progress: number[] = [];
    let r = steps.next();
    while (!r.done) {
      progress.push(r.value);
      r = steps.next();
    }
    expect(progress).toEqual([0.2, 0.4, 0.6, 0.8]);
    expect(r.value.league).toEqual(START.league);
  }, 60_000);
});

describe("a staged offseason with your own scouting and draft picks", () => {
  it("uses your in-season scouting and your picks, and ends with valid rosters", () => {
    const me = allTeams(START.league)[0]!.abbr;
    const draftClass = generateDraftClass(START.league);
    const target = draftClass.prospects[0]!.player.id;
    // Scout one prospect hard all season; the AI scouts for everyone else.
    let scouting = createScouting(START.league, draftClass);
    for (let w = 0; w < 22; w++) scouting = advanceScoutingWeek(scouting, START.league, draftClass, { [me]: [{ prospect: target, points: 12 }] });
    const other = allTeams(START.league)[1]!.abbr;
    expect(knowledge(scouting, me, target)).toBeGreaterThan(knowledge(scouting, other, target));

    const played = { ...playSeasonLike(), scouting };
    const state = resolveContracts(beginOffseason(START, played));
    const draft = offseasonDraft(state, new Set([me]));
    const mine: string[] = [];
    let r = draft.next();
    while (!r.done) {
      const choice = r.value.board[0]!.prospect.player.id;
      mine.push(choice);
      r = draft.next(choice);
    }
    const { dynasty } = completeOffseason(state, r.value);
    for (const id of mine) expect(dynasty.league.teams[me]!.roster.some((p) => p.id === id)).toBe(true);
    for (const t of allTeams(dynasty.league)) expect(validateTeam(t)).toEqual([]);
  }, 60_000);
});

describe("re-signing budget", () => {
  it("keeps enough back to fill the roster, so nobody opens free agency over the cap", () => {
    const begun = beginOffseason(START, playSeasonLike());
    // The screen's fit check: keeping everyone fits only while the rest of the roster can still be filled at the minimum.
    const plan = offseasonContractPlan(begun, allTeams(START.league)[0]!.abbr);
    const fits = resignFits(plan, new Set(plan.offers.map((o) => o.player.id)));
    const kept = plan.offers.filter((o) => fits.get(o.player.id));
    const spent = kept.reduce((s, o) => s + o.capHit, 0);
    expect(plan.committed + spent + Math.max(0, plan.openSpots - kept.length) * plan.minimum).toBeLessThanOrEqual(plan.budget);

    const state = resolveContracts(begun);
    const draft = draftWithBoards(state, new Map());
    for (const t of allTeams(START.league)) expect(offseasonFreeAgencyPlan(state, draft, t.abbr).room).toBeGreaterThanOrEqual(0);
  }, 60_000);
});

describe("early extensions", () => {
  it("are offered on the plan, and a team making its own calls extends only who it chose, at the deal shown", () => {
    const begun = beginOffseason(START, playSeasonLike());
    const plans = allTeams(START.league).map((t) => offseasonContractPlan(begun, t.abbr));
    const plan = plans.find((p) => p.extensions.length >= 2);
    expect(plan).toBeDefined();
    const [take, skip] = plan!.extensions;
    // Extend one star and not the other (re-signing nobody, so the extension fits).
    const keep = new Set([take!.player.id]);
    const state = resolveContracts(begun, { team: plan!.team, keep });
    const extended = state.contracts!.moves.filter((m) => m.team === plan!.team && m.kind === "extended");
    expect(resignFits(plan!, keep).get(take!.player.id)).toBe(true);
    expect(extended.find((m) => m.player.id === take!.player.id)?.contract).toEqual(take!.deal);
    expect(extended.some((m) => m.player.id === skip!.player.id)).toBe(false);
  }, 60_000);
});

/** The first season, played all at once (as ONE was). */
function playSeasonLike() {
  const schedule = seasonSchedule(START);
  const stats = createSeasonStats();
  const results = [];
  for (const g of schedule.games) {
    const { summary, result } = playGame(START.league, g);
    addGameToSeason(stats, result);
    results.push(summary);
  }
  const season = { season: schedule.season, schedule, results, standings: divisionStandings(START.league, results) };
  return { season, stats, playoffs: simulatePlayoffs(START.league, season) };
}

describe("your roster cuts", () => {
  const contracts = resolveContracts(beginOffseason(START, playSeasonLike()));
  const draft = runDraft(contracts.contracts!.league, contracts.draftClass, contracts.scouting, contracts.order);
  const afterFa = runOffseasonFreeAgency(contracts, draft);
  // The team with the most players after free agency, so there's real cutting to do.
  const me = allTeams(afterFa.freeAgency!.result.league).sort((a, b) => b.roster.length - a.roster.length)[0]!.abbr;
  const plan = offseasonRosterPlan(afterFa, me);

  it("shows the roster after free agency with cap effects and the front office's cuts", () => {
    expect(plan.players.length).toBeGreaterThan(72);
    expect(plan.aiCuts.length).toBeGreaterThan(0);
    for (const p of plan.players) expect(p.savings).toBe(p.capHit - p.deadMoney);
  });

  it("ends with the same roster as the AI when you make the front office's cuts", () => {
    const ai = completeOffseason(afterFa, draft).dynasty;
    const mine = completeOffseason(afterFa, draft, undefined, { team: me, players: new Set(plan.aiCuts) }).dynasty;
    const ids = (d: typeof ai) => d.league.teams[me]!.roster.map((p) => p.id).sort();
    expect(ids(mine)).toEqual(ids(ai));
  }, 60_000);

  it("cuts exactly who you choose, charging dead money, and leaves a valid 72-man roster", () => {
    // Cut the front office's picks plus one more: the priciest veteran who leaves dead money.
    const extra = [...plan.players].filter((p) => !p.rookie && p.deadMoney > 0).sort((a, b) => b.capHit - a.capHit)[0]!;
    const cuts = new Set([...plan.aiCuts, extra.player.id]);
    const { dynasty, log } = completeOffseason(afterFa, draft, undefined, { team: me, players: cuts });
    const team = dynasty.league.teams[me]!;
    expect(team.roster.some((p) => p.id === extra.player.id)).toBe(false);
    expect(team.roster).toHaveLength(72);
    expect(validateTeam(team)).toEqual([]);
    expect(log.contractMoves.find((m) => m.kind === "cut" && m.player.id === extra.player.id)?.deadMoney).toBe(extra.deadMoney);
  }, 60_000);
});
