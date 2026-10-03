// Talking to the online-leagues server (apps/server). The server runs the sim
// for online leagues; the app only asks it for things and shows the answers.
import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Where the server is: EXPO_PUBLIC_SERVER_URL if set, otherwise the computer
 * running the dev bundler (same host as Metro, port 8787), so a phone on the
 * same Wi-Fi finds it.
 */
export function serverUrl(): string {
  const set = process.env.EXPO_PUBLIC_SERVER_URL;
  if (set) return set.replace(/\/$/, "");
  const metroHost = Constants.expoConfig?.hostUri?.split(":")[0];
  const webHost = Platform.OS === "web" && typeof window !== "undefined" ? window.location.hostname : undefined;
  return `http://${metroHost || webHost || "localhost"}:8787`;
}

export interface OnlineMember {
  id: string;
  displayName: string;
  team: string | null;
  isCommissioner: boolean;
  ready: boolean;
}

export interface OnlineTeam {
  abbr: string;
  name: string;
  conference: string;
  division: string;
  overall: number;
  wins: number;
  losses: number;
  ties: number;
  claimedBy: string | null;
}

export type NextStep = { kind: "week"; week: number } | { kind: "playoffs" } | { kind: "offseason" };

export interface OnlineGame {
  id: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  overtime: boolean;
  winner: string | null;
}

export interface OnlineLeague {
  id: string;
  name: string;
  inviteCode: string;
  phase: "lobby" | "season";
  season: number;
  weeksPlayed: number;
  saveVersion: number;
  weekHours: number;
  deadline: string | null;
  next: NextStep | null;
  champion: string | null;
  members: OnlineMember[];
  teams: OnlineTeam[];
}

export type AdvanceSummary =
  | { kind: "week"; season: number; week: number; games: OnlineGame[]; covered: string[]; trades: number; moves: number }
  | { kind: "playoffs"; season: number; champion: string; runnerUp: string }
  | { kind: "offseason"; season: number; nextSeason: number };

export class ServerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(method: "GET" | "POST", path: string, body?: object, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(serverUrl() + path, {
      method,
      headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ServerError(`Can't reach the league server at ${serverUrl()}`, 0);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new ServerError(data.error ?? data.message ?? `The server said ${res.status}`, res.status);
  return data as T;
}

export interface Joined {
  token: string;
  memberId: string;
  league: OnlineLeague;
}

/** The league's save (the sim's compact format) and its version. */
async function saveText(id: string, token: string): Promise<{ text: string; version: number }> {
  let res: Response;
  try {
    res = await fetch(`${serverUrl()}/leagues/${id}/save`, { headers: { authorization: `Bearer ${token}` } });
  } catch {
    throw new ServerError(`Can't reach the league server at ${serverUrl()}`, 0);
  }
  if (!res.ok) throw new ServerError(`Couldn't load the league (the server said ${res.status})`, res.status);
  return { text: await res.text(), version: Number(res.headers.get("x-save-version") ?? 0) };
}

export const api = {
  save: saveText,
  health: () => call<{ ok: boolean; database: string }>("GET", "/health"),
  create: (name: string, displayName: string, weekHours: number) => call<Joined>("POST", "/leagues", { name, displayName, weekHours }),
  join: (inviteCode: string, displayName: string) => call<Joined>("POST", "/join", { inviteCode, displayName }),
  league: (id: string, token: string) => call<OnlineLeague>("GET", `/leagues/${id}`, undefined, token),
  claim: (id: string, token: string, team: string | null) => call<OnlineLeague>("POST", `/leagues/${id}/claim`, { team }, token),
  start: (id: string, token: string) => call<OnlineLeague>("POST", `/leagues/${id}/start`, {}, token),
  ready: (id: string, token: string, ready: boolean) => call<{ advanced: AdvanceSummary | null; league: OnlineLeague }>("POST", `/leagues/${id}/ready`, { ready }, token),
  advance: (id: string, token: string) => call<{ advanced: AdvanceSummary; league: OnlineLeague }>("POST", `/leagues/${id}/advance`, {}, token),
  games: (id: string, token: string, week?: number) =>
    call<{ season: number; week: number; games: OnlineGame[] }>("GET", `/leagues/${id}/games${week ? `?week=${week}` : ""}`, undefined, token),
};
