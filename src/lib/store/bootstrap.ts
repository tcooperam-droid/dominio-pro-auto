/** Orquestração de carregamento inicial e dados agregados do dashboard. */

import { ensureSupabaseSession, supabase } from "../supabase";
import { appointmentsStore } from "./appointments";
import { cashEntriesStore, cashSessionsStore } from "./cash";
import { commissionClosingsStore } from "./cash";
import { clientsStore } from "./clients";
import { employeesStore } from "./employees";
import { expensesStore } from "./cash";
import { servicesStore } from "./services";
import { cache, toAppointment } from "./shared";

export interface BootstrapResult {
  failed: string[];
}

let bootstrapPromise: Promise<BootstrapResult> | null = null;

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

/**
 * Carrega os stores uma única vez por ciclo de aplicação.
 *
 * A sessão anônima precisa estar pronta antes das queries. Cada tabela é
 * carregada de modo independente para que uma falha transitória não descarte
 * os dados que já chegaram das demais tabelas. O resultado informa à camada
 * de UI quais fontes falharam e permite uma nova tentativa explícita.
 */
export function fetchAllData(options: { force?: boolean } = {}): Promise<BootstrapResult> {
  if (bootstrapPromise && !options.force) return bootstrapPromise;

  bootstrapPromise = (async () => {
    await ensureSupabaseSession();

    const loaders: Array<[string, () => Promise<unknown>]> = [
      ["funcionários", () => employeesStore.fetchAll()],
      ["serviços", () => servicesStore.fetchAll()],
      ["clientes", () => clientsStore.fetchAll()],
      ["agendamentos", () => appointmentsStore.fetchAll()],
      ["sessões de caixa", () => cashSessionsStore.fetchAll()],
      ["lançamentos de caixa", () => cashEntriesStore.fetchAll()],
      ["despesas", () => expensesStore.fetchAll()],
      ["fechamentos de comissão", () => commissionClosingsStore.fetchAll()],
    ];

    const results = await Promise.allSettled(loaders.map(([, load]) => load()));
    const failed: string[] = [];

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const [name] = loaders[index];
        failed.push(name);
        console.warn(`[App] Falha ao carregar ${name}:`, result.reason);
      }
    });

    // Notifica componentes montados e também componentes que já tinham cache.
    window.dispatchEvent(new Event("appointments_updated"));
    window.dispatchEvent(new Event("store_updated"));
    window.dispatchEvent(new CustomEvent("bootstrap_updated", { detail: { failed } }));

    if (failed.length === loaders.length) {
      throw new Error("Não foi possível carregar nenhuma fonte de dados do Supabase.");
    }

    return { failed };
  })().catch((error) => {
    bootstrapPromise = null;
    throw error;
  });

  return bootstrapPromise;
}

export function retryFetchAllData(): Promise<BootstrapResult> {
  return fetchAllData({ force: true });
}

export async function fetchDashboardData(): Promise<{ clientCount: number }> {
  await ensureSupabaseSession();
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
    const mapped = apptResult.data.map((row: any) => toAppointment(row));

    const otherDays = (cache as any).appointments.filter(
      (a: any) => !a.startTime?.startsWith(today),
    );

    (cache as any).appointments = [...otherDays, ...mapped];
  }

  const clientCount = countResult.count ?? (cache as any).clients.length;

  return { clientCount };
}
