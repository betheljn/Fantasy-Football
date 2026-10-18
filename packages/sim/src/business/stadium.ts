// The stadium's design: what it's like to play in and to watch a game in.
// A roof (open air, a retractable roof that closes against rain, snow and
// cold, or a dome), a surface (grass or turf), the stands (a classic bowl, or
// steep stands right on top of the field that hold the noise in), a video
// board, a name. Older saves' stadiums read as they were: a dome or open
// air, turf under a dome and grass outside, a classic bowl.
import type { Stadium } from "./business.ts";

export type Roof = "open" | "retractable" | "dome";
export type Surface = "grass" | "turf";
export type Stands = "classic" | "steep";

export const ROOF_NAMES: Record<Roof, string> = { open: "Open air", retractable: "Retractable roof", dome: "Dome" };
export const SURFACE_NAMES: Record<Surface, string> = { grass: "Grass", turf: "Turf" };
export const STANDS_NAMES: Record<Stands, string> = { classic: "Classic bowl", steep: "Steep stands" };

/** Video board levels (0: an old scoreboard, 3: the biggest boards in the league). */
export const VIDEO_BOARD_MAX = 3;
export const VIDEO_BOARD_NAMES = ["Old scoreboard", "Video board", "Big video boards", "Wraparound boards"] as const;

export const roofOf = (s: Stadium): Roof => s.roof ?? (s.dome ? "dome" : "open");
export const surfaceOf = (s: Stadium): Surface => s.surface ?? (roofOf(s) === "dome" ? "turf" : "grass");
export const standsOf = (s: Stadium): Stands => s.stands ?? "classic";
export const videoBoardOf = (s: Stadium): number => s.videoBoard ?? 1;

/** Does it have a roof it can close (a dome, or a retractable one)? */
export const covered = (s: Stadium) => roofOf(s) !== "open";

/** The stadium in a line ("Retractable roof · turf · steep stands · 68,000"). */
export function describeStadium(s: Stadium): string {
  return `${ROOF_NAMES[roofOf(s)]} · ${SURFACE_NAMES[surfaceOf(s)].toLowerCase()} · ${STANDS_NAMES[standsOf(s)].toLowerCase()} · ${s.capacity.toLocaleString("en-US")} seats`;
}

/** Why a name won't do, or null. */
export function stadiumNameProblem(name: string): string | null {
  const n = name.trim();
  if (n.length < 3) return "Give it a name of at least three letters";
  if (n.length > 40) return "Keep it under 40 letters";
  if (!/^[A-Za-z0-9 .'&-]+$/.test(n)) return "Letters, numbers, spaces and . ' & - only";
  return null;
}
