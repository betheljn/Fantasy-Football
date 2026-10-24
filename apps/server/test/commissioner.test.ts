import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { advanceOverdue } from "../src/advance.ts";
import { buildApp } from "../src/app.ts";
import { createDb } from "../src/db.ts";
import { decodeState } from "../src/state.ts";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env: use the environment
}
process.env.PICKS_SIMS ??= "2";

const db = createDb();
const app = buildApp({ db });
const made: string[] = [];
let id = "";
const tokens: Record<"jai" | "sam" | "kit", string> = { jai: "", sam: "", kit: "" };
const memberIds: Record<string, string> = {};

const post = (url: string, payload: object, token?: string) =>
  app.inject({ method: "POST", url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
const get = (url: string, token?: string) => app.inject({ method: "GET", url, headers: token ? { authorization: `Bearer ${token}` } : {} });
const commish = (body: object, token = tokens.jai) => post(`/leagues/${id}/commissioner`, body, token);
const posts = async () => ((await get(`/leagues/${id}/chat?limit=20`, tokens.sam)).json().messages as Array<{ kind: string; body: string }>).filter((m) => m.kind === "post").map((m) => m.body);
const view = async () => (await get(`/leagues/${id}`, tokens.jai)).json();

beforeAll(async () => {
  await app.ready();
  const created = (await post("/leagues", { name: "Commish Test", displayName: "Jai" })).json();
  id = created.league.id;
  made.push(id);
  tokens.jai = created.token;
  tokens.sam = (await post("/join", { inviteCode: created.league.inviteCode, displayName: "Sam" })).json().token;
  tokens.kit = (await post("/join", { inviteCode: created.league.inviteCode, displayName: "Kit" })).json().token;
  const groups = [["speed", "passers", "coverage"], ["bigMen", "runStop", "kicking"], ["catchers", "passRush", "powerRun"]];
  for (const [i, t] of [tokens.jai, tokens.sam, tokens.kit].entries()) await post(`/leagues/${id}/program`, { groups: groups[i] }, t);
  const started = await post(`/leagues/${id}/start`, {}, tokens.jai);
  expect(started.statusCode).toBe(200);
  for (const m of started.json().members) memberIds[m.displayName] = m.id;
}, 120_000);

afterAll(async () => {
  await db.league.deleteMany({ where: { id: { in: made } } });
  await app.close();
});

describe("the commissioner's tools", () => {
  it("are the commissioner's alone", async () => {
    expect((await commish({ action: "pause" }, tokens.sam)).statusCode).toBe(403);
  });

  it("pauses the league: nothing plays on its own, and picking it back up gives a full week", { timeout: 120_000 }, async () => {
    expect((await commish({ action: "pause" })).json()).toEqual({ done: true });
    expect((await view()).paused).toBe(true);
    for (const t of Object.values(tokens)) await post(`/leagues/${id}/ready`, { ready: true }, t);
    expect((await view()).weeksPlayed).toBe(0);
    // Even past its deadline.
    await db.league.update({ where: { id }, data: { deadline: new Date(Date.now() - 1000) } });
    expect((await advanceOverdue(db)).some((d) => d.leagueId === id)).toBe(false);
    await commish({ action: "resume" });
    const v = await view();
    expect(v.paused).toBe(false);
    expect(new Date(v.deadline).getTime()).toBeGreaterThan(Date.now() + (v.weekHours - 1) * 3600_000);
    expect(await posts()).toEqual([expect.stringMatching(/picked the league back up/), expect.stringMatching(/paused the league/)]);
  });

  it("pushes this week's deadline back", async () => {
    const before = new Date((await view()).deadline).getTime();
    const r = (await commish({ action: "extend", hours: 6 })).json();
    expect(new Date(r.deadline).getTime() - before).toBe(6 * 3600_000);
    expect((await posts())[0]).toBe("The commissioner gave everyone 6 more hours this week.");
  });

  it("hands a friend's team to the AI: nobody waits on them, and they can have it back", { timeout: 120_000 }, async () => {
    expect((await commish({ action: "away", memberId: memberIds.Kit })).json()).toEqual({ done: true });
    expect((await view()).members.find((m: { displayName: string }) => m.displayName === "Kit").away).toBe(true);
    for (const t of [tokens.jai, tokens.sam]) await post(`/leagues/${id}/ready`, { ready: false }, t);
    await post(`/leagues/${id}/ready`, { ready: true }, tokens.jai);
    const r = (await post(`/leagues/${id}/ready`, { ready: true }, tokens.sam)).json();
    // Everyone left who counts was ready: the week played, Kit's team covered by the AI.
    expect(r.advanced).toMatchObject({ kind: "week", week: 1 });
    expect(r.advanced.covered).toEqual([(await view()).members.find((m: { displayName: string }) => m.displayName === "Kit").team]);
    await commish({ action: "back", memberId: memberIds.Kit });
    expect((await posts()).slice(0, 3).some((b) => /is back running/.test(b))).toBe(true);
  });

  it("removes a member: their team goes to the AI", async () => {
    expect((await commish({ action: "remove", memberId: memberIds.Jai })).statusCode).toBe(409);
    const kitTeam = (await view()).members.find((m: { displayName: string }) => m.displayName === "Kit").team;
    expect((await commish({ action: "remove", memberId: memberIds.Kit })).json()).toEqual({ done: true });
    const v = await view();
    expect(v.members.map((m: { displayName: string }) => m.displayName).sort()).toEqual(["Jai", "Sam"]);
    const save = await db.leagueSave.findUniqueOrThrow({ where: { leagueId: id } });
    expect(kitTeam in decodeState(save.data).humans).toBe(false);
    expect((await posts())[0]).toMatch(/^Kit has left the league\. The .+ go to the AI\.$/);
    // Kit's token no longer works here.
    expect((await get(`/leagues/${id}/chat`, tokens.kit)).statusCode).toBe(401);
  });
});
