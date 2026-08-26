/**
 * RelatoriosPage — Relatórios completos com comparativo de períodos e Visão Histórica.
 * Fonte de verdade: agendamentos (independente de status).
 */
import { useState, useMemo } from "react";
import { 
  format, subDays, parseISO, startOfMonth, endOfMonth, 
  subMonths, subYears, startOfYear, isWithinInterval 
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { 
  TrendingUp, Users, DollarSign, Award, Calendar, Scissors, 
  Percent, ChevronRight, ArrowUpRight, ArrowDownRight, History, BarChart3
} from "lucide-react";
import { appointmentsStore } from "@/features/agenda";
import { employeesStore } from "@/features/funcionarios";
import {
  calcPeriodStats, calcRevenueByDay, calcRevenueByEmployee,
  calcPopularServices, getAppointmentsInPeriod, getPeriodDates,
  toNum, calcMonthlyHistory, calcYearlyHistory, isFinancialAppointment,
  type Period,
} from "@/features/relatorios";
import { cn } from "@/lib/utils";
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

const PERIODS: { key: Period; label: string }[] = [
  { key: "hoje",      label: "Hoje"    },
  { key: "semana",    label: "Semana"  },
  { key: "mes",       label: "Mês"     },
  { key: "trimestre", label: "90 dias" },
  { key: "ano",       label: "Ano"     },
  { key: "custom",    label: "Custom"  },
];

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

export default function RelatoriosPage() {
  const [period, setPeriod]           = useState<Period>("mes");
  const [customStart, setCustomStart] = useState(() => format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd]     = useState(() => format(new Date(), "yyyy-MM-dd"));

  const [selectedEmp, setSelectedEmp] = useState<any | null>(null);
  const employees = useMemo(() => employeesStore.list(false), []);
  const allAppts = useMemo(() => appointmentsStore.list({}), []);

  const { start, end, label } = getPeriodDates(period, customStart, customEnd);

  // Período anterior para comparação (mesmo intervalo de dias)
  const prevDates = useMemo(() => {
    const diff = end.getTime() - start.getTime();
    const pStart = new Date(start.getTime() - diff - 86400000);
    const pEnd = new Date(start.getTime() - 86400000);
    return { start: pStart, end: pEnd };
  }, [start, end]);

  // Filtrar apenas agendamentos até o momento presente (sem projeções futuras)
  const now = new Date();
  const appts = useMemo(() => getAppointmentsInPeriod(start, end).filter(a => {
    try { return parseISO(a.startTime) <= now; } catch { return false; }
  }), [start, end]);

  const prevAppts = useMemo(() => getAppointmentsInPeriod(prevDates.start, prevDates.end).filter(a => {
    try { return parseISO(a.startTime) <= now; } catch { return false; }
  }), [prevDates]);

  const stats = useMemo(() => calcPeriodStats(appts, employees), [appts, employees]);
  const prevStats = useMemo(() => calcPeriodStats(prevAppts, employees), [prevAppts, employees]);

  const byDay    = useMemo(() => calcRevenueByDay(appts, Math.min(30, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1)), [appts, start, end]);
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
    { label: "Faturamento", value: fmt(stats.totalRevenue), icon: DollarSign, color: "#ec4899", growth: growth.revenue },
    { label: "Líquido", value: fmt(stats.netRevenue), icon: TrendingUp, color: "#22c55e", growth: null },
    { label: "Atendimentos", value: String(stats.count), icon: Calendar, color: "#3b82f6", growth: growth.count },
    { label: "Ticket Médio", value: fmt(stats.avgTicket), icon: DollarSign, color: "#f59e0b", growth: growth.avgTicket },
    { label: "Comissões", value: fmt(stats.totalCommissions), icon: Percent, color: "#8b5cf6", growth: null },
    { label: "Custo Material", value: fmt(stats.totalMaterial), icon: Scissors, color: "#06b6d4", growth: null },
    { label: "Cancelamentos", value: `${stats.cancelRate.toFixed(1)}%`, icon: Users, color: "#ef4444", growth: growth.cancelRate, inverse: true },
    { label: "Agend. Futuros", value: fmt(stats.scheduledRevenue), icon: Calendar, color: "#f97316", growth: null },
  ];

  return (
    <div className="p-4 md:p-6 space-y-8">
      {/* Header + período */}
      <div className="space-y-3">
        <div>
          <h2 className="text-xl font-bold">Relatórios</h2>
          <p className="text-sm text-muted-foreground">Fonte: agendamentos · {label}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {PERIODS.map(p => (
            <Button key={p.key} size="sm" variant={period === p.key ? "default" : "outline"}
              onClick={() => setPeriod(p.key)} className="h-7 text-xs">
              {p.label}
            </Button>
          ))}
        </div>
        {period === "custom" && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-xs">De:</Label>
              <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-36 h-8 text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Até:</Label>
              <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-36 h-8 text-sm" />
            </div>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map(({ label, value, icon: Icon, color, growth, inverse }) => (
          <Card key={label} className="border-border bg-card/50">
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
