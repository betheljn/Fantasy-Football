// A player card: identity, persona, contract, season stats, and every rating by group.
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  DEV_TRAIT_NAMES,
  PRIORITY_NAMES,
  RATING_INFO,
  RATING_KEYS,
  STATES,
  formatContract,
  keyAttributes,
  persona,
  playerOverall,
  teamName,
  topPriorities,
  type RatingGroup,
  capHit,
  formatMoney,
  inSeasonContract,
  injuryLabel,
  isCaptain,
  playerMorale,
  salaryCap,
  teamCaptains,
  type Player,
  type Team,
} from "@dynasty/sim";
import { Card, Pill, SectionTitle, Swatch } from "../../components/ui";
import { NEUTRAL_COLORS, teamColors } from "../../field/colors";
import { useDynasty, useLeague } from "../../league/LeagueProvider";
import { useTheme, type Theme } from "../../theme";

const GROUPS: RatingGroup[] = ["Physical", "Mental", "Passing", "Ball Carrier", "Receiving", "Blocking", "Defense", "Special Teams"];
const STATE_NAME = new Map(STATES.map(([name, abbr]) => [abbr, name]));

export default function PlayerScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const d = useDynasty();
  const { playerById, stats, league } = useLeague();
  const [signed, setSigned] = useState<string | null>(null);
  // On a team, or one of the free agents available this season.
  const onTeam = playerById.get(id ?? "");
  const free = onTeam ? undefined : league.freeAgents?.find((x) => x.id === id);
  if (!onTeam && !free) return <Text style={{ padding: 16, color: t.text }}>{signed ?? "Unknown player."}</Text>;
  const p = onTeam?.player ?? free!;
  const team = onTeam?.team ?? null;
  const who = persona(p);
  const season = stats.players.get(p.id);
  const key = new Set(keyAttributes(p));
  const statLine = season ? seasonLine(p.position, season.stats, season.games) : null;
  // Free agents wear neutral colors.
  const colors = team ? teamColors(team.abbr) : NEUTRAL_COLORS;
  const trimText = colors.onTrim;

  return (
    <>
      <Stack.Screen options={{ title: `${p.firstName} ${p.lastName}` }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={{ backgroundColor: colors.primary, borderRadius: 12, padding: 16, borderBottomWidth: 4, borderBottomColor: colors.trim, flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: colors.trim, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: trimText, fontSize: 24, fontWeight: "900" }}>{playerOverall(p)}</Text>
            <Text style={{ color: trimText, fontSize: 9, fontWeight: "800", marginTop: -3 }}>OVR</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 21, fontWeight: "900", color: colors.onPrimary }}>
              {p.firstName} {p.lastName}
            </Text>
            <Text style={{ color: colors.onPrimary, opacity: 0.85 }}>
              {team ? `#${p.jersey} · ` : ""}
              {p.position}
              {p.archetype ? ` · ${p.archetype}` : ""} · age {p.age}
            </Text>
            <Text style={{ color: colors.onPrimary, opacity: 0.85, marginTop: 2 }}>{team ? teamName(team) : "Free agent"}</Text>
          </View>
          {team ? <Swatch abbr={team.abbr} size={34} /> : null}
        </View>
        {p.injury ? <Pill tone="bad" label={`Injured: ${injuryLabel(p.injury)}`} /> : null}
        {p.holdout ? <Pill tone="bad" label={`Holding out for a new deal: ${p.holdout.weeks} more game${p.holdout.weeks === 1 ? "" : "s"}`} /> : null}
        {team ? <MoraleLine player={p} team={team} theme={t} /> : null}

        <Card>
          <Text style={{ color: t.muted, marginTop: 10 }}>
            Development: {p.devTraitRevealed ? DEV_TRAIT_NAMES[p.devTrait] : "Unknown"} · From {STATE_NAME.get(who.homeState) ?? who.homeState}
          </Text>
          <Text style={{ color: t.muted, marginTop: 2 }}>Cares most about {topPriorities(who).map((k) => PRIORITY_NAMES[k]).join(" and ")}</Text>
          {p.contract ? <Text style={{ color: t.text, marginTop: 8 }}>{formatContract(p.contract)}</Text> : null}
          {free ? (
            <View style={{ marginTop: 8, gap: 6 }}>
              <Text style={{ color: t.text }}>Signs for {formatMoney(capHit(inSeasonContract(free, league, league.season), league.season))} for the rest of the season (one year).</Text>
              {d.canMakeMoves ? (
                <Pressable
                  onPress={() => {
                    const problems = d.signFreeAgent(free.id);
                    setSigned(problems.length > 0 ? problems.join(" ") : `Signed ${free.firstName} ${free.lastName}.`);
                  }}
                  accessibilityRole="button"
                  style={{ alignSelf: "flex-start", paddingHorizontal: 14, height: 36, borderRadius: 8, justifyContent: "center", backgroundColor: t.accent }}
                >
                  <Text style={{ color: t.onAccent, fontWeight: "800" }}>Sign him</Text>
                </Pressable>
              ) : null}
              {signed ? <Text style={{ color: t.score, fontWeight: "700" }}>{signed}</Text> : null}
            </View>
          ) : null}
        </Card>

        {statLine ? (
          <Card>
            <SectionTitle>This season</SectionTitle>
            <Text style={{ color: t.text }}>{statLine}</Text>
          </Card>
        ) : null}

        {GROUPS.map((g) => {
          const keys = RATING_KEYS.filter((k) => RATING_INFO[k].group === g);
          return (
            <Card key={g}>
              <SectionTitle>{g}</SectionTitle>
              {keys.map((k) => (
                <RatingBar key={k} name={RATING_INFO[k].name} value={p.ratings[k]} strong={key.has(k)} theme={t} />
              ))}
            </Card>
          );
        })}
      </ScrollView>
    </>
  );
}

function RatingBar({ name, value, strong, theme: t }: { name: string; value: number; strong: boolean; theme: Theme }) {
  const color = value >= 80 ? t.accent : value >= 65 ? "#d4a017" : t.muted;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 }}>
      <Text style={{ width: 150, color: strong ? t.text : t.muted, fontWeight: strong ? "700" : "400" }} numberOfLines={1}>
        {name}
      </Text>
      <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: t.border }}>
        <View style={{ width: `${value}%`, height: 6, borderRadius: 3, backgroundColor: color }} />
      </View>
      <Text style={{ width: 26, textAlign: "right", color: t.text, fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}

/** One line of the most relevant season stats for the position. */
function seasonLine(pos: string, s: Record<string, number>, games: number): string {
  const g = `${games} game${games === 1 ? "" : "s"}`;
  switch (pos) {
    case "QB":
      return `${g}: ${s.passCmp}/${s.passAtt}, ${s.passYds} yds, ${s.passTd} TD, ${s.passInt} INT; ${s.rushYds} rush yds`;
    case "RB":
      return `${g}: ${s.rushAtt} car, ${s.rushYds} yds, ${s.rushTd} TD; ${s.rec} rec, ${s.recYds} yds`;
    case "WR":
    case "TE":
      return `${g}: ${s.rec} rec, ${s.recYds} yds, ${s.recTd} TD (${s.targets} targets)`;
    case "K":
      return `${g}: ${s.fgMade}/${s.fgAtt} FG (long ${s.fgLong}), ${s.xpMade}/${s.xpAtt} XP`;
    case "P":
      return `${g}: ${s.punts} punts, ${s.punts ? (s.puntYds! / s.punts!).toFixed(1) : "0"} avg`;
    case "OL":
    case "LS":
      return `${g} played`;
    default:
      return `${g}: ${s.tackles} tackles, ${s.sacks} sacks, ${s.defInt} INT, ${s.passDefended} passes defended`;
  }
}

/** His morale on his team now, and what's behind it (captains wear a C). */
function MoraleLine({ player, team, theme: t }: { player: Player; team: Team; theme: Theme }) {
  const { league, results } = useLeague();
  const captains = teamCaptains(team);
  const m = playerMorale(player, team, results, league.season, salaryCap(league.seed, league.season), captains);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {isCaptain(captains, player.id) ? <Pill tone="gold" label={`Captain (${captains.offense?.id === player.id ? "offense" : "defense"})`} /> : null}
      <Pill tone={m.value < 40 ? "bad" : m.value >= 57 ? "good" : "muted"} label={`Morale: ${m.label} (${m.value})`} />
      {m.reasons.length ? <Text style={{ color: t.muted, fontSize: 12 }}>{m.reasons.slice(0, 2).join(" · ")}</Text> : null}
    </View>
  );
}
