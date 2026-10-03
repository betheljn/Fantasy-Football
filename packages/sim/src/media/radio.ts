// The weekly radio show: three recurring hosts with set personalities talk
// through last week's headlines, own up to (or brag about) last week's picks,
// and make this week's picks from the board. Their picks are graded like
// anyone's, and their records follow them all season.
//
// The hosts pick by personality, from what anyone can see:
//   the stats nerd: wherever a player's season average sits furthest from his line;
//   the hot-take artist: overs on the stars, and the underdog getting the most points;
//   the former player: the run game and defense (rushing overs, passing unders, the home team).
import { Rng } from "../rng.ts";
import type { PlayerId } from "../model/player.ts";
import type { SeasonStats } from "../league/seasonstats.ts";
import type { GameSummary } from "../league/standings.ts";
import type { BoxScore } from "../stats/boxscore.ts";
import { PROP_STAT_NAMES, propValue, sideLabel, type GameLines, type Prop } from "../picks/lines.ts";
import type { PickSide } from "../picks/slates.ts";
import type { Story } from "./news.ts";

export type HostRole = "numbers" | "hottake" | "veteran";
export const HOST_ROLES: readonly HostRole[] = ["numbers", "hottake", "veteran"];

export interface Host {
  role: HostRole;
  name: string;
  /** How the show introduces them. */
  tagline: string;
}

export interface RadioCast {
  show: string;
  hosts: Host[];
}

const FIRST = ["Dale", "Rosa", "Terrence", "Kit", "Marisol", "Hank", "Jo", "Desmond", "Tamsin", "Ray", "Noor", "Wendell"];
const LAST = ["Abernathy", "Quill", "Castellanos", "Booker", "Lindqvist", "Okafor", "Pruett", "Haldane", "Mbeki", "Szabo"];
const SHOWS = ["The Fourth Down", "Two-Minute Drill Radio", "The Red Zone Hour", "Sunday Huddle", "The Film Room", "Goal Line Stand"];
const POSITIONS = ["linebacker", "safety", "guard", "running back", "defensive end", "tight end"];

/** The league's radio show and its three hosts (the same for the whole dynasty). */
export function radioCast(leagueSeed: string): RadioCast {
  const rng = new Rng(`${leagueSeed}:radio`);
  const names = rng.shuffle(FIRST).slice(0, 3);
  const lasts = rng.shuffle(LAST).slice(0, 3);
  const years = rng.int(8, 14);
  const pos = rng.pick(POSITIONS);
  const hosts: Host[] = [
    { role: "numbers", name: `${names[0]} ${lasts[0]}`, tagline: "who has a spreadsheet for everything" },
    { role: "hottake", name: `${names[1]} ${lasts[1]}`, tagline: "who has never once been unsure" },
    { role: "veteran", name: `${names[2]} ${lasts[2]}`, tagline: `${years} years at ${pos} before the microphone` },
  ];
  return { show: rng.pick(SHOWS), hosts };
}

/** One pick a host makes on the air, and why. */
export interface HostPick {
  host: HostRole;
  prop: Prop;
  side: PickSide;
  reason: string;
}

export interface GradedHostPick extends HostPick {
  value: number;
  hit: boolean;
}

/** A line of the script. */
export interface ScriptLine {
  host: HostRole;
  text: string;
}

export interface RadioShow {
  season: number;
  week: number;
  title: string;
  lines: ScriptLine[];
  picks: HostPick[];
}

export type HostRecords = Record<HostRole, { won: number; lost: number }>;

export const emptyRecords = (): HostRecords => ({ numbers: { won: 0, lost: 0 }, hottake: { won: 0, lost: 0 }, veteran: { won: 0, lost: 0 } });

const PICKS_PER_HOST = 3;

/** A player's season average per game for a stat (null without games). */
function average(stats: SeasonStats, id: PlayerId | undefined, stat: Prop["stat"]): number | null {
  if (!id || !stat) return null;
  const s = stats.players.get(id);
  return s && s.games >= 3 ? s.stats[stat] / s.games : null;
}

const describe = (p: Prop, side: PickSide, home: string, away: string) =>
  p.kind === "spread" ? sideLabel(p, side, home, away) : p.kind === "total" ? `${side} ${p.line} total points` : `${p.name} ${side} ${p.line} ${PROP_STAT_NAMES[p.stat!]}`;

/** Each host's picks for the week, by personality; one pick per game per host. */
export function hostPicks(board: readonly GameLines[], stats: SeasonStats, own?: string): HostPick[] {
  // Your own game stays off the show's board, as it's off yours.
  const games = board.filter((g) => !own || (g.game.home !== own && g.game.away !== own));
  const props = games.flatMap((g) => g.props.map((p) => ({ p, g })));
  const take = (role: HostRole, ranked: Array<{ p: Prop; side: PickSide; reason: string }>): HostPick[] => {
    const used = new Set<string>();
    const out: HostPick[] = [];
    for (const r of ranked) {
      if (out.length === PICKS_PER_HOST || used.has(r.p.game)) continue;
      used.add(r.p.game);
      out.push({ host: role, prop: r.p, side: r.side, reason: r.reason });
    }
    return out;
  };

  const numbers = props
    .filter(({ p }) => p.kind === "player")
    .map(({ p }) => ({ p, avg: average(stats, p.player, p.stat) }))
    .filter((x): x is { p: Prop; avg: number } => x.avg !== null)
    .map(({ p, avg }) => ({ p, avg, edge: (avg - p.line) / Math.max(20, p.line) }))
    // Way off the line usually means his role changed (a new starter): the average won't say much.
    .filter((x) => Math.abs(x.edge) <= 0.6)
    .sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge) || a.p.id.localeCompare(b.p.id))
    .map(({ p, avg, edge }) => ({ p, side: (edge > 0 ? "over" : "under") as PickSide, reason: `averaging ${Math.round(avg)} a game against a line of ${p.line}` }));

  const spreads = props.filter(({ p }) => p.kind === "spread").sort((a, b) => Math.abs(b.p.line) - Math.abs(a.p.line));
  const stars = props
    .filter(({ p }) => p.kind === "player")
    .sort((a, b) => b.p.line - a.p.line || a.p.id.localeCompare(b.p.id));
  const hottake = [
    ...spreads.slice(0, 1).map(({ p, g }) => ({ p, side: (p.line > 0 ? "under" : "over") as PickSide, reason: `${p.line > 0 ? g.game.away : g.game.home} getting ${Math.abs(p.line)}? That's a gift` })),
    ...stars.map(({ p }, i) => ({ p, side: "over" as PickSide, reason: [`${p.name} is a star and stars show up`, `nobody is stopping ${p.name}`, `${p.name} has that look this week`][i % 3]! })),
  ];

  const veteran = props
    .map(({ p }) => {
      if (p.kind === "player" && p.stat === "rushYds") return { p, side: "over" as PickSide, reason: "", score: 3 };
      if (p.kind === "player" && p.stat === "passYds") return { p, side: "under" as PickSide, reason: "", score: 2 };
      if (p.kind === "spread") return { p, side: "over" as PickSide, reason: "never bet against a home crowd", score: 1 };
      return null;
    })
    .filter((x): x is { p: Prop; side: PickSide; reason: string; score: number } => x !== null)
    .sort((a, b) => b.score - a.score || b.p.line - a.p.line || a.p.id.localeCompare(b.p.id))
    .map((x, i) => ({
      ...x,
      reason: x.reason || (x.p.stat === "rushYds" ? ["you win in the trenches", "run the ball, win the game", "that line is going to lean on people"] : ["defense travels", "those corners will be sitting on routes", "the pass rush gets home this week"])[i % 3]!,
    }));

  return [...take("numbers", numbers), ...take("hottake", hottake), ...take("veteran", veteran)];
}

/** Grade the hosts' picks from the week's games (box scores by game id). */
export function gradeHostPicks(picks: readonly HostPick[], games: ReadonlyMap<string, { summary: GameSummary; box: BoxScore }>): GradedHostPick[] {
  return picks.flatMap((p) => {
    const g = games.get(p.prop.game);
    if (!g) return [];
    const value = propValue(p.prop, g.summary, g.box);
    const over = value > p.prop.line;
    return [{ ...p, value, hit: p.side === "over" ? over : !over }];
  });
}

/** Add graded picks to the hosts' records. */
export function addToRecords(records: HostRecords, graded: readonly GradedHostPick[]): HostRecords {
  const next = { numbers: { ...records.numbers }, hottake: { ...records.hottake }, veteran: { ...records.veteran } };
  for (const g of graded) next[g.host][g.hit ? "won" : "lost"]++;
  return next;
}

type Voice = Record<HostRole, string[]>;

const REACT: Record<Story["kind"], Voice> = {
  upset: {
    numbers: ["The model gave that about a one-in-four chance. One-in-four happens.", "Variance. Beautiful, terrible variance.", "Upsets cluster in weeks like this. It's a known thing. I'm making it a known thing.", "I'd love to see the win probability chart on that one."],
    hottake: ["I SAID this would happen. Maybe not out loud. But I said it.", "Rankings are a suggestion, people!", "Panic. Everybody panic.", "That ranked team should be ashamed. ASHAMED."],
    veteran: ["Nobody in that locker room read the rankings. That's football.", "Any given week. I've lived it from both sides.", "That's a team that showed up hungry.", "Somebody got caught looking ahead to next week."],
  },
  clash: { numbers: ["Two top-ten teams and the better per-play offense won. Love to see it."], hottake: ["That's the best team in the league and it isn't close.", "Whoever lost that game should be embarrassed. I'm embarrassed for them."], veteran: ["Games like that are won at the line of scrimmage. Every time."] },
  thriller: { numbers: ["One-score games are basically coin flips. This one landed heads."], hottake: ["My heart can't take this league.", "That's a team that knows how to WIN."], veteran: ["You learn more about a team in the last two minutes than the first fifty-eight."] },
  blowout: { numbers: ["That margin was about three standard deviations wide."], hottake: ["Somebody check on that defense. Somebody bring snacks."], veteran: ["Some weeks the other guys just want it more. That was one of them."] },
  performance: { numbers: ["Put that stat line in a frame.", "That's a top-percentile game by any measure."], hottake: ["MVP. I'm calling it. Again.", "Give that man the keys to the state."], veteran: ["Give the offensive line some credit for that one."] },
  streak: { numbers: ["Streaks regress. Eventually.", "The underlying numbers mostly back it up."], hottake: ["They are not losing again this year. Write it down.", "Rock bottom has a basement and they found it."], veteran: ["Winning is a habit. So is losing."] },
  rankings: { numbers: ["The formula giveth.", "The ranking model has spoken."], hottake: ["Finally the rankings caught up to what I've been saying for weeks."], veteran: ["Rankings in October don't play in January."] },
  injury: { numbers: ["That's a real hit to their projections.", "Next man up is about six points worse, by my numbers."], hottake: ["Season's over. I'm sorry. It is.", "That's devastating. I need a minute."], veteran: ["Tough break. I've been there. Rehab is lonely."] },
  trade: { numbers: ["On paper they won that trade. Paper's all I've got.", "Fair value, give or take a draft pick."], hottake: ["Fleeced. Absolutely fleeced. I won't say by whom."], veteran: ["New guy has to learn a playbook in a week. Don't expect miracles."] },
  mvp: { numbers: ["His per-game numbers are the best in the league. Not close.", "The award usually follows the numbers."], hottake: ["It's not a race. It's a coronation.", "I've had him as MVP since week one. Look it up."], veteran: ["Ask the guys who have to tackle him who the MVP is."] },
  recap: { numbers: [""], hottake: [""], veteran: [""] },
  rivalry: { numbers: ["Rivalry games run about four points closer than you'd expect. I checked."], hottake: ["That trophy belongs in one place and everybody knows where."], veteran: ["Throw the records out in a rivalry game. I've lived it."] },
  preview: { numbers: [""], hottake: [""], veteran: [""] },
};

const BRAG: Voice = {
  numbers: ["{won} for {total} last week. The spreadsheet does not miss.", "{won} of {total}. Process over results, but I'll take the results."],
  hottake: ["{won} for {total}! Did anyone doubt me? Rhetorical.", "{won} of {total}. You're welcome, everybody."],
  veteran: ["{won} for {total}. All those years watching film pay off.", "{won} of {total}. Trust your gut. And the running game."],
};
const CROW: Voice = {
  numbers: ["{won} for {total} last week. The sample size is small. Very small.", "{won} of {total}. I'm reviewing my inputs."],
  hottake: ["{won} for {total}. The refs. It was the refs.", "{won} of {total}. I stand by every single one of those picks."],
  veteran: ["{won} for {total}. Even the best guys drop one sometimes.", "{won} of {total}. I'll take my lumps."],
};
const PICK_INTRO: Voice = {
  numbers: ["Here's what the numbers say:", "My three, all data-driven:"],
  hottake: ["Lock these in. LOCK them:", "Three picks. Zero doubt:"],
  veteran: ["Here's how I see it, from the field:", "My three, old-school style:"],
};

const fill = (text: string, vars: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k] ?? ""));
const say = (key: string, options: readonly string[], vars: Record<string, string | number> = {}) => fill(new Rng(key).pick(options), vars);

export interface RadioShowInput {
  leagueSeed: string;
  season: number;
  /** The week being previewed (the board's week). */
  week: number;
  board: readonly GameLines[];
  stats: SeasonStats;
  /** Last week's national stories, biggest first. */
  stories: readonly Story[];
  /** Last week's graded host picks, and records through last week. */
  lastWeek: readonly GradedHostPick[];
  records: HostRecords;
  /** Your team: off the show's board, as it's off yours. */
  own?: string;
}

/** Write this week's show. */
export function radioShow(input: RadioShowInput): RadioShow {
  const cast = radioCast(input.leagueSeed);
  const host = (role: HostRole) => cast.hosts.find((h) => h.role === role)!;
  const key = (k: string) => `${input.leagueSeed}:radio:${input.season}:${input.week}:${k}`;
  const lines: ScriptLine[] = [];
  const line = (role: HostRole, text: string) => text && lines.push({ host: role, text });

  // Open.
  const [a, b, c] = cast.hosts as [Host, Host, Host];
  line("numbers", `Welcome to ${cast.show}, week ${input.week}. I'm ${a.name}, ${a.tagline}. With me as always: ${b.name}, ${b.tagline}, and ${c.name}, ${c.tagline}.`);

  // Headlines, each read by a host, with the other two reacting (nobody repeats a line in one show).
  const used = new Set<string>();
  const react = (role: HostRole, s: Story) => {
    const options = new Rng(key(`react:${s.id}:${role}`)).shuffle(REACT[s.kind][role]);
    const text = options.find((o) => !used.has(o)) ?? "";
    used.add(text);
    return text;
  };
  for (const [i, s] of input.stories.filter((x) => !x.local).slice(0, 3).entries()) {
    const reader = HOST_ROLES[i % 3]!;
    line(reader, `${i === 0 ? "Top story" : "Also"}: ${s.headline}. ${s.body}`);
    for (const role of HOST_ROLES) if (role !== reader) line(role, react(role, s));
  }

  // Last week's picks.
  if (input.lastWeek.length > 0) {
    for (const role of HOST_ROLES) {
      const mine = input.lastWeek.filter((p) => p.host === role);
      if (mine.length === 0) continue;
      const won = mine.filter((p) => p.hit).length;
      const rec = input.records[role];
      line(role, `${say(key(`result:${role}`), won * 2 >= mine.length ? BRAG[role] : CROW[role], { won, total: mine.length })} That's ${rec.won}-${rec.lost} on the season.`);
    }
  }

  // This week's picks.
  const picks = hostPicks(input.board, input.stats, input.own);
  const homeAway = new Map(input.board.map((g) => [g.game.id, g.game]));
  for (const role of HOST_ROLES) {
    const mine = picks.filter((p) => p.host === role);
    if (mine.length === 0) continue;
    const said = mine.map((p) => {
      const g = homeAway.get(p.prop.game)!;
      return `${describe(p.prop, p.side, g.home, g.away)} (${p.reason})`;
    });
    line(role, `${say(key(`intro:${role}`), PICK_INTRO[role])} ${said.join("; ")}.`);
  }

  // Close.
  line("hottake", say(key("close"), ["That's the show. Bet responsibly. With points. Which have no cash value.", "We'll be right here next week, being right.", "Go watch some football. We'll tell you what it meant."]));

  return { season: input.season, week: input.week, title: `${cast.show}: week ${input.week}`, lines, picks };
}

