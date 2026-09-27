import type { PlayerId } from "../model/player.ts";

/**
 * Pre-snap situation. `yardline` is yards from the offense's own goal line:
 * 0 = own end zone, 100 = opponent's end zone.
 */
export interface Situation {
  quarter: number;
  /** Seconds left in the quarter at the snap. */
  clock: number;
  down: 1 | 2 | 3 | 4;
  distance: number;
  yardline: number;
}

export type Direction = "left" | "middle" | "right";

export type PenaltyType =
  | "false_start"
  | "delay_of_game"
  | "offside"
  | "offensive_holding"
  | "defensive_holding"
  | "offensive_pass_interference"
  | "defensive_pass_interference"
  | "roughing_the_passer"
  | "face_mask"
  | "unnecessary_roughness";

/** Ball position and down after a penalty is enforced. */
export interface PenaltyResult {
  yardline: number;
  down: 1 | 2 | 3 | 4;
  distance: number;
  firstDown: boolean;
}

export interface Penalty {
  type: PenaltyType;
  /** Team that committed the foul. */
  team: string;
  /** Player flagged (null for team fouls like delay of game). */
  player: PlayerId | null;
  accepted: boolean;
  /** Yards actually walked off (after half-the-distance); 0 if declined. */
  yards: number;
  /**
   * The play's result stands and the penalty is added after it (personal fouls after
   * the play). Otherwise an accepted penalty wipes out the play ("no play").
   */
  playStands: boolean;
  /** Where the ball ends up if accepted; null if declined. */
  result: PenaltyResult | null;
}

export type StopReason = "incomplete" | "out_of_bounds" | "touchdown" | "turnover" | "safety";

export interface Fumble {
  by: PlayerId;
  forcedBy: PlayerId | null;
  recoveredBy: PlayerId;
  lost: boolean;
}

export interface Turnover {
  type: "interception" | "fumble";
  /** Defender who ends up with the ball. */
  by: PlayerId;
  returnYards: number;
  /** Where the return ends, from the NEW offense's perspective (their own goal = 0). */
  endYardline: number;
  touchdown: boolean;
  /** Interception caught (or ended) in the end zone and downed: ball at the 20. */
  touchback: boolean;
}

interface PlayEventBase {
  offense: string;
  defense: string;
  start: Situation;
  /** Net yards for the offense from the line of scrimmage to where the play ended. */
  yardsGained: number;
  /** Ball spot after the play, offense perspective, before any change of possession. */
  endYardline: number;
  /** Live-ball seconds. Huddle/runoff time between plays is the game loop's job. */
  duration: number;
  stopReason: StopReason | null;
  firstDown: boolean;
  touchdown: boolean;
  safety: boolean;
  fumble: Fumble | null;
  turnover: Turnover | null;
  tackler: PlayerId | null;
  /** Live-ball foul on the play, if any (accepted or declined). */
  penalty: Penalty | null;
}

export interface RunPlayEvent extends PlayEventBase {
  kind: "run";
  rusher: PlayerId;
  direction: Direction;
  outOfBounds: boolean;
}

export type PassOutcome = "complete" | "incomplete" | "interception" | "sack";
export type IncompleteReason = "overthrown" | "defended" | "dropped";

export interface PassPlayEvent extends PlayEventBase {
  kind: "pass";
  passer: PlayerId;
  outcome: PassOutcome;
  /** Null on sacks. */
  target: PlayerId | null;
  /** Defender responsible for the target. */
  coverage: PlayerId | null;
  direction: Direction;
  /** Depth of the throw past the line of scrimmage (0 on sacks). */
  airYards: number;
  yardsAfterCatch: number;
  pressured: boolean;
  sackedBy: PlayerId | null;
  incompleteReason: IncompleteReason | null;
  outOfBounds: boolean;
}

/** A scrimmage play: the kinds that move the chains. */
export type ScrimmagePlayEvent = RunPlayEvent | PassPlayEvent;

interface SpecialEventBase {
  offense: string;
  defense: string;
  start: Situation;
  duration: number;
}

export interface FieldGoalEvent extends SpecialEventBase {
  kind: "field_goal";
  kicker: PlayerId;
  distance: number;
  made: boolean;
  blocked: boolean;
  /** On a miss: where the defense takes over (their perspective). */
  nextYardline: number | null;
}

export interface PuntEvent extends SpecialEventBase {
  kind: "punt";
  punter: PlayerId;
  /** 0 on a blocked punt. */
  grossYards: number;
  blocked: boolean;
  blockedBy: PlayerId | null;
  returner: PlayerId | null;
  returnYards: number;
  fairCatch: boolean;
  touchback: boolean;
  /** The returner muffed the catch (a fumble before possession). */
  muffed: boolean;
  /** A fumble by the returner after possession, on the return. */
  fumble: Fumble | null;
  /** Kicking team ends up with the ball (muff or return fumble recovery). */
  recoveredByKickingTeam: boolean;
  /** Touchdown by the receiving team (return, or blocked punt returned). */
  touchdown: boolean;
  /** Blocked punt recovered in the kicking team's own end zone. */
  safety: boolean;
  /** Coverage player who made the tackle on the return. */
  tackler: PlayerId | null;
  /** Where the team with the ball next starts, from THAT team's perspective (100 on a TD). */
  nextYardline: number;
}

export interface KneelEvent extends SpecialEventBase {
  kind: "kneel";
  qb: PlayerId;
  yardsGained: number;
}

/**
 * Kickoff or free kick. `offense` is the kicking team, `defense` the receiving
 * team (same convention as punts).
 */
export interface KickoffEvent extends SpecialEventBase {
  kind: "kickoff";
  kicker: PlayerId;
  onside: boolean;
  freeKick: boolean;
  returner: PlayerId | null;
  returnYards: number;
  touchback: boolean;
  touchdown: boolean;
  /** Fumble by the returner on the return. */
  fumble: Fumble | null;
  /** Kicking team keeps the ball: onside recovery or a lost return fumble. */
  recoveredByKickingTeam: boolean;
  tackler: PlayerId | null;
  /** Where the team with the ball starts, from that team's perspective (100 on a return TD). */
  nextYardline: number;
}

/** Pre-snap foul: no play is run. */
export interface PenaltyEvent extends SpecialEventBase {
  kind: "penalty";
  penalty: Penalty;
}

/** QB spikes the ball to stop the clock; costs a down. */
export interface SpikeEvent extends SpecialEventBase {
  kind: "spike";
  qb: PlayerId;
}

/** Not a play, but part of the event stream so the feed and replays see it. */
export interface TimeoutEvent extends SpecialEventBase {
  kind: "timeout";
  team: string;
  remaining: number;
}

/** Try after a touchdown. `team` is the scoring team (may be the defense after a return TD). */
export interface ConversionEvent extends SpecialEventBase {
  kind: "conversion";
  team: string;
  method: "kick" | "two_point";
  success: boolean;
  kicker: PlayerId | null;
  /** The underlying run/pass on a two-point try. */
  play: ScrimmagePlayEvent | null;
  /** Failed two-point try turned over and returned all the way: 2 points to the defense. */
  defensiveReturn: boolean;
}

export type PlayEvent =
  | ScrimmagePlayEvent
  | FieldGoalEvent
  | PuntEvent
  | KickoffEvent
  | KneelEvent
  | SpikeEvent
  | PenaltyEvent
  | TimeoutEvent
  | ConversionEvent;
