// Box score as of the current play: line score, team stats side by side, and
// each team's leaders. Everything comes from the sim's box score builder.
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { displayName, type BoxScore, type GameResult, type PlayerLookup, type PlayerStats, type TeamStats } from "@dynasty/sim";
import { minutes, type LineScore } from "../game/live";
import { useTheme, type Theme } from "../theme";

interface Props {
  game: GameResult;
  box: BoxScore;
  line: LineScore;
  who: PlayerLookup;
}

const TEAM_ROWS: Array<[string, (t: TeamStats) => string]> = [
  ["First downs", (t) => String(t.firstDowns)],
  ["Total yards", (t) => String(t.totalYards)],
  ["Passing", (t) => String(t.passYdsNet)],
  ["Comp–Att", (t) => `${t.passCmp}–${t.passAtt}`],
  ["Rushing", (t) => `${t.rushYds} (${t.rushAtt})`],
  ["Sacked–Yds", (t) => `${t.sacked}–${t.sackYdsLost}`],
  ["Turnovers", (t) => String(t.turnovers)],
  ["3rd down", (t) => `${t.thirdDownConv}/${t.thirdDownAtt}`],
  ["4th down", (t) => `${t.fourthDownConv}/${t.fourthDownAtt}`],
  ["Penalties", (t) => `${t.penalties}–${t.penaltyYds}`],
  ["Possession", (t) => minutes(t.timeOfPossession)],
];

export function BoxScoreView({ game, box, line, who }: Props) {
  const theme = useTheme();
  const s = styles(theme);
  const teams = [game.away, game.home];
  const name = (p: PlayerStats) => {
    try {
      return displayName(who(p.id));
    } catch {
      return p.id;
    }
  };
  const players = Object.values(box.players);
  const top = (team: string, key: keyof PlayerStats, n: number) =>
    players.filter((p) => p.team === team && (p[key] as number) > 0).sort((a, b) => (b[key] as number) - (a[key] as number)).slice(0, n);

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <View style={s.card}>
        <View style={s.row}>
          <Text style={[s.teamCol, s.head]}> </Text>
          {line.periods.map((p) => (
            <Text key={p} style={[s.cell, s.head]}>
              {p}
            </Text>
          ))}
          <Text style={[s.total, s.head]}>T</Text>
        </View>
        {teams.map((t) => (
          <View key={t} style={s.row}>
            <Text style={s.teamCol}>{t}</Text>
            {line.points[t]!.map((pts, i) => (
              <Text key={i} style={s.cell}>
                {pts}
              </Text>
            ))}
            <Text style={s.total}>{line.points[t]!.reduce((a, b) => a + b, 0)}</Text>
          </View>
        ))}
      </View>

      <View style={s.card}>
        <View style={s.row}>
          <Text style={[s.statLabel, s.head]}>Team stats</Text>
          {teams.map((t) => (
            <Text key={t} style={[s.statVal, s.head]}>
              {t}
            </Text>
          ))}
        </View>
        {TEAM_ROWS.map(([label, f]) => (
          <View key={label} style={s.row}>
            <Text style={s.statLabel}>{label}</Text>
            {teams.map((t) => (
              <Text key={t} style={s.statVal}>
                {f(box.teams[t]!)}
              </Text>
            ))}
          </View>
        ))}
      </View>

      {teams.map((t) => (
        <View key={t} style={s.card}>
          <Text style={s.cardTitle}>{t} leaders</Text>
          <Section title="Passing" theme={theme} rows={top(t, "passAtt", 1).map((p) => [name(p), `${p.passCmp}/${p.passAtt}, ${p.passYds} yds, ${p.passTd} TD, ${p.passInt} INT`])} />
          <Section title="Rushing" theme={theme} rows={top(t, "rushYds", 2).map((p) => [name(p), `${p.rushAtt} car, ${p.rushYds} yds${p.rushTd ? `, ${p.rushTd} TD` : ""}`])} />
          <Section title="Receiving" theme={theme} rows={top(t, "recYds", 3).map((p) => [name(p), `${p.rec} rec, ${p.recYds} yds${p.recTd ? `, ${p.recTd} TD` : ""}`])} />
          <Section
            title="Defense"
            theme={theme}
            rows={top(t, "tackles", 3).map((p) => [name(p), `${p.tackles} tkl${p.sacks ? `, ${p.sacks} sack${p.sacks === 1 ? "" : "s"}` : ""}${p.defInt ? `, ${p.defInt} INT` : ""}`])}
          />
        </View>
      ))}
    </ScrollView>
  );
}

function Section({ title, rows, theme }: { title: string; rows: string[][]; theme: Theme }) {
  const s = styles(theme);
  if (rows.length === 0) return null;
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {rows.map(([who, line]) => (
        <View key={who} style={s.leader}>
          <Text style={s.leaderName}>{who}</Text>
          <Text style={s.leaderLine}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    wrap: { padding: 16, gap: 12, paddingBottom: 40 },
    card: { padding: 12, backgroundColor: t.card, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border },
    cardTitle: { fontSize: 15, fontWeight: "700", color: t.text, marginBottom: 4 },
    row: { flexDirection: "row", alignItems: "center", paddingVertical: 3 },
    head: { color: t.muted, fontSize: 12, fontWeight: "600" },
    teamCol: { flex: 1, color: t.text, fontWeight: "700" },
    cell: { width: 30, textAlign: "center", color: t.muted, fontVariant: ["tabular-nums"] },
    total: { width: 36, textAlign: "right", color: t.text, fontWeight: "800", fontVariant: ["tabular-nums"] },
    statLabel: { flex: 1, color: t.muted, fontSize: 14 },
    statVal: { width: 84, textAlign: "right", color: t.text, fontSize: 14, fontVariant: ["tabular-nums"] },
    section: { marginTop: 8 },
    sectionTitle: { fontSize: 12, fontWeight: "700", color: t.accent, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
    leader: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2, gap: 8 },
    leaderName: { color: t.text, fontSize: 14, fontWeight: "600" },
    leaderLine: { flexShrink: 1, color: t.muted, fontSize: 13, textAlign: "right" },
  });
