// League chat: friends' messages and the league's own posts (a week played, a
// trade between friends, a title), kept in the database so history loads when
// you open the league, and sent live over a WebSocket to everyone connected.
//
// The live connection signs in with the member's token as its first message
// (never in the URL); posting and removing go through ordinary requests. You
// can remove your own messages; the commissioner can remove anyone's.
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { fail, hashToken, requireMember } from "./auth.ts";
import type { Db } from "./db.ts";

export const CHAT = {
  /** Longest message, in characters. */
  maxLength: 500,
  /** Messages a page (and the most a page may ask for). */
  page: 50,
  maxPage: 100,
  /** A member may post this many messages in `windowMs`. */
  burst: 8,
  windowMs: 20_000,
  /** A live connection has this long to sign in. */
  authMs: 10_000,
};

type Row = Awaited<ReturnType<Db["chatMessage"]["findUniqueOrThrow"]>>;

export interface ChatView {
  id: string;
  kind: "chat" | "post";
  memberId: string | null;
  /** The writer's display name (null for the league's own posts). */
  author: string | null;
  /** Empty once removed. */
  body: string;
  removed: boolean;
  createdAt: string;
}

/** Live events, sent to everyone connected to the league. */
export type ChatEvent = { type: "ready" } | { type: "message"; message: ChatView } | { type: "removed"; id: string } | { type: "error"; error: string };

const view = (m: Row, names: ReadonlyMap<string, string>): ChatView => ({
  id: m.id,
  kind: m.kind === "post" ? "post" : "chat",
  memberId: m.memberId,
  author: m.memberId ? (names.get(m.memberId) ?? "A former member") : null,
  body: m.removedAt ? "" : m.body,
  removed: m.removedAt !== null,
  createdAt: m.createdAt.toISOString(),
});

async function namesOf(db: Db, leagueId: string): Promise<Map<string, string>> {
  const members = await db.member.findMany({ where: { leagueId }, select: { id: true, displayName: true } });
  return new Map(members.map((m) => [m.id, m.displayName]));
}

// Who's connected, by league (one process; a second server would need a shared bus).
const live = new Map<string, Set<WebSocket>>();

function broadcast(leagueId: string, event: ChatEvent) {
  const text = JSON.stringify(event);
  for (const ws of live.get(leagueId) ?? []) if (ws.readyState === ws.OPEN) ws.send(text);
}

/** The league posts to its own chat (a week played, a trade, a title). */
export async function leaguePost(db: Db, leagueId: string, body: string): Promise<ChatView> {
  const m = await db.chatMessage.create({ data: { leagueId, kind: "post", body: body.slice(0, CHAT.maxLength * 2) } });
  const v = view(m, new Map());
  broadcast(leagueId, { type: "message", message: v });
  return v;
}

/** Collapse runs of whitespace (keeping line breaks) and trim. */
const tidy = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const recent = new Map<string, number[]>();
/** Too many messages too fast? (Remembers the post if not.) */
function flooding(memberId: string, now = Date.now()): boolean {
  const times = (recent.get(memberId) ?? []).filter((t) => now - t < CHAT.windowMs);
  if (times.length >= CHAT.burst) return true;
  recent.set(memberId, [...times, now]);
  return false;
}

export function chatRoutes(app: FastifyInstance, db: Db) {
  /** The league's messages, newest first; `before` (a message id) pages back. */
  app.get<{ Params: { id: string }; Querystring: { before?: string; limit?: string } }>("/leagues/:id/chat", async (req, reply) => {
    const member = await requireMember(db, req, reply, req.params.id);
    if (!member) return reply;
    const limit = Math.max(1, Math.min(CHAT.maxPage, Number(req.query.limit) || CHAT.page));
    const before = req.query.before ? await db.chatMessage.findFirst({ where: { id: req.query.before, leagueId: member.leagueId } }) : null;
    const rows = await db.chatMessage.findMany({
      where: { leagueId: member.leagueId, ...(before ? { OR: [{ createdAt: { lt: before.createdAt } }, { createdAt: before.createdAt, id: { lt: before.id } }] } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const names = await namesOf(db, member.leagueId);
    return { messages: rows.slice(0, limit).map((m) => view(m, names)), more: rows.length > limit };
  });

  /** Post a message. */
  app.post<{ Params: { id: string }; Body: { body: string } }>(
    "/leagues/:id/chat",
    { schema: { body: { type: "object", required: ["body"], additionalProperties: false, properties: { body: { type: "string", maxLength: CHAT.maxLength * 4 } } } } },
    async (req, reply) => {
      const member = await requireMember(db, req, reply, req.params.id);
      if (!member) return reply;
      const body = tidy(req.body.body);
      if (!body) return fail(reply, 400, "Say something first");
      if (body.length > CHAT.maxLength) return fail(reply, 400, `Keep it under ${CHAT.maxLength} characters`);
      if (flooding(member.id)) return fail(reply, 429, "Slow down a little");
      const m = await db.chatMessage.create({ data: { leagueId: member.leagueId, memberId: member.id, body } });
      const v = view(m, new Map([[member.id, member.displayName]]));
      broadcast(member.leagueId, { type: "message", message: v });
      return reply.code(201).send({ message: v });
    },
  );

  /** Remove a message: your own, or anyone's if you're the commissioner. */
  app.post<{ Params: { id: string; messageId: string } }>("/leagues/:id/chat/:messageId/remove", async (req, reply) => {
    const member = await requireMember(db, req, reply, req.params.id);
    if (!member) return reply;
    const m = await db.chatMessage.findFirst({ where: { id: req.params.messageId, leagueId: member.leagueId } });
    if (!m) return fail(reply, 404, "No such message");
    if (m.memberId !== member.id && !member.isCommissioner) return fail(reply, 403, "Only the commissioner can remove someone else's message");
    if (!m.removedAt) {
      await db.chatMessage.update({ where: { id: m.id }, data: { removedAt: new Date(), body: "" } });
      broadcast(member.leagueId, { type: "removed", id: m.id });
    }
    return { removed: true };
  });

  /** The live connection: send {type:"auth", token} first; then messages and removals arrive as they happen. */
  app.get<{ Params: { id: string } }>("/leagues/:id/live", { websocket: true }, (socket, req) => {
    const leagueId = req.params.id;
    let joined = false;
    const send = (e: ChatEvent) => socket.readyState === socket.OPEN && socket.send(JSON.stringify(e));
    const timer = setTimeout(() => {
      if (!joined) {
        send({ type: "error", error: "Sign in with your league token" });
        socket.close(4001, "no sign-in");
      }
    }, CHAT.authMs);
    socket.on("message", async (raw: unknown) => {
      if (joined) return; // (posting goes through POST /chat)
      let token = "";
      try {
        const msg = JSON.parse(String(raw)) as { type?: string; token?: string };
        if (msg.type === "auth" && typeof msg.token === "string") token = msg.token;
      } catch {
        // not JSON
      }
      const member = token ? await db.member.findUnique({ where: { tokenHash: hashToken(token) } }) : null;
      if (!member || member.leagueId !== leagueId) {
        send({ type: "error", error: member ? "You're not in this league" : "Sign in with your league token" });
        socket.close(4003, "not a member");
        return;
      }
      joined = true;
      clearTimeout(timer);
      let set = live.get(leagueId);
      if (!set) live.set(leagueId, (set = new Set()));
      set.add(socket);
      send({ type: "ready" });
    });
    socket.on("close", () => {
      clearTimeout(timer);
      const set = live.get(leagueId);
      set?.delete(socket);
      if (set?.size === 0) live.delete(leagueId);
    });
  });
}
