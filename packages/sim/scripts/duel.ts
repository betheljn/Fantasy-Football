// Milestone 22 step 1: the play duel's concepts and counter table, and what
// each matchup gives in the engines (yards per play, same two teams).
import { DEFENSE_CONCEPTS, DEFENSE_CONCEPT_INFO, OFFENSE_CONCEPTS, OFFENSE_CONCEPT_INFO, Rng, conceptMatchup, generateTeams, simulatePass, simulateRun, type DefenseConcept, type OffenseConcept, type Situation, type Team } from "../src/index.ts";

const [o, d] = generateTeams(new Rng("duel-demo"), 2) as [Team, Team];
const sit: Situation = { quarter: 1, clock: 900, down: 1, distance: 10, yardline: 25 };
const N = 600;
const pad = (s: string, n: number) => s.padEnd(n);
console.log(`Yards per play (${N} snaps each); passes also show the interception rate; the counter edge in brackets\n`);
console.log(pad("", 14) + DEFENSE_CONCEPTS.map((x) => pad(DEFENSE_CONCEPT_INFO[x].label, 14)).join(""));
for (const oc of OFFENSE_CONCEPTS) {
  const info = OFFENSE_CONCEPT_INFO[oc];
  const sim = info.kind === "run" ? simulateRun : simulatePass;
  const cells = DEFENSE_CONCEPTS.map((dc) => {
    const rng = new Rng(`duel:${oc}:${dc}`);
    let y = 0;
    let picks = 0;
    for (let i = 0; i < N; i++) {
      const p = sim(rng, { offense: o, defense: d, situation: sit, rules: 4, concepts: { offense: oc, defense: dc } });
      y += p.yardsGained;
      if (p.kind === "pass" && p.outcome === "interception") picks++;
    }
    const e = conceptMatchup(oc, dc).edge;
    return pad(`${(y / N).toFixed(1)}${info.kind === "pass" ? `/${((100 * picks) / N).toFixed(0)}%` : ""} [${e > 0 ? "+" : ""}${e}]`, 14);
  });
  console.log(pad(info.label, 14) + cells.join(""));
}
console.log(`\nWhy, for a few: ${["deep_shot:cover_2", "inside_run:run_blitz", "quick:pass_blitz", "play_action:run_blitz"].map((k) => { const [a, b] = k.split(":") as [OffenseConcept, DefenseConcept]; return `\n  ${OFFENSE_CONCEPT_INFO[a].label} vs ${DEFENSE_CONCEPT_INFO[b].label}: ${conceptMatchup(a, b).why}`; }).join("")}`);
