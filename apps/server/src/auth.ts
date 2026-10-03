// Device tokens: a member gets a random token once (when they create or join a
// league) and sends it as "Authorization: Bearer <token>". Only its hash is stored.
import { createHash, randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "./db.ts";

export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The member a request's token belongs to (null without a valid token). */
export async function memberFor(db: Db, req: FastifyRequest) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  return db.member.findUnique({ where: { tokenHash: hashToken(token) } });
}

/** Invite codes: 6 characters with no look-alikes (no 0/O, 1/I/L). */
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newInviteCode(): string {
  const bytes = randomBytes(6);
  return [...bytes].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}

export function fail(reply: FastifyReply, code: number, error: string) {
  return reply.code(code).send({ error });
}

/** The signed-in member, if they belong to this league (otherwise the reply says why, and null). */
export async function requireMember(db: Db, req: FastifyRequest, reply: FastifyReply, leagueId: string) {
  const member = await memberFor(db, req);
  if (!member) {
    fail(reply, 401, "Sign in with your league token");
    return null;
  }
  if (member.leagueId !== leagueId) {
    fail(reply, 403, "You're not in this league");
    return null;
  }
  return member;
}
