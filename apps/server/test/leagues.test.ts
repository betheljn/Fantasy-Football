import { afterAll, describe, expect, it } from "vitest";
import { advanceOverdue } from "../src/advance.ts";
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

const post = (url: string, payload: object, token?: string) =>
  app.inject({ method: "POST", url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
const get = (url: string, token?: string) => app.inject({ method: "GET", url, headers: token ? { authorization: `Bearer ${token}` } : {} });

describe("leagues", () => {
  it("create, join, claim, start", { timeout: 30_000 }, async () => {
    const created = await post("/leagues", { name: "  Sunday   Friends ", displayName: "Jai" });
    expect(created.statusCode).toBe(201);
    const { token: commish, league } = created.json();
    made.push(league.id);
    expect(league.name).toBe("Sunday Friends");
    expect(league.inviteCode).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    expect(league.phase).toBe("lobby");
    expect(league.teams).toHaveLength(50);
    expect(league.members).toEqual([expect.objectContaining({ displayName: "Jai", isCommissioner: true, team: null })]);

    // Joining: by code (any case), names unique per league (any case).
    const joined = await post("/join", { inviteCode: league.inviteCode.toLowerCase(), displayName: "Sam" });
    expect(joined.statusCode).toBe(201);
    const sam = joined.json().token;
    expect((await post("/join", { inviteCode: league.inviteCode, displayName: "jai" })).statusCode).toBe(409);
    expect((await post("/join", { inviteCode: "ZZZZZZ", displayName: "Pat" })).statusCode).toBe(404);

    // Claiming: one member per state, real states only.
    expect((await post(`/leagues/${league.id}/claim`, { team: "oh" }, commish)).statusCode).toBe(200);
    expect((await post(`/leagues/${league.id}/claim`, { team: "OH" }, sam)).statusCode).toBe(409);
    expect((await post(`/leagues/${league.id}/claim`, { team: "XX" }, sam)).statusCode).toBe(400);

    // Starting: commissioner only, and everyone needs a team.
    expect((await post(`/leagues/${league.id}/start`, {}, sam)).statusCode).toBe(403);
    const early = await post(`/leagues/${league.id}/start`, {}, commish);
    expect(early.statusCode).toBe(409);
    expect(early.json().error).toContain("Sam");
    expect((await post(`/leagues/${league.id}/claim`, { team: "TX" }, sam)).statusCode).toBe(200);
    const started = await post(`/leagues/${league.id}/start`, {}, commish);
    expect(started.statusCode).toBe(200);
    expect(started.json().phase).toBe("season");
    expect(started.json().teams.find((t: { abbr: string }) => t.abbr === "TX").claimedBy).toBe(joined.json().memberId);

    // After the start: no joining or claiming; the save names the humans.
    expect((await post("/join", { inviteCode: league.inviteCode, displayName: "Late" })).statusCode).toBe(409);
    expect((await post(`/leagues/${league.id}/claim`, { team: "CA" }, sam)).statusCode).toBe(409);
    const save = await get(`/leagues/${league.id}/save`, sam);
    expect(save.headers["x-save-version"]).toBe("2");
    const state = decodeState(save.body);
    expect(Object.keys(state.humans).sort()).toEqual(["OH", "TX"]);
    expect(state.dynasty.league.teams.OH!.roster.length).toBe(72);
  });

  it("guards league pages with the member's token", { timeout: 30_000 }, async () => {
    const a = (await post("/leagues", { name: "A", displayName: "One" })).json();
    const b = (await post("/leagues", { name: "B", displayName: "Two" })).json();
    made.push(a.league.id, b.league.id);
    expect(a.league.seed).toBeUndefined(); // the seed stays on the server
    expect((await get(`/leagues/${a.league.id}`)).statusCode).toBe(401);
    expect((await get(`/leagues/${a.league.id}`, "not-a-token")).statusCode).toBe(401);
    expect((await get(`/leagues/${a.league.id}`, b.token)).statusCode).toBe(403);
    expect((await get(`/leagues/${a.league.id}`, a.token)).json().name).toBe("A");
    // Different leagues, different dynasties.
    expect(a.league.teams[0].name === b.league.teams[0].name && a.league.teams[0].overall === b.league.teams[0].overall).toBe(false);
  });

  it("weeks: ready up, the commissioner's push, and the deadline", { timeout: 60_000 }, async () => {
    const created = (await post("/leagues", { name: "Weekly", displayName: "Jai", weekHours: 12 })).json();
    const { token: commish, league } = created;
    made.push(league.id);
    const sam = (await post("/join", { inviteCode: league.inviteCode, displayName: "Sam" })).json().token;
    await post(`/leagues/${league.id}/claim`, { team: "OH" }, commish);
    await post(`/leagues/${league.id}/claim`, { team: "TX" }, sam);
    expect((await post(`/leagues/${league.id}/ready`, { ready: true }, sam)).statusCode).toBe(409); // not started
    const before = Date.now();
    const started = (await post(`/leagues/${league.id}/start`, {}, commish)).json();
    expect(started.next).toEqual({ kind: "week", week: 1 });
    const hours = (Date.parse(started.deadline) - before) / 3_600_000;
    expect(hours).toBeGreaterThan(11.9);
    expect(hours).toBeLessThan(12.1);

    // One ready: nothing yet. Both ready: week 1 is played right away.
    const one = (await post(`/leagues/${league.id}/ready`, { ready: true }, sam)).json();
    expect(one.advanced).toBeNull();
    expect(one.league.members.find((m: { displayName: string }) => m.displayName === "Sam").ready).toBe(true);
    const both = (await post(`/leagues/${league.id}/ready`, { ready: true }, commish)).json();
    expect(both.advanced).toMatchObject({ kind: "week", week: 1, covered: [] });
    expect(both.league.weeksPlayed).toBe(1);
    expect(both.league.members.every((m: { ready: boolean }) => !m.ready)).toBe(true);
    const games = (await get(`/leagues/${league.id}/games`, sam)).json();
    expect(games.week).toBe(1);
    expect(games.games.length).toBeGreaterThan(20);
    const records = both.league.teams.reduce((n: number, t: { wins: number; losses: number; ties: number }) => n + t.wins + t.losses + t.ties, 0);
    expect(records).toBe(games.games.length * 2);

    // The commissioner pushes week 2 through; nobody readied, so the AI covers both.
    expect((await post(`/leagues/${league.id}/advance`, {}, sam)).statusCode).toBe(403);
    const pushed = (await post(`/leagues/${league.id}/advance`, {}, commish)).json();
    expect(pushed.advanced).toMatchObject({ kind: "week", week: 2, covered: ["OH", "TX"] });

    // The deadline: nothing is due now; past the deadline, week 3 is played.
    expect((await advanceOverdue(db)).filter((d) => d.leagueId === league.id)).toHaveLength(0);
    const later = new Date(Date.now() + 13 * 3_600_000);
    const overdue = (await advanceOverdue(db, later)).filter((d) => d.leagueId === league.id);
    expect(overdue.map((d) => d.summary)).toEqual([expect.objectContaining({ kind: "week", week: 3 })]);
    const after = (await get(`/leagues/${league.id}`, sam)).json();
    expect(after.weeksPlayed).toBe(3);
    expect(Date.parse(after.deadline)).toBeGreaterThan(later.getTime());
  });
});
