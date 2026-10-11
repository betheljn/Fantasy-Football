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
    const zipped = await app.inject({ method: "GET", url: `/leagues/${league.id}/save`, headers: { authorization: `Bearer ${sam}`, "accept-encoding": "gzip, deflate" } });
    expect(zipped.headers["content-encoding"]).toBe("gzip");
    const { gunzipSync } = await import("node:zlib");
    const save = await get(`/leagues/${league.id}/save`, sam);
    expect(gunzipSync(zipped.rawPayload).toString()).toBe(save.body);
    expect(zipped.rawPayload.length).toBeLessThan(save.body.length / 4);
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

  it("moves: your own team only, saved with a new version", { timeout: 60_000 }, async () => {
    const { token, league } = (await post("/leagues", { name: "Moves", displayName: "Jai" })).json();
    made.push(league.id);
    expect((await post(`/leagues/${league.id}/moves`, { move: { kind: "depth", pos: "QB", ids: [] } }, token)).statusCode).toBe(409); // no team yet
    await post(`/leagues/${league.id}/claim`, { team: "OH" }, token);
    const started = (await post(`/leagues/${league.id}/start`, {}, token)).json();
    const state = decodeState((await get(`/leagues/${league.id}/save`, token)).body);
    const qbs = [...state.dynasty.league.teams.OH!.depthChart.QB].reverse();
    const r = (await post(`/leagues/${league.id}/moves`, { move: { kind: "depth", pos: "QB", ids: qbs } }, token)).json();
    expect(r).toMatchObject({ done: true, problems: [], saveVersion: started.saveVersion + 1 });
    const after = decodeState((await get(`/leagues/${league.id}/save`, token)).body);
    expect(after.dynasty.league.teams.OH!.depthChart.QB).toEqual(qbs);
    // Refused by the rules: no change, the version stays.
    const bad = (await post(`/leagues/${league.id}/moves`, { move: { kind: "ir", player: qbs[0] } }, token)).json();
    expect(bad).toMatchObject({ done: false, saveVersion: r.saveVersion });
    expect(bad.problems).toHaveLength(1);
    // Not a move at all.
    expect((await post(`/leagues/${league.id}/moves`, { move: { kind: "cut", player: "x" } }, token)).statusCode).toBe(400);
  });
});

describe("team setups in the lobby", () => {
  const coach = (lastName: string) => ({
    firstName: "Dana",
    lastName,
    age: 44,
    style: "offense",
    offenseScheme: "Air Raid",
    defenseScheme: "Multiple",
    aggressiveness: 70,
    tempo: 70,
    ratings: { gameManagement: 62, discipline: 62, development: 62, playCalling: 62 },
  });

  it("each friend makes their team theirs; the server checks it and makes it at the start", { timeout: 60_000 }, async () => {
    const created = (await post("/leagues", { name: "Setups", displayName: "Jai" })).json();
    made.push(created.league.id);
    const id = created.league.id;
    const jai = created.token;
    const sam = (await post("/join", { inviteCode: created.league.inviteCode, displayName: "Sam" })).json().token;

    // A team first.
    expect((await post(`/leagues/${id}/setup`, { setup: { identity: { nickname: "Wolves", logo: "wolves" }, coach: coach("Reyes") } }, jai)).statusCode).toBe(409);
    await post(`/leagues/${id}/claim`, { team: "OH" }, jai);
    await post(`/leagues/${id}/claim`, { team: "TX" }, sam);

    // The sim's rules: a bad coach build or name comes back with the reason.
    const over = { ...coach("Reyes"), ratings: { gameManagement: 90, discipline: 90, development: 90, playCalling: 90 } };
    const bad = await post(`/leagues/${id}/setup`, { setup: { identity: { nickname: "Wolves", logo: "wolves" }, coach: over } }, jai);
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toMatch(/over budget/);
    expect((await post(`/leagues/${id}/setup`, { setup: { identity: { nickname: "Wolves", logo: "nope" }, coach: coach("Reyes") } }, jai)).statusCode).toBe(400);

    const ok = await post(`/leagues/${id}/setup`, { setup: { identity: { city: "Buckeye", nickname: "Wolves", tag: "BKY", logo: "wolves", colors: { primary: "#0B3D91", trim: "#F2C14E" } }, coach: coach("Reyes") } }, jai);
    expect(ok.statusCode).toBe(200);
    const oh = ok.json().teams.find((t: { abbr: string }) => t.abbr === "OH");
    expect(oh).toMatchObject({ name: "Buckeye Wolves", tag: "BKY", logo: "wolves", coach: "Dana Reyes" });
    expect(ok.json().members.find((m: { displayName: string }) => m.displayName === "Jai").setUp).toBe(true);

    // You can read your own setup back (to edit it); a friend without one gets null.
    expect((await get(`/leagues/${id}/setup`, jai)).json().setup).toMatchObject({ identity: { nickname: "Wolves" }, coach: { lastName: "Reyes" } });
    expect((await get(`/leagues/${id}/setup`, sam)).json().setup).toBeNull();

    // A friend's name, logo or short name is off limits; an AI team's is fair game.
    const clash = await post(`/leagues/${id}/setup`, { setup: { identity: { nickname: "wolves", logo: "tigers" }, coach: coach("Okafor") } }, sam);
    expect(clash.statusCode).toBe(400);
    expect(clash.json().error).toMatch(/friend/);
    expect((await post(`/leagues/${id}/setup`, { setup: { identity: { nickname: "Tigers", logo: "wolves" }, coach: coach("Okafor") } }, sam)).statusCode).toBe(400);
    const lobby = (await get(`/leagues/${id}`, sam)).json();
    const ai = lobby.teams.find((t: { abbr: string; claimedBy: string | null }) => !t.claimedBy);
    const aiNick = ai.name.split(" ").at(-1);
    expect((await post(`/leagues/${id}/setup`, { setup: { identity: { nickname: aiNick, logo: "tigers" }, coach: coach("Okafor") } }, sam)).statusCode).toBe(200);

    // A setup only counts while you hold that team: give it up and it's gone; claim it back and it returns.
    const txCoach = async () => (await get(`/leagues/${id}`, sam)).json().teams.find((t: { abbr: string }) => t.abbr === "TX").coach;
    await post(`/leagues/${id}/claim`, { team: "CA" }, sam);
    expect(await txCoach()).toBeUndefined();
    await post(`/leagues/${id}/claim`, { team: "TX" }, sam);
    expect(await txCoach()).toBe("Dana Okafor");

    // The start makes them: names, logos and coaches in the save; the AI team traded names.
    const started = await post(`/leagues/${id}/start`, {}, jai);
    expect(started.statusCode).toBe(200);
    expect(started.json().teams.find((t: { abbr: string }) => t.abbr === "OH").name).toBe("Buckeye Wolves");
    const state = decodeState((await get(`/leagues/${id}/save`, jai)).body);
    const league = state.dynasty.league;
    expect(league.teams.OH).toMatchObject({ city: "Buckeye", nickname: "Wolves", tag: "BKY", logo: "wolves", colors: { primary: "#0B3D91", trim: "#F2C14E" } });
    expect(league.teams.OH!.staff!.hc.lastName).toBe("Reyes");
    expect(league.teams.OH!.staff!.hc.calls?.scheme).toBe("Air Raid");
    expect(league.teams.TX).toMatchObject({ nickname: aiNick, logo: "tigers" });
    expect(league.teams.TX!.staff!.hc.lastName).toBe("Okafor");
    expect(league.teams[ai.abbr]!.nickname).not.toBe(aiNick);
    expect(state.setups).toBeUndefined();
    expect(state.dynasty.staffPool.length).toBe(2);

    // And not after the start.
    expect((await post(`/leagues/${id}/setup`, { setup: null }, jai)).statusCode).toBe(409);
  });
});

describe("programs in the lobby", () => {
  it("friends pick skill groups, share a region in join order, and their programs are built at the start", { timeout: 120_000 }, async () => {
    const created = (await post("/leagues", { name: "Programs", displayName: "Jai" })).json();
    made.push(created.league.id);
    const id = created.league.id;
    const jai = created.token;
    const sam = (await post("/join", { inviteCode: created.league.inviteCode, displayName: "Sam" })).json().token;
    const speed = ["speed", "coverage", "passRush"];

    expect((await post(`/leagues/${id}/program`, { groups: ["speed", "speed", "coverage"] }, jai)).statusCode).toBe(400);
    expect((await post(`/leagues/${id}/start`, {}, jai)).json().error).toMatch(/Waiting on a program/);
    await post(`/leagues/${id}/program`, { groups: speed }, jai);
    const drawn = (await post(`/leagues/${id}/program`, { groups: speed }, sam)).json();
    // Regions are drawn at random; only the commissioner can move a program.
    for (const m of drawn.members) expect(m.program.region).toBeTruthy();
    const samId = drawn.members.find((m: { displayName: string }) => m.displayName === "Sam").id;
    const jaiId = drawn.members.find((m: { displayName: string }) => m.displayName === "Jai").id;
    expect((await post(`/leagues/${id}/region`, { memberId: jaiId, region: "Pacific" }, sam)).statusCode).toBe(403);
    expect((await post(`/leagues/${id}/region`, { memberId: samId, region: "Atlantis" }, jai)).statusCode).toBe(400);
    await post(`/leagues/${id}/region`, { memberId: jaiId, region: "Southeast" }, jai);
    const lobby = (await post(`/leagues/${id}/region`, { memberId: samId, region: "Southeast" }, jai)).json();
    // New skill groups keep the region.
    const [j, s] = ["Jai", "Sam"].map((n) => lobby.members.find((m: { displayName: string }) => m.displayName === n));
    expect(j.program.region).toBe("Southeast");
    expect(s.program.region).toBe("Southeast");
    const regrouped = (await post(`/leagues/${id}/program`, { groups: ["bigMen", "runStop", "powerRun"] }, sam)).json();
    expect(regrouped.members.find((m: { displayName: string }) => m.displayName === "Sam").program.region).toBe("Southeast");
    await post(`/leagues/${id}/program`, { groups: speed }, sam);
    expect(j.team).not.toBe(s.team);
    expect(lobby.teams.find((t: { abbr: string }) => t.abbr === j.team)).toMatchObject({ name: "Southeast program", program: "Southeast", claimedBy: j.id });

    // Your look is checked against your program's spot; your own setup comes back with where you'll be.
    const coach = { firstName: "Dana", lastName: "Reyes", age: 44, style: "balanced", offenseScheme: "Pro Style", defenseScheme: "Multiple", aggressiveness: 50, tempo: 45, ratings: { gameManagement: 66, discipline: 66, development: 66, playCalling: 40 } };
    expect((await post(`/leagues/${id}/setup`, { setup: { identity: { city: "Gulf Coast", nickname: "Tigers", logo: "tigers" }, coach } }, jai)).statusCode).toBe(200);
    const mine = (await get(`/leagues/${id}/setup`, jai)).json();
    expect(mine).toMatchObject({ team: j.team, region: "Southeast", setup: { identity: { nickname: "Tigers" } } });
    expect((await post(`/leagues/${id}/setup`, { setup: { identity: { nickname: "Tigers", logo: "lions" }, coach } }, sam)).json().error).toMatch(/friend/);

    const started = await post(`/leagues/${id}/start`, {}, jai);
    expect(started.statusCode).toBe(200);
    const state = decodeState((await get(`/leagues/${id}/save`, jai)).body);
    const league = state.dynasty.league;
    expect(league.teams[j.team]).toMatchObject({ region: "Southeast", city: "Gulf Coast", nickname: "Tigers" });
    expect(league.teams[s.team]!.region).toBe("Southeast");
    expect(league.teams[j.team]!.staff!.hc.lastName).toBe("Reyes");
    expect(Object.keys(state.humans).sort()).toEqual([j.team, s.team].sort());
    expect(started.json().members.map((m: { team: string }) => m.team).sort()).toEqual([j.team, s.team].sort());
    expect(state.programs).toBeUndefined();
  });
});
