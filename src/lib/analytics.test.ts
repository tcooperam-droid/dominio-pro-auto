import { afterEach, describe, expect, it, vi } from "vitest";
import { format } from "date-fns";
import {
  calcCommission,
  calcFinancialSummary,
  calcPaidExpenses,
  calcConversionRate,
  calcInactiveClients,
  calcPeriodStats,
  isFinancialAppointment,
} from "./analytics";
import { getReportRange, shiftReportPeriod } from "./reportPeriods";
import type { Appointment, Client, Employee, Expense } from "./store/types";

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

afterEach(() => {
  vi.useRealTimers();
});

describe("regras do Financeiro baseadas na Agenda", () => {
  it("considera um agendamento existente mesmo com status scheduled", () => {
    expect(isFinancialAppointment(appointment({ status: "scheduled" }))).toBe(true);
    expect(calcPeriodStats([appointment()], [employee])).toMatchObject({
      totalRevenue: 100,
      count: 1,
      totalCommissions: 8,
    });
  });

  it("separa bruto, após comissão e após custos e despesas pagas", () => {
    const summary = calcFinancialSummary([appointment()], [employee], 25);

    expect(summary).toMatchObject({
      grossRevenue: 100,
      materialCost: 20,
      commissions: 8,
      paidExpenses: 25,
      afterCommissions: 92,
      afterCommissionsAndExpenses: 67,
      afterCostsAndExpenses: 47,
    });
  });

  it("soma somente despesas pagas dentro do período", () => {
    const expenses: Expense[] = [
      { id: 1, date: "2026-08-10", amount: 25, category: "Aluguel", status: "paga", notes: null, createdAt: "2026-08-10T12:00:00.000Z" },
      { id: 2, date: "2026-08-11", amount: 40, category: "Energia", status: "pendente", notes: null, createdAt: "2026-08-11T12:00:00.000Z" },
      { id: 3, date: "2026-08-20", amount: 15, category: "Material", status: "paga", notes: null, createdAt: "2026-08-20T12:00:00.000Z" },
      { id: 4, date: "2026-09-01", amount: 90, category: "Aluguel", status: "paga", notes: null, createdAt: "2026-09-01T12:00:00.000Z" },
    ];

    expect(calcPaidExpenses(expenses, new Date("2026-08-01T00:00:00"), new Date("2026-08-31T23:59:59"))).toBe(40);
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

  it("separa realizado e futuro sem zerar a projeção do período", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T15:00:00.000Z"));

    const realized = appointment({ id: 10, startTime: "2026-08-26T12:00:00.000Z" });
    const future = appointment({ id: 11, startTime: "2026-08-26T18:00:00.000Z", totalPrice: 150 });
    const cancelledFuture = appointment({ id: 12, startTime: "2026-08-26T19:00:00.000Z", status: "cancelled", totalPrice: 900 });
    const noShowFuture = appointment({ id: 13, startTime: "2026-08-26T20:00:00.000Z", status: "no_show", totalPrice: 900 });

    const realizedOnly = calcPeriodStats([realized], [employee]);
    const futureOnly = calcPeriodStats([future, cancelledFuture, noShowFuture], [employee]);

    expect(realizedOnly).toMatchObject({ totalRevenue: 100, count: 1, scheduledRevenue: 0, scheduledCount: 0 });
    expect(futureOnly).toMatchObject({ totalRevenue: 150, count: 1, scheduledRevenue: 150, scheduledCount: 1, cancelCount: 2 });
  });

  it("calcula corretamente semana e mês totalmente futuros", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T15:00:00.000Z"));

    const nextWeek = getReportRange("semana", new Date("2026-08-31T12:00:00.000Z"));
    const nextMonth = getReportRange("mes", new Date("2026-09-10T12:00:00.000Z"));
    const futureAppointment = appointment({ id: 20, startTime: "2026-09-02T12:00:00.000Z", totalPrice: 250 });
    const futureStats = calcPeriodStats([futureAppointment], [employee]);

    expect(format(nextWeek.start, "yyyy-MM-dd")).toBe("2026-08-31");
    expect(format(nextWeek.end, "yyyy-MM-dd")).toBe("2026-09-06");
    expect(format(nextMonth.start, "yyyy-MM-dd")).toBe("2026-09-01");
    expect(futureStats.scheduledRevenue).toBe(250);
    expect(futureStats.scheduledCount).toBe(1);
  });

  it("move o cursor exatamente um dia, uma semana ou um mês por vez", () => {
    const base = new Date("2026-08-26T12:00:00.000Z");

    expect(format(shiftReportPeriod(base, "dia", 1), "yyyy-MM-dd")).toBe("2026-08-27");
    expect(format(shiftReportPeriod(base, "semana", -1), "yyyy-MM-dd")).toBe("2026-08-19");
    expect(format(shiftReportPeriod(base, "mes", 1), "yyyy-MM-dd")).toBe("2026-09-26");
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
