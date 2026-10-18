// Times the game engine (50 games across rules versions and weather) and fingerprints every play.
import { allTeams, generateLeague, simulateGame, type GameConditions } from "../src/index.ts";

const teams = allTeams(generateLeague("game-bench"));
const rain: GameConditions = { dome: false, temp: 38, precip: "rain", wind: 15, noise: 0.6, surface: "turf" };
const hash = (s: string) => `${s.length}:${[...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)}`;
const games = [];
const t0 = performance.now();
for (let i = 0; i < 50; i++) {
  const rules = [3, 5, 6, 7, 7][i % 5]!;
  const r = simulateGame(teams[i % 50]!, teams[(i + 17) % 50]!, `gb${i}`, { rules, ...(i % 2 ? { conditions: rain } : {}) });
  games.push(r);
}
const ms = Math.round(performance.now() - t0);
console.log(`50 games ${ms} ms; fingerprint ${hash(games.map((g) => JSON.stringify(g)).join(""))}`);
