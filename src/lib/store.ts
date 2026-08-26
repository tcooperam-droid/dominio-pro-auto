/** Fachada de compatibilidade do armazenamento.
 *
 * Os consumidores antigos continuam importando de `@/lib/store`, enquanto
 * cada agregado agora possui seu próprio módulo interno.
 */

export * from "./store/commission";
export * from "./store/types";
export { employeesStore } from "./store/employees";
export { servicesStore } from "./store/services";
export { clientsStore } from "./store/clients";
export { appointmentsStore } from "./store/appointments";
export {
  cashSessionsStore,
  cashEntriesStore,
  expensesStore,
  commissionClosingsStore,
  autoLaunchCashEntry,
} from "./store/cash";
export { auditStore } from "./store/audit";
export { autoOpenCashIfNeeded, fetchAllData, fetchDashboardData } from "./store/bootstrap";
