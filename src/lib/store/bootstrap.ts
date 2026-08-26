/** Orquestração de carregamento inicial e dados agregados do dashboard. */

import { supabase } from "../supabase";
import { appointmentsStore } from "./appointments";
import { cashEntriesStore, cashSessionsStore } from "./cash";
import { commissionClosingsStore } from "./cash";
import { clientsStore } from "./clients";
import { employeesStore } from "./employees";
import { expensesStore } from "./cash";
import { servicesStore } from "./services";
import { cache, toAppointment } from "./shared";

// ─── Abertura Automática do Caixa ─────────────────────────

export async function autoOpenCashIfNeeded(): Promise<boolean> {
  try {
    const config = localStorage.getItem("salon_config");

    if (config) {
      const parsed = JSON.parse(config);

      if (parsed.autoOpenCash === false) return false;
    }
  } catch {
    // ignore
  }

  const currentSession = cashSessionsStore.getCurrent();

  if (currentSession) return false;

  const sessions = cashSessionsStore.list();
  const lastClosed = sessions.find(s => s.status === "closed");
  const openingBalance = lastClosed?.totalRevenue
    ? Math.max(
        0,
        (lastClosed.totalRevenue - (lastClosed.totalCommissions ?? 0)) +
          (lastClosed.openingBalance ?? 0),
      )
    : 0;

  await cashSessionsStore.open(openingBalance);

  return true;
}

// ─── Carregamento inicial ─────────────────────────────────

export async function fetchAllData(): Promise<void> {
  await Promise.all([
    employeesStore.fetchAll(),
    servicesStore.fetchAll(),
    clientsStore.fetchAll(),
    appointmentsStore.fetchAll(),
    cashSessionsStore.fetchAll(),
    cashEntriesStore.fetchAll(),
    expensesStore.fetchAll(),
    commissionClosingsStore.fetchAll(),
    // auditStore.fetchAll() removido do boot — carregado sob demanda
  ]);
  // Notifica todos os componentes que os dados foram atualizados
  window.dispatchEvent(new Event("appointments_updated"));
  window.dispatchEvent(new Event("store_updated"));
}

export async function fetchDashboardData(): Promise<{ clientCount: number }> {
  const today = new Date().toISOString().split("T")[0];

  const [, , apptResult, , countResult] = await Promise.all([
    employeesStore.fetchAll(),
    servicesStore.fetchAll(),
    supabase
      .from("appointments")
      .select("*")
      .gte("start_time", `${today}T00:00:00`)
      .lte("start_time", `${today}T23:59:59`)
      .order("start_time"),
    cashSessionsStore.fetchAll(),
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true }),
  ]);

  if (apptResult.data && !apptResult.error) {
    const mapped = apptResult.data.map((row: any) => ({
      id: row.id,
      clientName: row.client_name,
      clientId: row.client_id,
      employeeId: row.employee_id,
      startTime: row.start_time,
      endTime: row.end_time,
      status: row.status,
      totalPrice: row.total_price,
      notes: row.notes,
      paymentStatus: row.payment_status,
      groupId: row.group_id,
      services: row.services ?? [],
      createdAt: row.created_at,
    }));

    const otherDays = (cache as any).appointments.filter(
      (a: any) => !a.startTime?.startsWith(today),
    );

    (cache as any).appointments = [...otherDays, ...mapped];
  }

  const clientCount = countResult.count ?? (cache as any).clients.length;

  return { clientCount };
}
