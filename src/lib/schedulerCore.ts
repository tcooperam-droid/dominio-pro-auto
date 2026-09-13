import { intervalsOverlap } from "./agentSchedule";
import type { Appointment, Employee } from "./store/types";

export type SchedulerValidationError =
  | "INVALID_INTERVAL"
  | "OUTSIDE_WORKING_HOURS"
  | "CONFLICT";

export interface SchedulerConflict {
  id: number;
  clientName: string | null;
  startTime: string;
  endTime: string;
}

export interface SchedulerPlan {
  startTime: string;
  endTime: string;
  employeeId: number;
  serviceId: number;
  durationMinutes: number;
}

export interface SchedulerValidation {
  ok: boolean;
  error?: SchedulerValidationError;
  message?: string;
  conflict?: SchedulerConflict;
}

export function validateSchedulerPlan(input: {
  plan: SchedulerPlan;
  employee: Employee;
  appointments: Appointment[];
  date: string;
  time: string;
  forceConflict?: boolean;
  forceSchedule?: boolean;
}): SchedulerValidation {
  const { plan, employee, appointments } = input;
  const start = new Date(plan.startTime).getTime();
  const end = new Date(plan.endTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { ok: false, error: "INVALID_INTERVAL", message: "O intervalo do agendamento é inválido." };
  }

  if (!input.forceSchedule) {
    const dayName = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][new Date(`${input.date}T12:00:00`).getDay()];
    const daySchedule = employee.workingHours?.[dayName];
    // A verificação detalhada continua no agente existente; este núcleo apenas
    // impede intervalos impossíveis e permite ser usado por APIs sem UI.
    if (daySchedule && daySchedule.active === false) {
      return { ok: false, error: "OUTSIDE_WORKING_HOURS", message: `${employee.name} não trabalha em ${input.date}.` };
    }
  }

  const conflict = appointments.find((appointment) =>
    appointment.employeeId === plan.employeeId &&
    appointment.status !== "cancelled" &&
    intervalsOverlap(appointment.startTime, appointment.endTime, plan.startTime, plan.endTime),
  );

  if (conflict && !input.forceConflict) {
    return {
      ok: false,
      error: "CONFLICT",
      conflict: { id: conflict.id, clientName: conflict.clientName ?? null, startTime: conflict.startTime, endTime: conflict.endTime },
      message: `${employee.name} já possui um agendamento neste intervalo.`,
    };
  }

  return { ok: true };
}
