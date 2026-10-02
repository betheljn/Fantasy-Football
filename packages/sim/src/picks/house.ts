// The house: the bookmaker you play your slates against. Every league has its
// own (a fictional character with a name, a nickname and a style), who opens
// each week's board, sizes up your slate, and has something to say when it
// settles. Every line is picked by seed, so it's the same every time.
import { Rng } from "../rng.ts";
import type { GameLines, Prop } from "./lines.ts";
import { PROP_STAT_NAMES } from "./lines.ts";
import { slatePayout, type SettledPick, type SettledSlate, type Slate } from "./slates.ts";

export type HouseStyle = "smooth" | "oldschool" | "numbers";

export interface Bookmaker {
  name: string;
  nickname: string;
  style: HouseStyle;
  /** One line on who they are. */
  bio: string;
}

const FIRST = ["Vinnie", "Dolores", "Marty", "Rhonda", "Gus", "Bea", "Lenny", "Opal", "Sully", "Mae"];
const LAST = ["Marchetti", "Ostrowski", "Delacroix", "Pembroke", "Calloway", "Vantongeren", "Kowalczyk", "Beaumont"];
const NICKNAMES: Record<HouseStyle, string[]> = {
  smooth: ["Silk", "The Velvet Hammer", "Smooth"],
  oldschool: ["Old Ledger", "The Bookie", "Two-Pencil"],
  numbers: ["The Professor", "Decimal", "The Spreadsheet"],
};
const BIOS: Record<HouseStyle, string> = {
  smooth: "Never raises a voice. Never loses sleep. Rarely loses.",
  oldschool: "Has run the board out of the same back room since the league's first season.",
  numbers: "Runs every line through the models twice and still thinks you're the variance.",
};

/** The league's bookmaker (the same for the whole dynasty). */
export function bookmaker(leagueSeed: string): Bookmaker {
  const rng = new Rng(`${leagueSeed}:house`);
  const style = rng.pick<HouseStyle>(["smooth", "oldschool", "numbers"]);
  return { name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`, nickname: rng.pick(NICKNAMES[style]), style, bio: BIOS[style] };
}

type Lines = Record<HouseStyle, string[]>;

const GREETING: Lines = {
  smooth: ["Week {week}. Lines are fresh, the coffee's hot. The headliner: {game}.", "Evening. {game} is the one everyone's talking about. Make yourself comfortable.", "The board's open. {game} looks tight from here. Looks."],
  oldschool: ["Week {week}, board's up. {game} is the big one. Cash only. Kidding. Points only.", "Back again? {game} headlines. Same rules as always: the house was here before you.", "Board's chalked. {game}. Don't say I didn't warn you."],
  numbers: ["Week {week}: 80 simulations a game, every line dead center. Headliner: {game}.", "I've run {game} eighty times. You've watched it zero. Proceed.", "Lines are calibrated. {game} is a coin flip with extra steps."],
};
const SMALL: Lines = {
  smooth: ["Two or three legs. Sensible. I like sensible people. They come back.", "A modest slate. {payout} if it all lands. I'll keep the seat warm."],
  oldschool: ["Short ticket. Smart. Smart doesn't always win, though.", "{picks} picks for {stake}. I've seen worse. Not often."],
  numbers: ["{picks} legs: the payout's {mult}x, the fair price is higher. That gap is my salary.", "A {picks}-pick slate. Reasonable variance. Unreasonable optimism."],
};
const BIG: Lines = {
  smooth: ["{picks} legs. Bold. I'll have the points counted out for you. Mine, I mean.", "Going for {payout}? Love the ambition. Truly."],
  oldschool: ["{picks}-legger! Kid, I've framed tickets like this. Losing ones.", "Big ticket. Big dreams. Big donation to the house."],
  numbers: ["{picks} independent coin flips. Roughly a {odds} chance. I'll wait.", "A {picks}-leg parlay. My models just smiled."],
};
const WIN: Lines = {
  smooth: ["Well played. Enjoy the {payout}. I'll see you next week.", "You got me. Take your {payout}; the house remembers."],
  oldschool: ["All {picks} hit. Don't get used to it. {payout} on its way.", "Fine, fine. {payout}. Even a broken clock."],
  numbers: ["All {picks} hit. Statistically noted, emotionally ignored. {payout} paid.", "A winner. Small sample size. {payout} credited."],
};
const LOSS: Lines = {
  smooth: ["{hits} of {picks}. Close isn't a payout, friend.", "Not this week. The house thanks you for your {stake}."],
  oldschool: ["{hits} of {picks}. I'll put your {stake} with the others.", "Missed. The house always eats. Tonight it eats well."],
  numbers: ["{hits} of {picks} hit. Expected. My model had you losing; it usually does.", "Loss logged. Your {stake} has been reallocated to the house."],
};
const NEAR: Lines = {
  smooth: ["{miss} by {by}. That one stings, I imagine. For you.", "Ooh, {miss}: {by} short. So close I almost felt bad."],
  oldschool: ["{miss}, {by} short! Ha! That's the game, kid.", "Lost it on {miss} by {by}. I've seen grown men cry over less."],
  numbers: ["{miss} missed by {by}. Inside one standard deviation. Still a miss.", "{by} on {miss}. Margins matter. I keep mine."],
};

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k] ?? ""));
}

const say = (bm: Bookmaker, bank: Lines, key: string, vars: Record<string, string | number>) => fill(new Rng(key).pick(bank[bm.style]), vars);

/** "WY -4.5 over WI"-style headline for the board's biggest game. */
function headliner(board: readonly GameLines[]): string {
  const g = board.find((l) => l.props.some((p) => p.kind === "spread"));
  if (!g) return "a full slate of games";
  const spread = g.props.find((p) => p.kind === "spread")!;
  const fav = spread.line > 0 ? g.game.home : g.game.away;
  const dog = fav === g.game.home ? g.game.away : g.game.home;
  return `${fav} -${Math.abs(spread.line)} against ${dog}`;
}

/** The house opens the week's board. */
export function houseGreeting(bm: Bookmaker, leagueSeed: string, season: number, week: number, board: readonly GameLines[]): string {
  return say(bm, GREETING, `${leagueSeed}:house:${season}:${week}:hello`, { week, game: headliner(board) });
}

/** The house sizes up a slate you just placed. */
export function houseOnSlate(bm: Bookmaker, slate: Slate): string {
  const n = slate.picks.length;
  const vars = { picks: n, stake: slate.stake, payout: slatePayout(n, slate.stake), mult: slatePayout(n, 1), odds: `1-in-${2 ** n}` };
  return say(bm, n >= 5 ? BIG : SMALL, `house:slate:${slate.id}`, vars);
}

/** How far a missed pick was from the line, and what to call it. */
function missDescription(p: SettledPick): { miss: string; by: number } {
  const by = Math.round(Math.abs(p.value - p.prop.line) * 10) / 10;
  const what = (prop: Prop) => (prop.kind === "player" ? `${prop.name}'s ${PROP_STAT_NAMES[prop.stat!]}` : prop.kind === "total" ? "the total" : "the spread");
  return { miss: what(p.prop), by };
}

/** The house on a settled slate: grudging when you win, gleeful when you nearly did. */
export function houseOnResult(bm: Bookmaker, s: SettledSlate): string {
  const n = s.picks.length;
  const hits = s.picks.filter((p) => p.hit).length;
  const vars = { picks: n, hits, stake: s.stake, payout: s.payout };
  if (s.won) return say(bm, WIN, `house:win:${s.id}`, vars);
  // A near miss: the closest miss was within a few points or ten yards.
  const misses = s.picks.filter((p) => !p.hit).map(missDescription);
  const closest = misses.sort((a, b) => a.by - b.by)[0]!;
  const near = closest.by <= (closest.miss.includes("yards") ? 10 : 3);
  return near && hits === n - 1 ? say(bm, NEAR, `house:near:${s.id}`, { ...vars, ...closest }) : say(bm, LOSS, `house:loss:${s.id}`, vars);
}

/** You against the house: slates won and lost, and net points (positive = you're up). */
export function houseRecord(history: readonly SettledSlate[], season?: number): { won: number; lost: number; net: number } {
  const xs = season === undefined ? history : history.filter((s) => s.season === season);
  return {
    won: xs.filter((s) => s.won).length,
    lost: xs.filter((s) => !s.won).length,
    net: xs.reduce((n, s) => n + s.payout - s.stake, 0),
  };
}
