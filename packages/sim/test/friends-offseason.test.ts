// Several teams making their own offseason calls at once (an online league
// with friends): staff, re-signings, the draft from ranked boards, free
// agency and cuts, each team getting exactly its own.
import { describe, expect, it } from "vitest";
import {
  addGameToSeason,
  beginOffseason,
  completeOffseason,
  createSeasonStats,
  divisionStandings,
  draftWithBoards,
  finishSeason,
  finishStagedOffseason,
  stagedOffseason,
  toSaveJson,
  type StagedChoices,
  offseasonContractPlan,
  offseasonRosterPlan,
  playGame,
  resolveContracts,
  runOffseasonFreeAgency,
  seasonSchedule,
  simulatePlayoffs,
  startDynasty,
  teamChoices,
  validateTeam,
  type Dynasty,
} from "../src/index.ts";

const START: Dynasty = startDynasty("friends-offseason", 4);

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

const played = playSeasonLike();
const FRIENDS = ["OH", "TX"] as const;

describe("teamChoices", () => {
  it("takes one team's choices or several", () => {
    expect([...teamChoices({ team: "OH", keep: new Set() }).keys()]).toEqual(["OH"]);
    expect([...teamChoices([{ team: "OH" }, { team: "TX" }]).keys()]).toEqual(["OH", "TX"]);
    expect(teamChoices(undefined).size).toBe(0);
  });
});

describe("friends' offseason calls", () => {
  it("staff: each friend's calls are their own (fired, or not renewed)", { timeout: 60_000 }, () => {
    const decisions = FRIENDS.map((team) => ({ team, fire: new Set(["hc"] as const), renew: new Set<never>() }));
    const state = beginOffseason(START, played, { decisions });
    const before = (team: string) => START.league.teams[team]!.staff!.hc;
    for (const team of FRIENDS) {
      const hc = state.staff.changes.find((c) => c.team === team && c.role === "HC")!;
      expect(hc.out).toBe(`${before(team)!.firstName} ${before(team)!.lastName}`);
      expect(["fired", "contract expired"]).toContain(hc.reason);
    }
  });

  it("re-signings, the draft from boards, free agency and cuts: each friend gets exactly their own", { timeout: 120_000 }, () => {
    const begun = beginOffseason(START, played);
    // Re-signings: Ohio lets everyone go, Texas keeps everyone (who agrees and fits).
    const expiring = (team: string) => offseasonContractPlan(begun, team).offers.map((o) => o.player.id);
    expect(expiring("OH").length).toBeGreaterThan(0);
    const contracts = resolveContracts(begun, [
      { team: "OH", keep: new Set() },
      { team: "TX", keep: new Set(expiring("TX")) },
    ]);
    const after = contracts.contracts!.league;
    for (const id of expiring("OH")) expect(after.teams.OH!.roster.some((p) => p.id === id)).toBe(false);
    // Texas tried to keep everyone: nobody is let go by the team (some may still say no, or not fit).
    expect(contracts.contracts!.moves.filter((m) => m.team === "TX" && m.kind === "released")).toHaveLength(0);
    expect(expiring("TX").some((id) => after.teams.TX!.roster.some((p) => p.id === id))).toBe(true);

    // The draft: each friend's first pick is the top of their own board (here, prospects the AI wouldn't take early).
    const late = [...contracts.draftClass.prospects].reverse();
    const boards = new Map([
      ["OH", [late[0]!.player.id, late[2]!.player.id]],
      ["TX", [late[1]!.player.id]],
    ]);
    const draft = draftWithBoards(contracts, boards);
    const first = (team: string) => draft.picks.find((p) => p.team === team)!;
    expect(first("OH").player.id).toBe(late[0]!.player.id);
    expect(first("TX").player.id).toBe(late[1]!.player.id);
    expect(draftWithBoards(contracts, boards).picks.map((p) => p.player.id)).toEqual(draft.picks.map((p) => p.player.id));

    // Free agency: Texas bids on no one (and no front office), Ohio has its front office bid.
    const fa = runOffseasonFreeAgency(contracts, draft, [
      { team: "OH", offers: new Map(), frontOffice: true },
      { team: "TX", offers: new Map(), frontOffice: false },
    ]);
    expect(fa.freeAgency!.result.moves.filter((m) => m.team === "TX" && m.kind === "signed")).toHaveLength(0);

    // Cuts: each friend's own.
    const cutsFor = (team: string) => new Set(offseasonRosterPlan(fa, team).aiCuts.concat(offseasonRosterPlan(fa, team).players.filter((p) => !p.rookie).sort((a, b) => a.overall - b.overall)[0]!.player.id));
    const ohCuts = cutsFor("OH");
    const txCuts = cutsFor("TX");
    const { dynasty } = completeOffseason(fa, draft, undefined, [
      { team: "OH", players: ohCuts },
      { team: "TX", players: txCuts },
    ]);
    for (const [team, cuts] of [["OH", ohCuts], ["TX", txCuts]] as const) {
      const roster = dynasty.league.teams[team]!.roster;
      for (const id of cuts) expect(roster.some((p) => p.id === id)).toBe(false);
      expect(validateTeam(dynasty.league.teams[team]!)).toEqual([]);
    }
  });
});

describe("the staged offseason", () => {
  it("with no one's calls, ends exactly where the AI's offseason does", { timeout: 120_000 }, () => {
    const ai = finishSeason(START, played).dynasty;
    const staged = finishStagedOffseason(START, played, {}).dynasty;
    expect(toSaveJson(staged)).toBe(toSaveJson(ai));
  });

  it("works out each stage from the calls before it", { timeout: 120_000 }, () => {
    const choices: StagedChoices = {};
    expect(stagedOffseason(START, played, choices, "staff")).toEqual({});
    const hire = stagedOffseason(START, played, choices, "hire");
    expect(hire.releases).toBeDefined();
    const resign = stagedOffseason(START, played, choices, "resign");
    expect(resign.state?.contracts).toBeUndefined();
    const keepNone = { ...choices, resign: { OH: [] } };
    const draft = stagedOffseason(START, played, keepNone, "draft");
    expect(draft.state?.contracts).toBeDefined();
    const fa = stagedOffseason(START, played, keepNone, "freeagency");
    expect(fa.draft?.picks.length).toBeGreaterThan(0);
    expect(fa.state?.freeAgency).toBeUndefined();
    const cuts = stagedOffseason(START, played, keepNone, "cuts");
    expect(cuts.state?.freeAgency).toBeDefined();
    // Ohio letting everyone go shows up in the final rosters.
    const expiring = offseasonContractPlan(resign.state!, "OH").offers.map((o) => o.player.id);
    const done = finishStagedOffseason(START, played, keepNone).dynasty;
    for (const id of expiring) expect(done.league.teams.OH!.roster.some((p) => p.id === id && p.contract?.signed !== done.league.season)).toBe(false);
  });
});
