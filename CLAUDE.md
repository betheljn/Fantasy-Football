# Football Dynasty Game — Project Guide

## What this is
A phone-first football management and dynasty game. Players run one program in a
league of 50 fictional teams in ten regions (each region turns out its own kind
of talent), draft and develop players, hire coaches, GMs, and scouts, and chase
championships across many seasons.
Games are simulated and shown as a 2D top-down field plus a play-by-play feed.

This is NOT a real-world fantasy football or NFL projection tool.
Never use real leagues, teams, players, or logos (no "NFL", no real team names).
Generic nicknames (Tigers, Lions, Bears) are fine on their own; never a name
that points at one real team (49ers, 76ers) or a real team's city + name.
All players and teams are generated.

## Tech stack (do not change without asking)
- Language: TypeScript everywhere
- Repo: monorepo, pnpm workspaces
  - packages/sim     -> simulation engine (the only package for now)
  - apps/mobile      -> React Native (Expo) + Skia, LATER
  - apps/server      -> Node + PostgreSQL + Prisma, LATER
- Tests: Vitest
- No external runtime dependencies in packages/sim unless asked

## Core architecture rules
1. The sim decides outcomes and outputs play data. It never draws anything.
2. Every play produces a structured event (who, what, yards, result, clock),
   so the same data can drive the text feed, the 2D renderer, and replays.
3. The sim is deterministic given a seed. Same seed + same teams = same game.
4. Player ratings drive outcomes; randomness adds variance, not chaos.

## League facts the sim must respect
- 72-man rosters; 53 dress on game day
- Positions: QB, RB, WR, TE, OL, DL, LB, CB, S, K, P, LS
- Standard football rules: 4 downs, 10 yards, 4 quarters, touchdowns,
  field goals, punts, turnovers
- 50 teams in 2 conferences of 5 divisions (5 teams each)
- Each division is a region with a talent core (three skill groups); players
  have home states, and the best at a group mostly come from its regions
- Leagues record their season format (old saves keep theirs). New leagues
  (format 2): 15 games (4 division, 6 conference, 5 non-conference) over 16
  weeks with one bye (weeks 5-12), trade deadline after week 8. Format 1 (from
  before): 20 games over 22 weeks, two byes, deadline after week 11
- Weekly rankings 1-25 from a computed formula: 100 x win pct + 2 x strength
  rating (capped scoring margin + strength of schedule); preseason prior from
  roster strength fades over the first 5 games
- Format 2 championship week: each division's top two meet (first place
  hosts); the winners are division champions with the automatic bids
- 16-team playoff: the 10 division champions (automatic bids) + the 6
  highest-ranked other teams, all seeded 1-16 by ranking (format 2: the ranking
  after championship week). Fixed bracket (1v16, 8v9, ...), higher seed hosts,
  neutral-site championship, no ties. Format 2 re-ranks after each round; the
  final poll has the champion No. 1 and the runner-up No. 2
- ~50 Madden-style attributes per player, position archetypes, hidden potential
  and development traits (Normal / Impact / Star / Elite)
- Offseason: retirements, development, 450-prospect draft class scouted by each
  team over the season, 7-round draft, roster moves back to 72
- Awards each season: MVP, Offensive/Defensive Player of the Year, Rookie of the Year
- New dynasties start from a league settled by 15 quiet offseasons, so league
  talent and ages stay steady over decades

## Milestones (build in this order, one step at a time)

### Milestone 1: single-game sim (done)
1. Data model: player (position, ratings), team (roster, depth chart)
2. Generate two random teams
3. Simulate a single run play and a single pass play
4. Simulate a full drive
5. Simulate a full game
6. Print play-by-play and a box score to the console

Follow-ups also done: home field, special-teams mishaps, penalties,
formations/coverages/blitzes, and 2D player positions (packages/sim/src/anim).

### Milestone 2: league and season (done)
1. Generate the 50-team league: conferences, divisions, team identities
2. Build a season schedule
3. Simulate a full regular season with standings and tiebreakers
4. Season stats and league leaders
5. Weekly rankings (1-25) and the playoffs to a champion

### Milestone 3: dynasty offseason (done)
1. Player development and aging (potential, age curves by position)
2. Retirements
3. Draft class generation
   3a. Detailed attributes (~50, Madden-style) for every player, used by the sim
   3b. Hidden development traits (Normal / Impact / Star / Elite), revealed over time
   3c. Scouting: each team's view of prospects sharpens over the season
       (automatic + weekly scouting points; the combine reveals physicals)
4. Draft order and the draft (teams draft from their own scouting view)
5. Roster cuts to 72 and depth charts
6. Multi-season loop with league history

### Milestone 4: staff (done)
1. Staff model and generation: head coach, offensive and defensive coordinators,
   general manager, scouting director (ratings, schemes, tendencies)
2. Coaching in games: schemes shape play calling; quality gives small edges;
   head coach drives 4th-down aggression, clock management, discipline
3. Front office and development: GM shapes drafting and cuts, scouting director
   sets scouting quality, head coach affects player development
4. Staff careers: aging, firings and hirings, Coach of the Year, staff history

### Milestone 5: contracts and salary cap (done)
Our own cap system (all money fictional, stored in $ thousands):
- Hard cap, starting at $300M in 2031 and growing 3-6% a year with league revenue;
  teams must spend at least 85% of it (cap floor)
- Contracts: yearly salary, signing bonus prorated over the deal, guaranteed years;
  cutting a player leaves dead money on the cap
- Homegrown credit: a player re-signed by the team that drafted him counts only
  80% against the cap, rewarding drafting and development
- Cap rollover: up to 10% of unused cap carries into next season
- Performance escalators: incentives for awards and playoff runs, charged to the
  next season's cap
- Rookie scale: slotted 4-year deals by pick; first-rounders carry a 5th-year option
- Player mood: home state, money, winning, playing time and the head coach all sway
  where a free agent signs (hometown discount)
- Staff contracts: years and salary from a separate staff budget; firing someone
  pays out the rest of the deal
Steps:
1. Contract model, cap rules and market value; every player in a new league
   starts on a contract that fits the hard cap
2. Contract lifecycle: rookie scale for draft picks, expiring deals, re-signings
   and extensions, escalators, cap-driven cuts with dead money, rollover
3. Player mood and free agency: home states, preferences, bidding, hometown discount
4. Staff contracts and the staff budget

### Milestone 6: mobile app (apps/mobile) (done)
Expo + React Native + Skia 2D field and play-by-play, driven by the event log
and animation data. The app only calls the sim; it never decides outcomes.
1. App scaffold in the workspace: simulate a game on the phone and show the
   score and play-by-play feed
2. Skia 2D field: animate each play from the sim's animation data, with playback
   controls (play/pause, next play, speed)
3. Game screen: scoreboard, field and feed in sync; box score
4. League screens: standings, schedule, Top 25, team, roster and player cards
5. Dynasty flow: pick a team, play week by week, playoffs, then the offseason
   (staff, contracts, draft, free agency); save and load

### Milestone 7: your offseason (done)
The AI still runs the other 49 teams; you make your own team's calls. Each
decision goes through the sim's rules (cap, player mood, scouting knowledge).
1. Re-signings: see each expiring player's asking price, years, mood and odds
   of accepting; choose who to re-sign (and fifth-year options) within the cap
2. Scouting and the draft: spend weekly scouting points during the season;
   make your own picks on the clock from your scouting board
3. Free agency: make offers (money, years); players choose by mood
4. Roster: cuts to 72 and the depth chart
5. Staff: fire and hire coaches and executives within the staff budget

### Milestone 8: phone-ready, then trades (done)
From the "beyond the league" plan: make the game solid on a real phone first,
then add trades. (Injuries, then picks, come after.)
1. Phone performance: measure the sim at phone speed and make every heavy step
   (new league, a week, playoffs, each offseason stage) fast enough not to stall
2. Save checkpoints and smaller saves: save mid-offseason so choices survive
   closing the app, a compact save format, more than one save slot
3. Trades: AI player valuation (rating, age, contract, cap fit), a trade screen
   with cap checks, AI-to-AI trades, a trade deadline

Follow-ups also done: draft-pick trades (next two drafts), uneven trades
(releases with dead money to fit 72), a draft-week trade window after the
championship, and tougher AI GMs (contenders hold starters, humans pay more).

### Milestone 9: injuries and in-season moves (done)
1. Injuries in games: players in a play can get hurt (age and stamina matter);
   out for the game, a few weeks or the season; the injured sit on game day,
   heal week by week, and are healthy by the offseason; injuries in the event
   log and feed; past games replay exactly (rosters and who sat are kept)
2. Injury report: your injured players and their return dates on the hub,
   team pages and depth chart; injury news around the league
3. In-season moves: injured reserve, and signing free agents to fill spots
   (you and the AI), within the cap and the 72-man roster

### Milestone 10: picks (done, solo play)
Over/unders on the games you're not coaching, for points only (no money, never
for sale). From the "beyond the league" plan; online leagues and the server
come later.
1. Lines: about 8 featured games a week (not yours) are each simulated 60-100
   times on throwaway seeds (never the real seed), in the background; the
   middle result sets the total, the spread and player props (passing,
   rushing and receiving yards)
2. Slates and points: pick 2-6 props for a points multiplier; settled when the
   week is played; a points balance and history in the save
3. Your own games: off the board, except overs on your own players
4. Picks screen: this week's board, your slate, results; the house (an AI
   bookmaker with a personality) as your opponent

### Milestone 11: media (done)
The league's story told back to you, from the event log.
1. News: each week's stories (upsets, thrillers, routs, big games, streaks,
   rankings, star injuries, trades, the MVP race), ranked by size; a national
   feed and your team's local feed (your recap and a look at the next game)
2. The weekly radio show: three recurring hosts with set personalities (the
   stats nerd, the hot-take artist, the former player), a written script each
   week, and on-air picks from the board with their records kept
3. Follow or fade: add a host's pick to your slate; the show brags or eats
   crow about last week

### Milestone 12: collectibles and trophies (done)
Everything collected marks something that happened in your league; nothing is
for sale.
1. Moments and the record book: notable plays, games and seasons become
   moment cards (common, rare, epic, legendary; a league first is a 1 of 1;
   a broken record makes it rarer); single-game and single-season records,
   starting empty in year one
2. Trophy room and rivalries: your titles, division crowns and players'
   awards; traveling rivalry trophies between neighboring states
3. Hall of Fame: a yearly ballot of retired players (AI media voters plus
   your vote); retired jersey numbers

### Milestone 13: ownership and the business (done)
The business side; the salary cap stays the same for everyone and market
size only changes the business. No real money, ever.
1. The business engine: markets from state population, casual fans and
   die-hards, stadiums, attendance from winning, hype and price; revenue
   (tickets, concessions, merch, sponsors, local media, a national TV deal,
   revenue sharing) against payroll, staff, stadium and debt; season books
   for every team, fans moving with results
2. Your levers: ticket and concession prices, stadium upgrades (capacity,
   video board, suites, dome) paid in cash or bonds, naming rights; AI teams
   price and build sensibly
3. The owner: owner + GM, or GM for an AI owner with goals who can fire you;
   press conferences that move fan mood and owner trust

### Milestone 14: the spring season (done)
A second, smaller season for the players who don't dress on game day.
1. Spring league: each division pools its teams' players below the game-day
   53 into one regional team (gaps filled from free agents); a round robin in
   two conferences and a final; spring stats, MVP and breakouts (standouts
   come back a few points better); played every offseason, from the report
   or when the new season starts
2. Coverage and picks: spring stories in the news and on the radio show, and
   a spring board for picks

### Milestone 15: online leagues (done)
Private leagues with friends. Decided: Fastify + Prisma + PostgreSQL in
apps/server, Postgres in local Docker while building, invite code + display
name to join (no passwords at first). Ask before installing dependencies.
1. Server scaffold: Fastify, Prisma schema (leagues, members, saves), local
   Postgres in Docker, health check, tests
2. Leagues: create a league (commissioner), invite code, join with a name,
   claim a state; the server runs the sim (results decided on the server)
3. Weekly advance: everyone readies up (or a timer runs out); AI covers
   anyone who misses it; the app talks to the server for online leagues
   3a. Server: ready-ups, deadline timer, commissioner push; the server plays
       each week, the playoffs and the offseason (AI calls for now)
   3b. App: create or join an online league, lobby, ready up, results
4. Online league in the app's screens: the app downloads the league's save
   (gzipped) and opens it read-only in the hub and tabs (standings, schedule,
   Top 25, teams, players, box scores); the server keeps a lineup log so
   every game replays exactly; unplayed games aren't previewed online
5. Your moves online: depth chart, injured reserve, free-agent signings and
   trades with AI teams, made on the phone and checked and applied on the
   server by the same sim rules (one change at a time per league)
6. Trades between friends: offers sent from the trade screen, answered from
   Trade offers (accept, decline, withdraw); accepted trades are checked again
   and made on the server; open offers expire when trading closes
7. Friends' offseason calls, in stages with ready-ups (staff, hires,
   re-signings, draft board, free agency, cuts; anyone without a call is
   left to the AI)
   7a. Sim: offseason choices for several teams at once; the draft from
       ranked boards; the staged offseason worked out again from the calls
   7b. Server: offseason stages, calls per stage (private until it closes)
   7c. App: each stage's screen for online leagues (worked out on the phone
       with the same sim code as the server; a ranked draft board)

### Milestone 16: organized and alive (done)
Make the app easy to find your way around and good to look at, games first.
Decided: five tabs by what you're doing (Home, Team, League, Media, Office),
real icons (@expo/vector-icons).
1. Navigation: five tabs; League folds in scores, standings, Top 25 and
   teams; Team, Media and Office list their screens with a live line each;
   every screen has one home
2. Home, compact: the next game up top (play, watch, sim), one "Needs you"
   list (press, injuries, scouting, trade offers, offseason calls), last
   result, a few headlines
3. One look: shared headers, sections, rows, stats, badges and empty
   states; team colors used throughout; consistent spacing and type
4. Game day: pregame (matchup, key players), live scoreboard in team colors
   with a win-chance bar and big plays, postgame recap (leaders, moments)
   4b. Broadcast field graphics (decided: top-down first, clean broadcast
       feel): painted field and end zones, players in uniform with numbers
       and shadows, a football that arcs, a tighter camera that zooms for
       deep balls, and restrained moments (big hits, first downs, touchdowns,
       turnovers)
   4c. A switchable TV-angle camera (2.5D perspective) on the same drawing
5. Flow polish: the offseason as a guided stepper (solo and online), loading
   and empty states, transitions

### Milestone 17: coach your own game (done)
Call the plays in your own games instead of only watching. The sim still
decides every outcome; you only make the choices the AI coaches make now.
Online, friends coach their games against AI teams; games between friends are left to the coaches.
1. Sim: a game you can step through, pausing for your call before each snap
   (like the draft's steps); the same seed and the same calls always give the
   same game, and your calls are kept so past games replay exactly
2. Offense: run or pass, formation, and 4th down (go, punt, field goal); hand
   any drive to your offensive coordinator
3. Defense and the clock: coverage and blitz, timeouts, two-point tries; your
   head coach takes any call you skip
4. Game-day screen: a compact call bar under the field (top-down or TV), auto
   the rest of the half, and a recap of how your calls did

### Milestone 18: player stories (done)
Texture on the systems already there.
1. Re-signing talks: holdouts and counteroffers
2. Captains and morale swings during the season
3. Career milestones in the news and on the radio show

### Milestone 19: your start (done)
Onboarding for a new dynasty: make the team yours, build your head coach,
then a fantasy draft. The AI still runs the other 49 teams.
Decided: the whole league redrafts; logos are drawn in Skia; you build your
own head coach (not pick from candidates).
1. Sim: team identity: pick your state, then a city name, nickname, 2-4
   letter short name, colors and a logo from a library of 70 (each a
   nickname and an emblem; a new league hands out 50, the other 20 are
   classic generic names like Tigers and Lions); no two teams share a
   name or logo (taking one trades yours to its holder)
2. App: the 70 logos drawn in Skia, shown everywhere a team is; the team
   setup screen (state, name, logo list, colors, city and short name, role)
3. Build your head coach: offensive-, defensive-minded or balanced, schemes,
   tendencies and a rating budget; it drives play calling and development
   through the existing staff rules
4. Sim: fantasy draft: every rostered player into one pool, a snake draft for
   all 50 teams, step by step like the rookie draft; you pick your first 10,
   25 or all rounds, the AI the rest; then depth charts and contracts
   re-fitted to the hard cap
5. App: the draft screen and the whole flow wired together
   (team, coach, draft length and your draft slot, draft, first season);
   the draft is saved pick by pick and resumes; "players needed" grades
   the roster A+ to F (overall, each position, team traits like pass rush
   and coverage), each the average player score on a curve against the
   league (average is a C), with the positions most needed first

Follow-ups also done: online, each friend makes their claimed team theirs
from the lobby (look and coach, checked on the server, made when the league
starts; a friend's name, logo or short name is off limits).

### Milestone 20: regions and your program (done)
The league stops being "pick a state". Each division is a region with a
talent core, and you build a new program there.
Decided: regions are the 10 divisions; your program replaces one of the
region's five (league stays at 50) with a fresh roster; no state is named,
only the region's states; you create the name, logo, colors and more.
1. Sim: regional talent: each region has a core of skill groups (e.g.
   Southeast speed and elusiveness, Great Lakes/North/Plains big men up
   front); players get a home region and generated players, draft classes
   and free agents lean to their region's core (stars can still come from
   anywhere); existing saves keep their players as they are
2. Sim: skill groups and your program: rank your top 3 skill groups, the
   best-fit region is yours; a fresh roster built mostly from local talent
   plus players from other regions; your program's market is its region
3. App: onboarding reworked: skill groups, your region and why, then your
   program's name, logo, colors and other options, your head coach, the
   fantasy draft (optional), first season
4. Online: friends pick skill groups in the lobby instead of claiming states;
   friends who fit one region share it in the order they joined (its five
   spots, most typical market first), then go to their next-best region

### Milestone 21: the new season shape (done)
Decided: 15 games (4 division, 6 conference, 5 non-conference) over 16
weeks with one bye; division title games (each division's top two) give the
10 automatic bids; the 6 highest-ranked others fill the 16-team playoff;
the Top 25 is re-ranked after the title games and after each playoff round.
Leagues started before this keep their old format (versioned, so old saves
and replays don't change).
1. Sim: league format versions; the 15-game schedule
2. Sim: championship week (division title games), bids and seeding
3. Rankings after title games and each playoff round; news, radio, picks
4. App and server: the new calendar, championship week, playoff picture

### Milestone 22: the play duel (the core of the game) (done)
Playing, not watching: before each snap you and the opponent each pick a
call; the matchup of the calls, the players' ratings and a little engine
randomness decide the play.
Decided: you call the plays by default (hand any of them, or the game, to
your coach); both sides see formations, never the call; your head coach's
scheme is your playbook and their play design sets how well each play is
drawn up, so a coach who doesn't fit your philosophy costs you.
1. Sim: playbook concepts (offense: inside/outside run, draw, screen,
   quick, intermediate, deep shot, play action; defense: base, run blitz,
   pass blitz, man press, Cover 2/3/4) and the counter table feeding the run
   and pass engines; deterministic; old replays unchanged (rules versions)
2. Sim: the AI opponent: calls by situation, scheme and coach quality, and
   learns your tendencies during a game
3. Sim: the reveal and the duel recap (calls won and lost, why)
4. App: the call sheet (concept cards before each snap, the reveal after)
5. Online: games between friends become real duels
   5a. Sim: a game both teams' coaches call (one list of calls in the order
       the game asks); each coach sees the calls up to the last play, never
       the other's call before making their own
   5b. Server: the duel call by call (your view, your call, hand a drive, a
       half or the game to your coaches); roster moves wait while a duel is
       under way; the week plays it, the coaches calling anything left
   5c. App: the duel screen (your call, waiting on your friend, the reveal)

### Milestone 23: owner and coach progression
Decided: you are the owner, and the owner is who levels up; coaches level
too; both have upgrades that improve player growth and games.
1. Owner XP and levels (wins, calls won, development, titles)
2. Owner upgrades: facilities (growth), recruiting points, analytics (film
   study: see opponent tendencies), coaching clinic; coach levels and
   abilities; coach-philosophy fit
3. App: owner profile, upgrade tree, coach abilities

### Milestone 24: recruiting
Local and outside talent: recruiting points from your coach and upgrades;
local prospects cost less; you can recruit anywhere. (To decide: how
recruiting and the draft fit together.)

### Milestone 25: practice and game day
Weekly practice plan (focus, intensity, injury risk, installing plays for
the next opponent), training camp position battles, weather by region and
week, crowd noise; shown on the field and in the feed.

### Milestone 26: arenas
Design and grow your stadium (capacity, roof, surface, video board, name),
drawn in Skia, paid for through the business engine, feeding home-field
noise and atmosphere.

After each step: run it, show sample output, and stop for review.

## Working style
- Small, testable steps. Don't jump ahead to later milestones.
- Ask before adding dependencies or changing the stack.
- The full design doc lives in docs/design.md.
