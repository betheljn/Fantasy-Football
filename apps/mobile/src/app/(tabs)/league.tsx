// The league: every game's score, the standings, the Top 25 and every team,
// as sections of one tab.
import { useState } from "react";
import { View } from "react-native";
import { Segmented } from "../../components/ui";
import { ScoresSection } from "../../screens/league/Scores";
import { StandingsSection } from "../../screens/league/Standings";
import { Top25Section } from "../../screens/league/Top25";
import { TeamsSection } from "../../screens/league/Teams";

const SECTIONS = [
  { key: "scores", label: "Scores" },
  { key: "standings", label: "Standings" },
  { key: "top25", label: "Top 25" },
  { key: "teams", label: "Teams" },
] as const;
type Section = (typeof SECTIONS)[number]["key"];

export default function LeagueTab() {
  const [section, setSection] = useState<Section>("scores");
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 }}>
        <Segmented options={SECTIONS} value={section} onChange={setSection} />
      </View>
      <View style={{ flex: 1 }}>
        {section === "scores" ? <ScoresSection /> : section === "standings" ? <StandingsSection /> : section === "top25" ? <Top25Section /> : <TeamsSection />}
      </View>
    </View>
  );
}
