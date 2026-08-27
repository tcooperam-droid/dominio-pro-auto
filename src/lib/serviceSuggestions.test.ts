import { describe, expect, it } from "vitest";
import {
  getClientServiceRecurrence,
  getMostFrequentCurrentService,
  getMostFrequentCurrentServices,
  isHistoricalServiceAppointment,
  refreshAppointmentService,
} from "./serviceSuggestions";
import type { Appointment, AppointmentService, Service } from "./store/types";

const services: Service[] = [
  {
    id: 1,
    name: "Corte Atualizado",
    description: null,
    durationMinutes: 45,
    price: 80,
    materialCostPercent: 10,
    commissionMode: "cost_first",
    color: "#ec4899",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: 2,
    name: "Serviço Inativo",
    description: null,
    durationMinutes: 60,
    price: 120,
    materialCostPercent: 10,
    commissionMode: "cost_first",
    color: "#3b82f6",
    active: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: 3,
    name: "Segundo Serviço Atual",
    description: null,
    durationMinutes: 90,
    price: 150,
    materialCostPercent: 15,
    commissionMode: "cost_first",
    color: "#8b5cf6",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

function appointment(id: number, startTime: string, serviceId: number, status: Appointment["status"] = "completed"): Appointment {
  return {
    id,
    clientName: "Cliente Teste",
    clientId: 10,
    employeeId: 1,
    startTime,
    endTime: startTime,
    status,
    totalPrice: 10,
    notes: null,
    paymentStatus: null,
    groupId: null,
    services: [{
      serviceId,
      name: serviceId === 1 ? "Corte Antigo" : serviceId === 3 ? "Segundo Serviço Antigo" : "Serviço Antigo",
      price: serviceId === 1 ? 50 : serviceId === 3 ? 100 : 100,
      durationMinutes: 30,
      color: "#fff",
      materialCostPercent: 0,
      commissionMode: "cost_first",
    }],
    createdAt: startTime,
  };
}

describe("sugestão de serviço por reincidência", () => {
  it("conta por serviceId e escolhe o maior uso com desempate pela visita mais recente", () => {
    const result = getClientServiceRecurrence([
      appointment(1, "2026-08-01T12:00:00.000Z", 1),
      appointment(2, "2026-08-02T12:00:00.000Z", 2),
      appointment(3, "2026-08-03T12:00:00.000Z", 1),
      appointment(4, "2026-08-04T12:00:00.000Z", 2),
    ], services);

    expect(result.map(item => [item.serviceId, item.count])).toEqual([[2, 2], [1, 2]]);
  });

  it("retorna as duas maiores incidências ativas na ordem correta", () => {
    const result = getMostFrequentCurrentServices([
      appointment(1, "2026-08-01T12:00:00.000Z", 1),
      appointment(2, "2026-08-02T12:00:00.000Z", 1),
      appointment(3, "2026-08-03T12:00:00.000Z", 1),
      appointment(4, "2026-08-04T12:00:00.000Z", 3),
      appointment(5, "2026-08-05T12:00:00.000Z", 3),
      appointment(6, "2026-08-06T12:00:00.000Z", 2),
      appointment(7, "2026-08-07T12:00:00.000Z", 2),
      appointment(8, "2026-08-08T12:00:00.000Z", 2),
      appointment(9, "2026-08-09T12:00:00.000Z", 2),
    ], services);

    expect(result.map(item => [item.serviceId, item.count])).toEqual([[1, 3], [3, 2]]);
    expect(result.map(item => item.service?.price)).toEqual([80, 150]);
  });

  it("considera scheduled passado, ignora cancelado/no-show e não usa futuro como histórico", () => {
    const scheduledPast = appointment(4, "2026-08-04T12:00:00.000Z", 1, "scheduled");
    const future = appointment(5, "2027-08-04T12:00:00.000Z", 1, "scheduled");
    const result = getMostFrequentCurrentService([
      appointment(1, "2026-08-01T12:00:00.000Z", 2),
      appointment(2, "2026-08-02T12:00:00.000Z", 2, "cancelled"),
      appointment(3, "2026-08-03T12:00:00.000Z", 1),
      scheduledPast,
      future,
    ], services);

    expect(isHistoricalServiceAppointment(scheduledPast)).toBe(true);
    expect(isHistoricalServiceAppointment(future)).toBe(false);
    expect(result?.serviceId).toBe(1);
    expect(result?.count).toBe(2);
    expect(result?.service?.name).toBe("Corte Atualizado");
  });

  it("atualiza o snapshot com preço e duração atuais do cadastro", () => {
    const historical: AppointmentService = {
      serviceId: 1,
      name: "Corte Antigo",
      price: 50,
      durationMinutes: 30,
      color: "#fff",
      materialCostPercent: 0,
      commissionMode: "commission_first" as never,
    };

    expect(refreshAppointmentService(historical, services)).toMatchObject({
      serviceId: 1,
      name: "Corte Atualizado",
      price: 80,
      durationMinutes: 45,
      materialCostPercent: 10,
      commissionMode: "cost_first",
    });
  });
});
