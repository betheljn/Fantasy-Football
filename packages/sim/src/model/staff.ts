// Team staff: head coach, coordinators, general manager, scouting director.
// Ratings are 0-99 (50 = an average hire); tendencies are 0-99 dials.

export type StaffRole = "HC" | "OC" | "DC" | "GM" | "SCOUT";

export const STAFF_ROLE_NAMES: Record<StaffRole, string> = {
  HC: "Head Coach",
  OC: "Offensive Coordinator",
  DC: "Defensive Coordinator",
  GM: "General Manager",
  SCOUT: "Scouting Director",
};

export type OffensiveScheme = "West Coast" | "Air Raid" | "Power Run" | "Spread Option" | "Pro Style";
export type DefensiveScheme = "Blitz Heavy" | "Man Press" | "Two-High Zone" | "Cover 3 Zone" | "Multiple";
export type GmPhilosophy = "Best Available" | "Build Through Need" | "Youth Movement" | "Win Now";

export const OFFENSIVE_SCHEMES: readonly OffensiveScheme[] = ["West Coast", "Air Raid", "Power Run", "Spread Option", "Pro Style"];
export const DEFENSIVE_SCHEMES: readonly DefensiveScheme[] = ["Blitz Heavy", "Man Press", "Two-High Zone", "Cover 3 Zone", "Multiple"];
export const GM_PHILOSOPHIES: readonly GmPhilosophy[] = ["Best Available", "Build Through Need", "Youth Movement", "Win Now"];

export const SCHEME_DESCRIPTIONS: Record<OffensiveScheme | DefensiveScheme | GmPhilosophy, string> = {
  "West Coast": "short, timing-based passing to set up everything else",
  "Air Raid": "spread the field and throw, often at tempo",
  "Power Run": "heavy personnel, under center, run the ball",
  "Spread Option": "spread formations with a running quarterback",
  "Pro Style": "balanced, multiple personnel groups",
  "Blitz Heavy": "send extra rushers, trust man coverage behind it",
  "Man Press": "press corners in man coverage",
  "Two-High Zone": "two deep safeties, take away the big play",
  "Cover 3 Zone": "single-high zone, rally to the ball",
  Multiple: "no fixed identity; a bit of everything",
  "Best Available": "take the best player on the board",
  "Build Through Need": "fill holes in the lineup",
  "Youth Movement": "favor young players with upside",
  "Win Now": "favor proven veterans",
};

interface StaffBase {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly age: number;
  /** Seasons in this role anywhere. */
  readonly experience: number;
  /** Seasons with the current team. */
  readonly tenure: number;
  /** Current deal (absent when unemployed or outside the budget system). */
  readonly contract?: StaffContract;
}

/** A staff deal: a flat yearly salary ($K) from `signed` through `through`. */
export interface StaffContract {
  readonly signed: number;
  readonly through: number;
  readonly salary: number;
}

export interface HeadCoach extends StaffBase {
  readonly role: "HC";
  /** Clock, timeouts, situational decisions. */
  readonly gameManagement: number;
  /** Fewer penalties. */
  readonly discipline: number;
  /** Players improve faster. */
  readonly development: number;
  /** Tendency: 4th downs and two-point tries (50 = conventional). */
  readonly aggressiveness: number;
}

export interface OffensiveCoordinator extends StaffBase {
  readonly role: "OC";
  readonly scheme: OffensiveScheme;
  /** Calling the right play at the right time. */
  readonly playCalling: number;
  readonly passingGame: number;
  readonly runningGame: number;
  /** Tendency: how often the offense goes up-tempo (50 = only when needed). */
  readonly tempo: number;
}

export interface DefensiveCoordinator extends StaffBase {
  readonly role: "DC";
  readonly scheme: DefensiveScheme;
  readonly playCalling: number;
  readonly passDefense: number;
  readonly runDefense: number;
}

export interface GeneralManager extends StaffBase {
  readonly role: "GM";
  readonly philosophy: GmPhilosophy;
  /** How accurately he judges players (drafting, cuts). */
  readonly talentEvaluation: number;
}

export interface ScoutingDirector extends StaffBase {
  readonly role: "SCOUT";
  /** How much the scouting department learns per point spent. */
  readonly scouting: number;
}

export type StaffMember = HeadCoach | OffensiveCoordinator | DefensiveCoordinator | GeneralManager | ScoutingDirector;

export interface TeamStaff {
  hc: HeadCoach;
  oc: OffensiveCoordinator;
  dc: DefensiveCoordinator;
  gm: GeneralManager;
  scout: ScoutingDirector;
}

/** The single rating that best sums up a staff member (for display and hiring). */
export function staffOverall(m: StaffMember): number {
  switch (m.role) {
    case "HC":
      return Math.round((m.gameManagement + m.discipline + m.development) / 3);
    case "OC":
      return Math.round(m.playCalling * 0.4 + m.passingGame * 0.3 + m.runningGame * 0.3);
    case "DC":
      return Math.round(m.playCalling * 0.4 + m.passDefense * 0.3 + m.runDefense * 0.3);
    case "GM":
      return m.talentEvaluation;
    case "SCOUT":
      return m.scouting;
  }
}
