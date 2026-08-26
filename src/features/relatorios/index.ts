/** API pública das consultas de relatórios. */
export { appointmentsStore } from "../../lib/store/appointments";
export { employeesStore } from "../../lib/store/employees";
export { expensesStore } from "../../lib/store/cash";
export type { Appointment, Employee } from "../../lib/store/types";
export {
  calcPeriodStats,
  calcRevenueByDay,
  calcRevenueByEmployee,
  calcPopularServices,
  calcTopClients,
  calcConversionRate,
  calcMostProfitableServices,
  calcWeeklyRevenue,
  calcInactiveClients,
  getPeriodDates,
  getAppointmentsInPeriod,
  calcMonthlyHistory,
  calcYearlyHistory,
  toNum,
  isFinancialAppointment,
  isCompleted,
  calcMaterialCost,
  calcCommission,
} from "../../lib/analytics";
export type { Period, PeriodStats, HistoricalStats } from "../../lib/analytics";
