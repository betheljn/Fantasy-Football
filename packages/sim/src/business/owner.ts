// Owners, owner trust, fan mood, and press conferences.
//
// Every team has an owner with a goal: win now, turn a profit, or build for
// the long run. If you're the GM for an AI owner, their trust in you rises
// and falls with how each season measures up to that goal, and runs out if
// you keep missing it: then you're fired, and other teams come calling. If
// you own the team, there's no one to fire you, but the board and the fans
// still grade the season. Fan mood moves with winning, prices and the
// stadium, and with what you say at the podium after each week.
import { Rng } from "../rng.ts";

export type OwnerGoal = "win" | "profit" | "build";

export const OWNER_GOALS: Record<OwnerGoal, { name: string; wants: string }> = {
  win: { name: "Win now", wants: "a winner, this year: wins beyond what the roster should give, and the playoffs" },
  profit: { name: "Turn a profit", wants: "the books in the black, and a winner if it doesn't cost too much" },
  build: { name: "Build for the long run", wants: "a young, improving roster: patience now for a contender later" },
};

export interface Owner {
  name: string;
  goal: OwnerGoal;
  /** How long they'll put up with missing the goal (1 impatient, 3 patient). */
  patience: 1 | 2 | 3;
  bio: string;
}

const FIRST = ["Harlan", "Celeste", "Bernard", "Odessa", "Whitaker", "Lorraine", "Augustus", "Priya", "Thaddeus", "Ingrid", "Conrad", "Marguerite"];
const LAST = ["Vandermeer", "Ashcombe", "Delacorte", "Rutherford", "Kingsley", "Montague", "Halvorsen", "Pemberton", "Castellane", "Whitmore"];
const MONEY = ["shipping", "a grocery chain", "regional banking", "oil and gas", "software", "real estate", "a family hardware empire", "television stations"];

/** The team's owner (the same for the whole dynasty). */
export function teamOwner(leagueSeed: string, abbr: string): Owner {
  const rng = new Rng(`${leagueSeed}:owner:${abbr}`);
  const goal = rng.pick<OwnerGoal>(["win", "win", "profit", "build"]);
  const patience = rng.pick<1 | 2 | 3>([1, 2, 2, 3]);
  return { name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`, goal, patience, bio: `Made a fortune in ${rng.pick(MONEY)}. ${["Impatient.", "Expects results.", "Willing to wait, within reason."][patience - 1]}` };
}

/** Where your job stands. Trust and mood run 0-100. */
export interface FrontOfficeState {
  /** Owner and GM (nobody can fire you), or GM for the AI owner. */
  role: "owner" | "gm";
  /** The owner's trust in you (GM only). */
  trust: number;
  /** How the fans feel about the team. */
  fanMood: number;
  /** Each season's review. */
  reviews: SeasonReview[];
  /** Press conferences answered this season: week -> the answer's index. */
  press: Record<number, number>;
}

export const startFrontOffice = (role: "owner" | "gm"): FrontOfficeState => ({ role, trust: 60, fanMood: 55, reviews: [], press: {} });

/** Below this, a GM is fired. */
export const FIRED_BELOW = 20;

export interface SeasonContext {
  season: number;
  /** Your team that season. */
  team?: string;
  wins: number;
  losses: number;
  ties: number;
  /** Wins the roster should have managed (from its strength). */
  expectedWins: number;
  playoffs: boolean;
  champion: boolean;
  /** The season's profit ($K), if the books are known. */
  profit: number | null;
  /** Team strength (overall) at the start and end of the season, and starters' average age. */
  ratingBefore: number;
  ratingAfter: number;
  starterAge: number;
}

export interface SeasonReview {
  season: number;
  /** The team it was with. */
  team?: string;
  /** A-F. */
  grade: string;
  trustChange: number;
  fanChange: number;
  /** What the owner (or the board) said. */
  verdict: string;
  /** The GM lost the job. */
  fired: boolean;
}

const GRADES = ["F", "D", "C", "B", "A"];

/** How a season measured up to the owner's goal (-2 awful .. +2 great). */
function score(owner: Owner, c: SeasonContext): number {
  const overWins = (c.wins + 0.5 * c.ties - c.expectedWins) / 3;
  const october = c.champion ? 2 : c.playoffs ? 0.8 : -0.3;
  const money = c.profit === null ? 0 : Math.max(-1.5, Math.min(1.5, c.profit / 25_000));
  const growth = (c.ratingAfter - c.ratingBefore) / 1.5 + (27.5 - c.starterAge) / 2;
  const raw = owner.goal === "win" ? overWins + october : owner.goal === "profit" ? money + 0.5 * overWins + 0.3 * october : growth + 0.4 * overWins + 0.3 * october;
  return Math.max(-2, Math.min(2, raw));
}

/** The end-of-season review: the grade, trust and fan mood, and (for a GM) whether the job survives. */
export function seasonReview(owner: Owner, fo: FrontOfficeState, c: SeasonContext, leagueSeed: string): SeasonReview {
  const s = score(owner, c);
  const grade = GRADES[Math.max(0, Math.min(4, Math.round(s + 2)))]!;
  // Patient owners forgive a bad year more easily.
  const trustChange = Math.round(s >= 0 ? s * 12 : (s * 18) / owner.patience);
  const pct = (c.wins + 0.5 * c.ties) / Math.max(1, c.wins + c.losses + c.ties);
  const fanChange = Math.round((pct - 0.5) * 30 + (c.playoffs ? 6 : 0) + (c.champion ? 12 : 0));
  const trust = fo.trust + trustChange;
  const fired = fo.role === "gm" && trust < FIRED_BELOW;
  const rng = new Rng(`${leagueSeed}:review:${c.season}`);
  const who = fo.role === "owner" ? "The board" : owner.name.split(" ")[0]!;
  const verdict = fired
    ? rng.pick([`${who} has seen enough. "We're going in a different direction."`, `${who} calls you upstairs. It's a short meeting.`])
    : grade === "A"
      ? rng.pick([`${who} is thrilled: "This is exactly what I hoped for."`, `${who} raises a glass: "More of this, please."`])
      : grade === "B"
        ? rng.pick([`${who} is pleased: "Good year. Let's build on it."`, `${who} nods: "Solid work."`])
        : grade === "C"
          ? rng.pick([`${who} is lukewarm: "We need more than this."`, `${who} shrugs: "Fine. Not good. Fine."`])
          : rng.pick([`${who} is unhappy: "This isn't what I signed up for."`, `${who} is not happy: "Fix it, or I'll find someone who will."`]);
  return { season: c.season, ...(c.team ? { team: c.team } : {}), grade, trustChange, fanChange, verdict, fired };
}

/** Apply a season's review. */
export function afterReview(fo: FrontOfficeState, r: SeasonReview): FrontOfficeState {
  return { ...fo, trust: clamp(fo.trust + r.trustChange), fanMood: clamp(fo.fanMood + r.fanChange), reviews: [...fo.reviews, r], press: {} };
}

const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

/** Teams that would hire a fired GM: the ones with the weakest rosters (owners there want a fresh start). */
export function jobOffers(weakestFirst: readonly string[], current: string, leagueSeed: string, season: number): string[] {
  const rng = new Rng(`${leagueSeed}:offers:${season}`);
  return rng.shuffle(weakestFirst.filter((t) => t !== current).slice(0, 8)).slice(0, 3);
}

// --- press conferences ---

export interface PressAnswer {
  text: string;
  fans: number;
  trust: number;
  /** How it lands, shown after you answer. */
  reaction: string;
}

export interface PressConference {
  week: number;
  question: string;
  answers: PressAnswer[];
}

export interface PressContext {
  week: number;
  won: boolean;
  tied: boolean;
  margin: number;
  opponent: string;
  /** Current streak: +n wins, -n losses. */
  streak: number;
  /** A starter hurt this week (name), a rivalry trophy won or lost (trophy name). */
  starHurt?: string;
  rivalry?: { trophy: string; won: boolean };
}

/** This week's question, picked from what just happened, and three ways to answer. */
export function pressConference(leagueSeed: string, season: number, c: PressContext): PressConference {
  const rng = new Rng(`${leagueSeed}:press:${season}:${c.week}`);
  // (Questions can open with a trophy's name, "the ...": capitalized as the start of a sentence.)
  const q = (question: string, answers: PressAnswer[]): PressConference => ({ week: c.week, question: question.charAt(0).toUpperCase() + question.slice(1), answers });
  if (c.rivalry)
    return c.rivalry.won
      ? q(`You've got ${c.rivalry.trophy} back in your building. What does it mean?`, [
          { text: "It means everything to this state.", fans: 6, trust: 1, reaction: "The fans eat it up." },
          { text: "It's one game. We move on.", fans: -1, trust: 2, reaction: "Measured. The owner likes it; the fans wanted more." },
          { text: "Tell them to come get it.", fans: 8, trust: -3, reaction: "Bulletin-board material. The fans love it; the front office winces." },
        ])
      : q(`${c.rivalry.trophy} leaves town. How do you explain that to the fans?`, [
          { text: "No excuses. We'll get it back.", fans: 3, trust: 1, reaction: "The fans respect it." },
          { text: "They made more plays. Credit to them.", fans: -2, trust: 1, reaction: "Gracious, but the fans wanted fire." },
          { text: "Some of our guys didn't show up.", fans: -1, trust: -3, reaction: "The locker room hears about it. So does the owner." },
        ]);
  if (c.starHurt)
    return q(`How do you replace ${c.starHurt}?`, [
      { text: "Next man up. We trust our depth.", fans: 1, trust: 2, reaction: "Calm and confident." },
      { text: "We're looking at every option, including trades.", fans: 3, trust: -1, reaction: "The fans like the urgency; the owner worries about the cost." },
      { text: "It's a huge loss. This is tough.", fans: -3, trust: 0, reaction: "Honest, but it rattles the fan base." },
    ]);
  if (c.streak <= -3)
    return q(`That's ${-c.streak} straight losses. Is your job safe?`, [
      { text: "That's not my call. I'm focused on the next game.", fans: 0, trust: 2, reaction: "Steady. The owner appreciates it." },
      { text: "I take full responsibility.", fans: 3, trust: 1, reaction: "The fans respect the accountability." },
      { text: "We've had some bad luck.", fans: -4, trust: -2, reaction: "Nobody wants to hear about luck." },
    ]);
  if (c.won && c.margin >= 21)
    return q(`A ${c.margin}-point win over ${c.opponent}. Is this team a contender?`, rng.shuffle([
      { text: "We're the best team in this league. Period.", fans: 7, trust: -2, reaction: "Bold. The fans are fired up; the owner hopes you can back it up." },
      { text: "One week at a time. We've got work to do.", fans: 1, trust: 3, reaction: "Coach-speak, but the owner likes it." },
      { text: "Our players deserve all the credit.", fans: 3, trust: 1, reaction: "Classy." },
    ]));
  if (!c.won && !c.tied && c.margin >= 17)
    return q(`A ${c.margin}-point loss to ${c.opponent}. What happened out there?`, rng.shuffle([
      { text: "That's on me. I'll fix it.", fans: 2, trust: 2, reaction: "The buck stops with you. People notice." },
      { text: "We'll watch the film and get better.", fans: 0, trust: 1, reaction: "Fair enough." },
      { text: "Our effort wasn't good enough.", fans: -2, trust: -2, reaction: "Calling out the players doesn't sit well upstairs." },
    ]));
  return q(
    c.won ? `A win over ${c.opponent}. What's working?` : c.tied ? `A tie with ${c.opponent}. Satisfied?` : `A close loss to ${c.opponent}. What's missing?`,
    rng.shuffle([
      { text: "The guys are buying in. You can see it.", fans: 2, trust: 1, reaction: "Positive vibes." },
      { text: "We're building something here. Be patient.", fans: -1, trust: 3, reaction: "The owner likes patience. The fans, less so." },
      { text: "We expect to win every week.", fans: 3, trust: -1, reaction: "High expectations set." },
    ]),
  );
}

/** Answer a press conference: fan mood and trust move (once per week). */
export function answerPress(fo: FrontOfficeState, p: PressConference, choice: number): FrontOfficeState {
  if (fo.press[p.week] !== undefined) return fo;
  const a = p.answers[choice]!;
  return { ...fo, fanMood: clamp(fo.fanMood + a.fans), trust: fo.role === "gm" ? clamp(fo.trust + a.trust) : fo.trust, press: { ...fo.press, [p.week]: choice } };
}
