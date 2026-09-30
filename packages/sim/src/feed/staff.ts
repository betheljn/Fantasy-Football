// Console text for a team's staff.
import { SCHEME_DESCRIPTIONS, STAFF_ROLE_NAMES, staffOverall, type StaffMember, type TeamStaff } from "../model/staff.ts";
import { formatMoney } from "../model/contract.ts";

const deal = (m: StaffMember) => (m.contract ? `  ${formatMoney(m.contract.salary)}/yr through ${m.contract.through}` : "");

function details(m: StaffMember): string {
  switch (m.role) {
    case "HC":
      return `game mgmt ${m.gameManagement}, discipline ${m.discipline}, development ${m.development}, aggressiveness ${m.aggressiveness}`;
    case "OC":
      return `${m.scheme} (${SCHEME_DESCRIPTIONS[m.scheme]}); play calling ${m.playCalling}, passing ${m.passingGame}, running ${m.runningGame}, tempo ${m.tempo}`;
    case "DC":
      return `${m.scheme} (${SCHEME_DESCRIPTIONS[m.scheme]}); play calling ${m.playCalling}, pass D ${m.passDefense}, run D ${m.runDefense}`;
    case "GM":
      return `${m.philosophy} (${SCHEME_DESCRIPTIONS[m.philosophy]}); talent evaluation ${m.talentEvaluation}`;
    case "SCOUT":
      return `scouting ${m.scouting}`;
  }
}

export function formatStaff(staff: TeamStaff): string {
  return [staff.hc, staff.oc, staff.dc, staff.gm, staff.scout]
    .map(
      (m) =>
        `  ${STAFF_ROLE_NAMES[m.role].padEnd(22)} ${`${m.firstName} ${m.lastName}`.padEnd(20)} age ${m.age}, ${m.experience} yrs  ` +
        `OVR ${staffOverall(m)}${deal(m)}\n  ${"".padEnd(22)} ${details(m)}`,
    )
    .join("\n");
}
