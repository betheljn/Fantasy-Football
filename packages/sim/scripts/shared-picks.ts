// Milestone 27 step 1: the shared board in a league of friends, one friend's view, a slate and the show.
import { allTeams, createSeasonStats, gameLines, memberBoard, memberSlate, radioShow, radioCast, seasonSchedule, sharedBoardGames, startDynasty, teamName, propLabel, SLATE_RULES } from "../src/index.ts";

const d = startDynasty("shared-demo", 2);
const schedule = seasonSchedule(d);
const week = 1;
const meeting = schedule.games.find((g) => g.week === week)!;
const third = allTeams(d.league).map((t) => t.abbr).find((t) => t !== meeting.home && t !== meeting.away)!;
const friends = new Set([meeting.home, meeting.away, third]);
const name = (abbr: string) => teamName(d.league.teams[abbr]!);
console.log(`Friends: ${[...friends].map(name).join(", ")}\n`);
const games = sharedBoardGames(d.league, schedule, week, friends);
const lines = games.map((g) => gameLines(d.league, g, 40));
console.log("Shared board (worked out once by the league):");
for (const l of lines) console.log(`  ${l.game.away} at ${l.game.home}${[...friends].some((f) => l.game.home === f || l.game.away === f) ? "  (a friend's game)" : ""}: ${l.props.length} props`);
const me = meeting.home;
const view = memberBoard(lines, me, friends);
console.log(`\n${name(me)}'s board: ${view.length} games`);
const own = view.find((l) => l.game.id === meeting.id)!;
console.log(`  own game, own players only: ${own.props.map((p) => propLabel(p, own.game.home, own.game.away)).join("; ")}`);
const featured = view.filter((l) => l !== own);
const pick1 = featured[0]!.props.find((p) => p.kind === "total")!;
const pick2 = own.props[0]!;
const ok = memberSlate(view, [{ prop: pick1.id, side: "over" }, { prop: pick2.id, side: "over" }], 100, SLATE_RULES.startingBalance, me);
console.log(`\nSlate (total over + own player over, 100 pts): ${ok.problems.length ? ok.problems.join(" ") : "OK"}`);
const theirs = lines.find((l) => l.game.home === third || l.game.away === third)!.props[0]!;
const bad = memberSlate(view, [{ prop: pick1.id, side: "over" }, { prop: theirs.id, side: "over" }], 100, SLATE_RULES.startingBalance, me);
console.log(`Slate with a pick on another friend's game: ${bad.problems.join(" ")}`);
const show = radioShow({ leagueSeed: d.league.seed, season: d.league.season, week, board: lines, stats: createSeasonStats(), stories: [], lastWeek: [], records: { numbers: { won: 0, lost: 0 }, hottake: { won: 0, lost: 0 }, veteran: { won: 0, lost: 0 } }, friends });
const cast = radioCast(d.league.seed);
console.log(`\n${cast.show}: ${show.picks.length} host picks, none on a friend's game:`);
for (const p of show.picks) { const g = games.find((x) => x.id === p.prop.game)!; console.log(`  ${p.host}: ${g.away} at ${g.home} — ${p.side} ${p.prop.line}`); }
