/**
 * ComissoesPage — Fechamento e controle de comissões por funcionário.
 * Cálculos derivam 100% dos agendamentos concluídos.
 */
import { useState, useMemo } from "react";
import { useStoreVersion } from "@/hooks/useStoreVersion";
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Percent, CheckCircle, Clock, Scissors, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { appointmentsStore } from "@/features/agenda";
import { employeesStore, type Employee } from "@/features/funcionarios";
import { commissionClosingsStore, type CommissionClosing } from "@/features/financeiro";
import { calcCommission, calcMaterialCost, isCompleted, toNum } from "@/features/relatorios";

function getAccent() {
  try { return JSON.parse(localStorage.getItem("salon_config") || "{}").accentColor || "#ec4899"; }
  catch { return "#ec4899"; }
}
function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const PERIODS = [
  { value: "semana",    label: "Esta semana"  },
  { value: "mes",       label: "Este mês"     },
  { value: "mes_ant",   label: "Mês passado"  },
  { value: "custom",    label: "Personalizado"},
] as const;

function getPeriodRange(period: string, customStart?: string, customEnd?: string) {
  const now = new Date();
  switch (period) {
    case "semana":
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case "mes":
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case "mes_ant": {
      const prev = subMonths(now, 1);
      return { start: startOfMonth(prev), end: endOfMonth(prev) };
    }
    case "custom":
      return {
        start: customStart ? parseISO(customStart) : startOfMonth(now),
        end:   customEnd   ? parseISO(customEnd)   : endOfMonth(now),
      };
    default:
      return { start: startOfMonth(now), end: endOfMonth(now) };
  }
}

export default function ComissoesPage() {
  const accent = getAccent();
  const [refreshKey, setRefreshKey] = useState(0);
  const [period, setPeriod] = useState<typeof PERIODS[number]["value"]>("mes");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [closingEmp, setClosingEmp] = useState<Employee | null>(null);
  const [closingNotes, setClosingNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandHistory, setExpandHistory] = useState(false);
  const storeVersion = useStoreVersion();

  const employees = useMemo(() => employeesStore.list(true), [refreshKey, storeVersion]);
  const allAppts  = useMemo(() => appointmentsStore.list({}), [refreshKey, storeVersion]);
  const closings  = useMemo(() => commissionClosingsStore.list(), [refreshKey, storeVersion]);

  const { start, end } = useMemo(() => getPeriodRange(
    period,
    period === "custom" ? customStart : undefined,
    period === "custom" ? customEnd : undefined,
  ), [period, customStart, customEnd]);

  const startStr = start.toISOString().slice(0, 10);
  const endStr   = end.toISOString().slice(0, 10);

  const empStats = useMemo(() => {
    const now = new Date();
    return employees.map(emp => {
      const appts = allAppts.filter(a => {
        try {
          const d = parseISO(a.startTime);
          return a.employeeId === emp.id &&
            d >= start &&
            d <= end &&
            d <= now &&
            (a.totalPrice ?? 0) > 0;
        } catch { return false; }
      });

      const revenue    = appts.reduce((s, a) => s + toNum(a.totalPrice), 0);
      const material   = appts.reduce((s, a) => s + calcMaterialCost(a), 0);
      const commission = appts.reduce((s, a) => s + calcCommission(a, emp), 0);

      return { emp, appts, revenue, material, commission, count: appts.length };
    }).filter(s => s.count > 0 || s.revenue > 0);
  }, [employees, allAppts, start, end, refreshKey]);

  const totalStats = useMemo(() => ({
    revenue:    empStats.reduce((s, e) => s + e.revenue, 0),
    commission: empStats.reduce((s, e) => s + e.commission, 0),
    count:      empStats.reduce((s, e) => s + e.count, 0),
  }), [empStats]);

  const handleCloseCommission = async () => {
    if (!closingEmp) return;
    const stat = empStats.find(s => s.emp.id === closingEmp.id);
    if (!stat) { toast.error("Sem dados para este funcionário no período"); return; }

    setLoading(true);
    try {
      await commissionClosingsStore.create({
        employeeId:       closingEmp.id,
        periodStart:      startStr,
        periodEnd:        endStr,
        totalRevenue:     stat.revenue,
        totalCommission:  stat.commission,
        appointmentCount: stat.count,
        status:           "pendente",
        paidAt:           null,
        notes:            closingNotes || null,
      });
      toast.success(`Comissão de ${closingEmp.name} fechada!`);
      setClosingEmp(null);
      setClosingNotes("");
      setRefreshKey(k => k + 1);
    } catch {
      toast.error("Erro ao fechar comissão");
    } finally {
      setLoading(false);
    }
  };

  const handleMarkPaid = async (id: number) => {
    try {
      await commissionClosingsStore.markAsPaid(id);
      toast.success("Comissão marcada como paga!");
      setRefreshKey(k => k + 1);
    } catch {
      toast.error("Erro ao marcar como pago");
    }
  };

  const handleDeleteClosing = async (id: number) => {
    if (!confirm("Excluir este fechamento?")) return;
    try {
      await commissionClosingsStore.delete(id);
      toast.success("Fechamento excluído");
      setRefreshKey(k => k + 1);
    } catch {
      toast.error("Erro ao excluir");
    }
  };

  const cardStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(20px)",
    borderRadius: 16,
    padding: 20,
  };

  const pendingClosings = closings.filter(c => c.status === "pendente");
  const paidClosings    = closings.filter(c => c.status === "paga");

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Percent className="w-5 h-5" style={{ color: accent }} />
          Comissões
        </h2>
        <p className="text-sm text-muted-foreground">Fechamento e controle por profissional</p>
      </div>

      {/* Seletor de período */}
      <div style={cardStyle} className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {PERIODS.map(p => (
            <button key={p.value} onClick={() => setPeriod(p.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={period === p.value ? {
                background: `${accent}30`, border: `1px solid ${accent}50`, color: accent,
              } : {
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.5)",
              }}>
              {p.label}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="flex gap-3 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs">De</Label>
              <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Até</Label>
              <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {format(start, "dd/MM/yyyy", { locale: ptBR })} a {format(end, "dd/MM/yyyy", { locale: ptBR })}
        </p>
      </div>

      {/* KPIs totais */}
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3" style={{ minWidth: "max-content" }}>
          {[
            { label: "Faturamento total", value: fmt(totalStats.revenue) },
            { label: "Comissões totais",  value: fmt(totalStats.commission) },
            { label: "Atendimentos",      value: totalStats.count.toString() },
          ].map(({ label, value }) => (
            <div key={label} style={cardStyle} className="min-w-[180px]">
              <p className="text-xs text-muted-foreground mb-2">{label}</p>
              <p className="text-2xl font-bold">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Cards por funcionário */}
      <div className="space-y-3">
        <p className="text-sm font-semibold">Por profissional</p>
        {empStats.length === 0 ? (
          <div style={cardStyle} className="text-center py-10 text-muted-foreground">
            <Scissors className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">Nenhum atendimento concluído no período</p>
          </div>
        ) : (
          empStats.map(({ emp, appts, revenue, material, commission, count }) => (
            <div key={emp.id} style={cardStyle}>
              <div className="flex items-center gap-4 flex-wrap">
                <Avatar className="w-12 h-12 flex-shrink-0">
                  {emp.photoUrl
                    ? <img src={emp.photoUrl} alt={emp.name} className="w-full h-full object-cover rounded-full" />
                    : <AvatarFallback style={{ background: `${emp.color}30`, color: emp.color, fontSize: 18 }}>
                        {emp.name.charAt(0)}
                      </AvatarFallback>
                  }
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{emp.name}</p>
                  <p className="text-xs text-muted-foreground">{count} atendimento(s) · {emp.commissionPercent}% comissão</p>
                </div>
                <div className="flex gap-4 text-right flex-wrap">
                  <div>
                    <p className="text-xs text-muted-foreground">Faturamento</p>
                    <p className="font-bold text-sm">{fmt(revenue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Comissão</p>
                    <p className="font-bold text-sm" style={{ color: accent }}>{fmt(commission)}</p>
                  </div>
                  <Button size="sm" className="gap-1.5 self-center text-xs"
                    onClick={() => { setClosingEmp(emp); setClosingNotes(""); }}>
                    Fechar Comissão
                  </Button>
                </div>
              </div>

              {/* Detalhe dos atendimentos */}
              {appts.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/8 space-y-1">
                  {appts.slice(0, 5).map(a => (
                    <div key={a.id} className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{format(parseISO(a.startTime), "dd/MM HH:mm")} · {a.clientName ?? "—"}</span>
                      <span className="font-medium text-foreground">{fmt(toNum(a.totalPrice))}</span>
                    </div>
                  ))}
                  {appts.length > 5 && (
                    <p className="text-xs text-muted-foreground">+ {appts.length - 5} mais...</p>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Fechamentos pendentes */}
      {pendingClosings.length > 0 && (
        <div style={cardStyle}>
          <p className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-yellow-400" />
            Fechamentos pendentes ({pendingClosings.length})
          </p>
          <div className="space-y-2">
            {pendingClosings.map(c => {
              const emp = employees.find(e => e.id === c.employeeId);
              return (
                <div key={c.id}
                  className="flex items-center gap-3 p-3 rounded-xl border"
                  style={{ borderColor: "rgba(255,200,0,0.2)", background: "rgba(255,200,0,0.04)" }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{emp?.name ?? `Func. #${c.employeeId}`}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(c.periodStart), "dd/MM")} a {format(parseISO(c.periodEnd), "dd/MM/yyyy")}
                      {" · "}{c.appointmentCount} atend.
                    </p>
                    {c.notes && <p className="text-xs text-muted-foreground mt-0.5">{c.notes}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-sm" style={{ color: accent }}>{fmt(c.totalCommission)}</p>
                    <p className="text-xs text-muted-foreground">fat. {fmt(c.totalRevenue)}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="gap-1 text-xs bg-transparent"
                      onClick={() => handleMarkPaid(c.id)}>
                      <CheckCircle className="w-3.5 h-3.5 text-green-400" /> Pago
                    </Button>
                    <Button size="icon" variant="ghost" className="w-8 h-8 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteClosing(c.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Histórico de fechamentos pagos */}
      {paidClosings.length > 0 && (
        <div style={cardStyle}>
          <button
            className="w-full flex items-center justify-between text-sm font-semibold"
            onClick={() => setExpandHistory(v => !v)}>
            <span className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              Histórico de pagamentos ({paidClosings.length})
            </span>
            {expandHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expandHistory && (
            <div className="mt-3 space-y-2">
              {paidClosings.map(c => {
                const emp = employees.find(e => e.id === c.employeeId);
                return (
                  <div key={c.id}
                    className="flex items-center gap-3 p-3 rounded-xl border"
                    style={{ borderColor: "rgba(16,185,129,0.2)", background: "rgba(16,185,129,0.04)" }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{emp?.name ?? `Func. #${c.employeeId}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(c.periodStart), "dd/MM")} a {format(parseISO(c.periodEnd), "dd/MM/yyyy")}
                        {c.paidAt && ` · pago em ${format(parseISO(c.paidAt), "dd/MM/yyyy")}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm text-green-400">{fmt(c.totalCommission)}</p>
                      <p className="text-xs text-muted-foreground">fat. {fmt(c.totalRevenue)}</p>
                    </div>
                    <Button size="icon" variant="ghost" className="w-8 h-8 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteClosing(c.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal fechar comissão */}
      <Dialog open={!!closingEmp} onOpenChange={v => !v && setClosingEmp(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Fechar Comissão — {closingEmp?.name}</DialogTitle>
          </DialogHeader>
          {closingEmp && (() => {
            const stat = empStats.find(s => s.emp.id === closingEmp.id);
            return (
              <div className="space-y-4 py-2">
                <div className="p-4 rounded-xl space-y-2"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Período</span>
                    <span className="font-medium">
                      {format(start, "dd/MM")} a {format(end, "dd/MM/yyyy")}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Atendimentos</span>
                    <span className="font-medium">{stat?.count ?? 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Faturamento</span>
                    <span className="font-medium">{fmt(stat?.revenue ?? 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-white/10 pt-2 mt-2">
                    <span className="font-semibold">Comissão a pagar</span>
                    <span className="font-bold text-base" style={{ color: accent }}>
                      {fmt(stat?.commission ?? 0)}
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Observações</Label>
                  <Textarea value={closingNotes} onChange={e => setClosingNotes(e.target.value)}
                    placeholder="Observações opcionais..." rows={2} />
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setClosingEmp(null)} disabled={loading}>Cancelar</Button>
            <Button onClick={handleCloseCommission} disabled={loading}>
              {loading ? "Salvando..." : "Confirmar Fechamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
