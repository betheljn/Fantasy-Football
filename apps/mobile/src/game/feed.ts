// Turns a finished GameResult into rows for the play-by-play list. Pure data;
// the screen only renders it.
import {
  describePlay,
  formatClock,
  formatDownDistance,
  periodLabel,
  pointsForEvent,
  type GameResult,
  type PlayerLookup,
} from "@dynasty/sim";

export type FeedRow =
  | { kind: "period"; key: string; label: string }
  | { kind: "drive"; key: string; team: string; text: string }
  | { kind: "play"; key: string; team: string; clock: string; situation: string; text: string; scoring: boolean; score: string };

const PERIOD_NAMES = ["1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter"];
const SCRIMMAGE = new Set(["run", "pass", "kneel", "spike", "punt", "field_goal", "penalty"]);

export function buildFeed(game: GameResult, who: PlayerLookup): FeedRow[] {
  const rows: FeedRow[] = [];
  const driveAt = new Map(game.drives.map((d) => [d.plays.from, d]));
  let quarter = 0;
  game.plays.forEach((p, i) => {
    if (p.quarter !== quarter) {
      quarter = p.quarter;
      rows.push({ kind: "period", key: `q${quarter}`, label: PERIOD_NAMES[quarter - 1] ?? (quarter === 5 ? "Overtime" : `Overtime ${periodLabel(quarter)}`) });
    }
    const drive = driveAt.get(i);
    if (drive) {
      rows.push({ kind: "drive", key: `d${i}`, team: drive.offense, text: `${drive.offense} drive · ${drive.scrimmagePlays} play${drive.scrimmagePlays === 1 ? "" : "s"}, ${drive.yards} yds · ${drive.result.replace(/_/g, " ")}` });
    }
    const e = p.event;
    rows.push({
      kind: "play",
      key: `p${i}`,
      team: e.offense,
      clock: formatClock(e.start.clock),
      situation: SCRIMMAGE.has(e.kind) ? formatDownDistance(e.start, e.offense, e.defense) : "",
      text: describePlay(e, who),
      scoring: Object.keys(pointsForEvent(e)).length > 0,
      score: `${game.away} ${p.score[game.away]} – ${game.home} ${p.score[game.home]}`,
    });
  });
  return rows;
}
