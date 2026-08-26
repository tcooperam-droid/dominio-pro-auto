/** API pública das funcionalidades financeiras. */
export {
  cashSessionsStore,
  cashEntriesStore,
  expensesStore,
  commissionClosingsStore,
} from "../../lib/store/cash";
export { auditStore } from "../../lib/store/audit";
export { autoOpenCashIfNeeded, fetchAllData, fetchDashboardData } from "../../lib/store/bootstrap";
export { calcCommission } from "../../lib/store/commission";
export type {
  CashSession,
  CashEntry,
  Expense,
  CommissionClosing,
  AuditLog,
} from "../../lib/store/types";
