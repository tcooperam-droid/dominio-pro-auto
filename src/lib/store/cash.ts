/** Casos de uso e persistência dos domínios de caixa, despesas e comissões. */

import { supabase } from "../supabase";
import type { Appointment, CashEntry, CashSession, CommissionClosing, Employee, Expense } from "./types";
import { appointmentsStore } from "./appointments";
import { calcCommission } from "./commission";
import {
  addAuditLog,
  cache,
  fetchAllFromTable,
  logDb,
  toCashEntry,
  toCashSession,
  toCommissionClosing,
  toExpense,
  toNum,
} from "./shared";

// ─── Cash Sessions ───────────────────────────────────────

export const cashSessionsStore = {
  list(): CashSession[] {
    return [...cache.cashSessions];
  },

  getCurrent(): CashSession | null {
    return cache.cashSessions.find(s => s.status === "open") || null;
  },

  async fetchAll(): Promise<CashSession[]> {
    const { data, error } = await supabase
      .from("cash_sessions")
      .select("*")
      .order("opened_at", { ascending: false });

    if (error) throw error;

    cache.cashSessions = (data ?? []).map(toCashSession);

    return cache.cashSessions;
  },

  async open(openingBalance: number, openedDate?: string): Promise<CashSession> {
    const openedAt = openedDate ? `${openedDate}T00:00:00.000Z` : new Date().toISOString();

    const { data: row, error } = await supabase
      .from("cash_sessions")
      .insert({
        opened_at: openedAt,
        opening_balance: openingBalance,
        status: "open",
      })
      .select()
      .single();

    if (error) throw error;

    const session = toCashSession(row);
    cache.cashSessions.unshift(session);

    await addAuditLog("cash_session", session.id, "open", `Caixa aberto com R$ ${openingBalance.toFixed(2)}`);

    return session;
  },

  async close(
    id: number,
    data: { totalRevenue: number; totalCommissions: number; closingNotes?: string },
  ): Promise<CashSession> {
    const { data: row, error } = await supabase
      .from("cash_sessions")
      .update({
        closed_at: new Date().toISOString(),
        total_revenue: data.totalRevenue,
        total_commissions: data.totalCommissions,
        closing_notes: data.closingNotes,
        status: "closed",
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    const session = toCashSession(row);
    const idx = cache.cashSessions.findIndex(s => s.id === id);

    if (idx !== -1) cache.cashSessions[idx] = session;

    await addAuditLog("cash_session", id, "close", `Caixa fechado. Receita: R$ ${data.totalRevenue.toFixed(2)}`);

    return session;
  },

  async reopen(id: number): Promise<CashSession> {
    const current = cache.cashSessions.find(s => s.status === "open" && s.id !== id);

    if (current) throw new Error("Feche o caixa atual antes de reabrir outro.");

    const { data: row, error } = await supabase
      .from("cash_sessions")
      .update({ status: "open", closed_at: null })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    const session = toCashSession(row);
    const idx = cache.cashSessions.findIndex(s => s.id === id);

    if (idx !== -1) cache.cashSessions[idx] = session;

    await addAuditLog("cash_session", id, "reopen", `Caixa #${id} reaberto`);

    return session;
  },
};

// ─── Cash Entries ────────────────────────────────────────

export const cashEntriesStore = {
  list(sessionId?: number): CashEntry[] {
    return sessionId ? cache.cashEntries.filter(e => e.sessionId === sessionId) : [...cache.cashEntries];
  },

  async fetchAll(): Promise<CashEntry[]> {
    const data = await fetchAllFromTable("cash_entries", "created_at");
    cache.cashEntries = data.map(toCashEntry);
    return cache.cashEntries;
  },

  async create(data: Omit<CashEntry, "id" | "createdAt">): Promise<CashEntry> {
    const { data: row, error } = await supabase
      .from("cash_entries")
      .insert({
        session_id: data.sessionId,
        appointment_id: data.appointmentId,
        client_name: data.clientName,
        employee_id: data.employeeId,
        description: data.description,
        amount: data.amount,
        payment_method: data.paymentMethod,
        commission_percent: data.commissionPercent,
        commission_value: data.commissionValue,
        material_cost_value: data.materialCostValue,
        is_auto_launch: data.isAutoLaunch,
      })
      .select()
      .single();

    if (error) throw error;

    const entry = toCashEntry(row);
    cache.cashEntries.unshift(entry);

    return entry;
  },

  async update(id: number, data: Partial<CashEntry>): Promise<CashEntry | null> {
    const p: any = {};

    if (data.clientName !== undefined) p.client_name = data.clientName;
    if (data.description !== undefined) p.description = data.description;
    if (data.amount !== undefined) p.amount = data.amount;
    if (data.paymentMethod !== undefined) p.payment_method = data.paymentMethod;
    if (data.commissionPercent !== undefined) p.commission_percent = data.commissionPercent;
    if (data.commissionValue !== undefined) p.commission_value = data.commissionValue;

    const { data: row, error } = await supabase
      .from("cash_entries")
      .update(p)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    const entry = toCashEntry(row);
    const idx = cache.cashEntries.findIndex(e => e.id === id);

    if (idx !== -1) cache.cashEntries[idx] = entry;

    return entry;
  },

  async delete(id: number): Promise<void> {
    await supabase.from("cash_entries").delete().eq("id", id);

    cache.cashEntries = cache.cashEntries.filter(e => e.id !== id);

    await addAuditLog("cash_entry", id, "delete", `Lançamento #${id} removido`);
  },

  async deleteBySession(sessionId: number): Promise<void> {
    await supabase.from("cash_entries").delete().eq("session_id", sessionId);

    cache.cashEntries = cache.cashEntries.filter(e => e.sessionId !== sessionId);
  },

  async deleteByAppointment(appointmentId: number): Promise<void> {
    await supabase.from("cash_entries").delete().eq("appointment_id", appointmentId);

    cache.cashEntries = cache.cashEntries.filter(e => e.appointmentId !== appointmentId);
  },
};

// ─── Expenses ────────────────────────────────────────────

export const expensesStore = {
  list(filters?: { startDate?: string; endDate?: string; category?: string; status?: string }): Expense[] {
    let list = [...cache.expenses];

    if (filters?.startDate) list = list.filter(e => e.date >= filters.startDate!);
    if (filters?.endDate) list = list.filter(e => e.date <= filters.endDate!);
    if (filters?.category) list = list.filter(e => e.category === filters.category);
    if (filters?.status) list = list.filter(e => e.status === filters.status);

    return list.sort((a, b) => b.date.localeCompare(a.date));
  },

  async fetchAll(): Promise<Expense[]> {
    const data = await fetchAllFromTable("expenses", "date");
    cache.expenses = data.map(toExpense);
    return cache.expenses;
  },

  async create(data: Omit<Expense, "id" | "createdAt">): Promise<Expense> {
    const { data: row, error } = await supabase
      .from("expenses")
      .insert({
        date: data.date,
        category: data.category,
        description: data.description,
        amount: data.amount,
        status: data.status,
        notes: data.notes,
      })
      .select()
      .single();

    if (error) throw error;

    const expense = toExpense(row);
    cache.expenses.unshift(expense);
    window.dispatchEvent(new Event("expenses_updated"));

    return expense;
  },

  async update(id: number, data: Partial<Omit<Expense, "id" | "createdAt">>): Promise<Expense | null> {
    const p: any = {};

    if (data.date !== undefined) p.date = data.date;
    if (data.category !== undefined) p.category = data.category;
    if (data.description !== undefined) p.description = data.description;
    if (data.amount !== undefined) p.amount = data.amount;
    if (data.status !== undefined) p.status = data.status;
    if (data.notes !== undefined) p.notes = data.notes;

    const { data: row, error } = await supabase
      .from("expenses")
      .update(p)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    const expense = toExpense(row);
    const idx = cache.expenses.findIndex(e => e.id === id);

    if (idx !== -1) cache.expenses[idx] = expense;
    window.dispatchEvent(new Event("expenses_updated"));

    return expense;
  },

  async delete(id: number): Promise<void> {
    await supabase.from("expenses").delete().eq("id", id);

    cache.expenses = cache.expenses.filter(e => e.id !== id);
    window.dispatchEvent(new Event("expenses_updated"));
  },
};

// ─── Commission Closings ─────────────────────────────────

export const commissionClosingsStore = {
  list(): CommissionClosing[] {
    return [...cache.commissionClosings].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async fetchAll(): Promise<CommissionClosing[]> {
    const data = await fetchAllFromTable("commission_closings", "created_at");
    cache.commissionClosings = data.map(toCommissionClosing);
    return cache.commissionClosings;
  },

  async create(data: Omit<CommissionClosing, "id" | "createdAt">): Promise<CommissionClosing> {
    const { data: row, error } = await supabase
      .from("commission_closings")
      .insert({
        employee_id: data.employeeId,
        period_start: data.periodStart,
        period_end: data.periodEnd,
        total_revenue: data.totalRevenue,
        total_commission: data.totalCommission,
        appointment_count: data.appointmentCount,
        status: data.status,
        paid_at: data.paidAt,
        notes: data.notes,
      })
      .select()
      .single();

    if (error) throw error;

    const closing = toCommissionClosing(row);
    cache.commissionClosings.unshift(closing);

    return closing;
  },

  async markAsPaid(id: number): Promise<CommissionClosing | null> {
    const { data: row, error } = await supabase
      .from("commission_closings")
      .update({ status: "paga", paid_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    const closing = toCommissionClosing(row);
    const idx = cache.commissionClosings.findIndex(c => c.id === id);

    if (idx !== -1) cache.commissionClosings[idx] = closing;

    return closing;
  },

  async delete(id: number): Promise<void> {
    await supabase.from("commission_closings").delete().eq("id", id);

    cache.commissionClosings = cache.commissionClosings.filter(c => c.id !== id);
  },
};

// ─── Auto-Launch Cash Entry ──────────────────────────────

export async function autoLaunchCashEntry(appt: Appointment): Promise<void> {
  const currentSession = cache.cashSessions.find(s => s.status === "open");

  if (!currentSession) return;

  const sessionDate = currentSession.openedAt.slice(0, 10);
  const apptDate = appt.startTime.slice(0, 10);

  if (apptDate < sessionDate) return;

  const existing = cache.cashEntries.find(e => e.appointmentId === appt.id);

  if (existing) return;

  const emp = cache.employees.find(e => e.id === appt.employeeId);

  if (!emp) return;

  const amount = toNum(appt.totalPrice);
  let totalCommission = 0;
  let totalMaterialCost = 0;

  (appt.services ?? []).forEach(s => {
    const svcPrice = toNum(s.price);
    const matCost = svcPrice * (toNum(s.materialCostPercent) / 100);

    totalMaterialCost += matCost;
    totalCommission += calcCommission(svcPrice, matCost, emp.commissionPercent, s.commissionMode);
  });

  const services = (appt.services ?? []).map(s => s.name).join(", ") || "Serviço";

  await cashEntriesStore.create({
    sessionId: currentSession.id,
    appointmentId: appt.id,
    clientName: appt.clientName ?? "Cliente",
    employeeId: emp.id,
    description: services,
    amount,
    paymentMethod: "dinheiro",
    commissionPercent: emp.commissionPercent,
    commissionValue: totalCommission,
    materialCostValue: totalMaterialCost,
    isAutoLaunch: true,
  });

  await appointmentsStore.update(appt.id, { paymentStatus: "paid" });

  window.dispatchEvent(new Event("cash_entry_auto_launched"));
}
