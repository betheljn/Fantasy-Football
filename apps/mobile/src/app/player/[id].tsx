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
} from "@dynasty/sim";
import { Card, SectionTitle, Swatch } from "../../components/ui";
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

  return (
    <>
      <Stack.Screen options={{ title: `${p.firstName} ${p.lastName}` }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: t.onAccent, fontSize: 22, fontWeight: "900" }}>{playerOverall(p)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: "800", color: t.text }}>
                {team ? `#${p.jersey} ` : ""}
                {p.firstName} {p.lastName}
              </Text>
              <Text style={{ color: t.muted }}>
                {p.position}
                {p.archetype ? ` · ${p.archetype}` : ""} · age {p.age}
              </Text>
              {p.injury ? <Text style={{ color: t.score, fontWeight: "700" }}>Injured: {injuryLabel(p.injury)}</Text> : null}
              {team ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <Swatch abbr={team.abbr} />
                  <Text style={{ color: t.muted }}>{teamName(team)}</Text>
                </View>
              ) : (
                <Text style={{ color: t.muted, marginTop: 2 }}>Free agent</Text>
              )}
            </View>
          </View>
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
