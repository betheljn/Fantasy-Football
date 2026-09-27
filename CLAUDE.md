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

## Current milestone (build in this order, one step at a time)
1. Data model: player (position, ratings), team (roster, depth chart)
2. Generate two random teams
3. Simulate a single run play and a single pass play
4. Simulate a full drive
5. Simulate a full game
6. Print play-by-play and a box score to the console

After each step: run it, show sample output, and stop for review.

## Working style
- Small, testable steps. Don't jump ahead to later milestones.
- Ask before adding dependencies or changing the stack.
- The full design doc lives in docs/design.md.
