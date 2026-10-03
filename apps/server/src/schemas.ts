// Request shapes shared by routes (Fastify checks bodies against these).

export const idSchema = { type: "string", minLength: 1, maxLength: 64 } as const;

/** The sim's trade proposal: players and picks each way. */
export const proposalSchema = {
  type: "object",
  required: ["from", "to", "give", "get"],
  properties: {
    from: { type: "string", maxLength: 3 },
    to: { type: "string", maxLength: 3 },
    give: { type: "array", items: idSchema, maxItems: 12 },
    get: { type: "array", items: idSchema, maxItems: 12 },
    givePicks: { type: "array", items: idSchema, maxItems: 14 },
    getPicks: { type: "array", items: idSchema, maxItems: 14 },
  },
} as const;
