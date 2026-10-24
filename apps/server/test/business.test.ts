import { economy, namingOffers, priceLimits, startLeagueBusiness } from "@dynasty/sim";
import { describe, expect, it } from "vitest";
import { applyMove } from "../src/moves.ts";
import { advance, openSeason } from "../src/season.ts";
import { newLeagueState, type LeagueState } from "../src/state.ts";

process.env.PICKS_SIMS ??= "2";

describe("a friend's business online", () => {
  const humans = { OH: "m1", TX: "m2" };
  const opened = openSeason({ ...newLeagueState("business-online"), humans });
  // (A new league's books start with the first offseason; give it its business now.)
  const withBusiness: LeagueState = { ...opened, dynasty: { ...opened.dynasty, business: opened.dynasty.business ?? startLeagueBusiness(opened.dynasty.league) } };

  it("sets prices before the first home game, within the limits", () => {
    const lim = priceLimits(withBusiness.dynasty.league.seed, withBusiness.dynasty.league.season);
    expect(applyMove(withBusiness, "OH", { kind: "prices", ticket: lim.ticket[1] + 1, concessions: 30 }).problems).toContain("That price is out of bounds.");
    const set = applyMove(withBusiness, "OH", { kind: "prices", ticket: 120, concessions: 35 });
    expect(set.problems).toEqual([]);
    expect(set.state!.dynasty.business!.OH).toMatchObject({ ticketPrice: 120, concessionPrice: 35 });
  });

  it("sells the naming rights to one of this season's offers", () => {
    const { league } = withBusiness.dynasty;
    const sold = applyMove(withBusiness, "OH", { kind: "naming", offer: 1 });
    expect(sold.problems).toEqual([]);
    const offer = namingOffers(league.seed, "OH", league.season)[1]!;
    expect(sold.state!.dynasty.business!.OH!.stadium.naming).toMatchObject({ sponsor: offer.sponsor, perYear: offer.perYear });
    expect(applyMove(sold.state!, "OH", { kind: "naming", offer: 0 }).problems).toContain("The stadium already carries a sponsor's name.");
    expect(applyMove(withBusiness, "OH", { kind: "naming", offer: 7 }).problems).toContain("That offer isn't on the table.");
  });

  it("keeps a friend's own prices through an offseason they left to the AI (only kept up with the economy)", { timeout: 300_000 }, () => {
    let s = applyMove(withBusiness, "OH", { kind: "prices", ticket: 150, concessions: 45 }).state!;
    const season = s.dynasty.league.season;
    while (s.dynasty.league.season === season) s = advance(s, new Set()).state;
    const grow = economy(s.dynasty.league.seed, season + 1) / economy(s.dynasty.league.seed, season);
    expect(s.dynasty.business!.OH).toMatchObject({ ticketPrice: Math.round(150 * grow), concessionPrice: Math.round(45 * grow) });
  });
});
