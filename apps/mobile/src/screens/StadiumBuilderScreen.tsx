// Build your program's stadium: the roof, the field, the stands and the name.
// It's part of building the program (nothing to pay now; a roof costs more to
// run every season), and every choice plays on game day. You can rebuild any
// of it later from the stadium screen, through the business engine.
import { useState } from "react";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";
import {
  ROOF_NAMES,
  ROOF_NOTES,
  STANDS_NAMES,
  STANDS_NOTES,
  SURFACE_NAMES,
  SURFACE_NOTES,
  designProblem,
  designedStadium,
  type Roof,
  type Stadium,
  type StadiumDesign,
  type Stands,
  type Surface,
} from "@dynasty/sim";
import { Button, Card, Chips, Field, SectionTitle, StickyFooter } from "../components/ui";
import { StadiumView } from "../field/StadiumView";
import { useTheme } from "../theme";

export function StadiumBuilderScreen({ stadium, colors, initial, onBack, onDone, nextLabel = "Next: your head coach" }: { stadium: Stadium; colors: { primary: string; trim: string }; initial?: StadiumDesign; onBack: () => void; onDone: (d: StadiumDesign) => void; nextLabel?: string }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const [roof, setRoof] = useState<Roof>(initial?.roof ?? "open");
  const [surface, setSurface] = useState<Surface>(initial?.surface ?? "grass");
  const [stands, setStands] = useState<Stands>(initial?.stands ?? "classic");
  const [name, setName] = useState(initial?.name ?? stadium.name);
  // Grass won't grow under a dome.
  const field: Surface = roof === "dome" ? "turf" : surface;
  const design: StadiumDesign = { roof, surface: field, stands, name };
  const problem = designProblem(design);
  const preview = designedStadium(stadium, { ...design, name: name.trim() || stadium.name });
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text onPress={onBack} style={{ color: t.accent, fontWeight: "700" }}>‹ Back</Text>
        <Text style={{ fontSize: 22, fontWeight: "800", color: t.text }}>Your stadium</Text>
        <Text style={{ color: t.muted }}>Build it the way you want to play. Every choice shows up on game day; you can rebuild any of it later.</Text>
        <View style={{ alignItems: "center" }}>
          <StadiumView stadium={preview} colors={colors} width={Math.min(width - 32, 440)} />
        </View>
        <Card style={{ gap: 6 }}>
          <SectionTitle>Roof</SectionTitle>
          <Chips options={(["open", "retractable", "dome"] as const).map((k) => ({ key: k, label: ROOF_NAMES[k] }))} value={roof} onChange={setRoof} />
          <Text style={{ color: t.muted, fontSize: 12 }}>{ROOF_NOTES[roof]}</Text>
        </Card>
        <Card style={{ gap: 6 }}>
          <SectionTitle>Field</SectionTitle>
          <Chips options={(["grass", "turf"] as const).map((k) => ({ key: k, label: SURFACE_NAMES[k] }))} value={field} onChange={setSurface} />
          <Text style={{ color: t.muted, fontSize: 12 }}>{roof === "dome" ? "Under a dome it's turf. " : ""}{SURFACE_NOTES[field]}</Text>
        </Card>
        <Card style={{ gap: 6 }}>
          <SectionTitle>Stands</SectionTitle>
          <Chips options={(["classic", "steep"] as const).map((k) => ({ key: k, label: STANDS_NAMES[k] }))} value={stands} onChange={setStands} />
          <Text style={{ color: t.muted, fontSize: 12 }}>{STANDS_NOTES[stands]}</Text>
          <Text style={{ color: t.muted, fontSize: 12 }}>{`${preview.capacity.toLocaleString("en-US")} seats`}</Text>
        </Card>
        <Card style={{ gap: 6 }}>
          <SectionTitle>Name</SectionTitle>
          <Field label="Stadium name" value={name} onChangeText={setName} />
        </Card>
      </ScrollView>
      <StickyFooter note={problem ?? undefined}>
        <Button label={nextLabel} onPress={() => onDone({ ...design, name: name.trim() })} primary disabled={!!problem} />
      </StickyFooter>
    </View>
  );
}
