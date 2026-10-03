// Presentation-only team colors: every team gets its own designed pair (a
// primary and a trim color), fixed by its place in the league, so each team
// always looks the same and no two teams share a look. The home team wears its
// primary; the road team wears white with its primary as trim, so the two
// sides never clash.
import { STATES } from "@dynasty/sim";
import type { TeamColors } from "./FieldView";

/** 50 primary / trim pairs, all fictional. */
const PALETTE: ReadonlyArray<readonly [primary: string, trim: string]> = [
  ["#B3261E", "#F2C14E"], ["#0B3D91", "#F28C28"], ["#1E7B3A", "#F5F5F5"], ["#5B2C83", "#F2C14E"], ["#C8102E", "#1C1C1C"],
  ["#00587C", "#C9D3D9"], ["#8B5A2B", "#F2E3C6"], ["#0F6E56", "#F2C14E"], ["#D14905", "#FFFFFF"], ["#2D2D2D", "#E4002B"],
  ["#003DA5", "#FFD100"], ["#7A0019", "#FFCC33"], ["#00843D", "#FFD100"], ["#4B2E83", "#B7A57A"], ["#E35205", "#0C2340"],
  ["#0C2340", "#C99700"], ["#A6192E", "#C4C4C4"], ["#006747", "#CFC493"], ["#002855", "#00B2A9"], ["#8A1538", "#0A0A0A"],
  ["#C98A0B", "#2B2B2B"], ["#5C068C", "#FFFFFF"], ["#00838F", "#0A2240"], ["#C5050C", "#002F6C"], ["#154734", "#FF8200"],
  ["#6F263D", "#A2AAAD"], ["#FF6900", "#002244"], ["#0057B8", "#C8102E"], ["#3A5DAE", "#F4B223"], ["#9E1B32", "#FFC72C"],
  ["#4F2683", "#00A398"], ["#2E5E4E", "#E6A800"], ["#9C7A3C", "#1D1D1D"], ["#E31837", "#5C5C5C"], ["#13274F", "#A9B5C0"],
  ["#00704A", "#FFFFFF"], ["#CC0033", "#FFFFFF"], ["#7D3C98", "#F1C40F"], ["#1B365D", "#FF6F20"], ["#8C1D40", "#FFC627"],
  ["#00778B", "#F0B323"], ["#582C83", "#C1C6C8"], ["#A71930", "#E3D4AD"], ["#003831", "#EFB21E"], ["#D4A017", "#0C2340"],
  ["#4A4A4A", "#69BE28"], ["#00338D", "#F5F5F5"], ["#B04A5A", "#2B2B2B"], ["#2C7A7B", "#F6E05E"], ["#6B4226", "#F2A541"],
];

const ORDER = new Map([...STATES].map(([, abbr]) => abbr).sort().map((abbr, i) => [abbr, i]));

function hue(abbr: string): number {
  let h = 0;
  for (const ch of abbr) h = (h * 31 + ch.charCodeAt(0)) % PALETTE.length;
  return h;
}

export interface TeamPalette {
  primary: string;
  trim: string;
  /** Text that reads on the primary, and on the trim. */
  onPrimary: string;
  onTrim: string;
}

/** A team's primary and trim colors, and the text colors that read on them. */
export function teamColors(abbr: string): TeamPalette {
  const [primary, trim] = PALETTE[ORDER.get(abbr) ?? hue(abbr)]!;
  return { primary, trim, onPrimary: readableOn(primary), onTrim: readableOn(trim) };
}

/** Free agents and anyone without a team. */
export const NEUTRAL_COLORS: TeamPalette = { primary: "#3A4148", trim: "#C9D3D9", onPrimary: "#FFFFFF", onTrim: "#111111" };

/** Near-black on light colors, white on dark ones. */
export function readableOn(hex: string): string {
  return luminance(hex) > 0.4 ? "#111111" : "#FFFFFF";
}

export function teamColor(abbr: string): string {
  return teamColors(abbr).primary;
}

export function uniform(abbr: string, home: boolean): TeamColors {
  const { primary, trim } = teamColors(abbr);
  return home ? { fill: primary, ring: trim } : { fill: "#ffffff", ring: primary };
}

/** Relative luminance (0 dark - 1 light) of a #RRGGBB color. */
function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
