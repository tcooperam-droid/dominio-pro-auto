import { describe, expect, it } from "vitest";
import {
  calcCommission,
  calcConversionRate,
  calcInactiveClients,
  calcPeriodStats,
  isFinancialAppointment,
} from "./analytics";
import type { Appointment, Client, Employee } from "./store/types";

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

function daysAgo(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function daysAhead(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function client(id: number, name: string): Client {
  return {
    id,
    name,
    email: null,
    phone: null,
    birthDate: null,
    cpf: null,
    address: null,
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
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

  it("lista somente ausências entre 91 e 150 dias", () => {
    const clients = [
      client(1, "Cliente 91"),
      client(2, "Cliente 90"),
      client(3, "Cliente 150"),
      client(4, "Cliente 151"),
    ];
    const result = calcInactiveClients([
      appointment({ id: 1, clientId: 1, clientName: "Cliente 91", startTime: daysAgo(91) }),
      appointment({ id: 2, clientId: 2, clientName: "Cliente 90", startTime: daysAgo(90) }),
      appointment({ id: 3, clientId: 3, clientName: "Cliente 150", startTime: daysAgo(150) }),
      appointment({ id: 4, clientId: 4, clientName: "Cliente 151", startTime: daysAgo(151) }),
    ], 90, clients, 150);

    expect(result.map(item => item.clientName)).toEqual(["Cliente 150", "Cliente 91"]);
    expect(result.map(item => item.daysSince)).toEqual([150, 91]);
  });

  it("reconhece histórico sem clientId somente quando corresponde a cliente ativo", () => {
    const result = calcInactiveClients([
      appointment({ id: 10, clientId: null, clientName: "Âna-Maria", startTime: daysAgo(120) }),
      appointment({ id: 11, clientId: null, clientName: "Cliente Removido", startTime: daysAgo(120) }),
      appointment({ id: 12, clientId: 99, clientName: "Cliente Excluído", startTime: daysAgo(120) }),
      appointment({ id: 13, clientId: 2, clientName: "Cliente Futuro", startTime: daysAhead(2), status: "completed" }),
    ], 90, [client(1, "Ana Maria"), client(2, "Cliente Futuro")], 150);

    expect(result).toMatchObject([{ clientId: 1, clientName: "Ana Maria", daysSince: 120 }]);
  });
});
