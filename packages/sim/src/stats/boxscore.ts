// Box score built purely from the game's event log. Plain data; formatting
// for the console lives in feed/.
import type { PlayerId } from "../model/player.ts";
import type { GameResult } from "../game/game.ts";
import type { PlayEvent } from "../play/events.ts";

export const PLAYER_STAT_KEYS = [
  // passing
  "passAtt", "passCmp", "passYds", "passTd", "passInt", "passLong", "sacked", "sackYdsLost",
  // rushing
  "rushAtt", "rushYds", "rushTd", "rushLong",
  // receiving
  "targets", "rec", "recYds", "recTd", "recLong",
  // defense
  "tackles", "sacks", "defInt", "intRetYds", "passDefended", "forcedFumbles", "fumbleRecoveries", "defTd",
  // kicking / punting
  "fgAtt", "fgMade", "fgLong", "xpAtt", "xpMade", "punts", "puntYds", "puntLong", "puntTouchbacks",
  // returns
  "kickRet", "kickRetYds", "kickRetTd", "puntRet", "puntRetYds", "puntRetTd",
  // ball security / misc
  "fumbles", "fumblesLost", "twoPtMade",
] as const;

export type PlayerStatKey = (typeof PLAYER_STAT_KEYS)[number];
export type PlayerStats = Record<PlayerStatKey, number> & { id: PlayerId; team: string };

export const TEAM_STAT_KEYS = [
  "firstDowns", "plays", "totalYards",
  "rushAtt", "rushYds",
  "passAtt", "passCmp", "passYdsGross", "passYdsNet", "sacked", "sackYdsLost", "passInt",
  "fumbles", "fumblesLost", "turnovers",
  "thirdDownAtt", "thirdDownConv", "fourthDownAtt", "fourthDownConv",
  "punts", "puntYds", "timeOfPossession",
  // scoring not visible in player lines: two-point conversions, and safeties earned by the defense
  "twoPtConv", "safeties",
] as const;

export type TeamStatKey = (typeof TEAM_STAT_KEYS)[number];
export type TeamStats = Record<TeamStatKey, number>;

export interface BoxScore {
  teams: Record<string, TeamStats>;
  /** Players who recorded at least one stat. */
  players: Record<PlayerId, PlayerStats>;
}

function emptyTeam(): TeamStats {
  return Object.fromEntries(TEAM_STAT_KEYS.map((k) => [k, 0])) as TeamStats;
}

export function buildBoxScore(game: GameResult): BoxScore {
  const teams: Record<string, TeamStats> = { [game.home]: emptyTeam(), [game.away]: emptyTeam() };
  const players: Record<PlayerId, PlayerStats> = {};

  const p = (id: PlayerId, team: string): PlayerStats => {
    players[id] ??= { id, team, ...(Object.fromEntries(PLAYER_STAT_KEYS.map((k) => [k, 0])) as Record<PlayerStatKey, number>) };
    return players[id];
  };
  const long = (s: PlayerStats, key: "passLong" | "rushLong" | "recLong" | "fgLong" | "puntLong", v: number) => {
    s[key] = Math.max(s[key], v);
  };

  for (const { event: e, clockAfter } of game.plays) {
    addEvent(e);
    // Kickoff time counts toward whoever ends up with the ball (actual clock used, which
    // can be less than the return's duration when the quarter expires).
    if (e.kind === "kickoff") {
      teams[e.recoveredByKickingTeam ? e.offense : e.defense]!.timeOfPossession += e.start.clock - clockAfter;
    }
  }
  for (const d of game.drives) teams[d.offense]!.timeOfPossession += d.seconds;
  for (const t of Object.values(teams)) {
    t.totalYards = t.rushYds + t.passYdsNet;
    t.turnovers = t.passInt + t.fumblesLost;
  }
  return { teams, players };

  function addEvent(e: PlayEvent): void {
    switch (e.kind) {
      case "run":
      case "pass":
        return addScrimmage(e);
      case "kneel": {
        const t = teams[e.offense]!;
        t.plays++;
        t.rushAtt++;
        t.rushYds += e.yardsGained;
        const qb = p(e.qb, e.offense);
        qb.rushAtt++;
        qb.rushYds += e.yardsGained;
        return;
      }
      case "spike": {
        // Scored as an incomplete pass.
        const t = teams[e.offense]!;
        t.plays++;
        t.passAtt++;
        p(e.qb, e.offense).passAtt++;
        return;
      }
      case "field_goal": {
        const k = p(e.kicker, e.offense);
        k.fgAtt++;
        if (e.made) {
          k.fgMade++;
          long(k, "fgLong", e.distance);
        }
        return;
      }
      case "conversion":
        if (e.method === "kick") {
          const k = p(e.kicker!, e.team);
          k.xpAtt++;
          if (e.success) k.xpMade++;
        } else if (e.success && e.play) {
          teams[e.team]!.twoPtConv++;
          // Two-point tries don't count toward regular stats; credit the scorer.
          const pl = e.play;
          const scorer = pl.kind === "run" ? pl.rusher : pl.target;
          if (scorer) p(scorer, e.team).twoPtMade++;
          if (pl.kind === "pass") p(pl.passer, e.team).twoPtMade++;
        }
        return;
      case "punt": {
        const t = teams[e.offense]!;
        t.punts++;
        t.puntYds += e.grossYards;
        const pu = p(e.punter, e.offense);
        pu.punts++;
        pu.puntYds += e.grossYards;
        long(pu, "puntLong", e.grossYards);
        if (e.touchback) pu.puntTouchbacks++;
        if (e.returner && !e.fairCatch) {
          const r = p(e.returner, e.defense);
          r.puntRet++;
          r.puntRetYds += e.returnYards;
          if (e.touchdown) r.puntRetTd++;
        }
        return;
      }
      case "kickoff":
        if (e.returner) {
          const r = p(e.returner, e.defense);
          r.kickRet++;
          r.kickRetYds += e.returnYards;
          if (e.touchdown) r.kickRetTd++;
        }
        return;
      case "timeout":
        return;
    }
  }

  function addScrimmage(e: Extract<PlayEvent, { kind: "run" | "pass" }>): void {
    const off = e.offense;
    const def = e.defense;
    const t = teams[off]!;
    t.plays++;
    if (e.firstDown || e.touchdown) t.firstDowns++;
    const converted = e.firstDown || e.touchdown;
    if (e.start.down === 3) {
      t.thirdDownAtt++;
      if (converted) t.thirdDownConv++;
    } else if (e.start.down === 4) {
      t.fourthDownAtt++;
      if (converted) t.fourthDownConv++;
    }

    if (e.kind === "run") {
      t.rushAtt++;
      t.rushYds += e.yardsGained;
      const r = p(e.rusher, off);
      r.rushAtt++;
      r.rushYds += e.yardsGained;
      long(r, "rushLong", e.yardsGained);
      if (e.touchdown) r.rushTd++;
    } else {
      const qb = p(e.passer, off);
      if (e.outcome === "sack") {
        t.sacked++;
        t.sackYdsLost -= e.yardsGained;
        t.passYdsNet += e.yardsGained;
        qb.sacked++;
        qb.sackYdsLost -= e.yardsGained;
        p(e.sackedBy!, def).sacks++;
      } else {
        t.passAtt++;
        qb.passAtt++;
        const rec = p(e.target!, off);
        rec.targets++;
        if (e.outcome === "complete") {
          t.passCmp++;
          t.passYdsGross += e.yardsGained;
          t.passYdsNet += e.yardsGained;
          qb.passCmp++;
          qb.passYds += e.yardsGained;
          long(qb, "passLong", e.yardsGained);
          rec.rec++;
          rec.recYds += e.yardsGained;
          long(rec, "recLong", e.yardsGained);
          if (e.touchdown) {
            qb.passTd++;
            rec.recTd++;
          }
        } else if (e.outcome === "incomplete" && e.incompleteReason === "defended" && e.coverage) {
          p(e.coverage, def).passDefended++;
        } else if (e.outcome === "interception") {
          t.passInt++;
          qb.passInt++;
          const picker = p(e.turnover!.by, def);
          picker.defInt++;
          picker.passDefended++;
          picker.intRetYds += e.turnover!.returnYards;
          if (e.turnover!.touchdown) picker.defTd++;
        }
      }
    }

    if (e.safety) teams[def]!.safeties++;
    if (e.tackler) p(e.tackler, def).tackles++;

    if (e.fumble) {
      t.fumbles++;
      const carrier = p(e.fumble.by, off);
      carrier.fumbles++;
      if (e.fumble.forcedBy) p(e.fumble.forcedBy, def).forcedFumbles++;
      if (e.fumble.lost) {
        t.fumblesLost++;
        carrier.fumblesLost++;
        const rec = p(e.fumble.recoveredBy, def);
        rec.fumbleRecoveries++;
        if (e.turnover?.touchdown) rec.defTd++;
      }
    }
  }
}
