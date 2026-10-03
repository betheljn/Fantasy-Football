// The news: each week's biggest stories around the league, and everything
// about your team (your game's recap and a look at the next one).
import { Stack } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { StoryCard } from "../components/story";
import { Chips, EmptyState, Segmented } from "../components/ui";
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
      <Stack.Screen options={{ title: "Headlines" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Segmented
          options={[
            { key: "national", label: "Around the league" },
            { key: "local", label: league.teams[userTeam]!.nickname },
          ]}
          value={view}
          onChange={setView}
        />
        {weeks.length > 1 ? <Chips options={weeks.map((w) => ({ key: w, label: w === 0 ? "Spring" : `Week ${w}` }))} value={shown ?? weeks[0]!} onChange={setWeek} /> : null}
        {shown === null ? <EmptyState icon="newspaper-outline" title="The presses are warming up" body="Stories start once the first week is played." /> : null}
        {shown !== null && stories.length === 0 ? (
          <EmptyState icon="cafe-outline" title={view === "local" ? "A quiet week" : "No stories this week"} body={view === "local" ? "Nothing about your team this week (a bye?)." : undefined} />
        ) : null}
        <View style={{ gap: 10 }}>
          {stories.map((s, i) => (
            <StoryCard key={s.id} s={s} lead={i === 0} mine={s.teams.includes(userTeam)} theme={t} />
          ))}
        </View>
      </ScrollView>
    </>
  );
}
