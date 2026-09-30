// Presentation-only team colors, derived from the team abbreviation so every
// team always looks the same. The home team wears its color; the road team
// wears white with its color as trim, so the two sides never clash.
import type { TeamColors } from "./FieldView";

function hue(abbr: string): number {
  let h = 0;
  for (const ch of abbr) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function teamColor(abbr: string): string {
  return `hsl(${hue(abbr)}, 65%, 38%)`;
}

export function uniform(abbr: string, home: boolean): TeamColors {
  const color = teamColor(abbr);
  return home ? { fill: color, ring: "#ffffff" } : { fill: "#ffffff", ring: color };
}
