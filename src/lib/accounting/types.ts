import type { Appointment, Employee, Expense } from "@/lib/store/types";

export interface AccountingCompany {
  id: string;
  name: string;
  cnpj: string;
  tradeName: string | null;
  active: boolean;
}

export interface AccountingMembership {
  id: string;
  companyId: string;
  employeeId: number;
  validFrom: string;
  validUntil: string | null;
}

export interface AccountingAssignment {
  id: string;
  appointmentId: number;
  companyId: string;
  employeeId: number;
}

export interface AccountingProductionRow {
  appointment: Appointment;
  employee: Employee | null;
  company: AccountingCompany;
  services: Appointment["services"];
  grossValue: number;
}

export interface AccountingSummary {
  appointments: number;
  services: number;
  grossValue: number;
}

export type AccountingPeriod = { start: string; end: string };

export type AccountingExportFormat = "csv" | "pdf";

export interface AccountingExportRecord {
  id: string;
  companyId: string;
  periodStart: string;
  periodEnd: string;
  format: AccountingExportFormat;
  rowCount: number;
  createdAt: string;
}

export type AccountingExpense = Expense & { companyId?: string | null };
