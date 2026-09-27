export const POSITIONS = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S", "K", "P", "LS"] as const;

export type Position = (typeof POSITIONS)[number];

export type Unit = "offense" | "defense" | "special";

export const POSITION_UNIT: Record<Position, Unit> = {
  QB: "offense",
  RB: "offense",
  WR: "offense",
  TE: "offense",
  OL: "offense",
  DL: "defense",
  LB: "defense",
  CB: "defense",
  S: "defense",
  K: "special",
  P: "special",
  LS: "special",
};

/**
 * Starters per position in the base formations (11 personnel offense, 4-3 defense).
 * A depth chart must have at least this many players at each position.
 */
export const BASE_STARTERS: Record<Position, number> = {
  QB: 1,
  RB: 1,
  WR: 3,
  TE: 1,
  OL: 5,
  DL: 4,
  LB: 3,
  CB: 2,
  S: 2,
  K: 1,
  P: 1,
  LS: 1,
};

export function isPosition(value: string): value is Position {
  return (POSITIONS as readonly string[]).includes(value);
}
