import { describe, expect, it } from "vitest";
import { validateSchedulerPlan } from "./schedulerCore";
import type { Employee, Appointment } from "./store/types";

const employee: Employee = {
  id: 7, name: "Ricardo", email: "", phone: "", color: "#000", photoUrl: null,
  specialties: [], commissionPercent: 0, workingHours: {}, active: true, createdAt: "",
};
const basePlan = { startTime: "2026-09-15T08:00:00-03:00", endTime: "2026-09-15T08:30:00-03:00", employeeId: 7, serviceId: 3, durationMinutes: 30 };
const appointment = (overrides: Partial<Appointment> = {}): Appointment => ({
  id: 10, clientName: "Sérgio Santos", clientId: 1, employeeId: 7,
  startTime: "2026-09-15T08:00:00-03:00", endTime: "2026-09-15T08:30:00-03:00",
  status: "scheduled", totalPrice: 50, notes: null, paymentStatus: null, groupId: null, services: [], createdAt: "", ...overrides,
});

describe("schedulerCore", () => {
  it("detecta conflito do mesmo profissional", () => {
    const result = validateSchedulerPlan({ plan: basePlan, employee, appointments: [appointment()], date: "2026-09-15", time: "08:00" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("CONFLICT");
    expect(result.conflict?.id).toBe(10);
  });

  it("permite intervalo sem conflito", () => {
    const result = validateSchedulerPlan({ plan: { ...basePlan, startTime: "2026-09-15T09:00:00-03:00", endTime: "2026-09-15T09:30:00-03:00" }, employee, appointments: [appointment()], date: "2026-09-15", time: "09:00" });
    expect(result.ok).toBe(true);
  });

  it("ignora cancelados e rejeita intervalo invertido", () => {
    const cancelled = appointment({ status: "cancelled" });
    expect(validateSchedulerPlan({ plan: basePlan, employee, appointments: [cancelled], date: "2026-09-15", time: "08:00" }).ok).toBe(true);
    expect(validateSchedulerPlan({ plan: { ...basePlan, endTime: basePlan.startTime }, employee, appointments: [], date: "2026-09-15", time: "08:00" }).error).toBe("INVALID_INTERVAL");
  });
});
