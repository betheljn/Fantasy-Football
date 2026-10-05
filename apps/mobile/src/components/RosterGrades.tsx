// Players needed: a roster's grades, A+ to F (each the average score of the
// players in it, on a curve against the league), with the positions it most
// needs first, then every position group and the traits teams win with.
// While drafting there's no overall grade, only each position's.
import { Text, View } from "react-native";
import type { Grade, RosterReport } from "@dynasty/sim";
import { useTheme, type Theme } from "../theme";
import { Card, SectionTitle } from "./ui";

export function gradeColor(t: Theme, g: Grade): string {
  return g.startsWith("A") ? t.good : g.startsWith("B") ? t.accent : g.startsWith("C") ? t.text : g.startsWith("D") ? t.warn : t.score;
}

export function GradeBadge({ grade, size = 30 }: { grade: Grade; size?: number }) {
  const t = useTheme();
  const c = gradeColor(t, grade);
  return (
    <View style={{ minWidth: size, height: size, paddingHorizontal: 4, borderRadius: size / 4, borderWidth: 2, borderColor: c, alignItems: "center", justifyContent: "center" }} accessibilityLabel={`Grade ${grade}`}>
      <Text style={{ color: c, fontWeight: "900", fontSize: size * 0.45 }}>{grade}</Text>
    </View>
  );
}

export function RosterGrades({ report, drafting }: { report: RosterReport; drafting?: boolean }) {
  const t = useTheme();
  const needs = report.positions.filter((p) => report.needs.includes(p.position)).sort((a, b) => report.needs.indexOf(a.position) - report.needs.indexOf(b.position));
  const weakTraits = report.traits.filter((x) => /^[DF]|C-/.test(x.grade));
  return (
    <View style={{ gap: 12 }}>
      {drafting ? (
        <Text style={{ color: t.muted, fontSize: 12 }}>
          {"Each position's grade is the average of its players (open spots count as 40), against the league: average is a C."}
        </Text>
      ) : (
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <GradeBadge grade={report.overall.grade} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontSize: 17, fontWeight: "800" }}>Roster grade</Text>
            <Text style={{ color: t.muted, fontSize: 12 }}>{`Average player ${report.overall.score} across 72 spots, graded against the league: average is a C.`}</Text>
          </View>
        </Card>
      )}

      <Card>
        <SectionTitle>Players needed</SectionTitle>
        {needs.length === 0 ? <Text style={{ color: t.muted }}>Every position is filled and holding its own.</Text> : null}
        {needs.slice(0, 6).map((p) => (
          <View key={p.position} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 5 }}>
            <GradeBadge grade={p.grade} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: "700" }}>{p.position}</Text>
              <Text style={{ color: t.muted, fontSize: 12 }}>
                {p.have < p.starters
                  ? `Needs ${p.starters - p.have} more starter${p.starters - p.have === 1 ? "" : "s"} (${p.have} of ${p.target})`
                  : p.short > 0
                    ? `Thin: ${p.have} of ${p.target}, needs ${p.short} more for depth`
                    : `Weak group: average ${p.score}`}
              </Text>
            </View>
          </View>
        ))}
        {weakTraits.length ? <Text style={{ color: t.muted, fontSize: 12, marginTop: 6 }}>Weak spots: {weakTraits.map((x) => `${x.label} (${x.grade})`).join(", ")}</Text> : null}
      </Card>

      <Card>
        <SectionTitle>By position</SectionTitle>
        {report.positions.map((p) => (
          <View key={p.position} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4, gap: 10 }}>
            <Text style={{ width: 30, color: t.text, fontWeight: "700" }}>{p.position}</Text>
            <Text style={{ flex: 1, color: p.short > 0 ? t.warn : t.muted, fontSize: 13 }}>
              {p.have} of {p.target}
            </Text>
            <Text style={{ width: 44, textAlign: "right", color: t.muted, fontVariant: ["tabular-nums"], fontSize: 13 }}>{p.score.toFixed(1)}</Text>
            <GradeBadge grade={p.grade} size={26} />
          </View>
        ))}
      </Card>

      <Card>
        <SectionTitle>Strengths and weaknesses</SectionTitle>
        <Text style={{ color: t.muted, fontSize: 12, marginBottom: 4 }}>The ratings behind each, averaged over your starters.</Text>
        {[...report.traits]
          .sort((a, b) => b.score - a.score)
          .map((x) => (
            <View key={x.key} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4, gap: 10 }}>
              <Text style={{ flex: 1, color: t.text }}>{x.label}</Text>
              <Text style={{ width: 44, textAlign: "right", color: t.muted, fontVariant: ["tabular-nums"], fontSize: 13 }}>{x.score.toFixed(1)}</Text>
              <GradeBadge grade={x.grade} size={26} />
            </View>
          ))}
      </Card>
    </View>
  );
}
