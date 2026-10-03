// Trades between friends: one sends an offer, the other accepts or declines
// (or the sender takes it back). Accepting makes the trade if it still works
// by the sim's rules then; open offers expire when trading closes.
import type { TradeProposal } from "@dynasty/sim";
import type { FastifyInstance } from "fastify";
import { changeLeague } from "./advance.ts";
import { fail, requireMember } from "./auth.ts";
import type { Db } from "./db.ts";
import { acceptFriendTrade, friendTradeProblems } from "./moves.ts";
import { idSchema, proposalSchema } from "./schemas.ts";
import { decodeState } from "./state.ts";

type Offer = Awaited<ReturnType<Db["tradeOffer"]["findUniqueOrThrow"]>>;

const view = (o: Offer) => ({
  id: o.id,
  from: o.fromTeam,
  to: o.toTeam,
  proposal: o.proposal as unknown as TradeProposal,
  status: o.status,
  note: o.note,
  createdAt: o.createdAt.toISOString(),
  updatedAt: o.updatedAt.toISOString(),
});

export function offerRoutes(app: FastifyInstance, db: Db) {
  /** Offer a trade to a friend's team. */
  app.post<{ Params: { id: string }; Body: { proposal: TradeProposal } }>(
    "/leagues/:id/offers",
    { schema: { body: { type: "object", required: ["proposal"], properties: { proposal: proposalSchema } } } },
    async (req, reply) => {
      const member = await requireMember(db, req, reply, req.params.id);
      if (!member) return reply;
      if (!member.team) return fail(reply, 409, "Claim a team first");
      const league = await db.league.findUniqueOrThrow({ where: { id: member.leagueId }, include: { save: true } });
      if (league.phase !== "season" || !league.save) return fail(reply, 409, "The league hasn't started");
      const t = req.body.proposal;
      const problems = friendTradeProblems(decodeState(league.save.data), member.team, t);
      if (problems.length) return { sent: false, problems };
      const offer = await db.tradeOffer.create({ data: { leagueId: league.id, fromTeam: t.from, toTeam: t.to, proposal: t as object } });
      return reply.code(201).send({ sent: true, problems: [], offer: view(offer) });
    },
  );

  /** Your offers, sent and received (the most recent first). */
  app.get<{ Params: { id: string } }>("/leagues/:id/offers", async (req, reply) => {
    const member = await requireMember(db, req, reply, req.params.id);
    if (!member) return reply;
    if (!member.team) return { offers: [] };
    const offers = await db.tradeOffer.findMany({
      where: { leagueId: member.leagueId, OR: [{ fromTeam: member.team }, { toTeam: member.team }] },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    return { offers: offers.map(view) };
  });

  /** Accept or decline an offer made to you, or withdraw one you made. */
  app.post<{ Params: { id: string; offerId: string }; Body: { action: "accept" | "decline" | "withdraw" } }>(
    "/leagues/:id/offers/:offerId",
    { schema: { params: { type: "object", properties: { id: idSchema, offerId: idSchema } }, body: { type: "object", required: ["action"], properties: { action: { enum: ["accept", "decline", "withdraw"] } } } } },
    async (req, reply) => {
      const member = await requireMember(db, req, reply, req.params.id);
      if (!member) return reply;
      const offer = await db.tradeOffer.findUnique({ where: { id: req.params.offerId } });
      if (!offer || offer.leagueId !== member.leagueId) return fail(reply, 404, "No such offer");
      const { action } = req.body;
      const mine = action === "withdraw" ? offer.fromTeam : offer.toTeam;
      if (member.team !== mine) return fail(reply, 403, action === "withdraw" ? "Only the team that made the offer can withdraw it" : "Only the team it was offered to can answer it");
      if (offer.status !== "open") return fail(reply, 409, `That offer is ${offer.status}`);
      // Only one answer counts: whoever changes it from open first.
      const move = async (from: string, to: string, note: string | null = null) =>
        (await db.tradeOffer.updateMany({ where: { id: offer.id, status: from }, data: { status: to, note } })).count === 1;
      const current = async () => view(await db.tradeOffer.findUniqueOrThrow({ where: { id: offer.id } }));
      if (action !== "accept") {
        if (!(await move("open", action === "decline" ? "declined" : "withdrawn"))) return fail(reply, 409, "That offer was already answered");
        return { offer: await current(), problems: [] };
      }
      // Hold it while the trade is made, so it can't be withdrawn halfway.
      if (!(await move("open", "accepting"))) return fail(reply, 409, "That offer was already answered");
      const t = offer.proposal as unknown as TradeProposal;
      const r = await changeLeague(db, member.leagueId, (state) => {
        const m = acceptFriendTrade(state, t);
        return { state: m.state, result: m.problems };
      }).catch(async (e: unknown) => {
        await move("accepting", "open");
        throw e;
      });
      if (!r) {
        await move("accepting", "open");
        return fail(reply, 409, "The league is busy (a week may be being played): try again");
      }
      await move("accepting", r.result.length ? "failed" : "accepted", r.result[0] ?? null);
      return { offer: await current(), problems: r.result, saveVersion: r.version };
    },
  );
}
