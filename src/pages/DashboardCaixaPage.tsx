/**
 * DashboardCaixaPage v5 — Realizado + Projeção Futura
 * Realizado: agendamentos com startTime <= agora (exceto cancelados/no_show)
 * Projeção:  agendamentos futuros (exceto cancelados/no_show)
 */
import { useState, useMemo } from "react";
import { useStoreVersion } from "@/hooks/useStoreVersion";
import {
  format, subDays, subWeeks, subMonths, subYears,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfYear, endOfYear, parseISO, isWithinInterval, addDays,
  startOfDay, endOfDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  TrendingUp, TrendingDown, BarChart2, Award, Calendar, Clock,
  CheckCircle, X, ChevronRight, GitCompare,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from "recharts";
import { employeesStore } from "@/features/funcionarios";
import { appointmentsStore } from "@/features/agenda";

const toNum = (v: unknown) => parseFloat(String(v ?? 0)) || 0;

type Period =
  | "hoje" | "semana" | "mes" | "trimestre" | "ano"
  | "semana_passada" | "mes_passado" | "trimestre_passado" | "ano_passado";
type FuturePeriod = "semana" | "mes" | "trimestre";
type CompareMode = "mensal" | "anual";

function getPeriodRange(period: Period) {
  const now = new Date();
  switch (period) {
    case "hoje":      return { start: startOfDay(now), end: now, label: "Hoje" };
    case "semana":    return { start: startOfWeek(now, { locale: ptBR }), end: now, label: "Esta semana" };
    case "mes":       return { start: startOfMonth(now), end: now, label: "Este mês" };
    case "trimestre": return { start: subDays(now, 90), end: now, label: "Últimos 90 dias" };
    case "ano":       return { start: startOfYear(now), end: now, label: "Este ano" };
    case "semana_passada": {
      const lw = subWeeks(now, 1);
      return { start: startOfWeek(lw, { locale: ptBR }), end: endOfWeek(lw, { locale: ptBR }), label: "Semana passada" };
    }
    case "mes_passado": {
      const lm = subMonths(now, 1);
      return { start: startOfMonth(lm), end: endOfMonth(lm), label: "Mês passado" };
    }
    case "trimestre_passado":
      return { start: subDays(now, 180), end: subDays(now, 90), label: "90 dias anteriores" };
    case "ano_passado": {
      const ly = subYears(now, 1);
      return { start: startOfYear(ly), end: endOfYear(ly), label: "Ano passado" };
    }
  }
}

function getFutureRange(period: FuturePeriod) {
  const now = new Date();
  switch (period) {
    case "semana":    return { start: now, end: endOfWeek(now, { locale: ptBR }), label: "Esta semana" };
    case "mes":       return { start: now, end: endOfMonth(now), label: "Este mês" };
    case "trimestre": return { start: now, end: addDays(now, 90), label: "Próximos 90 dias" };
  }
}

function Sparkline({ data, color = "#ec4899" }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const w = 80; const h = 28;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => `${i * step},${h - (v / max) * h}`).join(" ");
  return (
    <svg width={w} height={h} className="opacity-70">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function EmpModal({ emp, appts, onClose }: {
  emp: { id: number; name: string; color: string; commissionPercent: number };
  appts: any[];
  onClose: () => void;
}) {
  const now = new Date();
  const realized = appts.filter(a => parseISO(a.startTime) <= now);
  const future   = appts.filter(a => parseISO(a.startTime) > now);
  const realRev  = realized.reduce((s, a) => s + toNum(a.totalPrice), 0);
  const futRev   = future.reduce((s, a) => s + toNum(a.totalPrice), 0);
  const commission = realRev * (emp.commissionPercent / 100);

  const last7: { label: string; revenue: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = subDays(now, i);
    const key = format(d, "yyyy-MM-dd");
    const rev = realized
      .filter(a => format(parseISO(a.startTime), "yyyy-MM-dd") === key)
      .reduce((s, a) => s + toNum(a.totalPrice), 0);
    last7.push({ label: format(d, "dd/MM"), revenue: rev });
  }
  const maxRev = Math.max(...last7.map(d => d.revenue), 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl p-5 space-y-4"
        style={{ background: "hsl(240 6% 10%)", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: emp.color }} />
            <h3 className="font-bold text-white">{emp.name.split(" ")[0]}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10">
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.05)" }}>
            <p className="text-[10px] text-muted-foreground">Realizado</p>
            <p className="text-base font-bold" style={{ color: emp.color }}>R$ {realRev.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground">{realized.length} atend.</p>
          </div>
          <div className="rounded-xl p-3" style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}>
            <p className="text-[10px] text-muted-foreground">Projeção</p>
            <p className="text-base font-bold text-amber-400">R$ {futRev.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground">{future.length} agend.</p>
          </div>
          <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.05)" }}>
            <p className="text-[10px] text-muted-foreground">Comissão</p>
            <p className="text-base font-bold text-purple-400">R$ {commission.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground">{emp.commissionPercent}%</p>
          </div>
          <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.05)" }}>
            <p className="text-[10px] text-muted-foreground">Total previsto</p>
            <p className="text-base font-bold text-emerald-400">R$ {(realRev + futRev).toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground">{realized.length + future.length} total</p>
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-2">Últimos 7 dias</p>
          <div className="space-y-1.5">
            {last7.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-9">{d.label}</span>
                <div className="flex-1 h-4 rounded bg-secondary/30 overflow-hidden">
                  <div className="h-full rounded transition-all" style={{
                    width: `${(d.revenue / maxRev) * 100}%`,
                    backgroundColor: emp.color,
                  }} />
                </div>
                <span className="text-[10px] font-bold w-16 text-right">R$ {d.revenue.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardCaixaPage() {
  const [period, setPeriod]             = useState<Period>("mes");
  const [futurePeriod, setFuturePeriod] = useState<FuturePeriod>("semana");
  const [compareMode, setCompareMode]   = useState<CompareMode>("mensal");
  const [selectedEmpId, setSelectedEmpId] = useState<number | null>(null);
  const storeVersion = useStoreVersion();

  const employees = useMemo(() => employeesStore.list(false), [storeVersion]);
  const allAppts  = useMemo(() => appointmentsStore.list({}), [storeVersion]);
  const now       = new Date();

  const { start, end, label }      = getPeriodRange(period);
  const periodEnd                  = end < now ? end : now;
  const { start: fStart, end: fEnd, label: fLabel } = getFutureRange(futurePeriod);

  const isActive = (a: any) =>
    !["cancelled", "no_show"].includes(a.status) && toNum(a.totalPrice) > 0.01;

  const realizedAppts = useMemo(() =>
    allAppts.filter(a => isActive(a) && parseISO(a.startTime) >= start && parseISO(a.startTime) <= periodEnd),
    [allAppts, start, periodEnd]
  );

  const futureAppts = useMemo(() =>
    allAppts.filter(a => isActive(a) && parseISO(a.startTime) > now
      && parseISO(a.startTime) <= fEnd),
    [allAppts, fEnd]
  );

  const realRevenue     = realizedAppts.reduce((s, a) => s + toNum(a.totalPrice), 0);
  const realCommissions = realizedAppts.reduce((s, a) => {
    const emp = employees.find(e => e.id === a.employeeId);
    return s + (emp ? toNum(a.totalPrice) * (emp.commissionPercent / 100) : 0);
  }, 0);
  const realNet    = realRevenue - realCommissions;
  const realTicket = realizedAppts.length > 0 ? realRevenue / realizedAppts.length : 0;

  const futRevenue     = futureAppts.reduce((s, a) => s + toNum(a.totalPrice), 0);
  const futCommissions = futureAppts.reduce((s, a) => {
    const emp = employees.find(e => e.id === a.employeeId);
    return s + (emp ? toNum(a.totalPrice) * (emp.commissionPercent / 100) : 0);
  }, 0);
  const futNet = futRevenue - futCommissions;

  const prevDiff  = periodEnd.getTime() - start.getTime();
  const prevStart = new Date(start.getTime() - prevDiff);
  const prevRev   = allAppts
    .filter(a => isActive(a) && parseISO(a.startTime) >= prevStart && parseISO(a.startTime) < start)
    .reduce((s, a) => s + toNum(a.totalPrice), 0);
  const revDelta = prevRev > 0 ? ((realRevenue - prevRev) / prevRev) * 100 : null;

  const sparkData = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = format(subDays(periodEnd, 6 - i), "yyyy-MM-dd");
      return realizedAppts
        .filter(a => format(parseISO(a.startTime), "yyyy-MM-dd") === d)
        .reduce((s, a) => s + toNum(a.totalPrice), 0);
    }), [realizedAppts, periodEnd]
  );

  const last7Days = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = subDays(periodEnd, 6 - i);
      const key = format(d, "yyyy-MM-dd");
      const dayAppts = realizedAppts.filter(a => format(parseISO(a.startTime), "yyyy-MM-dd") === key);
      return { label: format(d, "dd/MM"), revenue: dayAppts.reduce((s, a) => s + toNum(a.totalPrice), 0), count: dayAppts.length };
    }), [realizedAppts, periodEnd]
  );
  const maxDay = Math.max(...last7Days.map(d => d.revenue), 1);

  // ─── Dados Comparativos ────────────────────────────────────
  // Calcula faturamento, comissões e líquido para uma janela de tempo
  const aggregateRange = (s: Date, e: Date) => {
    const appts = allAppts.filter(a => isActive(a) && parseISO(a.startTime) >= s && parseISO(a.startTime) <= e);
    const faturamento = appts.reduce((sum, a) => sum + toNum(a.totalPrice), 0);
    const comissao = appts.reduce((sum, a) => {
      const emp = employees.find(em => em.id === a.employeeId);
      return sum + (emp ? toNum(a.totalPrice) * (emp.commissionPercent / 100) : 0);
    }, 0);
    return { faturamento, comissao, liquido: faturamento - comissao, atendimentos: appts.length };
  };

  const monthlyData = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => {
      const md = subMonths(now, 11 - i);
      const ms = startOfMonth(md);
      const me = endOfMonth(md);
      const agg = aggregateRange(ms, me);
      return { label: format(md, "MMM/yy", { locale: ptBR }), ...agg };
    }), [allAppts, employees]
  );

  const yearlyData = useMemo(() => {
    const years = new Set<number>();
    for (const a of allAppts) {
      if (isActive(a)) years.add(parseISO(a.startTime).getFullYear());
    }
    const sorted = [...years].sort();
    const lastFew = sorted.slice(-5); // últimos 5 anos com dados
    return lastFew.map(y => {
      const ys = new Date(y, 0, 1, 0, 0, 0);
      const ye = new Date(y, 11, 31, 23, 59, 59);
      const agg = aggregateRange(ys, ye);
      return { label: String(y), ...agg };
    });
  }, [allAppts, employees]);

  const compareData = compareMode === "mensal" ? monthlyData : yearlyData;
  const totalCompFat = compareData.reduce((s, d) => s + d.faturamento, 0);
  const totalCompLiq = compareData.reduce((s, d) => s + d.liquido, 0);

  const futureDays = useMemo(() => {
    const days = Math.ceil((fEnd.getTime() - now.getTime()) / 86400000);
    return Array.from({ length: Math.min(days, 90) }, (_, i) => {
      const d = addDays(now, i + 1);
      const key = format(d, "yyyy-MM-dd");
      const dayAppts = futureAppts.filter(a => format(parseISO(a.startTime), "yyyy-MM-dd") === key);
      return { label: format(d, "EEE dd/MM", { locale: ptBR }), revenue: dayAppts.reduce((s, a) => s + toNum(a.totalPrice), 0), count: dayAppts.length };
    }).filter(d => d.revenue > 0);
  }, [futureAppts, fEnd]);
  const maxFutDay = Math.max(...futureDays.map(d => d.revenue), 1);

  const byEmpRealized = useMemo(() =>
    employees.map(emp => {
      const appts = realizedAppts.filter(a => a.employeeId === emp.id);
      const revenue = appts.reduce((s, a) => s + toNum(a.totalPrice), 0);
      return { emp, revenue, commission: revenue * (emp.commissionPercent / 100), count: appts.length };
    }).filter(e => e.revenue > 0).sort((a, b) => b.revenue - a.revenue),
    [employees, realizedAppts]
  );

  const byEmpFuture = useMemo(() =>
    employees.map(emp => {
      const appts = futureAppts.filter(a => a.employeeId === emp.id);
      const revenue = appts.reduce((s, a) => s + toNum(a.totalPrice), 0);
      return { emp, revenue, commission: revenue * (emp.commissionPercent / 100), count: appts.length };
    }).filter(e => e.revenue > 0).sort((a, b) => b.revenue - a.revenue),
    [employees, futureAppts]
  );

  const selectedEmp = selectedEmpId !== null ? employees.find(e => e.id === selectedEmpId) : null;
  const selectedAppts = selectedEmpId !== null ? allAppts.filter(a => isActive(a) && a.employeeId === selectedEmpId) : [];

  const PERIODS: { key: Period; label: string }[] = [
    { key: "hoje", label: "Hoje" }, { key: "semana", label: "Semana" },
    { key: "mes", label: "Mês" }, { key: "trimestre", label: "90 dias" },
    { key: "ano", label: "Ano" },
  ];
  const PAST_PERIODS: { key: Period; label: string }[] = [
    { key: "semana_passada",    label: "Sem. passada" },
    { key: "mes_passado",       label: "Mês passado" },
    { key: "trimestre_passado", label: "90d ant." },
    { key: "ano_passado",       label: "Ano passado" },
  ];
  const FUTURE_PERIODS: { key: FuturePeriod; label: string }[] = [
    { key: "semana", label: "Semana" }, { key: "mes", label: "Mês" }, { key: "trimestre", label: "90 dias" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-primary" />Dashboard Financeiro
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">Realizado até agora + Projeção futura</p>
      </div>

      {/* REALIZADO */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold text-emerald-400">Realizado</span>
            <span className="text-xs text-muted-foreground">— {label}</span>
          </div>
          <div className="flex gap-1 flex-wrap">
            {PERIODS.map(p => (
              <Button key={p.key} size="sm" variant={period === p.key ? "default" : "ghost"}
                className="h-6 text-xs px-2" onClick={() => setPeriod(p.key)}>{p.label}</Button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap -mt-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Anteriores</span>
          <div className="flex gap-1 flex-wrap">
            {PAST_PERIODS.map(p => (
              <Button key={p.key} size="sm" variant={period === p.key ? "default" : "outline"}
                className="h-6 text-xs px-2" onClick={() => setPeriod(p.key)}>{p.label}</Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">Faturamento</p>
              <p className="text-xl font-bold text-primary">R$ {realRevenue.toFixed(2)}</p>
              <div className="flex items-center justify-between mt-1">
                {revDelta !== null ? (
                  <span className={`text-[10px] flex items-center gap-0.5 ${revDelta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {revDelta >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                    {Math.abs(revDelta).toFixed(1)}% vs ant.
                  </span>
                ) : <span />}
                <Sparkline data={sparkData} color="#ec4899" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">Líquido</p>
              <p className="text-xl font-bold text-emerald-400">R$ {realNet.toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {realRevenue > 0 ? `${((realNet / realRevenue) * 100).toFixed(1)}% do bruto` : "—"}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border bg-card/50">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">Comissões</p>
              <p className="text-xl font-bold text-purple-400">R$ {realCommissions.toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{realizedAppts.length} atend.</p>
            </CardContent>
          </Card>
          <Card className="border-border bg-card/50">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">Ticket médio</p>
              <p className="text-xl font-bold">R$ {realTicket.toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{realizedAppts.length} atend.</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Últimos 7 dias</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {last7Days.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-10">{d.label}</span>
                  <div className="flex-1 h-5 bg-secondary/30 rounded overflow-hidden">
                    <div className="h-full bg-primary rounded transition-all" style={{ width: `${(d.revenue / maxDay) * 100}%` }} />
                  </div>
                  <span className="text-xs font-bold w-20 text-right">R$ {d.revenue.toFixed(2)}</span>
                  <span className="text-[10px] text-muted-foreground w-6">{d.count}x</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Award className="w-4 h-4 text-primary" />Ranking — Realizado
            </CardTitle>
          </CardHeader>
          <CardContent>
            {byEmpRealized.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum dado no período</p>
            ) : (
              <div className="space-y-3">
                {byEmpRealized.map((e, i) => (
                  <div key={e.emp.id} className="flex items-center gap-2 cursor-pointer hover:bg-white/5 rounded-lg p-1 transition-colors"
                    onClick={() => setSelectedEmpId(e.emp.id)}>
                    <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}°</span>
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: e.emp.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{e.emp.name.split(" ")[0]}</span>
                        <span className="text-sm font-bold text-primary">R$ {e.revenue.toFixed(2)}</span>
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{
                          width: `${byEmpRealized[0] ? (e.revenue / byEmpRealized[0].revenue) * 100 : 0}%`,
                          backgroundColor: e.emp.color,
                        }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{e.count} atend. · Comissão: R$ {e.commission.toFixed(2)}</p>
                    </div>
                    <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* COMPARATIVO HISTÓRICO */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-blue-400/30" />
          <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold text-blue-400"
            style={{ background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.3)" }}>
            <GitCompare className="w-3 h-3" />COMPARATIVO HISTÓRICO
          </div>
          <div className="flex-1 h-px bg-blue-400/30" />
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-blue-400" />
            <span className="font-semibold text-blue-400">
              {compareMode === "mensal" ? "Últimos 12 meses" : "Histórico anual"}
            </span>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant={compareMode === "mensal" ? "default" : "ghost"}
              className="h-6 text-xs px-2" onClick={() => setCompareMode("mensal")}>Mensal</Button>
            <Button size="sm" variant={compareMode === "anual" ? "default" : "ghost"}
              className="h-6 text-xs px-2" onClick={() => setCompareMode("anual")}>Anual</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Card className="border-blue-400/20 bg-blue-400/5">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">Faturamento total</p>
              <p className="text-xl font-bold text-blue-400">R$ {totalCompFat.toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {compareMode === "mensal" ? `${compareData.length} meses` : `${compareData.length} ano(s)`}
              </p>
            </CardContent>
          </Card>
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">Líquido total</p>
              <p className="text-xl font-bold text-emerald-400">R$ {totalCompLiq.toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">após comissões</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-blue-400/20 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              Faturamento × Líquido — {compareMode === "mensal" ? "Mensal" : "Anual"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {compareData.length === 0 || totalCompFat === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sem dados suficientes</p>
            ) : (
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={compareData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
                    <Tooltip
                      contentStyle={{ background: "hsl(240 6% 10%)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number) => `R$ ${v.toFixed(2)}`}
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="faturamento" name="Faturamento" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="liquido"     name="Líquido"     fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="comissao"    name="Comissões"   fill="#a78bfa" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-blue-400/20 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Detalhamento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-white/5">
                    <th className="text-left py-2 pr-2 font-medium">Período</th>
                    <th className="text-right py-2 px-2 font-medium">Faturamento</th>
                    <th className="text-right py-2 px-2 font-medium">Comissões</th>
                    <th className="text-right py-2 px-2 font-medium">Líquido</th>
                    <th className="text-right py-2 pl-2 font-medium">Atend.</th>
                  </tr>
                </thead>
                <tbody>
                  {compareData.map((d, i) => {
                    const prev = i > 0 ? compareData[i - 1] : null;
                    const delta = prev && prev.faturamento > 0
                      ? ((d.faturamento - prev.faturamento) / prev.faturamento) * 100
                      : null;
                    return (
                      <tr key={i} className="border-b border-white/5 last:border-0">
                        <td className="py-2 pr-2 capitalize font-medium">{d.label}</td>
                        <td className="py-2 px-2 text-right text-blue-400 font-semibold">
                          R$ {d.faturamento.toFixed(2)}
                          {delta !== null && Math.abs(delta) >= 0.1 && (
                            <span className={`ml-1 text-[10px] ${delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {delta >= 0 ? "↑" : "↓"}{Math.abs(delta).toFixed(0)}%
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right text-purple-400">R$ {d.comissao.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right text-emerald-400 font-semibold">R$ {d.liquido.toFixed(2)}</td>
                        <td className="py-2 pl-2 text-right text-muted-foreground">{d.atendimentos}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DIVISÓRIA */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-amber-400/30" />
        <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold text-amber-400"
          style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)" }}>
          <Clock className="w-3 h-3" />PROJEÇÃO FUTURA
        </div>
        <div className="flex-1 h-px bg-amber-400/30" />
      </div>

      {/* PROJEÇÃO */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="font-semibold text-amber-400">Projeção</span>
            <span className="text-xs text-muted-foreground">— {fLabel}</span>
          </div>
          <div className="flex gap-1 flex-wrap">
            {FUTURE_PERIODS.map(p => (
              <Button key={p.key} size="sm" variant={futurePeriod === p.key ? "default" : "ghost"}
                className="h-6 text-xs px-2" onClick={() => setFuturePeriod(p.key)}>{p.label}</Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Card className="border-amber-400/20 bg-amber-400/5">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">Faturamento previsto</p>
              <p className="text-xl font-bold text-amber-400">R$ {futRevenue.toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{futureAppts.length} agendamento(s)</p>
            </CardContent>
          </Card>
          <Card className="border-amber-400/10 bg-card/50">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">Líquido previsto</p>
              <p className="text-xl font-bold text-emerald-400">R$ {futNet.toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">após comissões</p>
            </CardContent>
          </Card>
          <Card className="border-amber-400/10 bg-card/50">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">Total geral</p>
              <p className="text-xl font-bold text-white">R$ {(realRevenue + futRevenue).toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">realizado + previsto</p>
            </CardContent>
          </Card>
        </div>

        {futureDays.length > 0 && (
          <Card className="border-amber-400/20 bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400" />Agenda futura
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {futureDays.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-20 capitalize">{d.label}</span>
                    <div className="flex-1 h-5 rounded overflow-hidden" style={{ background: "rgba(251,191,36,0.1)" }}>
                      <div className="h-full rounded transition-all" style={{
                        width: `${(d.revenue / maxFutDay) * 100}%`,
                        background: "rgba(251,191,36,0.6)",
                      }} />
                    </div>
                    <span className="text-xs font-bold w-20 text-right text-amber-400">R$ {d.revenue.toFixed(2)}</span>
                    <span className="text-[10px] text-muted-foreground w-6">{d.count}x</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {byEmpFuture.length > 0 && (
          <Card className="border-amber-400/20 bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />Ranking — Projeção
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {byEmpFuture.map((e, i) => (
                  <div key={e.emp.id} className="flex items-center gap-2 cursor-pointer hover:bg-white/5 rounded-lg p-1 transition-colors"
                    onClick={() => setSelectedEmpId(e.emp.id)}>
                    <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}°</span>
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: e.emp.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{e.emp.name.split(" ")[0]}</span>
                        <span className="text-sm font-bold text-amber-400">R$ {e.revenue.toFixed(2)}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(251,191,36,0.15)" }}>
                        <div className="h-full rounded-full" style={{
                          width: `${byEmpFuture[0] ? (e.revenue / byEmpFuture[0].revenue) * 100 : 0}%`,
                          background: "rgba(251,191,36,0.7)",
                        }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{e.count} agend. previstos</p>
                    </div>
                    <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {selectedEmp && (
        <EmpModal emp={selectedEmp} appts={selectedAppts} onClose={() => setSelectedEmpId(null)} />
      )}
    </div>
  );
}

