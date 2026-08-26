/**
 * ClienteFicha — Painel lateral com ficha completa do cliente.
 * Mostra dados cadastrais, estatísticas, serviço favorito e histórico completo.
 * Clicar num agendamento navega para esse dia na Agenda.
 * Status (Agendado/Concluído) é baseado na data, não no caixa.
 */
import React, { useMemo } from "react";
import { useLocation } from "wouter";
import { differenceInYears, formatDistanceToNow, isBefore, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { safeDate, safeFmt } from "@/lib/utils";
import {
  X, Phone, Mail, MapPin, Calendar, Pencil, Clock,
  Star, TrendingUp, Hash, CreditCard, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { type Client } from "@/features/clientes";
import { appointmentsStore } from "@/features/agenda";
import { employeesStore } from "@/features/funcionarios";

interface Props {
  client: Client;
  onClose: () => void;
  onEdit: () => void;
}

// Deriva o status de exibição a partir da data — ignora o campo `status` do caixa
// para a classificação Agendado/Concluído.
// Cancelado e Faltou continuam sendo respeitados.
function deriveStatus(apptStatus: string, startTime: string) {
  if (apptStatus === "cancelled") return "cancelled";
  if (apptStatus === "no_show")   return "no_show";
  if (apptStatus === "in_progress") return "in_progress";
  const start = safeDate(startTime);
  if (!start) return "scheduled";
  return isBefore(start, new Date()) ? "completed" : "scheduled";
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  scheduled:   { label: "Agendado",      bg: "bg-blue-500/15",   text: "text-blue-400"   },
  in_progress: { label: "Em andamento",  bg: "bg-yellow-500/15", text: "text-yellow-400" },
  completed:   { label: "Concluído",     bg: "bg-green-500/15",  text: "text-green-400"  },
  cancelled:   { label: "Cancelado",     bg: "bg-red-500/15",    text: "text-red-400"    },
  no_show:     { label: "Faltou",        bg: "bg-orange-500/15", text: "text-orange-400" },
};

const DOT_COLOR: Record<string, string> = {
  completed:   "bg-green-400",
  cancelled:   "bg-red-400",
  no_show:     "bg-orange-400",
  in_progress: "bg-yellow-400",
  scheduled:   "bg-blue-400",
};

export default function ClienteFicha({ client, onClose, onEdit }: Props) {
  const [, setLocation] = useLocation();
  const employees = useMemo(() => employeesStore.list(false), []);

  const appts = useMemo(() => {
    const all = appointmentsStore.list({});
    return all
      .filter(a =>
        (a.clientId != null && a.clientId === client.id) ||
        a.clientName?.trim().toLowerCase() === client.name.trim().toLowerCase()
      )
      .sort((a, b) => (safeDate(b.startTime)?.getTime() ?? 0) - (safeDate(a.startTime)?.getTime() ?? 0));
  }, [client]);

  // "Concluído" = data passada + não cancelado/faltou — independente do caixa
  const now = new Date();
  const pastDone = useMemo(
    () => appts.filter(a => {
      const d = safeDate(a.startTime);
      return d != null && isBefore(d, now) && a.status !== "cancelled" && a.status !== "no_show";
    }),
    [appts]
  );

  const totalSpent = pastDone.reduce((s, a) => s + (a.totalPrice ?? 0), 0);
  const avgTicket  = pastDone.length > 0 ? totalSpent / pastDone.length : 0;
  const lastVisit  = pastDone[0]?.startTime ?? null;

  // Próximo = data futura e não cancelado
  const nextVisit = appts.find(a => {
    const d = safeDate(a.startTime);
    return d != null && !isBefore(d, startOfDay(now)) && a.status !== "cancelled" && a.status !== "no_show";
  });

  const serviceCount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of pastDone) {
      for (const s of a.services ?? []) {
        map[s.name] = (map[s.name] ?? 0) + 1;
      }
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [pastDone]);

  const favoriteService = serviceCount[0] ?? null;

  const age = client.birthDate
    ? (() => { const d = safeDate(client.birthDate + "T12:00:00"); return d ? differenceInYears(new Date(), d) : null; })()
    : null;

  const birthdayFmt = safeFmt(client.birthDate ? client.birthDate + "T12:00:00" : null, "dd/MM/yyyy");

  const memberSince = safeFmt(client.createdAt, "MMM yyyy", { locale: ptBR });

  function goToAgenda(startTime: string) {
    const date = safeFmt(startTime, "yyyy-MM-dd");
    if (date === "—") return;
    onClose();
    setLocation(`/agenda?date=${date}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className="relative flex flex-col h-full w-full max-w-md bg-background border-l border-border shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Sticky header ── */}
        <div className="shrink-0 sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-5 py-3 flex items-center justify-between gap-2">
          <h2 className="font-semibold text-sm">Ficha do Cliente</h2>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={onEdit} className="gap-1.5 text-xs h-8 px-3">
              <Pencil className="w-3.5 h-3.5" />Editar
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* ── Identity ── */}
          <div className="flex items-start gap-4">
            <Avatar className="w-16 h-16 shrink-0">
              <AvatarFallback className="bg-primary/20 text-primary font-bold text-2xl">
                {client.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold leading-tight">{client.name}</h3>
              {client.createdAt && memberSince !== "—" && (
                <p className="text-xs text-muted-foreground mt-0.5">Cliente desde {memberSince}</p>
              )}
              <div className="mt-2 space-y-1.5">
                {client.phone && (
                  <a href={`tel:${client.phone}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <Phone className="w-3.5 h-3.5 shrink-0 text-primary" />
                    {client.phone}
                  </a>
                )}
                {client.email && (
                  <a href={`mailto:${client.email}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors truncate">
                    <Mail className="w-3.5 h-3.5 shrink-0 text-primary" />
                    <span className="truncate">{client.email}</span>
                  </a>
                )}
                {client.birthDate && birthdayFmt !== "—" && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5 shrink-0 text-primary" />
                    {birthdayFmt}{age !== null ? ` · ${age} anos` : ""}
                  </div>
                )}
                {client.address && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 shrink-0 text-primary" />
                    <span className="truncate">{client.address}</span>
                  </div>
                )}
                {client.cpf && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Hash className="w-3.5 h-3.5 shrink-0 text-primary" />
                    CPF: {client.cpf}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Stats grid ── */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<Clock className="w-4 h-4" />}
              value={appts.length}
              label={`Visita${appts.length !== 1 ? "s" : ""}`}
              color="text-primary"
            />
            <StatCard
              icon={<CreditCard className="w-4 h-4" />}
              value={`R$ ${totalSpent.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              label="Total gasto"
              color="text-green-400"
              small
            />
            <StatCard
              icon={<TrendingUp className="w-4 h-4" />}
              value={`R$ ${avgTicket.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              label="Ticket médio"
              small
            />
            <StatCard
              icon={<Calendar className="w-4 h-4" />}
              value={lastVisit && safeDate(lastVisit) ? formatDistanceToNow(safeDate(lastVisit)!, { locale: ptBR, addSuffix: true }) : "—"}
              label="Última visita"
              color="text-orange-400"
              small
            />
          </div>

          {/* ── Próximo agendamento ── */}
          {nextVisit && (
            <button
              onClick={() => goToAgenda(nextVisit.startTime)}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors text-left group"
            >
              <Calendar className="w-4 h-4 text-blue-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-blue-400">Próximo agendamento</p>
                <p className="text-sm font-semibold">
                  {safeFmt(nextVisit.startTime, "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </p>
                {nextVisit.services && nextVisit.services.length > 0 && (
                  <p className="text-xs text-muted-foreground truncate">
                    {nextVisit.services.map(s => s.name).join(", ")}
                  </p>
                )}
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-blue-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}

          {/* ── Serviço favorito ── */}
          {favoriteService && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/10 border border-primary/20">
              <Star className="w-4 h-4 text-primary shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Serviço favorito</p>
                <p className="text-sm font-semibold">{favoriteService[0]}</p>
              </div>
              <Badge variant="secondary" className="ml-auto text-xs shrink-0">
                {favoriteService[1]}x
              </Badge>
            </div>
          )}

          {/* ── Todos os serviços (ranking) ── */}
          {serviceCount.length > 1 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Serviços utilizados
              </p>
              <div className="space-y-1.5">
                {serviceCount.map(([name, count]) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span className="truncate">{name}</span>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">{count}x</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Observações ── */}
          {client.notes && (
            <div className="p-3 rounded-xl bg-secondary/50 border border-border">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">📝 Observações e Preferências</p>
              <p className="text-sm whitespace-pre-wrap">{client.notes}</p>
            </div>
          )}

          {/* ── Histórico completo ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-primary" />
              <h4 className="font-semibold text-sm">Histórico Completo</h4>
              <Badge variant="secondary" className="ml-auto text-[10px]">
                {appts.length} registro{appts.length !== 1 ? "s" : ""}
              </Badge>
            </div>

            {appts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Nenhum agendamento registrado
              </div>
            ) : (
              <div className="space-y-2">
                {appts.map(appt => {
                  const derived = deriveStatus(appt.status, appt.startTime);
                  const st = STATUS_CONFIG[derived] ?? { label: derived, bg: "bg-gray-500/15", text: "text-gray-400" };
                  const dot = DOT_COLOR[derived] ?? "bg-gray-400";
                  const emp = employees.find(e => e.id === appt.employeeId);
                  const svcsStr = appt.services?.map(s => s.name).join(", ") || "—";
                  const hasPrice = appt.totalPrice != null && appt.totalPrice > 0;

                  return (
                    <button
                      key={appt.id}
                      onClick={() => goToAgenda(appt.startTime)}
                      className="w-full rounded-xl border border-border bg-card/30 p-3 hover:bg-card/60 hover:border-primary/30 transition-colors text-left group"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs text-muted-foreground">
                                {safeFmt(appt.startTime, "dd/MM/yyyy · HH:mm", { locale: ptBR })}
                              </p>
                              <p className="text-sm font-semibold mt-0.5 truncate">{svcsStr}</p>
                              {emp && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  👤 {emp.name}
                                </p>
                              )}
                            </div>
                            <div className="text-right shrink-0 flex flex-col items-end gap-1">
                              {hasPrice && (
                                <p className="text-sm font-bold text-primary">
                                  R$ {appt.totalPrice!.toFixed(2)}
                                </p>
                              )}
                              <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium ${st.bg} ${st.text}`}>
                                {st.label}
                              </span>
                              <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Stat card helper ──────────────────────────────────────

function StatCard({
  icon, value, label, color = "text-foreground", small = false,
}: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  color?: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={`font-bold ${small ? "text-base" : "text-2xl"} ${color} leading-tight`}>
        {value}
      </p>
    </div>
  );
}
