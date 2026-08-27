/**
 * RelatoriosPage — Relatórios completos com comparativo de períodos e Visão Histórica.
 * Fonte de verdade: Agenda; agendamentos scheduled também valem, exceto cancelado/no-show.
 */
import { useEffect, useMemo, useState } from "react";
import { useStoreVersion } from "@/hooks/useStoreVersion";
import {
  addDays, endOfDay, endOfMonth, format, parseISO, startOfDay,
  startOfMonth, startOfYear, subMonths, subWeeks, subYears,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { 
  TrendingUp, Users, DollarSign, Award, Calendar, CalendarDays, Scissors,
  Percent, ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight, History, BarChart3
} from "lucide-react";
import { appointmentsStore } from "@/features/agenda";
import { employeesStore } from "@/features/funcionarios";
import {
  calcPeriodStats, calcFinancialSummary, calcRevenueByEmployee,
  calcPopularServices, getAppointmentsInPeriod,
  toNum, calcMonthlyHistory, calcYearlyHistory, isFinancialAppointment,
  calcPaidExpenses, expensesStore,
} from "@/features/relatorios";
import { cn } from "@/lib/utils";
import {
  getReportRange,
  shiftReportPeriod,
  type ReportGranularity,
} from "@/lib/reportPeriods";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const tooltipStyle = { backgroundColor: "hsl(240 6% 10%)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#fff", fontSize: 12 };
const tickStyle = { fontSize: 11, fill: "hsl(0 0% 55%)" };

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

export default function RelatoriosPage() {
  const [granularity, setGranularity] = useState<ReportGranularity>("mes");
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const [selectedEmp, setSelectedEmp] = useState<any | null>(null);
  const [now, setNow] = useState(() => new Date());
  const storeVersion = useStoreVersion();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const employees = useMemo(() => employeesStore.list(false), [storeVersion]);
  const allAppts = useMemo(() => appointmentsStore.list({}), [storeVersion]);
  const { start, end, label, shortLabel } = useMemo(
    () => getReportRange(granularity, cursorDate),
    [granularity, cursorDate],
  );
  const currentRange = getReportRange(granularity, now);
  const isCurrentRange = format(start, "yyyy-MM-dd") === format(currentRange.start, "yyyy-MM-dd");

  // Período anterior para comparação, com a mesma granularidade do período atual.
  const prevDates = useMemo(() => {
    if (granularity === "dia") {
      const previous = addDays(start, -1);
      return { start: startOfDay(previous), end: endOfDay(previous) };
    }
    if (granularity === "semana") {
      return { start: subWeeks(start, 1), end: subWeeks(end, 1) };
    }
    const previous = subMonths(start, 1);
    return { start: startOfMonth(previous), end: endOfMonth(previous) };
  }, [granularity, start, end]);

  // Realizado exclui o futuro; a projeção é calculada em separado no mesmo intervalo.
  const apptsInRange = useMemo(
    () => getAppointmentsInPeriod(start, end),
    [start, end, storeVersion],
  );
  const appts = useMemo(() => apptsInRange.filter(a => {
    try { return parseISO(a.startTime) <= now; } catch { return false; }
  }), [apptsInRange, now]);
  const futureAppts = useMemo(() => apptsInRange.filter(a => {
    try { return parseISO(a.startTime) > now && isFinancialAppointment(a); } catch { return false; }
  }), [apptsInRange, now]);

  const prevAppts = useMemo(() => getAppointmentsInPeriod(prevDates.start, prevDates.end).filter(a => {
    try { return parseISO(a.startTime) <= now; } catch { return false; }
  }), [prevDates, storeVersion, now]);

  const stats = useMemo(() => calcPeriodStats(appts, employees), [appts, employees]);
  const prevStats = useMemo(() => calcPeriodStats(prevAppts, employees), [prevAppts, employees]);
  const futureStats = useMemo(() => calcPeriodStats(futureAppts, employees), [futureAppts, employees]);
  const expenses = useMemo(() => expensesStore.list(), [storeVersion]);
  const realizedEnd = end < now ? end : now;
  const paidExpenses = useMemo(
    () => calcPaidExpenses(expenses, start, realizedEnd),
    [expenses, start, realizedEnd],
  );
  const financialSummary = useMemo(
    () => calcFinancialSummary(appts, employees, paidExpenses),
    [appts, employees, paidExpenses],
  );

  const byDay = useMemo(() => {
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
    return Array.from({ length: Math.min(days, 31) }, (_, index) => {
      const date = addDays(start, index);
      const key = format(date, "yyyy-MM-dd");
      const dayAppts = appts.filter(a => {
        try { return format(parseISO(a.startTime), "yyyy-MM-dd") === key; } catch { return false; }
      });
      return {
        date: key,
        label: format(date, "dd/MM"),
        revenue: dayAppts.reduce((sum, a) => sum + toNum(a.totalPrice), 0),
        count: dayAppts.length,
      };
    });
  }, [appts, start, end]);
  const byEmp    = useMemo(() => calcRevenueByEmployee(appts, employees), [appts, employees]);
  const services = useMemo(() => calcPopularServices(appts), [appts]);

  // Cálculos de Crescimento
  const growth = {
    revenue: prevStats.totalRevenue > 0 ? ((stats.totalRevenue - prevStats.totalRevenue) / prevStats.totalRevenue) * 100 : 0,
    count: prevStats.count > 0 ? ((stats.count - prevStats.count) / prevStats.count) * 100 : 0,
    avgTicket: prevStats.avgTicket > 0 ? ((stats.avgTicket - prevStats.avgTicket) / prevStats.avgTicket) * 100 : 0,
    cancelRate: stats.cancelRate - prevStats.cancelRate
  };

  // Status breakdown
  const byStatus = useMemo(() => {
    const map: Record<string, number> = {};
    appts.forEach(a => { map[a.status] = (map[a.status] ?? 0) + 1; });
    const labels: Record<string, string> = {
      scheduled: "Agendado", confirmed: "Confirmado", in_progress: "Em andamento",
      completed: "Concluído", cancelled: "Cancelado", no_show: "Faltou",
    };
    const colors: Record<string, string> = {
      scheduled: "#3b82f6", confirmed: "#10b981", in_progress: "#f59e0b",
      completed: "#22c55e", cancelled: "#ef4444", no_show: "#6b7280",
    };
    return Object.entries(map).map(([st, count]) => ({
      name: labels[st] ?? st, value: count, color: colors[st] ?? "#ec4899",
    }));
  }, [appts]);

  // --- VISÃO HISTÓRICA ---
  const monthlyHistory = useMemo(() => calcMonthlyHistory(allAppts, 12), [allAppts]);
  const yearlyHistory = useMemo(() => calcYearlyHistory(allAppts), [allAppts]);

  // Comparativo Mês Atual vs Mês Anterior vs Mesmo Mês Ano Anterior
  const monthComparison = useMemo(() => {
    const currentMonthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastYearMonthStart = startOfMonth(subYears(now, 1));

    const getStats = (mStart: Date, mEnd: Date) => {
      const filtered = allAppts.filter(a => {
        const d = parseISO(a.startTime);
        return d >= mStart && d <= mEnd && d <= now && isFinancialAppointment(a);
      });
      const rev = filtered.reduce((s, a) => s + toNum(a.totalPrice), 0);
      return { revenue: rev, count: filtered.length, avgTicket: filtered.length > 0 ? rev / filtered.length : 0 };
    };

    const current = getStats(currentMonthStart, now);
    const last = getStats(lastMonthStart, subMonths(now, 1)); // Compara até o mesmo dia do mês anterior
    const lastYear = getStats(lastYearMonthStart, subYears(now, 1)); // Compara até o mesmo dia do ano anterior

    return { current, last, lastYear };
  }, [allAppts, now]);

  // Comparativo Ano Atual vs Ano Anterior (mesmo período)
  const yearComparison = useMemo(() => {
    const currentYearStart = startOfYear(now);
    const lastYearStart = startOfYear(subYears(now, 1));
    const lastYearPeriodEnd = subYears(now, 1);

    const getStats = (yStart: Date, yEnd: Date) => {
      const filtered = allAppts.filter(a => {
        const d = parseISO(a.startTime);
        return d >= yStart && d <= yEnd && d <= now && isFinancialAppointment(a);
      });
      const rev = filtered.reduce((s, a) => s + toNum(a.totalPrice), 0);
      return { revenue: rev, count: filtered.length, avgTicket: filtered.length > 0 ? rev / filtered.length : 0 };
    };

    const current = getStats(currentYearStart, now);
    const last = getStats(lastYearStart, lastYearPeriodEnd);

    return { current, last };
  }, [allAppts, now]);

  const kpis = [
    { label: "Bruto da Agenda", value: fmt(financialSummary.grossRevenue), icon: DollarSign, color: "#ec4899", growth: growth.revenue },
    { label: "Após comissões", value: fmt(financialSummary.afterCommissions), icon: TrendingUp, color: "#22c55e", growth: null },
    { label: "Após comissões e despesas", value: fmt(financialSummary.afterCommissionsAndExpenses), icon: TrendingUp, color: "#14b8a6", growth: null },
    { label: "Resultado após todos os custos", value: fmt(financialSummary.afterCostsAndExpenses), icon: TrendingUp, color: "#0ea5e9", growth: null },
    { label: "Atendimentos", value: String(stats.count), icon: Calendar, color: "#3b82f6", growth: growth.count },
    { label: "Ticket Médio", value: fmt(stats.avgTicket), icon: DollarSign, color: "#f59e0b", growth: growth.avgTicket },
    { label: "Comissões descontadas", value: fmt(financialSummary.commissions), icon: Percent, color: "#8b5cf6", growth: null },
    { label: "Despesas pagas", value: fmt(financialSummary.paidExpenses), icon: BarChart3, color: "#f97316", growth: null },
    { label: "Custo de material", value: fmt(financialSummary.materialCost), icon: Scissors, color: "#06b6d4", growth: null },
    { label: "Cancelamentos", value: `${stats.cancelRate.toFixed(1)}%`, icon: Users, color: "#ef4444", growth: growth.cancelRate, inverse: true },
  ];

  return (
    <div className="p-4 md:p-6 space-y-8">
      {/* Cabeçalho + navegação temporal */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-pink-500/[0.14] via-card/80 to-violet-500/[0.08] p-4 md:p-5 shadow-xl shadow-black/10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pink-500/15 text-pink-300">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-pink-300/80">Visão gerencial</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight">Relatórios</h2>
              <p className="mt-1 text-sm text-muted-foreground">Agenda como fonte de verdade · {shortLabel}</p>
            </div>
          </div>

          <div className="flex rounded-xl border border-white/10 bg-black/10 p-1">
            {(["dia", "semana", "mes"] as ReportGranularity[]).map(option => (
              <Button
                key={option}
                size="sm"
                variant={granularity === option ? "default" : "ghost"}
                onClick={() => setGranularity(option)}
                className="h-8 min-w-20 text-xs capitalize"
              >
                {option === "mes" ? "Mês" : option === "semana" ? "Semana" : "Dia"}
              </Button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/10 px-2 py-2">
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Período anterior: ${shortLabel}`}
            onClick={() => setCursorDate(date => shiftReportPeriod(date, granularity, -1))}
            className="h-10 w-10 shrink-0 rounded-lg"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 text-center">
            <p className="truncate text-base font-semibold md:text-lg">{label}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {futureStats.scheduledCount > 0
                ? `${futureStats.scheduledCount} agendamento(s) futuro(s) · ${fmt(futureStats.scheduledRevenue)}`
                : "Nenhum agendamento futuro neste período"}
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Próximo período: ${shortLabel}`}
            onClick={() => setCursorDate(date => shiftReportPeriod(date, granularity, 1))}
            className="h-10 w-10 shrink-0 rounded-lg"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {!isCurrentRange && (
          <div className="mt-3 flex justify-center">
            <Button size="sm" variant="outline" onClick={() => setCursorDate(new Date())} className="h-8 text-xs">
              Voltar para hoje
            </Button>
          </div>
        )}
      </div>

      {/* KPIs realizados */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3 px-1">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-pink-300/80">Desempenho</p>
            <h3 className="mt-1 text-lg font-bold">Realizado no período</h3>
          </div>
            <p className="text-xs text-muted-foreground">Bruto {fmt(financialSummary.grossRevenue)} · despesas pagas {fmt(financialSummary.paidExpenses)}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {kpis.map(({ label, value, icon: Icon, color, growth, inverse }) => (
            <Card key={label} className="border-border bg-card/50 transition-colors hover:border-pink-400/30">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: `${color}20` }}>
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>
                  {growth !== null && (
                    <div className={cn(
                      "flex items-center gap-0.5 text-[10px] font-bold",
                      inverse
                        ? (growth > 0 ? "text-red-400" : "text-emerald-400")
                        : (growth > 0 ? "text-emerald-400" : "text-red-400")
                    )}>
                      {growth > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {Math.abs(growth).toFixed(1)}%
                    </div>
                  )}
                </div>
                <p className="text-lg font-bold" style={{ color }}>{value}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Projeção futura separada do realizado */}
      <section className="rounded-2xl border border-orange-400/20 bg-orange-500/[0.08] p-4 md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-400/15 text-orange-300">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-300/80">Agenda futura</p>
              <h3 className="mt-1 text-lg font-bold">Agenda futura no período</h3>
              <p className="mt-1 text-xs text-muted-foreground">Agendamentos válidos na Agenda, ainda não iniciados.</p>
            </div>
          </div>
          <div className="md:text-right">
            <p className="text-2xl font-bold text-orange-300">{fmt(futureStats.scheduledRevenue)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{futureStats.scheduledCount} agendamento(s) futuro(s)</p>
          </div>
        </div>
      </section>

      {/* --- NOVA SEÇÃO: VISÃO HISTÓRICA FINANCEIRA --- */}
      <div className="space-y-6 pt-4 border-t border-border/50">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold">Visão Histórica Financeira</h3>
        </div>

        {/* Comparativos Rápidos */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Mês Atual vs Anterior */}
          <Card className="border-border bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Mês Atual vs Anterior</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-2xl font-bold">{fmt(monthComparison.current.revenue)}</p>
                  <p className="text-[10px] text-muted-foreground">Atual (até hoje)</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-muted-foreground">{fmt(monthComparison.last.revenue)}</p>
                  <p className="text-[10px] text-muted-foreground">Anterior (mesmo período)</p>
                </div>
              </div>
              <div className="pt-2 border-t border-border/50 flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Diferença</span>
                <div className={cn(
                  "flex items-center gap-1 text-sm font-bold",
                  monthComparison.current.revenue >= monthComparison.last.revenue ? "text-emerald-400" : "text-red-400"
                )}>
                  {fmt(monthComparison.current.revenue - monthComparison.last.revenue)}
                  <span className="text-[10px]">
                    ({fmtPct(monthComparison.last.revenue > 0 ? ((monthComparison.current.revenue - monthComparison.last.revenue) / monthComparison.last.revenue) * 100 : 0)})
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Mês Atual vs Ano Anterior */}
          <Card className="border-border bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Mês Atual vs Ano Anterior</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-2xl font-bold">{fmt(monthComparison.current.revenue)}</p>
                  <p className="text-[10px] text-muted-foreground">{format(now, "MMMM", { locale: ptBR })} {now.getFullYear()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-muted-foreground">{fmt(monthComparison.lastYear.revenue)}</p>
                  <p className="text-[10px] text-muted-foreground">{format(now, "MMMM", { locale: ptBR })} {now.getFullYear() - 1}</p>
                </div>
              </div>
              <div className="pt-2 border-t border-border/50 flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Crescimento</span>
                <div className={cn(
                  "flex items-center gap-1 text-sm font-bold",
                  monthComparison.current.revenue >= monthComparison.lastYear.revenue ? "text-emerald-400" : "text-red-400"
                )}>
                  {fmtPct(monthComparison.lastYear.revenue > 0 ? ((monthComparison.current.revenue - monthComparison.lastYear.revenue) / monthComparison.lastYear.revenue) * 100 : 0)}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ano Atual vs Ano Anterior */}
          <Card className="border-border bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Ano Atual vs Anterior</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-2xl font-bold">{fmt(yearComparison.current.revenue)}</p>
                  <p className="text-[10px] text-muted-foreground">Acumulado {now.getFullYear()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-muted-foreground">{fmt(yearComparison.last.revenue)}</p>
                  <p className="text-[10px] text-muted-foreground">Período equivalente {now.getFullYear() - 1}</p>
                </div>
              </div>
              <div className="pt-2 border-t border-border/50 flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Diferença</span>
                <div className={cn(
                  "flex items-center gap-1 text-sm font-bold",
                  yearComparison.current.revenue >= yearComparison.last.revenue ? "text-emerald-400" : "text-red-400"
                )}>
                  {fmtPct(yearComparison.last.revenue > 0 ? ((yearComparison.current.revenue - yearComparison.last.revenue) / yearComparison.last.revenue) * 100 : 0)}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Faturamento Mensal (Últimos 12 meses) */}
        <Card className="border-border bg-card/50">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" /> Faturamento Mensal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6 h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="label" tick={tickStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={tickStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `R$ ${v/1000}k`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [fmt(Number(v)), "Faturamento"]} />
                  <Bar dataKey="revenue" fill="#ec4899" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            
            <div className="rounded-md border border-border/50 overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="text-xs">Mês/Ano</TableHead>
                    <TableHead className="text-xs text-right">Faturamento</TableHead>
                    <TableHead className="text-xs text-right">Agend.</TableHead>
                    <TableHead className="text-xs text-right">Ticket Médio</TableHead>
                    <TableHead className="text-xs text-right">Variação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyHistory.slice().reverse().map((m, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-medium uppercase">{m.label}</TableCell>
                      <TableCell className="text-xs text-right font-bold">{fmt(m.revenue)}</TableCell>
                      <TableCell className="text-xs text-right text-muted-foreground">{m.count}</TableCell>
                      <TableCell className="text-xs text-right text-muted-foreground">{fmt(m.avgTicket)}</TableCell>
                      <TableCell className={cn(
                        "text-xs text-right font-bold",
                        m.growth ? (m.growth >= 0 ? "text-emerald-400" : "text-red-400") : "text-muted-foreground"
                      )}>
                        {m.growth ? fmtPct(m.growth) : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Faturamento Anual */}
        <Card className="border-border bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" /> Faturamento Anual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-border/50 overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="text-xs">Ano</TableHead>
                    <TableHead className="text-xs text-right">Faturamento Total</TableHead>
                    <TableHead className="text-xs text-right">Agendamentos</TableHead>
                    <TableHead className="text-xs text-right">Ticket Médio</TableHead>
                    <TableHead className="text-xs text-right">Crescimento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {yearlyHistory.slice().reverse().map((y, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-bold">{y.label}</TableCell>
                      <TableCell className="text-xs text-right font-bold text-primary">{fmt(y.revenue)}</TableCell>
                      <TableCell className="text-xs text-right text-muted-foreground">{y.count}</TableCell>
                      <TableCell className="text-xs text-right text-muted-foreground">{fmt(y.avgTicket)}</TableCell>
                      <TableCell className={cn(
                        "text-xs text-right font-bold",
                        y.growth ? (y.growth >= 0 ? "text-emerald-400" : "text-red-400") : "text-muted-foreground"
                      )}>
                        {y.growth ? fmtPct(y.growth) : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* --- SEÇÕES ORIGINAIS --- */}
      <div className="space-y-6 pt-4 border-t border-border/50">
        <h3 className="text-lg font-bold">Análise do Período Selecionado</h3>
        
        {/* Faturamento por dia */}
        <Card className="border-border bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Faturamento por Dia</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byDay.filter(d => d !== undefined && d !== null)} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="label" tick={tickStyle} axisLine={false} tickLine={false} />
                <YAxis tick={tickStyle} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [fmt(Number(v)), "Faturamento"]} />
                <Bar dataKey="revenue" fill="#ec4899" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Ranking funcionários */}
          <Card className="border-border bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Award className="w-4 h-4 text-primary" />Ranking de Funcionários
              </CardTitle>
            </CardHeader>
            <CardContent>
              {byEmp.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum dado no período</p>
              ) : (
                <div className="space-y-4">
                  {byEmp.map((emp, i) => (
                    <div key={emp.id} className="space-y-1 cursor-pointer rounded-lg p-1 hover:bg-white/5 transition-colors" onClick={() => setSelectedEmp(emp)}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}°</span>
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: emp.color }} />
                        <span className="text-sm font-semibold flex-1">{emp.name.split(" ")[0]}</span>
                        <span className="text-sm font-bold text-primary">{fmt(emp.revenue)}</span>
                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      </div>
                      <div className="pl-7 space-y-1">
                        <div className="h-2 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{
                            width: `${byEmp[0] ? (emp.revenue / byEmp[0].revenue) * 100 : 0}%`,
                            backgroundColor: emp.color,
                          }} />
                        </div>
                        <div className="flex gap-3 text-[10px] text-muted-foreground">
                          <span>{emp.count} atend.</span>
                          <span className="text-emerald-400">Líq: {fmt(emp.net)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Status */}
          <Card className="border-border bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Distribuição por Status</CardTitle>
            </CardHeader>
            <CardContent>
              {byStatus.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum dado</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={byStatus} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                      {byStatus.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend verticalAlign="bottom" height={36} formatter={(v) => <span className="text-[10px] text-muted-foreground">{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Ranking Serviços */}
        <Card className="border-border bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Scissors className="w-4 h-4 text-primary" /> Serviços Populares
            </CardTitle>
          </CardHeader>
          <CardContent>
            {services.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum dado no período</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {services.slice(0, 10).map((s, i) => (
                  <div key={s.serviceId} className="flex items-center gap-3 p-2 rounded-lg bg-white/5">
                    <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <p className="text-[10px] text-muted-foreground">{s.count} vezes · {fmt(s.revenue)}</p>
                    </div>
                    <div className="text-right">
                      <div className="h-1.5 w-16 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${(s.count / services[0].count) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
          }
