// The commissioner's tools: pause the league (and pick it back up), push back
// this week's deadline, hand a friend's team to the AI (and back), and remove a
// member (their team goes to the AI). Every action is posted to the league.
import { teamName } from "@dynasty/sim";
import type { FastifyInstance } from "fastify";
import { changeLeague, deadlineAfter } from "./advance.ts";
import { fail, requireMember } from "./auth.ts";
import { leaguePost } from "./chat.ts";
import type { Db } from "./db.ts";
import { idSchema } from "./schemas.ts";
import { decodeState, type LeagueState } from "./state.ts";

export type CommissionerAction =
  | { action: "pause" }
  | { action: "resume" }
  /** Push this week's deadline back this many hours (1 to a week). */
  | { action: "extend"; hours: number }
  /** Hand a friend's team to the AI, or give it back. */
  | { action: "away"; memberId: string }
  | { action: "back"; memberId: string }
  /** Remove a member from the league (their team goes to the AI). */
  | { action: "remove"; memberId: string };

const HOUR_MS = 60 * 60 * 1000;

/** A league without a friend: their team back to the AI, and anything of theirs that's private dropped. */
export function withoutFriend(s: LeagueState, memberId: string, team: string | null): LeagueState {
  const without = <T>(r: Record<string, T> | undefined, key: string | null): Record<string, T> | undefined =>
    r && key !== null && key in r ? Object.fromEntries(Object.entries(r).filter(([k]) => k !== key)) : r;
  const humans = Object.fromEntries(Object.entries(s.humans).filter(([t, id]) => id !== memberId && t !== team));
  const { coaching, scoutPlans, recruiting, setups, programs, ...rest } = s;
  const kept = {
    coaching: without(coaching, team),
    scoutPlans: without(scoutPlans, team),
    recruiting: without(recruiting, team),
    setups: without(setups, memberId),
    programs: without(programs, memberId),
  };
  return { ...rest, humans, ...Object.fromEntries(Object.entries(kept).filter(([, v]) => v !== undefined)) } as LeagueState;
}

export function commissionerRoutes(app: FastifyInstance, db: Db) {
  app.post<{ Params: { id: string }; Body: CommissionerAction }>(
    "/leagues/:id/commissioner",
    {
      schema: {
        body: {
          type: "object",
          required: ["action"],
          additionalProperties: false,
          properties: { action: { enum: ["pause", "resume", "extend", "away", "back", "remove"] }, hours: { type: "integer", minimum: 1, maximum: 168 }, memberId: idSchema },
        },
      },
    },
    async (req, reply) => {
      const me = await requireMember(db, req, reply, req.params.id);
      if (!me) return reply;
      if (!me.isCommissioner) return fail(reply, 403, "Only the commissioner can do that");
      const league = await db.league.findUniqueOrThrow({ where: { id: me.leagueId }, include: { members: true, save: true } });
      const body = req.body;
      const now = new Date();

      if (body.action === "pause" || body.action === "resume") {
        if (league.phase === "lobby") return fail(reply, 409, "The league hasn't started");
        const pause = body.action === "pause";
        if (league.paused === pause) return fail(reply, 409, pause ? "The league is already paused" : "The league isn't paused");
        // Picking back up gives everyone a full week again.
        await db.league.update({ where: { id: league.id }, data: { paused: pause, ...(pause ? {} : { deadline: deadlineAfter(now, league.weekHours) }) } });
        await leaguePost(db, league.id, pause ? "The commissioner paused the league. Nothing plays until it's picked back up." : `The commissioner picked the league back up. The next step plays in ${league.weekHours} hours, or when everyone is ready.`);
        return { done: true };
      }

      if (body.action === "extend") {
        if (league.phase === "lobby" || !league.deadline) return fail(reply, 409, "There's no deadline to push back");
        if (league.paused) return fail(reply, 409, "The league is paused");
        const hours = body.hours ?? 0;
        if (hours < 1) return fail(reply, 400, "Push it back at least an hour");
        const deadline = new Date(Math.max(league.deadline.getTime(), now.getTime()) + hours * HOUR_MS);
        await db.league.update({ where: { id: league.id }, data: { deadline } });
        await leaguePost(db, league.id, `The commissioner gave everyone ${hours} more hour${hours === 1 ? "" : "s"} this week.`);
        return { done: true, deadline: deadline.toISOString() };
      }

      // The rest are about one member.
      const them = league.members.find((m) => m.id === body.memberId);
      if (!them) return fail(reply, 404, "No such member");
      const state = league.save ? decodeState(league.save.data) : null;
      const theirTeam = them.team && state?.dynasty.league.teams[them.team] ? teamName(state.dynasty.league.teams[them.team]!) : null;

      if (body.action === "away" || body.action === "back") {
        if (them.id === me.id && body.action === "away") return fail(reply, 409, "You can't hand your own team to the AI (just don't ready up)");
        const away = body.action === "away";
        if (them.away === away) return fail(reply, 409, away ? `${them.displayName}'s team is already with the AI` : `${them.displayName}'s team isn't with the AI`);
        await db.member.update({ where: { id: them.id }, data: { away, ready: false } });
        await leaguePost(db, league.id, away ? `${them.displayName}'s team${theirTeam ? `, the ${theirTeam},` : ""} is in the AI's hands for now.` : `${them.displayName} is back running ${theirTeam ? `the ${theirTeam}` : "their team"}.`);
        return { done: true };
      }

      // Remove: their team goes to the AI (in the lobby, their claim and choices just go).
      if (them.id === me.id) return fail(reply, 409, "The commissioner can't remove themselves");
      const r = await changeLeague(db, league.id, (s) => ({ state: withoutFriend(s, them.id, them.team), result: true }), now);
      if (!r) return fail(reply, 409, "The league is busy (a week may be being played): try again");
      await db.$transaction([
        db.tradeOffer.updateMany({ where: { leagueId: league.id, status: "open", ...(them.team ? { OR: [{ fromTeam: them.team }, { toTeam: them.team }] } : { id: "" }) }, data: { status: "expired", note: "A friend in the trade left the league." } }),
        db.member.delete({ where: { id: them.id } }),
      ]);
      await leaguePost(db, league.id, `${them.displayName} has left the league.${theirTeam ? ` The ${theirTeam} go to the AI.` : ""}`);
      return { done: true };
    },
  );
}
