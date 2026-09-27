// Formations: which 11 players are on the field for each side, how the
// defense covers, and who rushes the passer.
import type { Player, PlayerId } from "../model/player.ts";
import type { Position } from "../model/positions.ts";
import { starters, type Team } from "../model/team.ts";
import type { Rng } from "../rng.ts";
import type { FormationInfo } from "./events.ts";

/** Offensive personnel, NFL-style: first digit RBs, second TEs (WRs make up the rest of 5). */
export type Personnel = "10" | "11" | "12" | "13" | "21";
export type OffenseSet = "shotgun" | "under_center";

export const PERSONNEL: Record<Personnel, { rb: number; te: number; wr: number }> = {
  "10": { rb: 1, te: 0, wr: 4 },
  "11": { rb: 1, te: 1, wr: 3 },
  "12": { rb: 1, te: 2, wr: 2 },
  "13": { rb: 1, te: 3, wr: 1 },
  "21": { rb: 2, te: 1, wr: 2 },
};

export type DefensePackage = "base" | "nickel" | "dime" | "goal_line";

export const PACKAGES: Record<DefensePackage, { dl: number; lb: number; cb: number; s: number }> = {
  base: { dl: 4, lb: 3, cb: 2, s: 2 },
  nickel: { dl: 4, lb: 2, cb: 3, s: 2 },
  dime: { dl: 4, lb: 1, cb: 4, s: 2 },
  goal_line: { dl: 5, lb: 3, cb: 2, s: 1 },
};

export type Coverage = "cover_0" | "cover_1" | "cover_2" | "cover_3" | "cover_4";

export const COVERAGES: Record<Coverage, { man: boolean; deepSafeties: number; label: string }> = {
  cover_0: { man: true, deepSafeties: 0, label: "Cover 0" },
  cover_1: { man: true, deepSafeties: 1, label: "Cover 1" },
  cover_2: { man: false, deepSafeties: 2, label: "Cover 2" },
  cover_3: { man: false, deepSafeties: 1, label: "Cover 3" },
  cover_4: { man: false, deepSafeties: 2, label: "Cover 4" },
};

export interface OffenseFormation {
  personnel: Personnel;
  set: OffenseSet;
  qb: Player;
  /** Ball carrier first; in 21 personnel the second back is the lead blocker. */
  rbs: Player[];
  tes: Player[];
  wrs: Player[];
  ol: Player[];
}

export interface DefenseFormation {
  package: DefensePackage;
  coverage: Coverage;
  dl: Player[];
  lb: Player[];
  cb: Player[];
  s: Player[];
  /** Everyone rushing the passer on a pass play (DL plus blitzers). */
  rushers: Player[];
  blitzers: Player[];
  /** All 11 on the field. */
  all: Player[];
}

export interface Formations {
  offense: OffenseFormation;
  defense: DefenseFormation;
}

/** The eligible receivers in a formation: WRs, TEs, RBs. */
export function receivers(o: OffenseFormation): Player[] {
  return [...o.wrs, ...o.tes, ...o.rbs];
}

export function offensePlayers(o: OffenseFormation): Player[] {
  return [o.qb, ...o.rbs, ...o.tes, ...o.wrs, ...o.ol];
}

/**
 * Put the offense on the field. In one-back sets RB2 spells RB1 on some snaps
 * (`rotateRb`); in 21 personnel RB1 carries and RB2 lines up as the fullback.
 */
export function buildOffense(team: Team, personnel: Personnel, set: OffenseSet, rotateRb = false): OffenseFormation {
  const counts = PERSONNEL[personnel];
  const [rb1, rb2] = starters(team, "RB", 2);
  const rbs = counts.rb === 2 ? [rb1!, rb2 ?? rb1!] : [rotateRb && rb2 ? rb2 : rb1!];
  return {
    personnel,
    set,
    qb: starters(team, "QB")[0]!,
    rbs,
    tes: starters(team, "TE", counts.te),
    wrs: starters(team, "WR", counts.wr),
    ol: starters(team, "OL", 5),
  };
}

/** Put the defense on the field. `blitzers` must come from its LBs, Ss or CBs. */
export function buildDefense(team: Team, pkg: DefensePackage, coverage: Coverage, blitzers: Player[] = []): DefenseFormation {
  const counts = PACKAGES[pkg];
  const dl = starters(team, "DL", counts.dl);
  const lb = starters(team, "LB", counts.lb);
  const cb = starters(team, "CB", counts.cb);
  const s = starters(team, "S", counts.s);
  return { package: pkg, coverage, dl, lb, cb, s, rushers: [...dl, ...blitzers], blitzers, all: [...dl, ...lb, ...cb, ...s] };
}

/** Pick `count` blitzers, favouring LBs, then the nickel/dime DBs and safeties. */
export function pickBlitzers(rng: Rng, d: DefenseFormation, count: number): Player[] {
  const pool = [...d.lb, ...d.s.slice(d.coverage === "cover_0" ? 0 : 1), ...d.cb.slice(2)];
  const chosen: Player[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const weights = pool.map((p) => p.ratings.passRush * (p.position === "LB" ? 3 : 1));
    let roll = rng.next() * weights.reduce((a, b) => a + b, 0);
    let idx = 0;
    while (roll >= weights[idx]! && idx < pool.length - 1) roll -= weights[idx++]!;
    chosen.push(pool.splice(idx, 1)[0]!);
  }
  return chosen;
}

/** Defaults when a play is simulated without formations: 11 personnel vs base 4-3, Cover 3, four-man rush. */
export function formationsFor(ctx: { offense: Team; defense: Team; formations?: Formations }): Formations {
  return (
    ctx.formations ?? {
      offense: buildOffense(ctx.offense, "11", "shotgun"),
      defense: buildDefense(ctx.defense, "base", "cover_3"),
    }
  );
}

/** How well a defender's position suits covering a receiver's position. */
const COVER_FIT: Partial<Record<Position, Partial<Record<Position, number>>>> = {
  CB: { WR: 12, TE: 4, RB: 4 },
  S: { WR: 4, TE: 10, RB: 6 },
  LB: { WR: -10, TE: 4, RB: 10 },
};

/**
 * Who is responsible for each receiver: best cover men on the most dangerous
 * receivers, with position fit. Receivers left over when the defense sends
 * extra rushers are uncovered (`null`).
 */
export function assignCoverage(o: OffenseFormation, d: DefenseFormation): Map<PlayerId, Player | null> {
  const rushing = new Set(d.rushers.map((p) => p.id));
  const available = d.all.filter((p) => !rushing.has(p.id) && p.position !== "DL");
  // Deep safeties stay over the top instead of taking a man.
  const deep = COVERAGES[d.coverage].deepSafeties;
  const safeties = available.filter((p) => p.position === "S").sort((a, b) => b.ratings.coverage - a.ratings.coverage);
  const reserved = new Set(safeties.slice(0, Math.min(deep, Math.max(0, available.length - receivers(o).length))).map((p) => p.id));
  const pool = available.filter((p) => !reserved.has(p.id));

  const threat = (p: Player) => (p.ratings.routeRunning + p.ratings.speed + p.ratings.catching) / 3;
  const out = new Map<PlayerId, Player | null>();
  for (const r of receivers(o).sort((a, b) => threat(b) - threat(a))) {
    let best = -1;
    let bestScore = -Infinity;
    for (const [i, dfd] of pool.entries()) {
      const score = dfd.ratings.coverage + (COVER_FIT[dfd.position]?.[r.position] ?? 0);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    out.set(r.id, best >= 0 ? pool.splice(best, 1)[0]! : null);
  }
  return out;
}

/** Defenders in the box against the run: front seven plus a safety rolled down in single-high shells. */
export function boxDefenders(d: DefenseFormation): Player[] {
  const box = [...d.dl, ...d.lb];
  if (COVERAGES[d.coverage].deepSafeties <= 1 && d.s.length > 1) box.push(d.s[d.s.length - 1]!);
  if (d.coverage === "cover_0") box.push(...d.blitzers.filter((p) => !box.includes(p)));
  return box;
}

/** Blockers on a run: the line, tight ends, and a fullback in 21 personnel. */
export function runBlockers(o: OffenseFormation): Player[] {
  return [...o.ol, ...o.tes, ...o.rbs.slice(1)];
}

/** Serializable summary of the formations for a play event. */
export function formationInfo(f: Formations): FormationInfo {
  const ids = (ps: readonly Player[]) => ps.map((p) => p.id);
  return {
    offense: { personnel: f.offense.personnel, set: f.offense.set, players: ids(offensePlayers(f.offense)) },
    defense: {
      package: f.defense.package,
      coverage: f.defense.coverage,
      rushers: ids(f.defense.rushers),
      blitzers: ids(f.defense.blitzers),
      players: ids(f.defense.all),
    },
  };
}
