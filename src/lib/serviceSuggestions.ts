import type { Appointment, AppointmentService, Service } from "./store/types";

export interface ServiceRecurrence {
  serviceId: number;
  count: number;
  lastUsedAt: string;
  historicalName: string;
  service?: Service;
}

/**
 * Ranking de serviços usados nas visitas concluídas de um cliente.
 * O ID é a chave principal; o nome/preço do histórico serve apenas como fallback visual.
 */
export function getClientServiceRecurrence(
  appointments: Appointment[],
  services: Service[],
): ServiceRecurrence[] {
  const recurrence = new Map<number, ServiceRecurrence>();

  for (const appointment of appointments) {
    if (appointment.status !== "completed") continue;

    for (const snapshot of appointment.services ?? []) {
      if (!Number.isFinite(snapshot.serviceId) || snapshot.serviceId <= 0) continue;

      const current = recurrence.get(snapshot.serviceId);
      if (!current) {
        recurrence.set(snapshot.serviceId, {
          serviceId: snapshot.serviceId,
          count: 1,
          lastUsedAt: appointment.startTime,
          historicalName: snapshot.name,
          service: services.find(service => service.id === snapshot.serviceId),
        });
        continue;
      }

      current.count += 1;
      if (appointment.startTime > current.lastUsedAt) {
        current.lastUsedAt = appointment.startTime;
        current.historicalName = snapshot.name;
      }
    }
  }

  return Array.from(recurrence.values()).sort((a, b) =>
    b.count - a.count ||
    b.lastUsedAt.localeCompare(a.lastUsedAt) ||
    a.serviceId - b.serviceId,
  );
}

/** Retorna o serviço recorrente mais usado que ainda está disponível no cadastro ativo. */
export function getMostFrequentCurrentService(
  appointments: Appointment[],
  services: Service[],
): ServiceRecurrence | null {
  return getClientServiceRecurrence(appointments, services)
    .find(item => item.service?.active) ?? null;
}

/** Reconstitui um snapshot de agendamento usando sempre os dados atuais do serviço. */
export function toCurrentAppointmentService(service: Service): AppointmentService {
  return {
    serviceId: service.id,
    name: service.name,
    price: service.price,
    durationMinutes: service.durationMinutes,
    color: service.color,
    materialCostPercent: service.materialCostPercent,
    commissionMode: "cost_first",
  };
}

/** Atualiza um snapshot histórico com os dados atuais sem perder compatibilidade com serviços antigos. */
export function refreshAppointmentService(
  snapshot: AppointmentService,
  services: Service[],
): AppointmentService {
  const current = services.find(service => service.id === snapshot.serviceId);
  return current
    ? toCurrentAppointmentService(current)
    : { ...snapshot, commissionMode: "cost_first" };
}
