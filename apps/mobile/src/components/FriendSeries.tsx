// Head-to-head between friends (online leagues): a team's series against each
// other friend's team, every season, with their last meeting.
import { Text, View } from "react-native";
import { friendSeries, type FriendGame } from "@dynasty/sim";
import { teamShort } from "../field/colors";
import { useTheme } from "../theme";
import { Card, SectionTitle, Swatch } from "./ui";

export function FriendSeriesCard({ team, friends, games, title = "Against your friends" }: { team: string; friends: readonly string[]; games: readonly FriendGame[]; title?: string }) {
  const t = useTheme();
  const rows = friends
    .filter((f) => f !== team)
    .map((f) => ({ f, s: friendSeries(games, team, f), last: [...games].reverse().find((g) => (g.home === team && g.away === f) || (g.home === f && g.away === team)) }))
    .filter((r) => r.s.games > 0);
  if (rows.length === 0) return null;
  return (
    <Card style={{ gap: 6 }}>
      <SectionTitle>{title}</SectionTitle>
      {rows.map(({ f, s, last }) => {
        const [w, l] = [s.wins[team]!, s.wins[f]!];
        const lastLine = last ? `${last.season}${last.duel ? " duel" : ""}: ${teamShort(last.away)} ${last.awayScore}, ${teamShort(last.home)} ${last.homeScore}` : "";
        return (
          <View key={f} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 }}>
            <Swatch abbr={f} size={22} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: "700" }}>vs {teamShort(f)}</Text>
              <Text style={{ color: t.muted, fontSize: 12 }}>Last: {lastLine}</Text>
            </View>
            <Text style={{ color: w > l ? t.accent : w < l ? t.score : t.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
              {w}-{l}
              {s.ties ? `-${s.ties}` : ""}
            </Text>
          </View>
        );
      })}
    </Card>
  );
}
