// Compact save text. A save is mostly the same few shapes repeated thousands of
// times (50 named ratings per player, 50 named stats per stat line, contract
// years), so those are written as plain arrays in a fixed key order instead of
// named fields. Maps (careers, stats) are tagged so they survive JSON. Lossless:
// fromSaveJson(toSaveJson(x)) deep-equals x.
import { RATING_KEYS } from "../model/ratings.ts";
import { PLAYER_STAT_KEYS, TEAM_STAT_KEYS } from "../stats/boxscore.ts";

const YEAR_KEYS = ["season", "salary", "bonus", "guaranteed"] as const;

/** Tags for the packed shapes. */
const TAGS = {
  $m: null, // Map: entries
  $r: RATING_KEYS, // ratings
  $p: PLAYER_STAT_KEYS, // a player's stat line
  $t: TEAM_STAT_KEYS, // a team's stat line
  $q: PLAYER_STAT_KEYS, // a player's stat line, as [index, value, ...] pairs
  $y: YEAR_KEYS, // a plain contract year
} as const;

/** Does this object have exactly these keys? */
function hasKeys(v: Record<string, unknown>, count: number, keys: readonly string[]): boolean {
  if (Object.keys(v).length !== count) return false;
  for (const k of keys) if (!(k in v)) return false;
  return true;
}

/** Values in key order, dropping trailing zeros (most stat lines are mostly zeros). */
function pack(v: Record<string, unknown>, keys: readonly string[]): unknown[] {
  const out = keys.map((k) => v[k]);
  while (out.length > 0 && out[out.length - 1] === 0) out.pop();
  return out;
}

function replacer(this: unknown, _k: string, v: unknown): unknown {
  if (v instanceof Map) return { $m: [...v.entries()] };
  if (!v || typeof v !== "object" || Array.isArray(v)) return v;
  const o = v as Record<string, unknown>;
  if (hasKeys(o, RATING_KEYS.length, ["speed", "snapping"])) return { $r: pack(o, RATING_KEYS) };
  if (hasKeys(o, PLAYER_STAT_KEYS.length, ["passAtt", "penaltyYds", "puntRetTd"])) {
    // Most players fill a handful of columns: list just those when that's shorter.
    const dense = pack(o, PLAYER_STAT_KEYS);
    const pairs: number[] = [];
    PLAYER_STAT_KEYS.forEach((k, i) => o[k] !== 0 && pairs.push(i, o[k] as number));
    return pairs.length < dense.length ? { $q: pairs } : { $p: dense };
  }
  if (hasKeys(o, TEAM_STAT_KEYS.length, TEAM_STAT_KEYS.slice(0, 3))) return { $t: pack(o, TEAM_STAT_KEYS) };
  if (hasKeys(o, YEAR_KEYS.length, YEAR_KEYS)) return { $y: YEAR_KEYS.map((k) => o[k]) };
  return v;
}

function reviver(_k: string, v: unknown): unknown {
  if (!v || typeof v !== "object" || Array.isArray(v)) return v;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== 1) return v;
  const tag = keys[0]!;
  const data = o[tag];
  if (!Array.isArray(data)) return v;
  // Version 2 saves tagged Maps as __map.
  if (tag === "$m" || tag === "__map") return new Map(data as [unknown, unknown][]);
  if (tag === "$q") {
    const line = Object.fromEntries(PLAYER_STAT_KEYS.map((k) => [k, 0])) as Record<string, number>;
    for (let i = 0; i < data.length; i += 2) line[PLAYER_STAT_KEYS[data[i] as number]!] = data[i + 1] as number;
    return line;
  }
  const order = (TAGS as Record<string, readonly string[] | null>)[tag];
  if (!order) return v;
  return Object.fromEntries(order.map((k, i) => [k, i < data.length ? data[i] : 0]));
}

/** A save as compact JSON text. */
export function toSaveJson(value: unknown): string {
  return JSON.stringify(value, replacer);
}

/** Read save text written by toSaveJson (or the older Map-tagged JSON). */
export function fromSaveJson<T>(text: string): T {
  return JSON.parse(text, reviver) as T;
}
