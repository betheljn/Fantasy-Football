// Turns a finished GameResult into rows for the play-by-play list. Pure data;
// the screen only renders it.
import {
  describeGamePlay,
  describeConditions,
  formatClock,
  formatDownDistance,
  formatSpot,
  periodLabel,
  pointsForEvent,
  revealCall,
  OFFENSE_CONCEPT_INFO,
  DEFENSE_CONCEPT_INFO,
  type GameResult,
  type PlayerLookup,
} from "@dynasty/sim";
import { teamShort } from "../field/colors";

/** Every row carries the index (into game.plays) of the play it belongs to or starts. */
export type FeedRow =
  | { kind: "period"; key: string; index: number; label: string }
  | { kind: "drive"; key: string; index: number; team: string; text: string }
  | { kind: "play"; key: string; index: number; team: string; clock: string; situation: string; text: string; scoring: boolean; score: string; big: boolean; calls?: string };

const PERIOD_NAMES = ["1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter"];
const SCRIMMAGE = new Set(["run", "pass", "kneel", "spike", "punt", "field_goal", "penalty"]);

export function buildFeed(game: GameResult, who: PlayerLookup): FeedRow[] {
  const rows: FeedRow[] = [];
  const driveAt = new Map(game.drives.map((d) => [d.plays.from, d]));
  const driveEnd = new Map(game.drives.map((d) => [d.plays.to, d]));
  let quarter = 0;
  // The conditions at kickoff, first thing in the feed.
  if (game.conditions) rows.push({ kind: "drive", key: "wx", index: 0, team: game.home, text: `Kickoff: ${describeConditions(game.conditions)}` });
  game.plays.forEach((p, i) => {
    if (p.quarter !== quarter) {
      quarter = p.quarter;
      rows.push({ kind: "period", key: `q${quarter}`, index: i, label: PERIOD_NAMES[quarter - 1] ?? (quarter === 5 ? "Overtime" : `Overtime ${periodLabel(quarter)}`) });
    }
    const drive = driveAt.get(i);
    if (drive) {
      rows.push({ kind: "drive", key: `d${i}`, index: i, team: drive.offense, text: `${drive.offense} ball at ${formatSpot(drive.start.yardline, drive.offense, drive.defense)}` });
    }
    const e = p.event;
    rows.push({
      kind: "play",
      key: `p${i}`,
      index: i,
      team: e.offense,
      clock: formatClock(e.start.clock),
      situation: SCRIMMAGE.has(e.kind) ? formatDownDistance(e.start, e.offense, e.defense) : "",
      text: describeGamePlay(p, who),
      scoring: Object.keys(pointsForEvent(e)).length > 0,
      score: `${teamShort(game.away)} ${p.score[game.away]} – ${teamShort(game.home)} ${p.score[game.home]}`,
      big: isBigPlay(p.event),
      ...callsLine(e),
    });
    // The drive's summary only after its last play, so it never gives away how a drive ends.
    const ending = driveEnd.get(i + 1);
    if (ending) {
      rows.push({
        kind: "drive",
        key: `e${i}`,
        index: i,
        team: ending.offense,
        text: `${ending.scrimmagePlays} play${ending.scrimmagePlays === 1 ? "" : "s"}, ${ending.yards} yds, ${formatClock(ending.seconds)} · ${ending.result.replace(/_/g, " ")}`,
      });
    }
  });
  return rows;
}

/** The play duel's calls on a run or pass: "Inside run vs Run blitz · defense won the call". */
function callsLine(e: GameResult["plays"][number]["event"]): { calls?: string } {
  const r = revealCall(e);
  if (!r) return {};
  const verdict = r.winner === "even" ? "even call" : `${r.winner === "offense" ? teamShort(e.offense) : teamShort(e.defense)} won the call`;
  return { calls: `${OFFENSE_CONCEPT_INFO[r.offense].label} vs ${DEFENSE_CONCEPT_INFO[r.defense].label} · ${verdict}` };
}

/** A play worth seeing again: points, a turnover, a sack, or 20+ yards. */
export function isBigPlay(e: GameResult["plays"][number]["event"]): boolean {
  if (Object.keys(pointsForEvent(e)).length > 0) return true;
  if (e.kind === "run" || e.kind === "pass") {
    if (e.turnover || e.fumble?.lost) return true;
    if (e.kind === "pass" && e.outcome === "sack") return true;
    return e.yardsGained >= 20;
  }
  return e.kind === "punt" || e.kind === "kickoff" ? !!(e as { touchdown?: boolean }).touchdown : false;
}
