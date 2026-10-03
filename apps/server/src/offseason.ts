// Friends' offseason calls in an online league: one call per stage (staff,
// hires, re-signings, the draft board, free agency, cuts), changeable until
// the stage closes. Anyone without a call when it closes is left to the AI.
import { STAGE_CHOICE_KEY, type FreeAgentOffer, type PlayerId, type StaffSlot, type StagedChoices } from "@dynasty/sim";
import type { FastifyInstance } from "fastify";
import { changeLeague } from "./advance.ts";
import { fail, requireMember } from "./auth.ts";
import type { Db } from "./db.ts";
import { idSchema } from "./schemas.ts";
import type { LeagueState } from "./state.ts";

export type OffseasonChoice =
  | { stage: "staff"; fire: StaffSlot[]; renew: StaffSlot[] }
  | { stage: "hire"; picks: Array<[StaffSlot, string]> }
  | { stage: "resign"; keep: PlayerId[]; offers?: Array<[PlayerId, number]> }
  | { stage: "draft"; board: PlayerId[] }
  | { stage: "freeagency"; offers: Array<[PlayerId, FreeAgentOffer]>; frontOffice: boolean }
  | { stage: "cuts"; cuts: PlayerId[] };

const STAGE_KEY = STAGE_CHOICE_KEY;

/** Record a friend's call for the stage that's open (replacing any earlier one). */
export function recordChoice(s: LeagueState, team: string, c: OffseasonChoice): { state: LeagueState | null; problems: string[] } {
  const o = s.offseason;
  if (!o) return { state: null, problems: ["The offseason hasn't opened."] };
  if (c.stage !== o.stage) return { state: null, problems: [`It's the ${o.stage} stage now.`] };
  const value =
    c.stage === "staff" ? { fire: c.fire, renew: c.renew }
    : c.stage === "hire" ? c.picks
    : c.stage === "resign" ? c.keep
    : c.stage === "draft" ? c.board
    : c.stage === "freeagency" ? { offers: c.offers, frontOffice: c.frontOffice }
    : c.cuts;
  const key = STAGE_KEY[c.stage];
  let choices: StagedChoices = { ...o.choices, [key]: { ...(o.choices[key] ?? {}), [team]: value } };
  // Counteroffers ride with the re-signings.
  if (c.stage === "resign") {
    const { [team]: _old, ...rest } = o.choices.resignOffers ?? {};
    choices = { ...choices, resignOffers: c.offers?.length ? { ...rest, [team]: c.offers } : rest };
  }
  return { state: { ...s, offseason: { ...o, choices } }, problems: [] };
}

/** The save as one friend may see it: other friends' calls for the open stage are theirs alone. */
export function forMember(s: LeagueState, team: string | null): LeagueState {
  const o = s.offseason;
  if (!o) return s;
  const key = STAGE_KEY[o.stage];
  const mine = team ? o.choices[key]?.[team] : undefined;
  const choices = { ...o.choices, [key]: mine === undefined ? {} : { [team!]: mine } };
  // During re-signings, other friends' counteroffers are theirs alone too.
  if (o.stage === "resign") {
    const offers = team ? o.choices.resignOffers?.[team] : undefined;
    choices.resignOffers = offers ? { [team!]: offers } : {};
  }
  return { ...s, offseason: { ...o, choices } };
}

/** Friends who've made their call for the open stage. */
export function madeCall(s: LeagueState): string[] {
  const o = s.offseason;
  return o ? Object.keys(o.choices[STAGE_KEY[o.stage]] ?? {}).sort() : [];
}

const slot = { enum: ["hc", "oc", "dc", "gm", "scout"] } as const;
const ids = (max: number) => ({ type: "array", items: idSchema, maxItems: max }) as const;
const choiceSchema = {
  oneOf: [
    { type: "object", required: ["stage", "fire", "renew"], properties: { stage: { const: "staff" }, fire: { type: "array", items: slot, maxItems: 5 }, renew: { type: "array", items: slot, maxItems: 5 } } },
    { type: "object", required: ["stage", "picks"], properties: { stage: { const: "hire" }, picks: { type: "array", maxItems: 5, items: { type: "array", items: [slot, idSchema], minItems: 2, maxItems: 2, additionalItems: false } } } },
    {
      type: "object",
      required: ["stage", "keep"],
      properties: {
        stage: { const: "resign" },
        keep: ids(72),
        offers: { type: "array", maxItems: 72, items: { type: "array", minItems: 2, maxItems: 2, additionalItems: false, items: [idSchema, { enum: [0.9, 1, 1.1, 1.2] }] } },
      },
    },
    { type: "object", required: ["stage", "board"], properties: { stage: { const: "draft" }, board: ids(500) } },
    {
      type: "object",
      required: ["stage", "offers", "frontOffice"],
      properties: {
        stage: { const: "freeagency" },
        frontOffice: { type: "boolean" },
        offers: {
          type: "array",
          maxItems: 80,
          items: {
            type: "array",
            minItems: 2,
            maxItems: 2,
            additionalItems: false,
            items: [idSchema, { type: "object", required: ["annual", "years"], properties: { annual: { type: "integer", minimum: 1, maximum: 1_000_000 }, years: { type: "integer", minimum: 1, maximum: 5 } } }],
          },
        },
      },
    },
    { type: "object", required: ["stage", "cuts"], properties: { stage: { const: "cuts" }, cuts: ids(80) } },
  ],
} as const;

export function offseasonRoutes(app: FastifyInstance, db: Db) {
  /** Your call for the stage that's open (send it again to change it). */
  app.post<{ Params: { id: string }; Body: { choice: OffseasonChoice } }>(
    "/leagues/:id/offseason",
    { schema: { body: { type: "object", required: ["choice"], properties: { choice: choiceSchema } } } },
    async (req, reply) => {
      const member = await requireMember(db, req, reply, req.params.id);
      if (!member) return reply;
      if (!member.team) return fail(reply, 409, "Claim a team first");
      const team = member.team;
      const r = await changeLeague(db, member.leagueId, (state) => {
        const done = recordChoice(state, team, req.body.choice);
        return { state: done.state, result: done.problems };
      });
      if (!r) return fail(reply, 409, "The league is busy (a stage may be closing): try again");
      return { done: r.result.length === 0, problems: r.result, saveVersion: r.version };
    },
  );
}
