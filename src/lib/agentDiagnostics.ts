import { appointmentsStore, clientsStore, employeesStore, servicesStore } from "@/lib/store";
import { intervalsOverlap, localDateKey, localTimeKey } from "@/lib/agentSchedule";
import type { Appointment } from "@/lib/store/types";

export type DiagnosticSeverity = "info" | "warning" | "error";

export interface DiagnosticFinding {
  id: string;
  severity: DiagnosticSeverity;
  category: "screen" | "database" | "rule" | "schedule" | "integration";
  title: string;
  description: string;
  evidence: string[];
  recommendedFix: string;
}

export interface DiagnosticSnapshot {
  capturedAt: string;
  route: string;
  screenText: string;
  appointments: Appointment[];
  counts: { clients: number; employees: number; services: number; appointments: number };
}

export interface ScheduleScenarioResult {
  scenario: string;
  passed: boolean;
  expected: string;
  actual: string;
  evidence: string[];
}

export function collectDiagnosticSnapshot(): DiagnosticSnapshot {
  const appointments = appointmentsStore.list({});
  const screenText = typeof document === "undefined" ? "Tela indisponível" : document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 12000);
  return {
    capturedAt: new Date().toISOString(),
    route: typeof window === "undefined" ? "server" : window.location.pathname,
    screenText,
    appointments,
    counts: {
      clients: clientsStore.list().length,
      employees: employeesStore.list(true).length,
      services: servicesStore.list(true).length,
      appointments: appointments.length,
    },
  };
}

export async function refreshDiagnosticSnapshot(): Promise<DiagnosticSnapshot> {
  await Promise.allSettled([
    appointmentsStore.fetchAll(),
    clientsStore.fetchAll(),
    employeesStore.fetchAll(),
    servicesStore.fetchAll(),
  ]);
  return collectDiagnosticSnapshot();
}

function activeAppointmentsForEmployee(employeeId: number): Appointment[] {
  return appointmentsStore.list({ employeeId }).filter((appointment) => appointment.status !== "cancelled");
}

export function runScheduleScenario(input: {
  scenario: "conflict_same_employee" | "no_conflict_other_employee" | "invalid_time" | "outside_working_hours";
  employeeId?: number;
  date?: string;
  startTime?: string;
  endTime?: string;
}): ScheduleScenarioResult {
  const employee = input.employeeId ? employeesStore.list(true).find((item) => item.id === input.employeeId) : employeesStore.list(true)[0];
  const date = input.date || localDateKey(new Date()) || "";
  const startTime = input.startTime || "09:00";
  const endTime = input.endTime || "10:00";
  const prefix = input.scenario;

  if (!employee) {
    return { scenario: prefix, passed: false, expected: "profissional disponível", actual: "nenhum profissional carregado", evidence: [] };
  }

  if (input.scenario === "invalid_time") {
    const valid = /^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) && /^([01]\d|2[0-3]):[0-5]\d$/.test(endTime);
    return { scenario: prefix, passed: !valid, expected: "horário inválido rejeitado", actual: valid ? "horário aceito" : "horário rejeitado", evidence: [`Entrada: ${startTime}-${endTime}`] };
  }

  const overlaps = activeAppointmentsForEmployee(employee.id).filter((appointment) => localDateKey(appointment.startTime) === date && intervalsOverlap(appointment.startTime, appointment.endTime, `${date}T${startTime}:00`, `${date}T${endTime}:00`));
  if (input.scenario === "conflict_same_employee") {
    return { scenario: prefix, passed: overlaps.length > 0, expected: "conflito detectado", actual: overlaps.length ? `conflito com ${overlaps.length} agendamento(s)` : "nenhum conflito", evidence: overlaps.map((item) => `#${item.id} ${localTimeKey(item.startTime)}-${localTimeKey(item.endTime)}`) };
  }
  if (input.scenario === "no_conflict_other_employee") {
    const other = employeesStore.list(true).find((item) => item.id !== employee.id);
    const otherOverlaps = other ? activeAppointmentsForEmployee(other.id).filter((appointment) => localDateKey(appointment.startTime) === date && intervalsOverlap(appointment.startTime, appointment.endTime, `${date}T${startTime}:00`, `${date}T${endTime}:00`)) : [];
    return { scenario: prefix, passed: Boolean(other) && otherOverlaps.length === 0, expected: "profissional diferente não bloqueia", actual: other ? (otherOverlaps.length ? "outro profissional também ocupado" : "sem conflito no profissional alternativo") : "nenhum profissional alternativo", evidence: other ? [`Alternativo: ${other.name}`] : [] };
  }

  const workingHours = employee.workingHours?.[String(new Date(`${date}T12:00:00`).getDay())];
  const [hour, minute] = startTime.split(":").map(Number);
  const startMinutes = hour * 60 + minute;
  const inside = Boolean(workingHours?.active && startMinutes >= Number(workingHours.start.split(":")[0]) * 60 + Number(workingHours.start.split(":")[1]) && startMinutes < Number(workingHours.end.split(":")[0]) * 60 + Number(workingHours.end.split(":")[1]));
  return { scenario: "outside_working_hours", passed: !inside, expected: "horário fora do expediente rejeitado", actual: inside ? "horário dentro do expediente" : "horário fora do expediente", evidence: [`Profissional: ${employee.name}`, `Dia: ${date}`, `Horário: ${startTime}`] };
}

export function findLocalDivergences(snapshot = collectDiagnosticSnapshot()): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = [];
  const active = snapshot.appointments.filter((item) => item.status !== "cancelled");
  const byEmployee = new Map<number, Appointment[]>();
  for (const appointment of active) byEmployee.set(appointment.employeeId, [...(byEmployee.get(appointment.employeeId) || []), appointment]);
  for (const [employeeId, appointments] of byEmployee) {
    for (let i = 0; i < appointments.length; i += 1) {
      for (let j = i + 1; j < appointments.length; j += 1) {
        const left = appointments[i];
        const right = appointments[j];
        if (localDateKey(left.startTime) === localDateKey(right.startTime) && intervalsOverlap(left.startTime, left.endTime, right.startTime, right.endTime)) {
          findings.push({ id: `overlap-${left.id}-${right.id}`, severity: "error", category: "schedule", title: "Conflito de agenda detectado", description: `Dois agendamentos ativos ocupam o mesmo profissional e intervalo.`, evidence: [`#${left.id}: ${localTimeKey(left.startTime)}-${localTimeKey(left.endTime)}`, `#${right.id}: ${localTimeKey(right.startTime)}-${localTimeKey(right.endTime)}`, `Profissional ID: ${employeeId}`], recommendedFix: "Revisar o profissional ou o horário de um dos agendamentos antes de confirmar." });
        }
      }
    }
  }
  if (snapshot.screenText.includes("nenhum agendamento") && snapshot.appointments.length > 0) findings.push({ id: "screen-data-mismatch", severity: "warning", category: "screen", title: "Possível divergência entre tela e dados carregados", description: "A tela informa que não há agendamentos, mas o cache local possui registros.", evidence: [`${snapshot.appointments.length} agendamento(s) no cache`], recommendedFix: "Atualizar a tela e verificar filtros, período selecionado e sincronização do store." });
  return findings;
}

export function formatDiagnosticContext(snapshot: DiagnosticSnapshot, findings: DiagnosticFinding[]): string {
  return JSON.stringify({ snapshot: { ...snapshot, appointments: snapshot.appointments.slice(0, 100) }, findings }, null, 2).slice(0, 50000);
}
