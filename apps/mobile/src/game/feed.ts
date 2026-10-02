// Turns a finished GameResult into rows for the play-by-play list. Pure data;
// the screen only renders it.
import {
  describeGamePlay,
  formatClock,
  formatDownDistance,
  formatSpot,
  periodLabel,
  pointsForEvent,
  type GameResult,
  type PlayerLookup,
} from "@dynasty/sim";

/** Every row carries the index (into game.plays) of the play it belongs to or starts. */
export type FeedRow =
  | { kind: "period"; key: string; index: number; label: string }
  | { kind: "drive"; key: string; index: number; team: string; text: string }
  | { kind: "play"; key: string; index: number; team: string; clock: string; situation: string; text: string; scoring: boolean; score: string };

const PERIOD_NAMES = ["1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter"];
const SCRIMMAGE = new Set(["run", "pass", "kneel", "spike", "punt", "field_goal", "penalty"]);

export function buildFeed(game: GameResult, who: PlayerLookup): FeedRow[] {
  const rows: FeedRow[] = [];
  const driveAt = new Map(game.drives.map((d) => [d.plays.from, d]));
  const driveEnd = new Map(game.drives.map((d) => [d.plays.to, d]));
  let quarter = 0;
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
      score: `${game.away} ${p.score[game.away]} – ${game.home} ${p.score[game.home]}`,
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
