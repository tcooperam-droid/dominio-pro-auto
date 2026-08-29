import { supabase, ensureSupabaseSession } from "@/lib/supabase";
import { appointmentsStore } from "@/features/agenda";
import { employeesStore } from "@/features/funcionarios";
import { expensesStore } from "@/features/financeiro";
import { isFinancialAppointment, toNum } from "@/lib/analytics";
import { localDateKey } from "@/lib/agentSchedule";
import type { AccountingAssignment, AccountingCompany, AccountingExportRecord, AccountingMembership, AccountingProductionRow } from "./types";
import type { Appointment, Employee } from "@/lib/store/types";

const companyRow = (row: any): AccountingCompany => ({
  id: row.id,
  name: row.name,
  cnpj: row.cnpj,
  tradeName: null,
  active: row.active !== false,
});

const membershipRow = (row: any): AccountingMembership => ({
  id: row.id,
  companyId: row.company_id,
  employeeId: Number(row.employee_id),
  validFrom: row.valid_from,
  validUntil: row.valid_until ?? null,
});

const assignmentRow = (row: any): AccountingAssignment => ({
  id: row.id,
  appointmentId: Number(row.appointment_id),
  companyId: row.company_id,
  employeeId: Number(row.employee_id),
});

export const accountingStore = {
  async listCompanies(): Promise<AccountingCompany[]> {
    await ensureSupabaseSession();
    const [{ data, error }, { data: membershipRows, error: membershipError }] = await Promise.all([
      supabase.from("accounting_companies").select("*").order("name"),
      supabase.from("accounting_company_memberships").select("company_id"),
    ]);
    if (error) throw error;
    if (membershipError) throw membershipError;

    // Registros antigos podem ter sido criados antes da restrição UNIQUE do
    // schema. Deduplicate na leitura sem tocar nas tabelas existentes.
    const membershipCount = new Map<string, number>();
    for (const row of membershipRows ?? []) {
      membershipCount.set(row.company_id, (membershipCount.get(row.company_id) ?? 0) + 1);
    }
    const canonicalByCnpj = new Map<string, any>();
    for (const row of data ?? []) {
      const key = String(row.cnpj).replace(/\D/g, "");
      const current = canonicalByCnpj.get(key);
      if (!current || (membershipCount.get(row.id) ?? 0) > (membershipCount.get(current.id) ?? 0)) {
        canonicalByCnpj.set(key, row);
      }
    }
    return [...canonicalByCnpj.values()].map(companyRow);
  },

  async listMemberships(): Promise<AccountingMembership[]> {
    await ensureSupabaseSession();
    const { data, error } = await supabase.from("accounting_company_memberships").select("*").order("valid_from");
    if (error) throw error;
    return (data ?? []).map(membershipRow);
  },

  async createCompany(input: { name: string; cnpj: string }): Promise<AccountingCompany> {
    const { data, error } = await supabase.from("accounting_companies").insert({
      name: input.name.trim(), cnpj: input.cnpj.replace(/\D/g, ""),
    }).select().single();
    if (error) throw error;
    return companyRow(data);
  },

  async createMembership(input: { companyId: string; employeeId: number; validFrom?: string; validUntil?: string | null }): Promise<AccountingMembership> {
    const { data, error } = await supabase.from("accounting_company_memberships").insert({
      company_id: input.companyId, employee_id: input.employeeId,
      valid_from: input.validFrom ?? "2026-01-01", valid_until: input.validUntil ?? null,
    }).select().single();
    if (error) throw error;
    return membershipRow(data);
  },

  async closeMembership(id: string, validUntil: string): Promise<AccountingMembership> {
    const { data, error } = await supabase
      .from("accounting_company_memberships")
      .update({ valid_until: validUntil })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return membershipRow(data);
  },

  async syncAssignments(appointments: Appointment[], memberships: AccountingMembership[]): Promise<AccountingAssignment[]> {
    const existing = await this.listAssignments();
    const existingIds = new Set(existing.map(assignment => assignment.appointmentId));
    const rows = appointments
      .filter(a => !a.notes?.startsWith("__DOMINIO_TIME_BLOCK__"))
      .filter(a => !existingIds.has(a.id))
      .map(a => {
        const date = localDateKey(a.startTime) ?? "";
        const membership = memberships
          .filter(item => item.employeeId === a.employeeId && item.validFrom <= date && (!item.validUntil || item.validUntil >= date))
          .sort((left, right) => right.validFrom.localeCompare(left.validFrom))[0];
        return membership ? { appointment_id: a.id, employee_id: a.employeeId, company_id: membership.companyId } : null;
      })
      .filter((row): row is { appointment_id: number; employee_id: number; company_id: string } => Boolean(row));
    if (!rows.length) return existing;
    const { data, error } = await supabase.from("accounting_appointment_assignments").insert(rows).select();
    if (error) throw error;
    return [...existing, ...(data ?? []).map(assignmentRow)];
  },

  async listAssignments(): Promise<AccountingAssignment[]> {
    await ensureSupabaseSession();
    const { data, error } = await supabase.from("accounting_appointment_assignments").select("*");
    if (error) throw error;
    return (data ?? []).map(assignmentRow);
  },

  async loadProduction(start: string, end: string, companyId?: string): Promise<{ rows: AccountingProductionRow[]; companies: AccountingCompany[]; employees: Employee[] }> {
    await ensureSupabaseSession();
    const [companies, memberships] = await Promise.all([
      this.listCompanies(), this.listMemberships(),
    ]);
    const appointments = appointmentsStore
      .list({ startDate: start, endDate: end })
      .filter(isFinancialAppointment);
    // O período histórico pode conter colaboradores que hoje estão inativos.
    const employees = employeesStore.list();
    await this.syncAssignments(appointments, memberships);
    const assignments = await this.listAssignments();
    const assignmentMap = new Map(assignments.map(a => [a.appointmentId, a]));
    const companyMap = new Map(companies.map(c => [c.id, c]));
    const employeeMap = new Map(employees.map(e => [e.id, e]));
    const rows = appointments
      .filter(a => a.status !== "cancelled")
      .map(appointment => {
        const assignment = assignmentMap.get(appointment.id);
        const company = assignment ? companyMap.get(assignment.companyId) : undefined;
        return company ? { appointment, employee: employeeMap.get(appointment.employeeId) ?? null, company, services: appointment.services, grossValue: toNum(appointment.totalPrice) } : null;
      })
      .filter((row): row is AccountingProductionRow => Boolean(row && (!companyId || row.company.id === companyId)));
    return { rows, companies, employees };
  },

  async listExports(): Promise<AccountingExportRecord[]> {
    const { data, error } = await supabase.from("accounting_exports").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(row => ({ id: row.id, companyId: row.company_id, periodStart: row.period_start, periodEnd: row.period_end, format: row.format, rowCount: row.row_count, createdAt: row.created_at }));
  },

  async recordExport(input: { companyId: string; periodStart: string; periodEnd: string; format: string; rowCount: number }): Promise<void> {
    const { error } = await supabase.from("accounting_exports").insert({ company_id: input.companyId, period_start: input.periodStart, period_end: input.periodEnd, format: input.format, row_count: input.rowCount });
    if (error) throw error;
  },

  listReadOnlyExpenses(start: string, end: string) {
    return expensesStore.list({ startDate: start, endDate: end });
  },
};
