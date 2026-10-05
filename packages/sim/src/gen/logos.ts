// The logo library: 70 generic team identities, each a nickname and the
// emblem drawn for it. The first 50 are the nicknames a new league hands out
// (in this order, so existing seeds keep their names); the other 20 are only
// for a team you name yourself: generic nicknames, never one that points at
// a real team ("49ers", "76ers"). No real team logos or color sets.

export interface TeamLogo {
  /** Stable id, saved on a team (kebab-case nickname). */
  readonly id: string;
  readonly nickname: string;
  /** What the emblem shows (the app draws it; also its accessibility label). */
  readonly emblem: string;
}

const entry = (nickname: string, emblem: string): TeamLogo => ({ id: nickname.toLowerCase().replace(/[^a-z0-9]+/g, "-"), nickname, emblem });

export const LOGOS: readonly TeamLogo[] = [
  entry("Ironclads", "armored steamship"),
  entry("Anvils", "anvil"),
  entry("Riveters", "hex nut"),
  entry("Foxhounds", "hound head"),
  entry("Ridgebacks", "dog with a ridged back"),
  entry("Thunderheads", "storm cloud"),
  entry("Quarrymen", "pickaxe and stone block"),
  entry("Harriers", "diving hawk"),
  entry("Stormcrows", "crow with a lightning bolt"),
  entry("Copperheads", "coiled snake"),
  entry("Kestrels", "small falcon"),
  entry("Blacksmiths", "hammer over anvil"),
  entry("Drovers", "steer horns"),
  entry("Surveyors", "compass rose"),
  entry("Lanterns", "lantern"),
  entry("Sawtooths", "saw blade"),
  entry("Brawlers", "clenched fist"),
  entry("Prospectors", "gold pan and nugget"),
  entry("Tumbleweeds", "tumbleweed"),
  entry("Keelboats", "river boat"),
  entry("Wildfire", "flame"),
  entry("Longshots", "horseshoe"),
  entry("Granite", "mountain peak"),
  entry("Bandogs", "dog with a spiked collar"),
  entry("Lamplighters", "street lamp"),
  entry("Millwrights", "water wheel"),
  entry("Tinsmiths", "tin star"),
  entry("Hailstones", "hailstone burst"),
  entry("Northwinds", "north arrow and wind"),
  entry("Bluestems", "prairie grass"),
  entry("Canalmen", "lock gates over water"),
  entry("Pathfinders", "trail arrow"),
  entry("Wolfhounds", "wolf head"),
  entry("Ferrymen", "crossed oars"),
  entry("Stonecutters", "chisel and block"),
  entry("Rainmakers", "rain cloud"),
  entry("Coalers", "coal cart"),
  entry("Tidecallers", "trident and wave"),
  entry("Ropewalkers", "coiled rope"),
  entry("Sandpipers", "shorebird"),
  entry("Headwinds", "wind swirl"),
  entry("Fieldhands", "pitchfork"),
  entry("Ironwoods", "oak tree"),
  entry("Cragsmen", "climbing axe"),
  entry("Brakemen", "brake wheel"),
  entry("Signalmen", "rail signal"),
  entry("Duststorms", "dust funnel"),
  entry("Timberjacks", "felling axe"),
  entry("Graystones", "stacked stones"),
  entry("Switchmen", "switch stand and lever"),
  // Twenty more, only for a team you name: classic generic nicknames.
  entry("Tigers", "tiger head"),
  entry("Lions", "lion head with mane"),
  entry("Bears", "bear head"),
  entry("Wolves", "wolf head and crescent moon"),
  entry("Eagles", "eagle head"),
  entry("Hawks", "hawk with wings spread"),
  entry("Bulldogs", "bulldog head"),
  entry("Mustangs", "horse head"),
  entry("Panthers", "panther head"),
  entry("Falcons", "falcon in flight"),
  entry("Rams", "ram head with curled horns"),
  entry("Bison", "bison"),
  entry("Grizzlies", "bear paw"),
  entry("Cougars", "cougar head"),
  entry("Sharks", "shark fin"),
  entry("Hornets", "hornet"),
  entry("Owls", "owl"),
  entry("Vipers", "striking snake"),
  entry("Knights", "knight's helmet"),
  entry("Pirates", "skull and crossed swords"),
];

/** How many logos a new league hands out (one per team). */
export const LEAGUE_LOGOS = 50;

const BY_ID = new Map(LOGOS.map((l) => [l.id, l]));
const BY_NICKNAME = new Map(LOGOS.map((l) => [l.nickname, l]));

export function logoById(id: string): TeamLogo | undefined {
  return BY_ID.get(id);
}

/** The library logo for a nickname, if it has one. */
export function logoForNickname(nickname: string): TeamLogo | undefined {
  return BY_NICKNAME.get(nickname);
}
