import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { advancePost } from "../src/advance.ts";
import { buildApp } from "../src/app.ts";
import { CHAT, leaguePost, type ChatEvent } from "../src/chat.ts";
import { createDb } from "../src/db.ts";
import { newLeagueState } from "../src/state.ts";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env: use the environment
}

const db = createDb();
const app = buildApp({ db });
const made: string[] = [];
let leagueId = "";
let commish = "";
let sam = "";
let kit = "";

const post = (url: string, payload: object, token?: string) =>
  app.inject({ method: "POST", url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
const get = (url: string, token?: string) => app.inject({ method: "GET", url, headers: token ? { authorization: `Bearer ${token}` } : {} });

beforeAll(async () => {
  await app.ready();
  const created = (await post("/leagues", { name: "Chat Test", displayName: "Jai" })).json();
  leagueId = created.league.id;
  commish = created.token;
  made.push(leagueId);
  sam = (await post("/join", { inviteCode: created.league.inviteCode, displayName: "Sam" })).json().token;
  kit = (await post("/join", { inviteCode: created.league.inviteCode, displayName: "Kit" })).json().token;
});

afterAll(async () => {
  await db.league.deleteMany({ where: { id: { in: made } } });
  await app.close();
});

describe("league chat", () => {
  it("keeps messages, newest first, and pages back", async () => {
    for (const body of ["first", "  second\n\n\n\nline  ", "third"]) expect((await post(`/leagues/${leagueId}/chat`, { body }, sam)).statusCode).toBe(201);
    const page = (await get(`/leagues/${leagueId}/chat?limit=2`, commish)).json();
    expect(page.messages.map((m: { body: string }) => m.body)).toEqual(["third", "second\n\nline"]);
    expect(page.messages[0]).toMatchObject({ kind: "chat", author: "Sam", removed: false });
    expect(page.more).toBe(true);
    const older = (await get(`/leagues/${leagueId}/chat?limit=2&before=${page.messages[1].id}`, commish)).json();
    expect(older.messages.map((m: { body: string }) => m.body)).toEqual(["first"]);
    expect(older.more).toBe(false);
  });

  it("turns away empty, long, outside and too-fast messages", async () => {
    expect((await post(`/leagues/${leagueId}/chat`, { body: "   " }, kit)).statusCode).toBe(400);
    expect((await post(`/leagues/${leagueId}/chat`, { body: "x".repeat(CHAT.maxLength + 1) }, kit)).statusCode).toBe(400);
    expect((await post(`/leagues/${leagueId}/chat`, { body: "hi" })).statusCode).toBe(401);
    expect((await get(`/leagues/${leagueId}/chat`)).statusCode).toBe(401);
    const codes: number[] = [];
    for (let i = 0; i < CHAT.burst + 1; i++) codes.push((await post(`/leagues/${leagueId}/chat`, { body: `spam ${i}` }, kit)).statusCode);
    expect(codes.slice(0, CHAT.burst).every((c) => c === 201)).toBe(true);
    expect(codes.at(-1)).toBe(429);
  });

  it("lets you remove your own message, and the commissioner anyone's", async () => {
    const mine = (await post(`/leagues/${leagueId}/chat`, { body: "oops" }, sam)).json().message;
    expect((await post(`/leagues/${leagueId}/chat/${mine.id}/remove`, {}, kit)).statusCode).toBe(403);
    expect((await post(`/leagues/${leagueId}/chat/${mine.id}/remove`, {}, sam)).json()).toEqual({ removed: true });
    const theirs = (await post(`/leagues/${leagueId}/chat`, { body: "out of line" }, sam)).json().message;
    expect((await post(`/leagues/${leagueId}/chat/${theirs.id}/remove`, {}, commish)).json()).toEqual({ removed: true });
    const list = (await get(`/leagues/${leagueId}/chat?limit=2`, kit)).json().messages;
    expect(list.map((m: { removed: boolean; body: string }) => [m.removed, m.body])).toEqual([
      [true, ""],
      [true, ""],
    ]);
  });

  it("sends messages and removals live to everyone signed in, and turns away a bad token", async () => {
    const ws = await app.injectWS(`/leagues/${leagueId}/live`);
    const events: ChatEvent[] = [];
    const next = () => new Promise<ChatEvent>((resolve) => ws.once("message", (d: unknown) => resolve(JSON.parse(String(d)))));
    ws.send(JSON.stringify({ type: "auth", token: kit }));
    expect(await next()).toEqual({ type: "ready" });
    ws.on("message", (d: unknown) => events.push(JSON.parse(String(d))));
    const sent = (await post(`/leagues/${leagueId}/chat`, { body: "live one" }, commish)).json().message;
    await leaguePost(db, leagueId, "Week 1 is in.");
    await post(`/leagues/${leagueId}/chat/${sent.id}/remove`, {}, commish);
    await new Promise((r) => setTimeout(r, 100));
    expect(events).toEqual([
      { type: "message", message: expect.objectContaining({ body: "live one", author: "Jai" }) },
      { type: "message", message: expect.objectContaining({ kind: "post", body: "Week 1 is in.", author: null }) },
      { type: "removed", id: sent.id },
    ]);
    ws.terminate();

    const bad = await app.injectWS(`/leagues/${leagueId}/live`);
    const closed = new Promise<number>((resolve) => bad.on("close", (code: number) => resolve(code)));
    bad.send(JSON.stringify({ type: "auth", token: "nope" }));
    expect(await closed).toBe(4003);
  });

  it("posts the week's recap (friends' results, series, the picks leader), the champion, and the new season", () => {
    const base = newLeagueState("chat-posts");
    const g = (home: string, away: string, hs: number, as: number, duel = false) =>
      ({ id: `${home}${away}`, week: 3, home, away, homeScore: hs, awayScore: as, winner: hs > as ? home : as > hs ? away : null, ...(duel ? { coached: { team: home, calls: [], rival: away } } : {}) }) as never;
    // OH and TX are friends who've met twice (OH won both) before tonight's duel; MI is a friend too.
    const earlier = [1, 2].map((week) => ({ season: 2031, week, home: "OH", away: "TX", homeScore: 21, awayScore: 10, duel: false }));
    const state = {
      ...base,
      humans: { OH: "m1", TX: "m2", MI: "m3" },
      friendGames: [...earlier, { season: 2031, week: 3, home: "OH", away: "TX", homeScore: 24, awayScore: 17, duel: true }],
      picks: { board: null, shows: [], records: { numbers: { won: 0, lost: 0 }, hottake: { won: 0, lost: 0 }, veteran: { won: 0, lost: 0 } }, last: [], members: { TX: { balance: 1250, open: [], history: [{} as never] }, OH: { balance: 900, open: [], history: [{} as never] } } },
    };
    const owners = new Map([["OH", "Jai"], ["TX", "Sam"], ["MI", "Kit"]]);
    const week = advancePost({ kind: "week", season: 2031, week: 3, games: [g("OH", "TX", 24, 17, true), g("CA", "NY", 10, 13), g("MI", "FL", 20, 20)], covered: [], trades: 0, moves: 0 }, state, owners)!;
    expect(week.split("\n")).toEqual([
      "Week 3 is in.",
      expect.stringMatching(/^Jai's .+ 24, Sam's .+ 17 \(a duel\): .+ lead the series 3-0$/),
      expect.stringMatching(/^Florida .+ and Kit's .+ tied 20-20$/),
      "Picks: Sam leads with 1,250 points.",
    ]);
    expect(advancePost({ kind: "playoffs", season: 2031, champion: "OH", runnerUp: "CA" }, state, owners)).toMatch(/^Jai's .+ won the 2031 championship over California/);
    expect(advancePost({ kind: "offseason", season: 2031, done: "cuts", next: null, covered: [], nextSeason: 2032 }, state, owners)).toBe("The 2032 season is open.");
    expect(advancePost({ kind: "offseason", season: 2031, done: "staff", next: "hire", covered: [] }, state, owners)).toBeNull();
  });
});
