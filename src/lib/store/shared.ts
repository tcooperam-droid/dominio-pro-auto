/** Infraestrutura compartilhada: cache em memória, mapeadores e acesso genérico ao Supabase. */

import { supabase } from "../supabase";
import type {
  Appointment,
  AuditLog,
  CashEntry,
  CashSession,
  Client,
  CommissionClosing,
  Employee,
  Expense,
  Service,
} from "./types";

// ─── Helpers ───────────────────────────────────────────────

export const toNum = (v: unknown) => parseFloat(String(v ?? 0)) || 0;

const SEARCH_DEBUG_PREFIX = "[store]";

export function normalizeSearchText(value: string): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9@\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildPhoneticKey(value: string): string {
  const base = normalizeSearchText(value)
    .replace(/[aeiou]/g, "")
    .replace(/ph/g, "f")
    .replace(/y/g, "i")
    .replace(/w/g, "v")
    .replace(/h/g, "")
    .replace(/(.)\1+/g, "$1");
  return base.slice(0, 12);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i]);

  for (let j = 1; j <= b.length; j++) rows[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + cost,
      );
    }
  }

  return rows[a.length][b.length];
}

export function scoreClientMatch(query: string, candidate: Client): number {
  const nq = normalizeSearchText(query);
  const nc = normalizeSearchText(candidate.name);

  if (!nq || !nc) return 0;
  if (nc === nq) return 1;
  if (nc.startsWith(nq)) return 0.96;
  if (nc.includes(nq)) return 0.9;

  const nqTokens = nq.split(" ").filter(Boolean);
  if (nqTokens.length > 1 && nqTokens.every(token => nc.includes(token))) return 0.86;

  if (buildPhoneticKey(nc) === buildPhoneticKey(nq)) return 0.8;

  const ratio = 1 - (levenshtein(nq, nc) / Math.max(nq.length, nc.length));
  return ratio >= 0.55 ? ratio * 0.72 : 0;
}

export function escapeLike(value: string): string {
  return value.replace(/[%_,]/g, (m) => `\\${m}`);
}

export function logDb(action: string, details?: unknown): void {
  if (details === undefined) {
    console.log(`${SEARCH_DEBUG_PREFIX} ${action}`);
    return;
  }
  console.log(`${SEARCH_DEBUG_PREFIX} ${action}`, details);
}

// ─── Mappers (snake_case → camelCase) ────────────────────

export function toEmployee(r: any): Employee {
  return {
    id: r.id,
    name: r.name,
    email: r.email ?? "",
    phone: r.phone ?? "",
    color: r.color ?? "#ec4899",
    photoUrl: r.photo_url ?? null,
    specialties: r.specialties ?? [],
    commissionPercent: Number(r.commission_percent ?? 0),
    workingHours: r.working_hours ?? {},
    active: r.active ?? true,
    createdAt: r.created_at,
  };
}

export function toService(r: any): Service {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    durationMinutes: r.duration_minutes ?? 60,
    price: Number(r.price ?? 0),
    materialCostPercent: Number(r.material_cost_percent ?? 0),
    commissionMode: r.commission_mode ?? "cost_first",
    color: r.color ?? "#ec4899",
    active: r.active ?? true,
    createdAt: r.created_at,
  };
}

export function toClient(r: any): Client {
  return {
    id: r.id,
    name: r.name,
    email: r.email ?? null,
    phone: r.phone ?? null,
    birthDate: r.birth_date ?? null,
    cpf: r.cpf ?? null,
    address: r.address ?? null,
    notes: r.notes ?? null,
    createdAt: r.created_at,
  };
}

export function toAppointment(r: any): Appointment {
  return {
    id: r.id,
    clientName: r.client_name ?? null,
    clientId: r.client_id ?? null,
    employeeId: r.employee_id,
    startTime: r.start_time,
    endTime: r.end_time,
    status: r.status,
    totalPrice: r.total_price != null ? Number(r.total_price) : null,
    notes: r.notes ?? null,
    paymentStatus: r.payment_status ?? null,
    groupId: r.group_id ?? null,
    services: r.services ?? [],
    createdAt: r.created_at,
  };
}

export function toCashSession(r: any): CashSession {
  return {
    id: r.id,
    openedAt: r.opened_at,
    closedAt: r.closed_at ?? null,
    openingBalance: Number(r.opening_balance ?? 0),
    totalRevenue: r.total_revenue != null ? Number(r.total_revenue) : null,
    totalCommissions: r.total_commissions != null ? Number(r.total_commissions) : null,
    closingNotes: r.closing_notes ?? null,
    status: r.status,
  };
}

export function toCashEntry(r: any): CashEntry {
  return {
    id: r.id,
    sessionId: r.session_id,
    appointmentId: r.appointment_id ?? null,
    clientName: r.client_name ?? "",
    employeeId: r.employee_id,
    description: r.description ?? "",
    amount: Number(r.amount ?? 0),
    paymentMethod: r.payment_method ?? "dinheiro",
    commissionPercent: Number(r.commission_percent ?? 0),
    commissionValue: Number(r.commission_value ?? 0),
    materialCostValue: Number(r.material_cost_value ?? 0),
    isAutoLaunch: r.is_auto_launch ?? false,
    createdAt: r.created_at,
  };
}

export function toAuditLog(r: any): AuditLog {
  return {
    id: r.id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    action: r.action,
    description: r.description,
    userName: r.user_name ?? null,
    createdAt: r.created_at,
  };
}

export function toExpense(r: any): Expense {
  return {
    id: r.id,
    date: r.date,
    category: r.category,
    description: r.description,
    amount: Number(r.amount ?? 0),
    status: r.status ?? "pendente",
    notes: r.notes ?? null,
    createdAt: r.created_at,
  };
}

export function toCommissionClosing(r: any): CommissionClosing {
  return {
    id: r.id,
    employeeId: r.employee_id,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    totalRevenue: Number(r.total_revenue ?? 0),
    totalCommission: Number(r.total_commission ?? 0),
    appointmentCount: Number(r.appointment_count ?? 0),
    status: r.status ?? "pendente",
    paidAt: r.paid_at ?? null,
    notes: r.notes ?? null,
    createdAt: r.created_at,
  };
}

// ─── Cache em memória ─────────────────────────────────────

export const cache = {
  employees: [] as Employee[],
  services: [] as Service[],
  clients: [] as Client[],
  appointments: [] as Appointment[],
  cashSessions: [] as CashSession[],
  cashEntries: [] as CashEntry[],
  auditLogs: [] as AuditLog[],
  expenses: [] as Expense[],
  commissionClosings: [] as CommissionClosing[],
};

export async function addAuditLog(
  entityType: string,
  entityId: number,
  action: string,
  description: string,
): Promise<void> {
  await supabase.from("audit_logs").insert({
    entity_type: entityType,
    entity_id: entityId,
    action,
    description,
    user_name: "Admin",
  });
}

// ─── Função de Busca em Lotes (Paginação Recursiva) ───────

export async function fetchAllFromTable(tableName: string, orderBy: string = "id"): Promise<any[]> {
  logDb(`fetchAllFromTable:start ${tableName}`, { orderBy });

  let allData: any[] = [];
  let from = 0;
  let to = 999;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .order(orderBy)
      .range(from, to);

    if (error) {
      logDb(`fetchAllFromTable:error ${tableName}`, error);
      throw error;
    }

    logDb(`fetchAllFromTable:chunk ${tableName}`, {
      from,
      to,
      returned: data?.length ?? 0,
    });

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allData = [...allData, ...data];

      if (data.length < 1000) {
        hasMore = false;
      } else {
        from += 1000;
        to += 1000;
      }
    }
  }

  logDb(`fetchAllFromTable:done ${tableName}`, { total: allData.length });
  return allData;
}
