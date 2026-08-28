/** Contratos de domínio compartilhados entre os módulos do aplicativo. */

import type { CommissionMode } from "./commission";

// ─── Tipos ───────────────────────────────────────────────

export interface Employee {
  id: number;
  name: string;
  email: string;
  phone: string;
  color: string;
  photoUrl: string | null;
  specialties: string[];
  commissionPercent: number;
  workingHours: Record<string, { start: string; end: string; active: boolean }>;
  active: boolean;
  createdAt: string;
}

export interface Service {
  id: number;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: number;
  materialCostPercent: number;
  commissionMode: CommissionMode;
  color: string;
  active: boolean;
  createdAt: string;
}

export interface ServicePackage {
  id: number;
  name: string;
  description: string | null;
  serviceIds: number[];
  discount: number | null;
  active: boolean;
  createdAt: string;
}

export interface Client {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  cpf: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
}

export interface AppointmentService {
  serviceId: number;
  name: string;
  price: number;
  durationMinutes: number;
  color: string;
  materialCostPercent: number;
  commissionMode: CommissionMode;
}

export interface Appointment {
  id: number;
  clientName: string | null;
  clientId: number | null;
  employeeId: number;
  startTime: string;
  endTime: string;
  status: "scheduled" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show";
  totalPrice: number | null;
  notes: string | null;
  paymentStatus: string | null;
  groupId: string | null;
  services: AppointmentService[];
  createdAt: string;
}

export const TIME_BLOCK_MARKER = "__DOMINIO_TIME_BLOCK__";

export function isTimeBlock(appointment: Appointment): boolean {
  return appointment.notes?.startsWith(TIME_BLOCK_MARKER) ?? false;
}

export interface CashSession {
  id: number;
  openedAt: string;
  closedAt: string | null;
  openingBalance: number;
  totalRevenue: number | null;
  totalCommissions: number | null;
  closingNotes: string | null;
  status: "open" | "closed";
}

export interface CashEntry {
  id: number;
  sessionId: number;
  appointmentId: number | null;
  clientName: string;
  employeeId: number;
  description: string;
  amount: number;
  paymentMethod: "dinheiro" | "cartao_credito" | "cartao_debito" | "pix" | "outro";
  commissionPercent: number;
  commissionValue: number;
  materialCostValue: number;
  isAutoLaunch: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: number;
  entityType: string;
  entityId: number;
  action: string;
  description: string;
  userName: string | null;
  createdAt: string;
}

// ─── Novos tipos financeiros ──────────────────────────────

export type ExpenseCategory =
  | "aluguel" | "energia" | "agua" | "internet" | "produtos"
  | "manutencao" | "marketing" | "taxas" | "salarios" | "impostos"
  | "estoque" | "outras";

export type ExpenseStatus = "paga" | "pendente" | "atrasada";

export interface Expense {
  id: number;
  date: string;           // 'yyyy-MM-dd'
  category: ExpenseCategory;
  description: string;
  amount: number;
  status: ExpenseStatus;
  notes: string | null;
  createdAt: string;
}

export interface CommissionClosing {
  id: number;
  employeeId: number;
  periodStart: string;    // 'yyyy-MM-dd'
  periodEnd: string;      // 'yyyy-MM-dd'
  totalRevenue: number;
  totalCommission: number;
  appointmentCount: number;
  status: "pendente" | "paga";
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
}
