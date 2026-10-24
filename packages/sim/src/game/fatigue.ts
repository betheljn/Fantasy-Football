// Fatigue through a game (rules 8). Every player starts fresh; each snap on
// the field costs energy (more for the ball carrier, less with good stamina),
// and the sideline, the quarter breaks and halftime give it back. A tired
// player plays a step slower, and the coaches rotate him out by the depth
// chart until he's rested (quarterbacks, linemen and specialists play
// through). A person can override it: keep a starter in, or rest someone.
// No randomness: the same game with the same calls tires the same way.
import type { Player, PlayerId } from "../model/player.ts";
import type { Position } from "../model/positions.ts";
import type { RatingKey } from "../model/ratings.ts";
import type { Team } from "../model/team.ts";
import type { PlayEvent } from "../play/events.ts";
import { TEMPO } from "../play/common.ts";

export const FATIGUE = {
  /** Energy a snap on the field costs an average-stamina player (out of 100). */
  drain: 2.4,
  /** Extra for the ball carrier, the target or the sacked passer. */
  carrier: 2.5,
  /** Energy back for each play spent on the sideline. */
  recover: 1.8,
  /** Energy back at a quarter break, and at halftime. */
  quarterBreak: 12,
  halftime: 40,
  /** The coaches sit a player at this energy, and play him again once he's back to `rested`. */
  tired: 60,
  rested: 82,
  /** Tired (below `slowFrom`) costs a step of speed; spent (below `spentAt`) costs more. */
  slowFrom: 70,
  spentAt: 45,
  tiredSlow: 0.04,
  spentSlow: 0.1,
} as const;

/** Positions the coaches rotate (everyone else plays through). */
const ROTATE: ReadonlySet<Position> = new Set(["RB", "WR", "TE", "DL", "LB", "CB", "S"]);
/** What tiredness takes off: the legs. */
const SLOWS: readonly RatingKey[] = ["speed", "acceleration", "agility", "jumping", "strength"];

/** A person's standing calls on their own players (until changed). */
export interface LineupOverride {
  /** Keep these in even when tired. */
  keep?: PlayerId[];
  /** Rest these whatever their energy. */
  rest?: PlayerId[];
}

/** How hard a snap is at each position (the trenches are hardest). */
export const WORKLOAD: Partial<Record<Position, number>> = { DL: 2.3, LB: 1.1, OL: 0.9, QB: 0.5, RB: 1.2 };

/** How tired: -1 fresh, 1 tired, 0 spent. */
const step = (en: number) => (en >= FATIGUE.slowFrom ? -1 : en >= FATIGUE.spentAt ? 1 : 0);

/**
 * A player's speed step, moved only once his energy is 3 clear of the step's
 * edge (so a player hovering at a line doesn't flip back and forth each play).
 */
function nextStep(current: number, en: number): number {
  const target = step(en);
  if (target === current) return current;
  const bottom = current < 0 ? FATIGUE.slowFrom : current === 1 ? FATIGUE.spentAt : 0;
  const top = current < 0 ? 101 : current === 1 ? FATIGUE.slowFrom : FATIGUE.spentAt;
  return en < bottom - 3 || en >= top + 3 ? target : current;
}

/** How fast a player tires: low stamina tires faster (0.7x to 1.4x). */
const tireRate = (p: Player) => Math.max(0.7, Math.min(1.4, 1.6 - p.ratings.stamina / 100));

export class FatigueTracker {
  // Everyone in the game, by index: energy, team, how fast they tire, and what the view depends on.
  private readonly index = new Map<PlayerId, number>();
  private readonly ids: PlayerId[] = [];
  private readonly team: string[] = [];
  private readonly rotates: boolean[] = [];
  private readonly tire: number[] = [];
  private readonly work: number[] = [];
  private readonly energy: number[] = [];
  private readonly steps: number[] = [];
  private readonly sitting: boolean[] = [];
  /** Players below full energy (the only ones a play on the sideline changes). */
  private active: number[] = [];
  private readonly isActive: boolean[] = [];
  private readonly onField: boolean[] = [];
  private readonly overrides = new Map<string, { keep: Set<PlayerId>; rest: Set<PlayerId> }>();
  /** Go up when a team's view changes: who's resting (its depth chart), and how tired (its roster). */
  private readonly versions = new Map<string, number>();
  private readonly rosterVersions = new Map<string, number>();
  private quarter = 1;
  private readonly views = new Map<string, { version: number; rosterVersion: number; base: Team; view: Team }>();
  /** Slowed copies of players, by energy step (the same copy each time, so the engine's caches keep working). */
  private readonly slowed = new Map<Player, Map<number, Player>>();

  constructor(teams: Record<string, Team>) {
    for (const [abbr, t] of Object.entries(teams)) {
      this.versions.set(abbr, 0);
      this.rosterVersions.set(abbr, 0);
      for (const p of t.roster) {
        this.index.set(p.id, this.ids.length);
        this.ids.push(p.id);
        this.team.push(abbr);
        this.rotates.push(ROTATE.has(p.position));
        this.tire.push(tireRate(p));
        this.work.push(WORKLOAD[p.position] ?? 1);
        this.energy.push(100);
        this.steps.push(-1);
        this.sitting.push(false);
        this.isActive.push(false);
        this.onField.push(false);
      }
    }
  }

  /** A player's energy, 0-100 (100 for anyone unknown). */
  energyOf(id: PlayerId): number {
    const i = this.index.get(id);
    return i === undefined ? 100 : this.energy[i]!;
  }

  /** Every player's energy on a team, rounded (for the call sheet). */
  teamEnergy(team: string): Record<PlayerId, number> {
    const out: Record<PlayerId, number> = {};
    for (let i = 0; i < this.ids.length; i++) if (this.team[i] === team) out[this.ids[i]!] = Math.round(this.energy[i]!);
    return out;
  }

  /** Is the player resting (sat by the coaches until rested, or by a person)? */
  resting(team: string, id: PlayerId): boolean {
    const o = this.overrides.get(team);
    if (o?.keep.has(id)) return false;
    if (o?.rest.has(id)) return true;
    const i = this.index.get(id);
    return i !== undefined && this.sitting[i]!;
  }

  /** A person's standing calls for their team (replacing any before). */
  override(team: string, o: LineupOverride): void {
    const mine = (ids: readonly PlayerId[] = []) => new Set(ids.filter((id) => this.team[this.index.get(id) ?? -1] === team));
    this.overrides.set(team, { keep: mine(o.keep), rest: mine(o.rest) });
    this.bump(team);
  }

  private bump(team: string) {
    this.versions.set(team, (this.versions.get(team) ?? 0) + 1);
  }

  /** The play happened: those on the field tire, everyone else rests; quarter breaks and halftime give energy back. */
  play(e: PlayEvent, quarter: number, hurry = false): void {
    let back = 0;
    if (quarter > this.quarter) {
      back = this.quarter <= 2 && quarter >= 3 ? FATIGUE.halftime : FATIGUE.quarterBreak;
      this.quarter = quarter;
    }
    const on: number[] = [];
    let carrier = -1;
    if ((e.kind === "run" || e.kind === "pass") && e.formation) {
      for (const id of e.formation.offense.players) on.push(this.index.get(id) ?? -1);
      for (const id of e.formation.defense.players) on.push(this.index.get(id) ?? -1);
      const c = e.kind === "run" ? e.rusher : e.outcome === "sack" ? e.passer : e.outcome === "complete" ? e.target : undefined;
      if (c) carrier = this.index.get(c) ?? -1;
    }
    for (const i of on) {
      if (i < 0) continue;
      this.onField[i] = true;
      if (!this.isActive[i]) {
        this.isActive[i] = true;
        this.active.push(i);
      }
    }
    const still: number[] = [];
    for (const i of this.active) {
      const en = Math.min(100, this.energy[i]! + back);
      // (No-huddle: no breathers between snaps, so everyone on the field tires faster.)
      const next = this.onField[i] ? en - (FATIGUE.drain * this.work[i]! + (i === carrier ? FATIGUE.carrier : 0)) * this.tire[i]! * (hurry ? TEMPO.hurryFatigue : 1) : en + FATIGUE.recover;
      const e2 = next < 0 ? 0 : next > 100 ? 100 : next;
      this.energy[i] = e2;
      // The coaches sit him when he's tired, and play him again once he's rested.
      let sit = this.sitting[i]!;
      if (this.rotates[i] && e2 < FATIGUE.tired) sit = true;
      else if (e2 >= FATIGUE.rested) sit = false;
      const st = nextStep(this.steps[i]!, e2);
      if (sit !== this.sitting[i]) {
        this.sitting[i] = sit;
        this.bump(this.team[i]!);
      }
      if (st !== this.steps[i]) {
        this.steps[i] = st;
        const t = this.team[i]!;
        this.rosterVersions.set(t, (this.rosterVersions.get(t) ?? 0) + 1);
      }
      if (e2 < 100) still.push(i);
      else this.isActive[i] = false;
    }
    for (const i of on) if (i >= 0) this.onField[i] = false;
    this.active = still;
  }

  /**
   * The team as it takes the field now: at each rotating position, the
   * rested players first (in depth-chart order), then the tired ones (the
   * freshest first); a tired player plays a step slower.
   */
  view(team: Team): Team {
    const version = this.versions.get(team.abbr) ?? 0;
    const rosterVersion = this.rosterVersions.get(team.abbr) ?? 0;
    const cached = this.views.get(team.abbr);
    const same = cached && cached.base === team;
    if (same && cached.version === version && cached.rosterVersion === rosterVersion) return cached.view;
    const depthChart = { ...team.depthChart };
    for (const pos of Object.keys(depthChart) as Position[]) {
      if (!ROTATE.has(pos)) continue;
      const ids = depthChart[pos];
      const fresh = ids.filter((id) => !this.resting(team.abbr, id));
      const tired = ids.filter((id) => this.resting(team.abbr, id)).sort((a, b) => this.energyOf(b) - this.energyOf(a));
      depthChart[pos] = [...fresh, ...tired];
    }
    // Who's resting changed but nobody's speed: the same roster (so lookups stay cached).
    const roster = same && cached.rosterVersion === rosterVersion ? cached.view.roster : team.roster.map((p) => {
      const i = this.index.get(p.id);
      const s = i === undefined ? -1 : this.steps[i]!;
      if (s < 0) return p;
      let copies = this.slowed.get(p);
      if (!copies) this.slowed.set(p, (copies = new Map()));
      let copy = copies.get(s);
      if (!copy) {
        const slow = 1 - (s === 1 ? FATIGUE.tiredSlow : FATIGUE.spentSlow);
        const ratings = { ...p.ratings };
        for (const k of SLOWS) ratings[k] = Math.round(ratings[k] * slow);
        copies.set(s, (copy = { ...p, ratings }));
      }
      return copy;
    });
    const view: Team = { ...team, roster, depthChart };
    this.views.set(team.abbr, { version, rosterVersion, base: team, view });
    return view;
  }
}
