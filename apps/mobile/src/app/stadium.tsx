// Your stadium: drawn from the air, what its design means on game day, and
// how to change it. Every choice plays: the roof (open air, a retractable
// roof that closes against bad weather, a dome), the field (grass or turf),
// the stands (a classic bowl, or steep stands that make it louder), the
// seats, the boards, the name. Work is paid in cash or bonds and opens next
// season, through the business engine.
import { Stack } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import {
  PROJECTS,
  ROOF_NAMES,
  STANDS_NAMES,
  SURFACE_NAMES,
  ROOF_NOTES,
  STANDS_NOTES,
  SURFACE_NOTES,
  VIDEO_BOARD_MAX,
  VIDEO_BOARD_NAMES,
  crowdNoise,
  describeStadium,
  formatMoney,
  projectCost,
  projectProblems,
  roofOf,
  standsOf,
  startLeagueBusiness,
  surfaceOf,
  videoBoardOf,
  type ProjectKind,
  type TeamBusiness,
} from "@dynasty/sim";
import { Card, SectionTitle } from "../components/ui";
import { teamColors } from "../field/colors";
import { StadiumView } from "../field/StadiumView";
import { useDynasty, useLeague } from "../league/LeagueProvider";
import { useTheme, type Theme } from "../theme";

const ROOF_PLAYS = ROOF_NOTES;
const FIELD_PLAYS = SURFACE_NOTES;
const STANDS_PLAYS = STANDS_NOTES;

export default function StadiumScreen() {
  const t = useTheme();
  const d = useDynasty();
  const { league, userTeam } = useLeague();
  const { width } = useWindowDimensions();
  const [closed, setClosed] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const all = d.save!.dynasty.business ?? startLeagueBusiness(league);
  const b: TeamBusiness = all[userTeam]!;
  const s = b.stadium;
  const roof = roofOf(s);
  const noise = crowdNoise(b);
  const pending = b.pending ?? [];
  const say = (problems: string[], ok: string) => setMessage(problems.length ? { text: problems[0]!, good: false } : { text: ok, good: true });
  const build = (kind: ProjectKind, financing: "cash" | "bonds") => say(d.startStadiumProject(kind, financing), `${PROJECTS[kind].name}: under way (${financing}). It opens next season.`);

  /** One choice: the option, its cost, and the build buttons (or why not). */
  const option = (kind: ProjectKind, label: string, note: string) => {
    const cash = projectProblems(b, kind, userTeam, "cash");
    const bonds = projectProblems(b, kind, userTeam, "bonds");
    const building = pending.some((p) => p.kind === kind);
    return (
      <View key={kind} style={{ paddingVertical: 8, borderTopWidth: 1, borderColor: t.border, gap: 4 }}>
        <Text style={{ color: t.text, fontWeight: "700" }}>{`${label} · ${formatMoney(projectCost(kind, userTeam))}`}</Text>
        <Text style={{ color: t.muted, fontSize: 12 }}>{note}</Text>
        {building ? (
          <Text style={{ color: t.accent, fontWeight: "700", fontSize: 12 }}>Under way: opens next season</Text>
        ) : cash.length && bonds.length ? (
          <Text style={{ color: t.muted, fontSize: 12 }}>{bonds[0]}</Text>
        ) : (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Small label="Pay cash" disabled={cash.length > 0} onPress={() => build(kind, "cash")} theme={t} />
            <Small label="Use bonds" disabled={bonds.length > 0} onPress={() => build(kind, "bonds")} theme={t} />
          </View>
        )}
      </View>
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: "Stadium" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={{ alignItems: "center", gap: 6 }}>
          <StadiumView stadium={s} colors={teamColors(userTeam)} width={Math.min(width - 32, 480)} closed={closed} />
          {roof === "retractable" ? <Small label={closed ? "Open the roof" : "Close the roof"} onPress={() => setClosed(!closed)} theme={t} /> : null}
        </View>
        <Card style={{ gap: 4 }}>
          <Text style={{ color: t.text, fontSize: 18, fontWeight: "800" }}>{s.name}</Text>
          <Text style={{ color: t.muted }}>{describeStadium(s)}</Text>
          <Text style={{ color: t.text }}>{`Crowd noise: ${noise >= 0.75 ? "deafening" : noise >= 0.6 ? "loud" : noise >= 0.35 ? "solid" : "quiet"} (${Math.round(noise * 100)})`}</Text>
          <Text style={{ color: t.muted, fontSize: 12 }}>{`Cash ${formatMoney(b.cash)} · stadium debt ${formatMoney(s.debt)}`}</Text>
        </Card>

        <Card style={{ gap: 6 }}>
          <SectionTitle>On game day</SectionTitle>
          <Text style={{ color: t.text }}>{`${ROOF_NAMES[roof]}: ${ROOF_PLAYS[roof]}`}</Text>
          <Text style={{ color: t.text }}>{`${SURFACE_NAMES[surfaceOf(s)]}: ${FIELD_PLAYS[surfaceOf(s)]}`}</Text>
          <Text style={{ color: t.text }}>{`${STANDS_NAMES[standsOf(s)]}: ${STANDS_PLAYS[standsOf(s)]}`}</Text>
        </Card>

        {message ? <Text style={{ color: message.good ? t.accent : t.score, fontWeight: "700" }}>{message.text}</Text> : null}

        <Card>
          <SectionTitle>{`Roof · now ${ROOF_NAMES[roof].toLowerCase()}`}</SectionTitle>
          {roof === "open" ? option("retractable", "Retractable roof", ROOF_PLAYS.retractable) : null}
          {roof !== "dome" ? option("dome", "A dome", `${ROOF_PLAYS.dome} The field goes to turf.`) : <Text style={{ color: t.muted, fontSize: 12 }}>A dome stays a dome.</Text>}
        </Card>
        <Card>
          <SectionTitle>{`Field · now ${SURFACE_NAMES[surfaceOf(s)].toLowerCase()}`}</SectionTitle>
          {surfaceOf(s) === "grass" ? option("turf", "Lay turf", FIELD_PLAYS.turf) : roof === "dome" ? <Text style={{ color: t.muted, fontSize: 12 }}>Grass won't grow under a dome.</Text> : option("grass", "Grow grass", FIELD_PLAYS.grass)}
        </Card>
        <Card>
          <SectionTitle>{`Stands · now ${STANDS_NAMES[standsOf(s)].toLowerCase()}, ${s.capacity.toLocaleString("en-US")} seats`}</SectionTitle>
          {standsOf(s) === "classic" ? option("steep", "Steeper stands", STANDS_PLAYS.steep) : null}
          {option("expand", PROJECTS.expand.name, "More seats: more tickets, a bigger crowd (and a little more noise).")}
        </Card>
        <Card>
          <SectionTitle>{`Boards and suites · ${VIDEO_BOARD_NAMES[videoBoardOf(s)]!.toLowerCase()}, ${s.suites ?? 0} levels of suites`}</SectionTitle>
          {videoBoardOf(s) < VIDEO_BOARD_MAX ? option("videoBoard", `Upgrade to ${VIDEO_BOARD_NAMES[videoBoardOf(s) + 1]!.toLowerCase()}`, PROJECTS.videoBoard.does) : null}
          {option("suites", PROJECTS.suites.name, PROJECTS.suites.does)}
        </Card>

        <Card style={{ gap: 8 }}>
          <SectionTitle>Name</SectionTitle>
          {s.naming && s.naming.through >= league.season ? (
            <Text style={{ color: t.muted }}>{`${s.naming.sponsor} has the naming rights through ${s.naming.through}.`}</Text>
          ) : (
            <>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={s.name}
                placeholderTextColor={t.muted}
                accessibilityLabel="Stadium name"
                style={{ color: t.text, borderWidth: 1, borderColor: t.border, borderRadius: 8, padding: 10, backgroundColor: t.bg }}
              />
              <Small label="Rename it" disabled={!name.trim()} onPress={() => say(d.renameStadium(name), `It's ${name.trim().replace(/\s+/g, " ")} now.`)} theme={t} />
            </>
          )}
        </Card>
      </ScrollView>
    </>
  );
}

function Small({ label, onPress, disabled, theme: t }: { label: string; onPress: () => void; disabled?: boolean; theme: Theme }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={({ pressed }) => ({ alignSelf: "flex-start", paddingHorizontal: 12, height: 34, borderRadius: 8, justifyContent: "center", borderWidth: 1, borderColor: disabled ? t.border : t.accent, backgroundColor: disabled ? t.card : t.accent, opacity: disabled ? 0.5 : pressed ? 0.7 : 1 })}>
      <Text style={{ color: disabled ? t.muted : t.onAccent, fontWeight: "800", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}
