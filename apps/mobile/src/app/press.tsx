// After each game: one question from the press, three ways to answer. What
// you say moves the fans (and, if you answer to an owner, his trust).
import { Stack } from "expo-router";
import { Pressable, ScrollView, Text } from "react-native";
import { Card, SectionTitle } from "../components/ui";
import { useDynasty } from "../league/LeagueProvider";
import { useTheme } from "../theme";

export default function PressScreen() {
  const t = useTheme();
  const d = useDynasty();
  const p = d.press;
  const answered = p ? d.save?.office?.press[p.week] : undefined;
  return (
    <>
      <Stack.Screen options={{ title: "Press conference" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {!p ? (
          <Text style={{ color: t.muted }}>No press conference right now. There's one after each of your games.</Text>
        ) : (
          <Card>
            <SectionTitle>After week {p.week}</SectionTitle>
            <Text style={{ color: t.text, fontWeight: "700", fontSize: 17, marginBottom: 10 }}>"{p.question}"</Text>
            {answered === undefined ? (
              p.answers.map((a, i) => (
                <Pressable key={i} onPress={() => d.answerPress(i)} accessibilityRole="button" style={({ pressed }) => ({ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: t.border, marginBottom: 8, opacity: pressed ? 0.6 : 1 })}>
                  <Text style={{ color: t.text }}>{a.text}</Text>
                </Pressable>
              ))
            ) : (
              <>
                <Text style={{ color: t.muted }}>You said: "{p.answers[answered]!.text}"</Text>
                <Text style={{ color: t.accent, marginTop: 6 }}>{p.answers[answered]!.reaction}</Text>
              </>
            )}
          </Card>
        )}
      </ScrollView>
    </>
  );
}
