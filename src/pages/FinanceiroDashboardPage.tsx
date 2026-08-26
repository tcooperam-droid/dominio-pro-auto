/**
 * FinanceiroDashboardPage — Dashboard financeiro unificado.
 * Fonte de verdade: agenda (appointmentsStore). Despesas: expensesStore.
 * Realizado vs Projeção nunca se misturam.
 */
import { useState, useMemo, useEffect } from "react";
import {
  format, parseISO, subDays, subWeeks,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useLocation } from "wouter";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, Users, Scissors,
  AlertCircle, AlertTriangle, CheckCircle, Info, ChevronRight,
  Calendar, Clock, Award,
} from "lucide-react";
import { appointmentsStore, fetchAllData, retryFetchAllData } from "@/features/agenda";
import { employeesStore } from "@/features/funcionarios";
import { expensesStore } from "@/features/financeiro";
import { clientsStore } from "@/features/clientes";
import {
  calcPeriodStats, calcRevenueByDay, calcRevenueByEmployee,
  calcTopClients, calcConversionRate, calcMostProfitableServices,
  calcWeeklyRevenue, calcInactiveClients, getPeriodDates,
  getAppointmentsInPeriod, toNum, isFinancialAppointment, calcCommission,
} from "@/features/relatorios";
import { Button } from "@/components/ui/button";
import { useStoreVersion } from "@/hooks/useStoreVersion";
import { localDateKey } from "@/lib/agentSchedule";

function getAccent() {
  try { return JSON.parse(localStorage.getItem("salon_config") || "{}").accentColor || "#ec4899"; }
  catch { return "#ec4899"; }
}
function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtPct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

type PeriodKey = "hoje" | "semana" | "semana_passada" | "mes" | "trimestre" | "ano";
type FuturePeriod = "semana" | "mes" | "trimestre";

function getPeriodRange(key: PeriodKey) {
  if (key === "semana_passada") {
    const lw = subWeeks(new Date(), 1);
    return {
      start: startOfWeek(lw, { weekStartsOn: 1 }),
      end:   endOfWeek(lw,   { weekStartsOn: 1 }),
      label: "Sem. passada",
    };
  }
  return getPeriodDates(key as any);
}

function getFutureRange(period: FuturePeriod, now = new Date()) {
  switch (period) {
    case "semana":    return { start: now, end: endOfWeek(now, { weekStartsOn: 1 }), label: "Esta semana" };
    case "mes":       return { start: now, end: endOfMonth(now), label: "Este mês" };
    case "trimestre": return { start: now, end: addDays(now, 90), label: "Próximos 90 dias" };
  }
}

const PERIOD_TABS: { value: PeriodKey; label: string }[] = [
  { value: "hoje",           label: "Hoje"       },
  { value: "semana",         label: "Semana"     },
  { value: "semana_passada", label: "Sem. passada" },
  { value: "mes",            label: "Mês"        },
  { value: "trimestre",      label: "90 dias"    },
  { value: "ano",            label: "Ano"        },
];

const FUTURE_TABS: { value: FuturePeriod; label: string }[] = [
  { value: "semana",    label: "Semana"  },
  { value: "mes",       label: "Mês"    },
  { value: "trimestre", label: "90 dias" },
];

export default function FinanceiroDashboardPage() {
  const accent = getAccent();
  const [, setLocation] = useLocation();
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>("mes");
  const [futurePeriod, setFuturePeriod]     = useState<FuturePeriod>("semana");
  const [showInactive, setShowInactive]     = useState(false);
  const [dataVersion, setDataVersion]       = useState(0);
  const [retryVersion, setRetryVersion]     = useState(0);
  const [loading, setLoading]               = useState(true);
  const [failedSources, setFailedSources]   = useState<string[]>([]);
  const [clockVersion, setClockVersion]     = useState(0);
  const storeVersion = useStoreVersion();

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setFailedSources([]);

    const load = retryVersion > 0 ? retryFetchAllData() : fetchAllData();
    load.then(result => {
      if (!mounted) return;
      setFailedSources(result.failed);
      setDataVersion(version => version + 1);
      setLoading(false);
    }).catch(error => {
      if (!mounted) return;
      console.warn("[Financeiro] Não foi possível carregar a Agenda:", error);
      setFailedSources(["bootstrap"]);
      setLoading(false);
    });

    return () => { mounted = false; };
  }, [retryVersion]);

  // Atualiza períodos e projeções quando o app permanece aberto durante a
  // passagem do tempo, sem fazer novas alterações no Supabase.
  useEffect(() => {
    const timer = window.setInterval(() => setClockVersion(version => version + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const allAppts    = useMemo(() => appointmentsStore.list({}), [dataVersion, storeVersion]);
  const employees   = useMemo(() => employeesStore.list(true), [dataVersion, storeVersion]);
  const allExpenses = useMemo(() => expensesStore.list(), [dataVersion, storeVersion]);
  const clients     = useMemo(() => clientsStore.list(), [dataVersion, storeVersion]);

  const now      = useMemo(() => new Date(), [clockVersion]);
  const todayStr = localDateKey(now) ?? "";
  const dataLoading = loading && allAppts.length === 0;
  const agendaUnavailable = !loading &&
    (failedSources.includes("agendamentos") || failedSources.includes("bootstrap")) &&
    allAppts.length === 0;

  // ── Ranges ───────────────────────────────────────────────
  const { start: pStart, end: pEnd, label: pLabel } = useMemo(
    () => getPeriodRange(selectedPeriod),
    [selectedPeriod, clockVersion]
  );
  const periodEnd = pEnd < now ? pEnd : now; // para períodos passados usar pEnd, actuais usar now

  const { end: fEnd, label: fLabel } = useMemo(
    () => getFutureRange(futurePeriod, now),
    [futurePeriod, clockVersion]
  );

  const isActive = (a: any) => isFinancialAppointment(a);

  // ── KPIs dos 6 períodos simultâneos ──────────────────────
  const multiPeriodStats = useMemo(() => {
    return PERIOD_TABS.map(({ value, label }) => {
      const { start, end } = getPeriodRange(value);
      const cutoff = end < now ? end : now;
      const appts = allAppts.filter(a => {
        try {
          const d = parseISO(a.startTime);
          return d >= start && d <= cutoff && isFinancialAppointment(a);
        } catch { return false; }
      });
      const revenue   = appts.reduce((s, a) => s + toNum(a.totalPrice), 0);
      const count     = appts.length;
      const avgTicket = count > 0 ? revenue / count : 0;
      return { period: value, label, revenue, count, avgTicket };
    });
  }, [allAppts, now]);

  // ── Realizado no período seleccionado ────────────────────
  const periodAppts = useMemo(
    () => allAppts.filter(a => {
      try {
        const d = parseISO(a.startTime);
        return d >= pStart && d <= periodEnd && isFinancialAppointment(a);
      } catch { return false; }
    }),
    [pStart, periodEnd, allAppts]
  );

  const pStats = useMemo(
    () => calcPeriodStats(periodAppts, employees),
    [periodAppts, employees]
  );

  const periodExpenses = useMemo(() => {
    const s = localDateKey(pStart) ?? "";
    const e = localDateKey(periodEnd) ?? "";
    return allExpenses.filter(ex => ex.date >= s && ex.date <= e && ex.status === "paga");
  }, [allExpenses, pStart, periodEnd]);

  const totalExpenses = periodExpenses.reduce((s, e) => s + e.amount, 0);
  const lucroReal     = pStats.totalRevenue - pStats.totalMaterial - pStats.totalCommissions - totalExpenses;
  const margem        = pStats.totalRevenue > 0 ? (lucroReal / pStats.totalRevenue) * 100 : 0;

  // ── Agendamentos futuros (projeção) ──────────────────────
  const futureAppts = useMemo(() =>
    allAppts.filter(a =>
      isActive(a) && parseISO(a.startTime) > now && parseISO(a.startTime) <= fEnd
    ), [allAppts, fEnd, now]
  );

  const futRevenue     = futureAppts.reduce((s, a) => s + toNum(a.totalPrice), 0);
  const futCommissions = futureAppts.reduce((s, a) => {
      const emp = employees.find(e => e.id === a.employeeId);
    return s + (emp ? calcCommission(a, emp) : 0);
  }, 0);
  const futNet = futRevenue - futCommissions;

  // Dias com agendamentos futuros
  const futureDays = useMemo(() => {
    const days = Math.ceil((fEnd.getTime() - now.getTime()) / 86400000);
    return Array.from({ length: Math.min(days, 90) }, (_, i) => {
      const d   = addDays(now, i + 1);
      const key = format(d, "yyyy-MM-dd");
      const dayAppts = futureAppts.filter(a => format(parseISO(a.startTime), "yyyy-MM-dd") === key);
      return {
        label:   format(d, "EEE dd/MM", { locale: ptBR }),
        revenue: dayAppts.reduce((s, a) => s + toNum(a.totalPrice), 0),
        count:   dayAppts.length,
      };
    }).filter(d => d.revenue > 0);
  }, [futureAppts, fEnd, now]);
  const maxFutDay = Math.max(...futureDays.map(d => d.revenue), 1);

  // Ranking por funcionário — projeção
  const byEmpFuture = useMemo(() =>
    employees.map(emp => {
      const appts   = futureAppts.filter(a => a.employeeId === emp.id);
      const revenue = appts.reduce((s, a) => s + toNum(a.totalPrice), 0);
      return { emp, revenue, commission: appts.reduce((sum, a) => sum + calcCommission(a, emp), 0), count: appts.length };
    }).filter(e => e.revenue > 0).sort((a, b) => b.revenue - a.revenue),
    [employees, futureAppts]
  );

  // ── Gráficos históricos ───────────────────────────────────
  const pastAppts = useMemo(() =>
    allAppts.filter(a => {
      try { return parseISO(a.startTime) <= now && isFinancialAppointment(a); }
      catch { return false; }
    }), [allAppts, now]);

  const revenueByDay   = useMemo(() => calcRevenueByDay(pastAppts, 30), [pastAppts, now]);
  const revenueByEmp   = useMemo(() => calcRevenueByEmployee(periodAppts, employees), [periodAppts, employees]);
  const topClients     = useMemo(() => calcTopClients(periodAppts, 10), [periodAppts]);
  const profitServices = useMemo(() => calcMostProfitableServices(pastAppts).slice(0, 8), [pastAppts]);

  // ── Alertas ──────────────────────────────────────────────
  const convRate       = useMemo(() => calcConversionRate(pastAppts), [pastAppts]);
  const inactiveClients= useMemo(
    () => calcInactiveClients(allAppts, 90, clients, 150),
    [allAppts, clients, now],
  );
  const overdueExpenses= useMemo(() => allExpenses.filter(e => e.status === "pendente" && e.date < todayStr), [allExpenses, todayStr]);
  const weeklyData     = useMemo(() => calcWeeklyRevenue(pastAppts, 5, now), [pastAppts, now]);
  const thisWeekRev    = weeklyData[weeklyData.length - 1]?.revenue ?? 0;
  const prevAvg        = weeklyData.slice(0, 4).reduce((s, w) => s + w.revenue, 0) / 4;
  const weekVsPrev     = prevAvg > 0 ? ((thisWeekRev - prevAvg) / prevAvg) * 100 : 0;

  const cardStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(20px)",
    borderRadius: 16,
    padding: 20,
  };
  const projStyle: React.CSSProperties = {
    background: "rgba(245,158,11,0.06)",
    border: "1px solid rgba(245,158,11,0.15)",
    backdropFilter: "blur(20px)",
    borderRadius: 16,
    padding: 20,
  };

  if (dataLoading) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <TrendingUp className="w-5 h-5" style={{ color: accent }} />
            Painel Financeiro
          </h2>
          <p className="text-sm text-muted-foreground">Carregando os dados da Agenda…</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-sm text-muted-foreground animate-pulse">
          Sincronizando faturamento, projeções e comissões…
        </div>
      </div>
    );
  }

  if (agendaUnavailable) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <TrendingUp className="w-5 h-5" style={{ color: accent }} />
            Painel Financeiro
          </h2>
          <p className="text-sm text-muted-foreground">A Agenda é a fonte de verdade do Financeiro.</p>
        </div>
        <div className="rounded-2xl border border-red-400/20 bg-red-400/[0.08] p-5 space-y-3">
          <p className="text-sm text-red-300">Não foi possível carregar os agendamentos. Os indicadores não serão apresentados como zero.</p>
          <Button size="sm" onClick={() => setRetryVersion(version => version + 1)}>Tentar novamente</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <TrendingUp className="w-5 h-5" style={{ color: accent }} />
          Painel Financeiro
        </h2>
          <p className="text-sm text-muted-foreground">Baseado nos agendamentos da Agenda</p>
        </div>
        {loading && allAppts.length > 0 && (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-muted-foreground">
            Atualizando os dados da Agenda…
          </div>
        )}
        {failedSources.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.08] px-4 py-3">
            <p className="text-sm text-amber-300">
              Algumas fontes não foram atualizadas: {failedSources.join(", ")}.
            </p>
            <Button size="sm" variant="outline" onClick={() => setRetryVersion(version => version + 1)}>
              Tentar novamente
            </Button>
          </div>
        )}

      {/* ── Alertas proativos ── */}
      <div className="space-y-2">
        {weekVsPrev >= 10 && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
            <TrendingUp className="w-4 h-4 text-green-400 flex-shrink-0" />
            <p className="text-sm text-green-400">
              Semana actual {fmtPct(weekVsPrev)} acima da média das 4 semanas anteriores 🎉
            </p>
          </div>
        )}
        {inactiveClients.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl cursor-pointer"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
            onClick={() => setShowInactive(v => !v)}>
            <div className="flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-400">{inactiveClients.length} cliente(s) entre 91 e 150 dias sem visita</p>
            </div>
            <ChevronRight className={`w-4 h-4 text-red-400 transition-transform ${showInactive ? "rotate-90" : ""}`} />
          </div>
        )}
        {showInactive && inactiveClients.length > 0 && (
          <div style={{ ...cardStyle, borderColor: "rgba(239,68,68,0.15)" }} className="space-y-1">
            <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
              {inactiveClients.map((c, i) => (
                <div key={i}
                  className="flex items-center justify-between text-sm py-2 px-1 rounded-lg cursor-pointer hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                  onClick={() => setLocation(`/clientes?search=${encodeURIComponent(c.clientName)}`)}
                >
                  <span className="font-medium">{c.clientName}</span>
                  <span className="text-red-400 text-xs shrink-0 ml-2">{c.daysSince} dias sem visita</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground text-right pt-1">Exibindo somente ausências entre 91 e 150 dias</p>
          </div>
        )}
        {overdueExpenses.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
            onClick={() => setLocation("/despesas")}>
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-400">
              {overdueExpenses.length} despesa(s) atrasada(s) · {fmt(overdueExpenses.reduce((s, e) => s + e.amount, 0))} em aberto
            </p>
            <ChevronRight className="w-4 h-4 text-red-400 ml-auto" />
          </div>
        )}
      </div>

      {/* ── REALIZADO — 6 períodos ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle className="w-4 h-4 text-green-400" />
          <span className="text-sm font-semibold text-green-400 uppercase tracking-wider">Realizado</span>
        </div>
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-3" style={{ minWidth: "max-content" }}>
            {multiPeriodStats.map(({ period, label, revenue, count, avgTicket }) => (
              <div key={period}
                className={`cursor-pointer transition-all ${selectedPeriod === period ? "ring-2" : ""}`}
                style={{
                  ...cardStyle,
                  minWidth: 160,
                  ...(selectedPeriod === period ? {
                    border: `1px solid ${accent}50`,
                    boxShadow: `0 0 20px ${accent}20`,
                  } : {}),
                }}
                onClick={() => setSelectedPeriod(period as PeriodKey)}>
                <p className="text-xs text-muted-foreground mb-2">{label}</p>
                <p className="text-lg font-bold">{fmt(revenue)}</p>
                <p className="text-xs text-muted-foreground mt-1">{count} atend. · ticket {fmt(avgTicket)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Breakdown financeiro do período ── */}
      <div style={cardStyle}>
          <p className="text-sm font-semibold mb-4">
          Resultado após custos cadastrados — {pLabel}
        </p>
        <div className="space-y-2">
          {[
            { label: "Faturamento bruto",    value:  pStats.totalRevenue,      color: "text-foreground" },
            { label: "- Custo de materiais", value: -pStats.totalMaterial,     color: "text-yellow-400" },
            { label: "- Comissões",          value: -pStats.totalCommissions,  color: "text-orange-400" },
            { label: "- Despesas pagas cadastradas", value: -totalExpenses, color: "text-red-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center justify-between py-1.5 border-b border-white/5">
              <span className="text-sm text-muted-foreground">{label}</span>
              <span className={`text-sm font-medium ${color}`}>
                {value < 0 ? `- ${fmt(Math.abs(value))}` : fmt(value)}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-3">
            <span className="font-bold">= Resultado líquido</span>
            <span className={`text-xl font-bold ${lucroReal >= 0 ? "text-green-400" : "text-red-400"}`}>{fmt(lucroReal)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Margem de lucro</span>
            <span className={`text-sm font-medium ${margem >= 0 ? "text-green-400" : "text-red-400"}`}>{margem.toFixed(1)}%</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Custos cadastrados no período</p>
            <button className="text-xs underline" style={{ color: accent }} onClick={() => setLocation("/despesas")}>Gerenciar →</button>
          </div>
          {totalExpenses === 0 && (
            <div className="mt-2 p-3 rounded-lg flex items-center gap-2"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <Info className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                Nenhuma despesa paga cadastrada neste período.{" "}
                <button className="underline" style={{ color: accent }} onClick={() => setLocation("/despesas")}>Cadastrar →</button>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Gráfico de faturamento diário ── */}
      <div style={cardStyle}>
        <p className="text-sm font-semibold mb-4">Faturamento diário — últimos 30 dias</p>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={revenueByDay}>
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} interval={4} />
            <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
            <Tooltip
              formatter={(v: number) => [fmt(v), "Faturamento"]}
              contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
            />
            <Line type="monotone" dataKey="revenue" stroke={accent} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Por funcionário ── */}
      {revenueByEmp.length > 0 && (
        <div style={cardStyle}>
          <p className="text-sm font-semibold mb-4">Por profissional — {pLabel}</p>
          <div className="space-y-3">
            {revenueByEmp.map(emp => (
              <div key={emp.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: emp.color }} />
                    <span className="text-sm font-medium">{emp.firstName}</span>
                    <span className="text-xs text-muted-foreground">{emp.count} atend.</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold">{fmt(emp.revenue)}</span>
                    <span className="text-xs text-muted-foreground ml-2">comissão {fmt(emp.commission)}</span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{
                    width: `${revenueByEmp[0].revenue > 0 ? (emp.revenue / revenueByEmp[0].revenue) * 100 : 0}%`,
                    background: emp.color,
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Serviços mais lucrativos ── */}
      {profitServices.length > 0 && (
        <div style={cardStyle}>
          <p className="text-sm font-semibold mb-4">Serviços mais lucrativos</p>
          <div className="space-y-2">
            {profitServices.map((svc, i) => (
              <div key={svc.serviceId} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: svc.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{svc.name}</p>
                  <p className="text-xs text-muted-foreground">{svc.count}x · {fmt(svc.revenue)}</p>
                </div>
                <span className="text-sm font-bold text-green-400">{svc.margin.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Top clientes ── */}
      {topClients.length > 0 && (
        <div style={cardStyle}>
          <p className="text-sm font-semibold mb-4">Clientes que mais gastaram — {pLabel}</p>
          <div className="space-y-2">
            {topClients.map((c, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: `${accent}20`, color: accent }}>
                  {c.clientName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.clientName}</p>
                  <p className="text-xs text-muted-foreground">{c.visitCount} visita(s) · ticket {fmt(c.avgTicket)}</p>
                </div>
                <span className="font-bold text-sm">{fmt(c.totalSpent)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── DIVISÓRIA PROJEÇÃO ── */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: "rgba(245,158,11,0.3)" }} />
        <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold text-amber-400"
          style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }}>
          <Clock className="w-3 h-3" />PROJEÇÃO FUTURA
        </div>
        <div className="flex-1 h-px" style={{ background: "rgba(245,158,11,0.3)" }} />
      </div>

      {/* ── Selector de período futuro ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-400" />
          <span className="font-semibold text-amber-400">Projeção</span>
          <span className="text-xs text-muted-foreground">— {fLabel}</span>
        </div>
        <div className="flex gap-1">
          {FUTURE_TABS.map(t => (
            <Button key={t.value} size="sm"
              variant={futurePeriod === t.value ? "default" : "ghost"}
              className="h-6 text-xs px-2"
              onClick={() => setFuturePeriod(t.value)}>{t.label}</Button>
          ))}
        </div>
      </div>

      {/* Cards projeção */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div style={{ ...projStyle, borderRadius: 12 }}>
          <p className="text-xs text-muted-foreground mb-1">Faturamento previsto</p>
          <p className="text-xl font-bold text-amber-400">{fmt(futRevenue)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{futureAppts.length} agendamento(s)</p>
        </div>
        <div style={{ ...projStyle, borderRadius: 12 }}>
          <p className="text-xs text-muted-foreground mb-1">Líquido previsto</p>
          <p className="text-xl font-bold text-green-400">{fmt(futNet)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">após comissões</p>
        </div>
        <div style={{ ...cardStyle, borderRadius: 12 }}>
          <p className="text-xs text-muted-foreground mb-1">Total geral</p>
          <p className="text-xl font-bold text-white">{fmt(pStats.totalRevenue + futRevenue)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">realizado + previsto</p>
        </div>
      </div>

      {/* Agenda futura por dia */}
      {futureDays.length > 0 && (
        <div style={projStyle}>
          <p className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-400" />Agenda futura
          </p>
          <div className="space-y-2">
            {futureDays.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-20 capitalize">{d.label}</span>
                <div className="flex-1 h-5 rounded overflow-hidden" style={{ background: "rgba(245,158,11,0.1)" }}>
                  <div className="h-full rounded transition-all"
                    style={{ width: `${(d.revenue / maxFutDay) * 100}%`, background: "rgba(245,158,11,0.6)" }} />
                </div>
                <span className="text-xs font-bold w-20 text-right text-amber-400">{fmt(d.revenue)}</span>
                <span className="text-[10px] text-muted-foreground w-5">{d.count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ranking por funcionário — projeção */}
      {byEmpFuture.length > 0 && (
        <div style={projStyle}>
          <p className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />Ranking — Projeção
          </p>
          <div className="space-y-3">
            {byEmpFuture.map((e, i) => (
              <div key={e.emp.id} className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}°</span>
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: e.emp.color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{e.emp.name.split(" ")[0]}</span>
                    <span className="text-sm font-bold text-amber-400">{fmt(e.revenue)}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(245,158,11,0.15)" }}>
                    <div className="h-full rounded-full" style={{
                      width: `${byEmpFuture[0] ? (e.revenue / byEmpFuture[0].revenue) * 100 : 0}%`,
                      background: "rgba(245,158,11,0.7)",
                    }} />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {e.count} agend. · comissão {fmt(e.commission)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nota de conversão */}
      <div className="flex items-center gap-2 p-3 rounded-lg"
        style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.12)" }}>
        <Info className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <p className="text-xs text-amber-400/80">
          Taxa de conversão histórica: {convRate == null
            ? <strong>sem dados suficientes</strong>
            : <><strong>{(convRate * 100).toFixed(0)}%</strong> dos últimos 90 dias</>}
        </p>
      </div>
    </div>
  );
}
