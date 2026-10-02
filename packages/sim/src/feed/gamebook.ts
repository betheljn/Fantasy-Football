// Console text for a finished game: full play-by-play and a box score.
// Pure formatting over GameResult + BoxScore; no simulation here.
import { displayName, type PlayerId } from "../model/player.ts";
import { teamName, type Team } from "../model/team.ts";
import type { GameResult } from "../game/game.ts";
import { pointsForEvent } from "../play/scoring.ts";
import type { BoxScore, PlayerStats } from "../stats/boxscore.ts";
import { describeGamePlay,
  describePlay, formatClock, formatDownDistance, formatSpot, type PlayerLookup } from "./describe.ts";

const PERIOD_NAMES = ["1ST QUARTER", "2ND QUARTER", "3RD QUARTER", "4TH QUARTER"];

export function periodLabel(q: number): string {
  return q <= 4 ? String(q) : q === 5 ? "OT" : `OT${q - 4}`;
}

function scoreLine(score: Record<string, number>, away: string, home: string): string {
  return `${away} ${score[away]}, ${home} ${score[home]}`;
}

export function formatPlayByPlay(game: GameResult, who: PlayerLookup): string {
  const out: string[] = [];
  const driveAt = new Map(game.drives.map((d) => [d.plays.from, d]));
  let quarter = 0;

  for (const [i, p] of game.plays.entries()) {
    if (p.quarter !== quarter) {
      quarter = p.quarter;
      const name = PERIOD_NAMES[quarter - 1] ?? (quarter === 5 ? "OVERTIME" : `OVERTIME ${quarter - 4}`);
      out.push("", `=== ${name} ${"=".repeat(Math.max(0, 60 - name.length))}`);
    }
    const drive = driveAt.get(i);
    if (drive) {
      out.push(
        "",
        `--- ${drive.offense} ball at ${formatSpot(drive.start.yardline, drive.offense, drive.defense)}, ` +
          `${formatClock(drive.start.clock)} ---`,
      );
    }

    const e = p.event;
    const clock = formatClock(e.start.clock).padStart(5);
    const pre =
      e.kind === "run" || e.kind === "pass" || e.kind === "kneel" || e.kind === "spike" || e.kind === "punt" || e.kind === "field_goal" || e.kind === "penalty"
        ? `${clock} ${formatDownDistance(e.start, e.offense, e.defense)}`
        : e.kind === "conversion"
          ? ""
          : clock;
    out.push(`  ${pre.padEnd(25)} ${describeGamePlay(p, who)}`);
    if (Object.keys(pointsForEvent(e)).length > 0) {
      out.push(`  ${"".padEnd(25)} >> ${scoreLine(p.score, game.away, game.home)}`);
    }

    // Drive summary after its last play.
    const ending = game.drives.find((d) => d.plays.to === i + 1);
    if (ending) {
      out.push(
        `  ${"".padEnd(25)} (${ending.scrimmagePlays} plays, ${ending.yards} yards, ${formatClock(ending.seconds)} — ${ending.result.replace(/_/g, " ")})`,
      );
    }
  }
  return out.join("\n");
}

// --- box score -------------------------------------------------------------

type Col = [header: string, width: number, value: (s: PlayerStats) => string | number];

function table(title: string, rows: PlayerStats[], cols: Col[], who: PlayerLookup): string[] {
  if (rows.length === 0) return [];
  const nameW = 22;
  const head = title.padEnd(nameW) + cols.map(([h, w]) => h.padStart(w)).join("");
  const lines = rows.map((s) => {
    const pl = who(s.id);
    return `${displayName(pl)} ${pl.position}`.padEnd(nameW) + cols.map(([, w, f]) => String(f(s)).padStart(w)).join("");
  });
  return [head, ...lines];
}

const avg = (n: number, d: number) => (d === 0 ? "0.0" : (n / d).toFixed(1));

export function formatBoxScore(game: GameResult, box: BoxScore, home: Team, away: Team, who: PlayerLookup): string {
  const out: string[] = [];
  const order = [away, home];

  // Line score
  const periods = game.periodScores[home.abbr]!.length;
  const header = "".padEnd(24) + Array.from({ length: periods }, (_, i) => periodLabel(i + 1).padStart(4)).join("") + "     T";
  out.push(`FINAL${game.overtime ? " (OT)" : ""}`, header);
  for (const t of order) {
    out.push(
      teamName(t).padEnd(24) +
        game.periodScores[t.abbr]!.map((x) => String(x).padStart(4)).join("") +
        String(game.score[t.abbr]).padStart(6),
    );
  }

  // Team stats
  const [a, h] = order.map((t) => box.teams[t.abbr]!) as [BoxScore["teams"][string], BoxScore["teams"][string]];
  const row = (label: string, f: (t: typeof a) => string | number) =>
    `  ${label.padEnd(26)}${String(f(a)).padStart(12)}${String(f(h)).padStart(12)}`;
  out.push(
    "",
    `TEAM STATS${"".padEnd(18)}${away.abbr.padStart(12)}${home.abbr.padStart(12)}`,
    row("First downs (by penalty)", (t) => `${t.firstDowns} (${t.firstDownsByPenalty})`),
    row("Total plays", (t) => t.plays),
    row("Total yards", (t) => t.totalYards),
    row("Yards per play", (t) => avg(t.totalYards, t.plays)),
    row("Rushing (att-yds)", (t) => `${t.rushAtt}-${t.rushYds}`),
    row("Passing (cmp-att-yds)", (t) => `${t.passCmp}-${t.passAtt}-${t.passYdsNet}`),
    row("Sacked (num-yds)", (t) => `${t.sacked}-${t.sackYdsLost}`),
    row("Turnovers (int-fum lost)", (t) => `${t.turnovers} (${t.passInt}-${t.fumblesLost})`),
    row("3rd down", (t) => `${t.thirdDownConv}-${t.thirdDownAtt}`),
    row("4th down", (t) => `${t.fourthDownConv}-${t.fourthDownAtt}`),
    row("Punts (num-avg)", (t) => `${t.punts}-${avg(t.puntYds, t.punts)}`),
    row("Penalties (num-yds)", (t) => `${t.penalties}-${t.penaltyYds}`),
    row("Time of possession", (t) => formatClock(t.timeOfPossession)),
  );

  const byTeam = (abbr: string, filter: (s: PlayerStats) => boolean, sort: (s: PlayerStats) => number) =>
    Object.values(box.players)
      .filter((s) => s.team === abbr && filter(s))
      .sort((x, y) => sort(y) - sort(x));

  for (const t of order) {
    const abbr = t.abbr;
    out.push("", `${teamName(t).toUpperCase()} (${abbr})`, "");
    const sections: string[][] = [
      table("Passing", byTeam(abbr, (s) => s.passAtt + s.sacked > 0, (s) => s.passAtt), [
        ["C/ATT", 8, (s) => `${s.passCmp}/${s.passAtt}`],
        ["YDS", 6, (s) => s.passYds],
        ["AVG", 6, (s) => avg(s.passYds, s.passAtt)],
        ["TD", 4, (s) => s.passTd],
        ["INT", 5, (s) => s.passInt],
        ["SACK", 7, (s) => `${s.sacked}-${s.sackYdsLost}`],
        ["LONG", 6, (s) => s.passLong],
      ], who),
      table("Rushing", byTeam(abbr, (s) => s.rushAtt > 0, (s) => s.rushYds), [
        ["CAR", 5, (s) => s.rushAtt],
        ["YDS", 6, (s) => s.rushYds],
        ["AVG", 6, (s) => avg(s.rushYds, s.rushAtt)],
        ["TD", 4, (s) => s.rushTd],
        ["LONG", 6, (s) => s.rushLong],
      ], who),
      table("Receiving", byTeam(abbr, (s) => s.targets > 0, (s) => s.recYds), [
        ["REC", 5, (s) => s.rec],
        ["TGT", 5, (s) => s.targets],
        ["YDS", 6, (s) => s.recYds],
        ["AVG", 6, (s) => avg(s.recYds, s.rec)],
        ["TD", 4, (s) => s.recTd],
        ["LONG", 6, (s) => s.recLong],
      ], who),
      table(
        "Defense",
        byTeam(abbr, (s) => s.tackles + s.sacks + s.defInt + s.passDefended + s.forcedFumbles + s.fumbleRecoveries > 0, (s) => s.tackles * 10 + s.sacks),
        [
          ["TKL", 5, (s) => s.tackles],
          ["SACK", 6, (s) => s.sacks],
          ["INT", 5, (s) => s.defInt],
          ["PD", 4, (s) => s.passDefended],
          ["FF", 4, (s) => s.forcedFumbles],
          ["FR", 4, (s) => s.fumbleRecoveries],
          ["TD", 4, (s) => s.defTd],
        ],
        who,
      ),
      table("Kicking", byTeam(abbr, (s) => s.fgAtt + s.xpAtt > 0, (s) => s.fgAtt), [
        ["FG", 7, (s) => `${s.fgMade}/${s.fgAtt}`],
        ["LONG", 6, (s) => s.fgLong],
        ["XP", 7, (s) => `${s.xpMade}/${s.xpAtt}`],
        ["PTS", 5, (s) => s.fgMade * 3 + s.xpMade],
      ], who),
      table("Punting", byTeam(abbr, (s) => s.punts > 0, (s) => s.punts), [
        ["NO", 4, (s) => s.punts],
        ["YDS", 6, (s) => s.puntYds],
        ["AVG", 6, (s) => avg(s.puntYds, s.punts)],
        ["LONG", 6, (s) => s.puntLong],
        ["TB", 4, (s) => s.puntTouchbacks],
      ], who),
      table("Returns", byTeam(abbr, (s) => s.kickRet + s.puntRet > 0, (s) => s.kickRetYds + s.puntRetYds), [
        ["KR", 4, (s) => s.kickRet],
        ["YDS", 6, (s) => s.kickRetYds],
        ["TD", 4, (s) => s.kickRetTd],
        ["PR", 5, (s) => s.puntRet],
        ["YDS", 6, (s) => s.puntRetYds],
        ["TD", 4, (s) => s.puntRetTd],
      ], who),
      table("Fumbles", byTeam(abbr, (s) => s.fumbles > 0, (s) => s.fumbles), [
        ["FUM", 5, (s) => s.fumbles],
        ["LOST", 6, (s) => s.fumblesLost],
      ], who),
      table("Penalties", byTeam(abbr, (s) => s.penalties > 0, (s) => s.penaltyYds), [
        ["NO", 4, (s) => s.penalties],
        ["YDS", 6, (s) => s.penaltyYds],
      ], who),
    ];
    for (const sec of sections.filter((x) => x.length > 0)) out.push(...sec.map((l) => `  ${l}`), "");
  }
  return out.join("\n").trimEnd();
}

/** Player lookup across both rosters. */
export function lookupFor(...teams: Team[]): PlayerLookup {
  const map = new Map<PlayerId, ReturnType<PlayerLookup>>();
  for (const t of teams) for (const p of t.roster) map.set(p.id, p);
  return (id) => {
    const p = map.get(id);
    if (!p) throw new Error(`Unknown player ${id}`);
    return p;
  };
}
