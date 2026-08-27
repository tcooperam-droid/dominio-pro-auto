import type { Appointment, AppointmentService, Service } from "./store/types";

export interface ServiceRecurrence {
  serviceId: number;
  count: number;
  lastUsedAt: string;
  historicalName: string;
  service?: Service;
}

/** Um agendamento que pode entrar no histórico de recorrência do cliente. */
export function isHistoricalServiceAppointment(appointment: Appointment, now = new Date()): boolean {
  return appointment.status !== "cancelled" &&
    appointment.status !== "no_show" &&
    new Date(appointment.startTime) <= now;
}

/**
 * Ranking de serviços usados no histórico válido de um cliente.
 * O ID é a chave principal; o nome/preço do histórico serve apenas como fallback visual.
 */
export function getClientServiceRecurrence(
  appointments: Appointment[],
  services: Service[],
  now = new Date(),
): ServiceRecurrence[] {
  const recurrence = new Map<number, ServiceRecurrence>();

  for (const appointment of appointments) {
    // A Agenda é a fonte de verdade: scheduled também vale. O futuro não é histórico.
    if (!isHistoricalServiceAppointment(appointment, now)) continue;

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

/** Retorna os serviços recorrentes mais usados que ainda estão disponíveis no cadastro ativo. */
export function getMostFrequentCurrentServices(
  appointments: Appointment[],
  services: Service[],
  limit = 2,
  now = new Date(),
): ServiceRecurrence[] {
  return getClientServiceRecurrence(appointments, services, now)
    .filter(item => item.service?.active)
    .slice(0, limit);
}

/** Retorna apenas a primeira sugestão ativa, preservando a API legada. */
export function getMostFrequentCurrentService(
  appointments: Appointment[],
  services: Service[],
  now = new Date(),
): ServiceRecurrence | null {
  return getMostFrequentCurrentServices(appointments, services, 1, now)[0] ?? null;
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
