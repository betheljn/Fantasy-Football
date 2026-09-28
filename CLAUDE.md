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

### Milestone 3: dynasty offseason (current)
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

### Milestone 4: staff
Coaches, GMs, and scouts with ratings that affect play calling, rosters, and drafting.

### Milestone 5: mobile app (apps/mobile)
Expo + React Native + Skia 2D field and play-by-play, driven by the event log
and animation data.

After each step: run it, show sample output, and stop for review.

## Working style
- Small, testable steps. Don't jump ahead to later milestones.
- Ask before adding dependencies or changing the stack.
- The full design doc lives in docs/design.md.
