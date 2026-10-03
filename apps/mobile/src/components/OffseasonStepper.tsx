// Where you are in the offseason: six stages in order, the ones behind you
// checked, this one highlighted. Shown above every offseason screen (solo and
// online), so the offseason reads as one guided path.
import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme";

export const OFFSEASON_STEPS = [
  { key: "staff", short: "Staff", long: "Staff decisions" },
  { key: "hire", short: "Hire", long: "Staff hires" },
  { key: "resign", short: "Re-sign", long: "Re-signings" },
  { key: "draft", short: "Draft", long: "The draft" },
  { key: "freeagency", short: "Signings", long: "Free agency" },
  { key: "cuts", short: "Cuts", long: "Roster cuts" },
] as const;
export type OffseasonStepKey = (typeof OFFSEASON_STEPS)[number]["key"];

export function OffseasonStepper({ step, note }: { step: OffseasonStepKey; note?: string }) {
  const t = useTheme();
  const at = OFFSEASON_STEPS.findIndex((s) => s.key === step);
  return (
    <View style={{ backgroundColor: t.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8 }}>
      <Text style={{ color: t.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>
        Offseason · step {at + 1} of {OFFSEASON_STEPS.length}
      </Text>
      <Text style={{ color: t.text, fontSize: 17, fontWeight: "800", marginTop: 1 }}>
        {OFFSEASON_STEPS[at]!.long}
        {note ? <Text style={{ color: t.muted, fontSize: 13, fontWeight: "400" }}> · {note}</Text> : null}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 8 }}>
        {OFFSEASON_STEPS.map((s, i) => {
          const done = i < at;
          const here = i === at;
          return (
            <View key={s.key} style={{ flex: 1, alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", alignSelf: "stretch" }}>
                <View style={{ flex: 1, height: 2, backgroundColor: i === 0 ? "transparent" : i <= at ? t.accent : t.border }} />
                <View
                  style={{
                    width: here ? 20 : 16,
                    height: here ? 20 : 16,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: done || here ? t.accent : t.bg,
                    borderWidth: done || here ? 0 : 1.5,
                    borderColor: t.border,
                  }}
                >
                  {done ? <Ionicons name="checkmark" size={11} color={t.onAccent} /> : here ? <Text style={{ color: t.onAccent, fontSize: 10, fontWeight: "900" }}>{i + 1}</Text> : null}
                </View>
                <View style={{ flex: 1, height: 2, backgroundColor: i === OFFSEASON_STEPS.length - 1 ? "transparent" : i < at ? t.accent : t.border }} />
              </View>
              <Text style={{ color: here ? t.text : t.muted, fontSize: 10, fontWeight: here ? "800" : "500", marginTop: 3 }} numberOfLines={1}>
                {s.short}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
