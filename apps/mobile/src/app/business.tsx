// The business: your market, your fans, your stadium, this season's home
// crowds, and last season's books. (The salary cap is the same for every
// team; market size only changes the business.)
import { Stack } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  BOND,
  BUSINESS_RULES,
  POPULATION,
  PROJECTS,
  attendance,
  economy,
  formatMoney,
  homeGates,
  interest,
  marketSize,
  namingAvailable,
  namingOffers,
  projectCost,
  projectProblems,
  startBusiness,
  type ProjectKind,
  type SeasonFinances,
  type TeamBusiness,
} from "@dynasty/sim";
import { Card, SectionTitle, Stat, StatRow, TeamBanner } from "../components/ui";
import { teamColors } from "../field/colors";
import { useDynasty, useLeague } from "../league/LeagueProvider";
import { useTheme, type Theme } from "../theme";

const SIZE_NOTE = {
  large: "A big market: lots of fans and local money, but casual fans leave when you lose.",
  mid: "A mid-size market: a solid base with room to grow.",
  small: "A small market: fewer fans but loyal ones, and a bigger revenue-sharing check.",
} as const;

export default function BusinessScreen() {
  const t = useTheme();
  const d = useDynasty();
  const { league, userTeam, results } = useLeague();
  const team = league.teams[userTeam]!;
  const dynasty = d.save!.dynasty;
  const b = dynasty.business?.[userTeam] ?? startBusiness(team, league.seed);
  const last = dynasty.finances?.[userTeam]?.at(-1) ?? null;
  const lastPct = dynasty.lastWinPct?.get(userTeam) ?? 0.5;
  const econ = economy(league.seed, league.season);
  const gates = useMemo(() => homeGates(team, b, results, lastPct, econ), [team, b, results, lastPct, econ]);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const say = (problems: string[], ok: string) => setMessage(problems.length ? { text: problems.join(" "), good: false } : { text: ok, good: true });
  const wins = results.filter((r) => r.winner === userTeam).length;
  const played = results.filter((r) => r.home === userTeam || r.away === userTeam).length;
  const keen = interest(played ? wins / played : lastPct, lastPct);
  const size = marketSize(userTeam);
  const avg = gates.length ? Math.round(gates.reduce((n, g) => n + g.attendance, 0) / gates.length) : null;

  return (
    <>
      <Stack.Screen options={{ title: "Business" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <TeamBanner abbr={userTeam} title={`${size.charAt(0).toUpperCase()}${size.slice(1)} market`} subtitle={`${team.state} · ${POPULATION[userTeam]}M people. ${SIZE_NOTE[size]}`}>
          <StatRow>
            <Stat label="Cash" value={formatMoney(b.cash)} onDark={teamColors(userTeam).onPrimary} />
            <Stat label="Die-hards" value={`${b.fans.dieHard.toLocaleString()}k`} onDark={teamColors(userTeam).onPrimary} />
            <Stat label="Seats" value={`${Math.round(b.stadium.capacity / 1000)}k`} onDark={teamColors(userTeam).onPrimary} />
          </StatRow>
        </TeamBanner>

        <Card>
          <SectionTitle>Fans</SectionTitle>
          <Row label="Die-hards (come no matter what)" value={`${b.fans.dieHard.toLocaleString()}k`} theme={t} />
          <Row label="Casual fans (follow winning)" value={`${b.fans.casual.toLocaleString()}k`} theme={t} />
        </Card>

        <Card>
          <SectionTitle>{b.stadium.name}</SectionTitle>
          <Row label="Capacity" value={b.stadium.capacity.toLocaleString()} theme={t} />
          <Row label="Amenities" value={`${b.stadium.quality} / 100`} theme={t} />
          <Row label="Roof" value={b.stadium.dome ? "Dome" : "Open air"} theme={t} />
          {b.stadium.debt > 0 ? <Row label="Stadium debt" value={formatMoney(b.stadium.debt)} theme={t} /> : null}
          <Row label="Ticket price" value={`$${b.ticketPrice}`} theme={t} />
          <Row label="Concessions per fan" value={`$${b.concessionPrice}`} theme={t} />
        </Card>

        <Card>
          <SectionTitle>Home crowds this season</SectionTitle>
          {gates.length === 0 ? <Text style={{ color: t.muted }}>No home games yet.</Text> : null}
          {gates.map((g) => (
            <View key={g.week} style={{ flexDirection: "row", paddingVertical: 2 }}>
              <Text style={{ width: 70, color: t.muted }}>Week {g.week}</Text>
              <Text style={{ flex: 1, color: t.text }}>vs {g.opponent}</Text>
              <Text style={{ color: g.sellout ? t.accent : t.text, fontWeight: g.sellout ? "800" : "400", fontVariant: ["tabular-nums"] }}>
                {g.attendance.toLocaleString()}
                {g.sellout ? " · sellout" : ""}
              </Text>
            </View>
          ))}
          {avg !== null ? <Text style={{ color: t.muted, marginTop: 4 }}>Average {avg.toLocaleString()} ({Math.round((avg / b.stadium.capacity) * 100)}% full)</Text> : null}
        </Card>

        {message ? <Text style={{ color: message.good ? t.accent : t.score, fontWeight: "700" }}>{message.text}</Text> : null}

        <Prices b={b} keen={keen} econ={econ} locked={gates.length > 0} onSave={(tk, cn) => say(d.setPrices(tk, cn), `Prices set: $${tk} a ticket, $${cn} at the concession stands.`)} theme={t} />

        <Card>
          <SectionTitle>Stadium projects</SectionTitle>
          <Text style={{ color: t.muted, marginBottom: 6 }}>
            Work starts now and opens next season. Bonds cost {Math.round(BOND.interest * 100)}% interest a year and pay down {Math.round(BOND.principal * 100)}% of the debt each season.
          </Text>
          {(b.pending ?? []).map((p) => (
            <Text key={p.kind} style={{ color: t.accent, fontWeight: "700", paddingVertical: 2 }}>
              Under way: {PROJECTS[p.kind].name} ({formatMoney(p.cost)}, {p.financing}), opens next season
            </Text>
          ))}
          {(Object.keys(PROJECTS) as ProjectKind[]).map((kind) => {
            const cost = projectCost(kind, userTeam);
            const blocked = projectProblems(b, kind, userTeam, "bonds").length > 0 && projectProblems(b, kind, userTeam, "cash").length > 0;
            return (
              <View key={kind} style={{ paddingVertical: 6, borderTopWidth: 1, borderColor: t.border }}>
                <Text style={{ color: t.text, fontWeight: "700" }}>
                  {PROJECTS[kind].name} · {formatMoney(cost)}
                </Text>
                <Text style={{ color: t.muted, fontSize: 13 }}>{PROJECTS[kind].does}</Text>
                {!blocked ? (
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                    <Small label="Pay cash" onPress={() => say(d.startStadiumProject(kind, "cash"), `${PROJECTS[kind].name}: under way, paid in cash.`)} disabled={projectProblems(b, kind, userTeam, "cash").length > 0} theme={t} />
                    <Small label="Use bonds" onPress={() => say(d.startStadiumProject(kind, "bonds"), `${PROJECTS[kind].name}: under way, paid with bonds.`)} disabled={projectProblems(b, kind, userTeam, "bonds").length > 0} theme={t} />
                  </View>
                ) : (
                  <Text style={{ color: t.muted, fontSize: 12 }}>{projectProblems(b, kind, userTeam, "bonds")[0]}</Text>
                )}
              </View>
            );
          })}
        </Card>

        <Card>
          <SectionTitle>Naming rights</SectionTitle>
          {namingAvailable(b, league.season) ? (
            <>
              <Text style={{ color: t.muted, marginBottom: 6 }}>Local companies want their name on your stadium:</Text>
              {namingOffers(league.seed, userTeam, league.season).map((o) => (
                <View key={o.sponsor} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}>
                  <Text style={{ flex: 1, color: t.text }}>
                    <Text style={{ fontWeight: "700" }}>{o.sponsor}</Text>: {formatMoney(o.perYear)} a year for {o.years} years
                  </Text>
                  <Small label="Accept" onPress={() => say(d.acceptNamingOffer(o), `Welcome to ${o.sponsor} ${b.stadium.name.split(" ").at(-1)}.`)} theme={t} />
                </View>
              ))}
            </>
          ) : (
            <Text style={{ color: t.text }}>
              {b.stadium.naming!.sponsor} pays {formatMoney(b.stadium.naming!.perYear)} a year, through {b.stadium.naming!.through}.
            </Text>
          )}
        </Card>

        {last ? <Books f={last} theme={t} /> : <Text style={{ color: t.muted }}>Your first books close at the end of this season.</Text>}
        <Text style={{ color: t.muted, fontSize: 12 }}>
          Every team gets the same national TV money ({Math.round(BUSINESS_RULES.nationalMedia * 100)}% of the salary cap) and {Math.round(BUSINESS_RULES.sharing * 100)}% of local revenue is shared evenly. The salary cap is the same for every team.
        </Text>
      </ScrollView>
    </>
  );
}

function Books({ f, theme: t }: { f: SeasonFinances; theme: Theme }) {
  const income = Object.values(f.revenue).reduce((a, b) => a + b, 0);
  const spent = Object.values(f.expenses).reduce((a, b) => a + b, 0);
  return (
    <Card>
      <SectionTitle>{f.season} books</SectionTitle>
      <Text style={{ color: t.muted, fontWeight: "700", marginTop: 2 }}>Revenue {formatMoney(income)}</Text>
      <Row label="National TV" value={formatMoney(f.revenue.nationalMedia)} theme={t} />
      <Row label="Revenue sharing" value={formatMoney(f.revenue.sharing)} theme={t} />
      <Row label="Tickets" value={formatMoney(f.revenue.tickets)} theme={t} />
      <Row label="Concessions" value={formatMoney(f.revenue.concessions)} theme={t} />
      <Row label="Merchandise" value={formatMoney(f.revenue.merch)} theme={t} />
      <Row label="Local sponsors" value={formatMoney(f.revenue.sponsors)} theme={t} />
      <Row label="Local radio and TV" value={formatMoney(f.revenue.localMedia)} theme={t} />
      {f.revenue.suites ? <Row label="Luxury suites" value={formatMoney(f.revenue.suites)} theme={t} /> : null}
      {f.revenue.naming ? <Row label="Naming rights" value={formatMoney(f.revenue.naming)} theme={t} /> : null}
      <Text style={{ color: t.muted, fontWeight: "700", marginTop: 8 }}>Expenses {formatMoney(spent)}</Text>
      <Row label="Player payroll" value={formatMoney(f.expenses.payroll)} theme={t} />
      <Row label="Coaches and staff" value={formatMoney(f.expenses.staff)} theme={t} />
      <Row label="Stadium operations" value={formatMoney(f.expenses.stadium)} theme={t} />
      {f.expenses.debt ? <Row label="Debt payments" value={formatMoney(f.expenses.debt)} theme={t} /> : null}
      <Row label="Profit" value={formatMoney(f.profit)} theme={t} bold bad={f.profit < 0} />
      <Text style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>
        {f.attendance.toLocaleString()} fans at home ({f.sellouts} sellout{f.sellouts === 1 ? "" : "s"}). Local revenue shown after the shared portion.
      </Text>
    </Card>
  );
}

function Prices({ b, keen, econ, locked, onSave, theme: t }: { b: TeamBusiness; keen: number; econ: number; locked: boolean; onSave: (ticket: number, concessions: number) => void; theme: Theme }) {
  const [ticket, setTicket] = useState(b.ticketPrice);
  const [conc, setConc] = useState(b.concessionPrice);
  const crowd = attendance({ ...b, ticketPrice: ticket }, keen, econ);
  const gate = (crowd * (ticket + conc)) / 1000;
  return (
    <Card>
      <SectionTitle>Prices</SectionTitle>
      {locked ? <Text style={{ color: t.muted, marginBottom: 6 }}>Set for the season (the first home game has been played). You can change them in the offseason.</Text> : null}
      <Stepper label="Ticket" value={ticket} step={5} onChange={setTicket} disabled={locked} theme={t} />
      <Stepper label="Concessions per fan" value={conc} step={2} onChange={setConc} disabled={locked} theme={t} />
      <Text style={{ color: t.muted, marginTop: 6 }}>
        At these prices: about {crowd.toLocaleString()} a game ({Math.round((crowd / b.stadium.capacity) * 100)}% full), {formatMoney(gate)} at the gate and the stands.
      </Text>
      {!locked ? (
        <View style={{ flexDirection: "row", marginTop: 8 }}>
          <Small label="Set prices" onPress={() => onSave(ticket, conc)} disabled={ticket === b.ticketPrice && conc === b.concessionPrice} theme={t} />
        </View>
      ) : null}
    </Card>
  );
}

function Stepper({ label, value, step, onChange, disabled, theme: t }: { label: string; value: number; step: number; onChange: (v: number) => void; disabled: boolean; theme: Theme }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 3, gap: 8 }}>
      <Text style={{ flex: 1, color: t.muted }}>{label}</Text>
      {!disabled ? <Small label="−" onPress={() => onChange(Math.max(5, value - step))} theme={t} /> : null}
      <Text style={{ width: 52, textAlign: "center", color: t.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>${value}</Text>
      {!disabled ? <Small label="+" onPress={() => onChange(value + step)} theme={t} /> : null}
    </View>
  );
}

function Small({ label, onPress, disabled, theme: t }: { label: string; onPress: () => void; disabled?: boolean; theme: Theme }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={{ paddingHorizontal: 12, height: 32, borderRadius: 8, justifyContent: "center", borderWidth: 1, borderColor: t.accent, opacity: disabled ? 0.35 : 1 }}>
      <Text style={{ color: t.accent, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

function Row({ label, value, theme: t, bold, bad }: { label: string; value: string; theme: Theme; bold?: boolean; bad?: boolean }) {
  return (
    <View style={{ flexDirection: "row", paddingVertical: 2 }}>
      <Text style={{ flex: 1, color: t.muted }}>{label}</Text>
      <Text style={{ color: bad ? t.score : t.text, fontWeight: bold ? "800" : "500", fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}
