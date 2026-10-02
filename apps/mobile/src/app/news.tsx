// The news: each week's biggest stories around the league, and everything
// about your team (your game's recap and a look at the next one).
import { Stack } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StoryCard } from "../components/story";
import { useDynasty, useLeague } from "../league/LeagueProvider";
import { useTheme } from "../theme";

export default function NewsScreen() {
  const t = useTheme();
  const d = useDynasty();
  const { userTeam, league } = useLeague();
  const all = d.save?.news ?? [];
  const weeks = useMemo(() => [...new Set(all.map((s) => s.week))].sort((a, b) => b - a), [all]);
  const [week, setWeek] = useState<number | null>(null);
  const [view, setView] = useState<"national" | "local">("national");
  const shown = week ?? weeks[0] ?? null;
  const stories = all.filter((s) => s.week === shown && (view === "national" ? !s.local : s.teams.includes(userTeam))).sort((a, b) => b.importance - a.importance);

  return (
    <>
      <Stack.Screen options={{ title: "News" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {(
            [
              ["national", "Around the league"],
              ["local", league.teams[userTeam]!.nickname],
            ] as const
          ).map(([key, label]) => (
            <Pressable key={key} onPress={() => setView(key)} accessibilityRole="button" style={{ paddingHorizontal: 12, height: 32, borderRadius: 16, justifyContent: "center", backgroundColor: view === key ? t.accent : t.card, borderWidth: 1, borderColor: t.border }}>
              <Text style={{ color: view === key ? t.onAccent : t.text, fontWeight: "700", fontSize: 13 }}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {weeks.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {weeks.map((w) => (
              <Pressable key={w} onPress={() => setWeek(w)} accessibilityRole="button" style={{ paddingHorizontal: 10, height: 28, borderRadius: 14, justifyContent: "center", borderWidth: 1, borderColor: shown === w ? t.accent : t.border }}>
                <Text style={{ color: shown === w ? t.accent : t.muted, fontWeight: "700", fontSize: 12 }}>Week {w}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        {shown === null ? <Text style={{ color: t.muted }}>The news starts once the first week is played.</Text> : null}
        {shown !== null && stories.length === 0 ? <Text style={{ color: t.muted }}>{view === "local" ? "A quiet week for your team (a bye?)." : "No stories this week."}</Text> : null}
        {stories.map((s, i) => (
          <StoryCard key={s.id} s={s} lead={i === 0} mine={s.teams.includes(userTeam)} theme={t} />
        ))}
      </ScrollView>
    </>
  );
}
