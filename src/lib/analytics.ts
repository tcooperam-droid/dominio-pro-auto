/**
 * analytics.ts — Fonte única de verdade para cálculos financeiros.
 * Todos os dados derivam dos agendamentos (appointments).
 * Regras:
 *  - A agenda é a fonte de verdade.
 *  - Tudo que está na agenda com valor > 0 entra no faturamento, independente do status.
 *  - O caixa é apenas operacional.
 */
import { appointmentsStore } from "../features/agenda";
import { employeesStore } from "../features/funcionarios";
import type { Appointment } from "../features/agenda";
import type { Employee } from "../features/funcionarios";
import {
  format, isWithinInterval, parseISO,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfYear, endOfYear, subDays, addDays, subWeeks, subMonths, subYears, isSameMonth, isSameYear,
} from "date-fns";
import { ptBR } from "date-fns/locale";

export const toNum = (v: unknown) => parseFloat(String(v ?? 0)) || 0;

/** Regra Central: Se tem valor, entra no faturamento */
export const isFinancialAppointment = (a: Appointment) => toNum(a.totalPrice) > 0;

export const EXCLUDED = ["cancelled", "no_show"] as const;
/** Mantido para compatibilidade, mas a regra financeira agora é isFinancialAppointment */
export const isValid = (a: Appointment) => isFinancialAppointment(a);
export const isCompleted = (a: Appointment) => a.status === "completed" && toNum(a.totalPrice) > 0;

export type Period = "hoje" | "semana" | "mes" | "trimestre" | "ano" | "custom";

export function getPeriodDates(period: Period, customStart?: string, customEnd?: string) {
  const now = new Date();
  switch (period) {
    case "hoje":
      return {
        start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0),
        end:   new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59),
        label: "Hoje",
      };
    case "semana":
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }),
        end:   endOfWeek(now,   { weekStartsOn: 1 }),
        label: "Esta semana",
      };
    case "mes":
      return { start: startOfMonth(now), end: endOfMonth(now), label: "Este mês" };
    case "trimestre":
      return { start: subDays(now, 89), end: now, label: "Últimos 90 dias" };
    case "ano":
      return { start: startOfYear(now), end: endOfYear(now), label: "Este ano" };
    case "custom":
      return {
        start: customStart ? parseISO(customStart) : subDays(now, 30),
        end:   customEnd   ? parseISO(customEnd)   : now,
        label: "Período personalizado",
      };
  }
}

export function getAppointmentsInPeriod(start: Date, end: Date): Appointment[] {
  return appointmentsStore.list({}).filter(a => {
    try {
      const d = parseISO(a.startTime);
      return d >= start && d <= end;
    } catch { return false; }
  });
}

export function calcMaterialCost(appt: Appointment): number {
  return (appt.services ?? []).reduce((sum, s) => {
    return sum + (toNum(s.price) * (toNum(s.materialCostPercent) / 100));
  }, 0);
}

export function calcCommission(appt: Appointment, emp: Employee): number {
  return (appt.services ?? []).reduce((sum, s) => {
    const price = toNum(s.price);
    const matCost = price * (toNum(s.materialCostPercent) / 100);
    const mode = s.commissionMode ?? "cost_first";

    if (mode === "commission_first") {
      return sum + (price * (emp.commissionPercent / 100));
    }
    const base = Math.max(0, price - matCost);
    return sum + (base * (emp.commissionPercent / 100));
  }, 0);
}

export interface PeriodStats {
  totalRevenue:      number;
  totalMaterial:     number;
  totalCommissions:  number;
  netRevenue:        number;
  count:             number;
  avgTicket:         number;
  cancelCount:       number;
  cancelRate:        number;
  scheduledRevenue:  number;
  scheduledCount:    number;
}

export function calcPeriodStats(appts: Appointment[], employees: Employee[]): PeriodStats {
  const empMap = new Map(employees.map(e => [e.id, e]));

  const valid     = appts.filter(isFinancialAppointment);
  const future    = appts.filter(a => ["scheduled", "confirmed"].includes(a.status) && new Date(a.startTime) > new Date());
  const cancelled = appts.filter(a => EXCLUDED.includes(a.status as any));

  let totalRevenue     = 0;
  let totalMaterial    = 0;
  let totalCommissions = 0;

  for (const a of valid) {
    const rev  = toNum(a.totalPrice);
    const mat  = calcMaterialCost(a);
    const emp  = empMap.get(a.employeeId);
    const comm = emp ? calcCommission(a, emp) : 0;
    totalRevenue     += rev;
    totalMaterial    += mat;
    totalCommissions += comm;
  }

  const netRevenue       = totalRevenue - totalMaterial - totalCommissions;
  const scheduledRevenue = future.reduce((s, a) => s + toNum(a.totalPrice), 0);

  return {
    totalRevenue,
    totalMaterial,
    totalCommissions,
    netRevenue,
    count:            valid.length,
    avgTicket:        valid.length > 0 ? totalRevenue / valid.length : 0,
    cancelCount:      cancelled.length,
    cancelRate:       appts.length > 0 ? (cancelled.length / appts.length) * 100 : 0,
    scheduledRevenue,
    scheduledCount:   future.length,
  };
}

export function calcRevenueByDay(
  appts: Appointment[],
  days: number = 7,
): { date: string; label: string; revenue: number; count: number }[] {
  const result: { date: string; label: string; revenue: number; count: number }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = subDays(now, i);
    const key = format(d, "yyyy-MM-dd");
    const dayAppts = appts.filter(a => {
      try { return format(parseISO(a.startTime), "yyyy-MM-dd") === key; } catch { return false; }
    }).filter(isFinancialAppointment);
    result.push({
      date:    key,
      label:   format(d, "dd/MM"),
      revenue: dayAppts.reduce((s, a) => s + toNum(a.totalPrice), 0),
      count:   dayAppts.length,
    });
  }
  return result;
}

export function calcRevenueByEmployee(appts: Appointment[], employees: Employee[]) {
  return employees.map(emp => {
    const empAppts   = appts.filter(a => a.employeeId === emp.id).filter(isFinancialAppointment);
    const revenue    = empAppts.reduce((s, a) => s + toNum(a.totalPrice), 0);
    const material   = empAppts.reduce((s, a) => s + calcMaterialCost(a), 0);
    const commission = empAppts.reduce((s, a) => s + calcCommission(a, emp), 0);
    return {
      id:                emp.id,
      name:              emp.name,
      firstName:         emp.name.split(" ")[0],
      color:             emp.color,
      photoUrl:          emp.photoUrl,
      revenue,
      material,
      commission,
      net:               revenue - material - commission,
      count:             empAppts.length,
      commissionPercent: emp.commissionPercent,
    };
  }).filter(e => e.count > 0).sort((a, b) => b.revenue - a.revenue);
}

export function calcPopularServices(appts: Appointment[]) {
  const counts: Record<number, { serviceId: number; name: string; count: number; revenue: number; color: string }> = {};
  appts.filter(isFinancialAppointment).forEach(a => {
    (a.services ?? []).forEach(s => {
      if (!counts[s.serviceId]) {
        counts[s.serviceId] = { serviceId: s.serviceId, name: s.name, count: 0, revenue: 0, color: s.color ?? "#ec4899" };
      }
      counts[s.serviceId].count++;
      counts[s.serviceId].revenue += toNum(s.price);
    });
  });
  return Object.values(counts).sort((a, b) => b.count - a.count);
}

// ─── Novas funções financeiras ────────────────────────────

export function calcTopClients(
  appts: Appointment[],
  limit = 10,
): {
  clientId: number | null;
  clientName: string;
  totalSpent: number;
  visitCount: number;
  avgTicket: number;
  lastVisit: string;
}[] {
  const financial = appts.filter(isFinancialAppointment);

  const map = new Map<string, {
    clientId: number | null;
    clientName: string;
    totalSpent: number;
    visitCount: number;
    lastVisit: string;
  }>();

  for (const a of financial) {
    const key = a.clientId ? `id:${a.clientId}` : `name:${(a.clientName ?? "Sem nome").toLowerCase()}`;
    const existing = map.get(key);
    const price = toNum(a.totalPrice);
    const date = a.startTime.slice(0, 10);

    if (existing) {
      existing.totalSpent += price;
      existing.visitCount += 1;
      if (date > existing.lastVisit) existing.lastVisit = date;
    } else {
      map.set(key, {
        clientId:   a.clientId,
        clientName: a.clientName ?? "Sem nome",
        totalSpent: price,
        visitCount: 1,
        lastVisit:  date,
      });
    }
  }

  return Array.from(map.values())
    .map(c => ({ ...c, avgTicket: c.visitCount > 0 ? c.totalSpent / c.visitCount : 0 }))
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, limit);
}

export function calcConversionRate(appts: Appointment[]): number {
  const past90Start = subDays(new Date(), 90);
  const past = appts.filter(a => {
    try { return parseISO(a.startTime) <= new Date() && parseISO(a.startTime) >= past90Start; }
    catch { return false; }
  });

  const completed  = past.filter(a => a.status === "completed").length;
  const terminal   = past.filter(a => ["completed", "cancelled", "no_show"].includes(a.status)).length;

  if (terminal === 0) return 0.85; 
  return completed / terminal;
}

export function calcClientReturnFrequency(appts: Appointment[]): number {
  const sorted = appts
    .filter(isFinancialAppointment)
    .map(a => a.startTime.slice(0, 10))
    .sort();

  if (sorted.length < 2) return -1;

  let totalDays = 0;
  for (let i = 1; i < sorted.length; i++) {
    const diff = (new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) / 86400000;
    totalDays += diff;
  }

  return Math.round(totalDays / (sorted.length - 1));
}

export function calcMostProfitableServices(appts: Appointment[]): {
  serviceId: number;
  name: string;
  count: number;
  revenue: number;
  materialCost: number;
  margin: number;
  color: string;
}[] {
  const map = new Map<number, {
    serviceId: number;
    name: string;
    count: number;
    revenue: number;
    materialCost: number;
    color: string;
  }>();

  appts.filter(isFinancialAppointment).forEach(a => {
    (a.services ?? []).forEach(s => {
      const price    = toNum(s.price);
      const matCost  = price * (toNum(s.materialCostPercent) / 100);
      const existing = map.get(s.serviceId);

      if (existing) {
        existing.count++;
        existing.revenue     += price;
        existing.materialCost += matCost;
      } else {
        map.set(s.serviceId, {
          serviceId:    s.serviceId,
          name:         s.name,
          count:        1,
          revenue:      price,
          materialCost: matCost,
          color:        s.color ?? "#ec4899",
        });
      }
    });
  });

  return Array.from(map.values())
    .map(s => ({
      ...s,
      margin: s.revenue > 0 ? ((s.revenue - s.materialCost) / s.revenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

export function calcWeeklyRevenue(
  appts: Appointment[],
  weeks: number = 8,
): { weekLabel: string; revenue: number; count: number }[] {
  const result: { weekLabel: string; revenue: number; count: number }[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const refDate  = subWeeks(new Date(), i);
    const wStart   = startOfWeek(refDate, { weekStartsOn: 1 });
    const wEnd     = endOfWeek(refDate, { weekStartsOn: 1 });
    const label    = format(wStart, "dd/MM", { locale: ptBR });

    const weekAppts = appts.filter(a => {
      try {
        const d = parseISO(a.startTime);
        return isWithinInterval(d, { start: wStart, end: wEnd });
      } catch { return false; }
    }).filter(isFinancialAppointment);

    result.push({
      weekLabel: label,
      revenue:   weekAppts.reduce((s, a) => s + toNum(a.totalPrice), 0),
      count:     weekAppts.length,
    });
  }

  return result;
}

export function calcInactiveClients(
  appts: Appointment[],
  inactiveDays = 70,
  activeClientIds?: Set<number>,
): { clientId: number | null; clientName: string; lastVisit: string; daysSince: number }[] {
  const now = new Date();
  const threshold = subDays(now, inactiveDays);

  // Filtrar agendamentos de clientes excluídos do cadastro:
  // Se activeClientIds é fornecido e o agendamento tem clientId, o cliente
  // deve ainda existir no cadastro (não foi deletado).
  const validAppts = activeClientIds
    ? appts.filter(a => !a.clientId || activeClientIds.has(a.clientId))
    : appts;

  // Some appointments are linked by clientId, others only by clientName (e.g. walk-ins).
  // Build a name→clientId map so both kinds are unified under the same key.
  const nameToClientId = new Map<string, number>();
  validAppts.forEach(a => {
    if (a.clientId && a.clientName) {
      nameToClientId.set((a.clientName).toLowerCase(), a.clientId);
    }
  });

  const getKey = (a: Appointment): string => {
    const id = a.clientId ?? nameToClientId.get((a.clientName ?? "").toLowerCase());
    return id ? `id:${id}` : `name:${(a.clientName ?? "").toLowerCase()}`;
  };

  const futureClientsSet = new Set(
    validAppts
      .filter(a => ["scheduled", "confirmed"].includes(a.status) && parseISO(a.startTime) > now)
      .map(getKey)
  );

  const lastVisitMap = new Map<string, { clientId: number | null; clientName: string; lastVisit: string }>();

  validAppts
    .filter(a => !EXCLUDED.includes(a.status as typeof EXCLUDED[number]) && parseISO(a.startTime) <= now)
    .forEach(a => {
      const key      = getKey(a);
      const date     = a.startTime.slice(0, 10);
      const resolvedId = a.clientId ?? nameToClientId.get((a.clientName ?? "").toLowerCase()) ?? null;
      const cur      = lastVisitMap.get(key);
      if (!cur || date > cur.lastVisit) {
        lastVisitMap.set(key, { clientId: resolvedId, clientName: a.clientName ?? "Sem nome", lastVisit: date });
      }
    });

  return Array.from(lastVisitMap.entries())
    .filter(([key, v]) => {
      if (futureClientsSet.has(key)) return false;
      return parseISO(v.lastVisit) < threshold;
    })
    .map(([, v]) => ({
      ...v,
      daysSince: Math.floor((now.getTime() - parseISO(v.lastVisit).getTime()) / 86400000),
    }))
    .sort((a, b) => b.daysSince - a.daysSince);
}

// ─── Visão Histórica ──────────────────────────────────────

export interface HistoricalStats {
  label: string;
  revenue: number;
  count: number;
  avgTicket: number;
  growth?: number;
}

export function calcMonthlyHistory(appts: Appointment[], months: number = 12): HistoricalStats[] {
  const result: HistoricalStats[] = [];
  const now = new Date();
  
  for (let i = months - 1; i >= 0; i--) {
    const d = subMonths(now, i);
    const start = startOfMonth(d);
    const end = endOfMonth(d);
    const label = format(d, "MMM/yy", { locale: ptBR });
    
    const monthAppts = appts.filter(a => {
      try {
        const ad = parseISO(a.startTime);
        return ad >= start && ad <= end && ad <= now && isFinancialAppointment(a);
      } catch { return false; }
    });
    
    const revenue = monthAppts.reduce((s, a) => s + toNum(a.totalPrice), 0);
    const count = monthAppts.length;
    
    const prev = result[result.length - 1];
    const growth = (prev && prev.revenue > 0) ? ((revenue - prev.revenue) / prev.revenue) * 100 : undefined;
    
    result.push({
      label,
      revenue,
      count,
      avgTicket: count > 0 ? revenue / count : 0,
      growth
    });
  }
  return result;
}

export function calcYearlyHistory(appts: Appointment[]): HistoricalStats[] {
  const result: HistoricalStats[] = [];
  const now = new Date();
  
  // Pegar todos os anos presentes nos agendamentos
  const years = Array.from(new Set(appts.map(a => parseISO(a.startTime).getFullYear()))).sort();
  
  for (let i = 0; i < years.length; i++) {
    const year = years[i];
    const start = startOfYear(new Date(year, 0, 1));
    const end = endOfYear(new Date(year, 0, 1));
    
    const yearAppts = appts.filter(a => {
      try {
        const ad = parseISO(a.startTime);
        return ad >= start && ad <= end && ad <= now && isFinancialAppointment(a);
      } catch { return false; }
    });
    
    const revenue = yearAppts.reduce((s, a) => s + toNum(a.totalPrice), 0);
    const count = yearAppts.length;
    
    const prev = result[result.length - 1];
    const growth = (prev && prev.revenue > 0) ? ((revenue - prev.revenue) / prev.revenue) * 100 : undefined;
    
    result.push({
      label: String(year),
      revenue,
      count,
      avgTicket: count > 0 ? revenue / count : 0,
      growth
    });
  }
  return result;
  }
