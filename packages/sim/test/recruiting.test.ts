import { describe, expect, it } from "vitest";
import {
  CURRENT_FORMAT,
  RECRUITING,
  advanceScoutingWeek,
  createScouting,
  generateDraftClass,
  generateLeague,
  interestGain,
  interestIn,
  isLocal,
  knowledge,
  leaningOf,
  recruitingPoints,
  type ScoutingState,
} from "../src/index.ts";

const league = { ...generateLeague("recruiting-test"), format: CURRENT_FORMAT };
const cls = generateDraftClass(league);
const OH = league.teams.OH!;

describe("recruiting points and interest", () => {
  it("points: a base, the head coach, and the owner's upgrade", () => {
    const noStaff = { ...OH, staff: undefined } as unknown as typeof OH;
    expect(recruitingPoints(noStaff)).toBe(RECRUITING.basePoints);
    expect(recruitingPoints({ ...OH, upgrades: { recruiting: 3 } }) - recruitingPoints(OH)).toBe(3 * RECRUITING.perUpgradeTier);
    const great = { ...OH, staff: { ...OH.staff!, hc: { ...OH.staff!.hc, gameManagement: 99, development: 99 } } };
    expect(recruitingPoints(great)).toBe(RECRUITING.basePoints + RECRUITING.coachSwing);
  });

  it("builds with diminishing returns; local prospects warm faster", () => {
    expect(interestGain(0, 10, true)).toBeCloseTo(interestGain(0, 10, false) * RECRUITING.localBoost);
    expect(interestGain(80, 10, false)).toBeLessThan(interestGain(20, 10, false));
    expect(interestGain(100, 10, true)).toBe(0);
  });

  it("a prospect leans to the program he's warmest on, once warm enough and clear", () => {
    const s = (interest: NonNullable<ScoutingState["interest"]>): ScoutingState => ({ ...createScouting(league, cls), interest });
    expect(leaningOf(s({ OH: { p: 39 } }), "p")).toBeNull();
    expect(leaningOf(s({ OH: { p: 55 }, TX: { p: 50 } }), "p")).toBeNull();
    expect(leaningOf(s({ OH: { p: 55 }, TX: { p: 40 } }), "p")).toMatchObject({ team: "OH", margin: 15 });
  });
});

describe("a season of recruiting", () => {
  const local = cls.prospects.find((p) => isLocal(OH, p) && p.boardRank > 100)!;
  const far = cls.prospects.find((p) => !isLocal(OH, p) && p.boardRank > 100)!;
  const plan = { OH: [{ prospect: local.player.id, points: 4 }, { prospect: far.player.id, points: 4 }, { prospect: cls.prospects[0]!.player.id, points: 99 }] };

  it("spends your points as given (no more than the week's), and visits scout", () => {
    let s = createScouting(league, cls);
    const before = knowledge(s, "OH", local.player.id);
    s = advanceScoutingWeek(s, league, cls, {}, plan);
    expect(interestIn(s, "OH", local.player.id)).toBeCloseTo(interestGain(0, 4, true));
    expect(interestIn(s, "OH", far.player.id)).toBeCloseTo(interestGain(0, 4, false));
    // The third ask gets only what's left of the week's points.
    const left = recruitingPoints(OH) - 8;
    expect(interestIn(s, "OH", cls.prospects[0]!.player.id)).toBeCloseTo(left > 0 ? interestGain(0, left, isLocal(OH, cls.prospects[0]!)) : 0);
    expect(knowledge(s, "OH", local.player.id)).toBeGreaterThan(before);
  });

  it("interest you stop working on fades; AI teams recruit on their own; it's deterministic", () => {
    let s = createScouting(league, cls);
    s = advanceScoutingWeek(s, league, cls, {}, plan);
    const once = interestIn(s, "OH", local.player.id);
    s = advanceScoutingWeek(s, league, cls, {}, { OH: [] });
    expect(interestIn(s, "OH", local.player.id)).toBeCloseTo(once * RECRUITING.fade);
    const recruiting = Object.entries(s.interest!).filter(([t, m]) => t !== "OH" && Object.keys(m).length > 0);
    expect(recruiting.length).toBeGreaterThan(40);
    let again = createScouting(league, cls);
    again = advanceScoutingWeek(again, league, cls, {}, plan);
    again = advanceScoutingWeek(again, league, cls, {}, { OH: [] });
    expect(again.interest).toEqual(s.interest);
  });

  it("a scouting state from before recruiting carries on", () => {
    const { interest: _i, ...old } = createScouting(league, cls);
    const s = advanceScoutingWeek(old, league, cls);
    expect(Object.keys(s.interest!).length).toBe(50);
  });
});

import { allLeanings, allTeams, playerMorale, runDraft, scoutSeason } from "../src/index.ts";

describe("recruits in the draft", () => {
  const scouting = scoutSeason(league, cls);
  const order = allTeams(league).map((t) => t.abbr);
  const leanings = allLeanings(scouting);
  const draft = runDraft(league, cls, scouting, order);
  const { interest: _i, ...plain } = scouting;
  const without = runDraft(league, cls, plain, order);

  it("fall toward the programs they lean to", () => {
    const landed = (d: typeof draft) => d.picks.filter((p) => leanings.get(p.player.id)?.team === p.team).length;
    expect(landed(draft)).toBeGreaterThan(3 * Math.max(1, landed(without)));
  });

  it("a recruit who lands with his program is marked, and is happier there", () => {
    const pick = draft.picks.find((p) => p.recruit)!;
    expect(pick.player.recruitedBy).toBe(pick.team);
    expect(draft.picks.filter((p) => !p.recruit).every((p) => p.player.recruitedBy === undefined)).toBe(true);
    const team = draft.league.teams[pick.team]!;
    const player = team.roster.find((p) => p.id === pick.player.id)!;
    const m = playerMorale(player, team, [], league.season, 300_000);
    const { recruitedBy: _r, ...unrecruited } = player;
    expect(m.value).toBeGreaterThan(playerMorale(unrecruited, team, [], league.season, 300_000).value);
    expect(m.reasons).toContain("chose this program");
  });
});
