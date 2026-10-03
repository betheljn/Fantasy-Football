# Football Dynasty Game — Project Guide

## What this is
A phone-first football management and dynasty game. Players run one team in a
league of 50 fictional teams (one per US state), draft and develop players, hire
coaches, GMs, and scouts, and chase championships across many seasons.
Games are simulated and shown as a 2D top-down field plus a play-by-play feed.

This is NOT a real-world fantasy football or NFL projection tool.
Never use real leagues, teams, players, or logos (no "NFL", no real team names).
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
- 20-game regular season over 22 weeks: two byes per team, one in weeks 5-11
  and one in weeks 12-18
- Weekly rankings 1-25 from a computed formula: 100 x win pct + 2 x strength
  rating (capped scoring margin + strength of schedule); preseason prior from
  roster strength fades over the first 5 games
- 16-team playoff: the 10 division winners (automatic bids) + the 6 highest-ranked
  other teams, all seeded 1-16 by final ranking. Fixed bracket (1v16, 8v9, ...),
  higher seed hosts, neutral-site championship, no ties
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

### Milestone 16: organized and alive (current)
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
5. Flow polish: the offseason as a guided stepper (solo and online), loading
   and empty states, transitions

After each step: run it, show sample output, and stop for review.

## Working style
- Small, testable steps. Don't jump ahead to later milestones.
- Ask before adding dependencies or changing the stack.
- The full design doc lives in docs/design.md.
