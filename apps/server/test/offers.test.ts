import { afterAll, describe, expect, it } from "vitest";
import { TRADE_DEADLINE_WEEK } from "@dynasty/sim";
import { buildApp } from "../src/app.ts";
import { createDb } from "../src/db.ts";
import { decodeState } from "../src/state.ts";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env: use the environment
}

const db = createDb();
const app = buildApp({ db });
const made: string[] = [];
afterAll(async () => {
  await db.league.deleteMany({ where: { id: { in: made } } });
  await app.close();
});

const post = (url: string, payload: object, token: string) => app.inject({ method: "POST", url, payload, headers: { authorization: `Bearer ${token}` } });
const get = (url: string, token: string) => app.inject({ method: "GET", url, headers: { authorization: `Bearer ${token}` } });

/** A started league: Jai (commissioner) runs Ohio, Sam runs Texas. */
async function league() {
  const c = (await app.inject({ method: "POST", url: "/leagues", payload: { name: "Offers", displayName: "Jai" } })).json();
  made.push(c.league.id);
  const sam = (await app.inject({ method: "POST", url: "/join", payload: { inviteCode: c.league.inviteCode, displayName: "Sam" } })).json().token as string;
  await post(`/leagues/${c.league.id}/claim`, { team: "OH" }, c.token);
  await post(`/leagues/${c.league.id}/claim`, { team: "TX" }, sam);
  await post(`/leagues/${c.league.id}/start`, {}, c.token);
  return { id: c.league.id as string, jai: c.token as string, sam };
}

/** Texas's 7th-rounder next year for Ohio's (picks only: no rosters or cap in the way). */
const sevenths = { from: "TX", to: "OH", give: [], get: [], givePicks: ["2032:7:TX"], getPicks: ["2032:7:OH"] };

describe("trades between friends", () => {
  it("offer, answer, and the trade is made on the server", { timeout: 60_000 }, async () => {
    const { id, jai, sam } = await league();
    // Offers go friend to friend, from your own team.
    expect((await post(`/leagues/${id}/offers`, { proposal: { ...sevenths, to: "IN", getPicks: ["2032:7:IN"] } }, sam)).json()).toMatchObject({ sent: false, problems: ["Offers go to a friend's team."] });
    expect((await post(`/leagues/${id}/offers`, { proposal: { ...sevenths, from: "OH", to: "TX" } }, sam)).json().sent).toBe(false);

    const sent = await post(`/leagues/${id}/offers`, { proposal: sevenths }, sam);
    expect(sent.statusCode).toBe(201);
    const offer = sent.json().offer;
    expect(offer).toMatchObject({ from: "TX", to: "OH", status: "open" });
    // Both see it; only Ohio can answer it, only Texas can take it back.
    expect((await get(`/leagues/${id}/offers`, jai)).json().offers.map((o: { id: string }) => o.id)).toEqual([offer.id]);
    expect((await post(`/leagues/${id}/offers/${offer.id}`, { action: "accept" }, sam)).statusCode).toBe(403);
    expect((await post(`/leagues/${id}/offers/${offer.id}`, { action: "withdraw" }, jai)).statusCode).toBe(403);

    // A second offer for the same pick: Ohio accepts the first, so the second no longer works.
    const second = (await post(`/leagues/${id}/offers`, { proposal: { ...sevenths, getPicks: ["2032:7:OH", "2033:7:OH"] } }, sam)).json().offer;
    const accepted = (await post(`/leagues/${id}/offers/${offer.id}`, { action: "accept" }, jai)).json();
    expect(accepted).toMatchObject({ offer: { status: "accepted" }, problems: [] });
    const state = decodeState((await get(`/leagues/${id}/save`, jai)).body);
    expect(state.dynasty.league.pickOwners).toMatchObject({ "2032:7:TX": "OH", "2032:7:OH": "TX" });
    expect(state.progress.trades.at(-1)).toMatchObject({ teams: ["TX", "OH"] });
    expect((await post(`/leagues/${id}/offers/${offer.id}`, { action: "decline" }, jai)).statusCode).toBe(409);

    const late = (await post(`/leagues/${id}/offers/${second.id}`, { action: "accept" }, jai)).json();
    expect(late.offer.status).toBe("failed");
    expect(late.problems.length).toBeGreaterThan(0);
    expect(late.offer.note).toBe(late.problems[0]);

    // Declined and withdrawn offers change nothing.
    const third = (await post(`/leagues/${id}/offers`, { proposal: { ...sevenths, givePicks: ["2033:7:TX"], getPicks: ["2033:7:OH"] } }, sam)).json().offer;
    expect((await post(`/leagues/${id}/offers/${third.id}`, { action: "decline" }, jai)).json().offer.status).toBe("declined");
    const fourth = (await post(`/leagues/${id}/offers`, { proposal: { ...sevenths, givePicks: ["2033:6:TX"], getPicks: ["2033:6:OH"] } }, sam)).json().offer;
    expect((await post(`/leagues/${id}/offers/${fourth.id}`, { action: "withdraw" }, sam)).json().offer.status).toBe("withdrawn");
    expect(decodeState((await get(`/leagues/${id}/save`, jai)).body).dynasty.league.pickOwners?.["2033:7:TX"]).toBeUndefined();
  });

  it("open offers expire when the trade deadline passes", { timeout: 60_000 }, async () => {
    const { id, jai, sam } = await league();
    const offer = (await post(`/leagues/${id}/offers`, { proposal: sevenths }, sam)).json().offer;
    for (let w = 0; w < TRADE_DEADLINE_WEEK - 1; w++) await post(`/leagues/${id}/advance`, {}, jai);
    expect((await get(`/leagues/${id}/offers`, jai)).json().offers[0].status).toBe("open");
    await post(`/leagues/${id}/advance`, {}, jai);
    const after = (await get(`/leagues/${id}/offers`, jai)).json().offers[0];
    expect(after).toMatchObject({ status: "expired" });
    expect((await post(`/leagues/${id}/offers`, { proposal: sevenths }, sam)).json()).toMatchObject({ sent: false, problems: ["Trading is closed right now."] });
  });

  it("offseason calls: only in the open stage, and each friend's stays private until it closes", { timeout: 120_000 }, async () => {
    const { id, jai, sam } = await league();
    expect((await post(`/leagues/${id}/offseason`, { choice: { stage: "resign", keep: [] } }, jai)).json()).toMatchObject({ done: false, problems: ["The offseason hasn't opened."] });
    expect((await post(`/leagues/${id}/offseason`, { choice: { stage: "resign" } }, jai)).statusCode).toBe(400);
    // 22 weeks, the playoffs, then draft week ends.
    let view = (await get(`/leagues/${id}`, jai)).json();
    while (!(view.next.kind === "offseason" && view.next.stage === "staff")) view = (await post(`/leagues/${id}/advance`, {}, jai)).json().league;
    expect((await post(`/leagues/${id}/offseason`, { choice: { stage: "staff", fire: ["oc"], renew: [] } }, jai)).json().done).toBe(true);
    expect((await get(`/leagues/${id}`, sam)).json().madeCall).toEqual(["OH"]);
    expect(decodeState((await get(`/leagues/${id}/save`, jai)).body).offseason!.choices.staff).toEqual({ OH: { fire: ["oc"], renew: [] } });
    expect(decodeState((await get(`/leagues/${id}/save`, sam)).body).offseason!.choices.staff).toEqual({});
    // Once the stage closes, everyone sees it.
    const closed = (await post(`/leagues/${id}/advance`, {}, jai)).json();
    expect(closed.advanced).toMatchObject({ kind: "offseason", done: "staff", next: "hire", covered: ["TX"] });
    expect(decodeState((await get(`/leagues/${id}/save`, sam)).body).offseason!.choices.staff).toEqual({ OH: { fire: ["oc"], renew: [] } });
  });
});
