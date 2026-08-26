import { describe, expect, it } from "vitest";
import {
  calcCommission,
  calcConversionRate,
  calcPeriodStats,
  isFinancialAppointment,
} from "./analytics";
import type { Appointment, Employee } from "./store/types";

const employee: Employee = {
  id: 1,
  name: "Profissional Teste",
  email: "teste@example.com",
  phone: "",
  color: "#ec4899",
  photoUrl: null,
  specialties: [],
  commissionPercent: 10,
  workingHours: {},
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 1,
    clientName: "Cliente Teste",
    clientId: 1,
    employeeId: 1,
    startTime: "2026-08-26T12:00:00.000Z",
    endTime: "2026-08-26T13:00:00.000Z",
    status: "scheduled",
    totalPrice: 100,
    notes: null,
    paymentStatus: null,
    groupId: null,
    services: [
      {
        serviceId: 1,
        name: "Serviço Teste",
        price: 100,
        durationMinutes: 60,
        color: "#ec4899",
        materialCostPercent: 20,
        commissionMode: "cost_first",
      },
    ],
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("regras do Financeiro baseadas na Agenda", () => {
  it("considera um agendamento existente mesmo com status scheduled", () => {
    expect(isFinancialAppointment(appointment({ status: "scheduled" }))).toBe(true);
    expect(calcPeriodStats([appointment()], [employee])).toMatchObject({
      totalRevenue: 100,
      count: 1,
      totalCommissions: 8,
    });
  });

  it("remove do realizado somente alterações explícitas canceladas ou no-show", () => {
    const cancelled = appointment({ id: 2, status: "cancelled" });
    const noShow = appointment({ id: 3, status: "no_show" });

    expect(isFinancialAppointment(cancelled)).toBe(false);
    expect(isFinancialAppointment(noShow)).toBe(false);
    expect(calcPeriodStats([cancelled, noShow], [employee])).toMatchObject({
      totalRevenue: 0,
      count: 0,
      totalCommissions: 0,
      cancelCount: 2,
    });
  });

  it("retorna ausência de dados em vez de uma taxa fixa quando não há eventos terminais", () => {
    expect(calcConversionRate([
      appointment({ startTime: new Date().toISOString(), status: "scheduled" }),
    ])).toBeNull();
  });

  it("normaliza snapshots legados para custo compartilhado", () => {
    const legacy = appointment({
      services: [{
        ...appointment().services[0],
        commissionMode: "commission_first" as never,
      }],
    });

    expect(calcCommission(legacy, employee)).toBe(8);
  });
});
