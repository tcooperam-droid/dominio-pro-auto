import { supabase } from "./supabase";
import { clientsStore, employeesStore, servicesStore } from "./store";
import { buildScheduleTimes, normalizeTime, resolveDate } from "./agentSchedule";

export interface SchedulerRpcResult {
  ok: boolean;
  code?: string;
  message?: string;
  request_key?: string;
  expires_at?: string;
  appointment_id?: number;
  client_name?: string;
  service_name?: string;
  service_duration?: number;
  conflict?: { id: number; client_name: string | null; start_time: string; end_time: string };
}

function findClient(clients: Awaited<ReturnType<typeof clientsStore.ensureLoaded>>, name: string) {
  const needle = name.trim().toLowerCase();
  const exact = clients.find((client) => client.name.toLowerCase() === needle);
  if (exact) return { client: exact };
  const matches = clients.filter((client) => client.name.toLowerCase().includes(needle) || needle.includes(client.name.toLowerCase()));
  if (matches.length === 1) return { client: matches[0] };
  if (matches.length > 1) return { ambiguous: matches };
  return {};
}

export async function executeScheduleServer(params: Record<string, unknown>, confirmed: boolean): Promise<string> {
  const clientName = String(params.clientName ?? "").trim();
  const serviceId = Number(params.serviceId);
  const requestedEmployeeId = params.employeeId == null ? null : Number(params.employeeId);
  const date = resolveDate(String(params.date ?? "hoje"));
  const time = normalizeTime(String(params.time ?? ""));
  if (!clientName) return "Informe o nome do cliente.";
  if (!date) return "Data inválida. Use YYYY-MM-DD ou uma data relativa válida.";
  if (!time) return "Horário inválido. Use HH:MM.";
  if (!Number.isInteger(serviceId)) return "Serviço inválido.";

  const clients = await clientsStore.ensureLoaded();
  const foundClient = findClient(clients, clientName);
  if (foundClient.ambiguous) return `Encontrei vários clientes: ${foundClient.ambiguous.slice(0, 5).map((client) => `${client.name} (ID:${client.id})`).join(", ")}. Qual deles?`;
  if (!foundClient.client) return `Cliente "${clientName}" não encontrado no sistema.`;

  const service = servicesStore.list(true).find((item) => item.id === serviceId);
  if (!service) return `Serviço ID:${serviceId} não encontrado.`;
  const employees = employeesStore.list(true);
  const employee = requestedEmployeeId ? employees.find((item) => item.id === requestedEmployeeId) : employees.length === 1 ? employees[0] : null;
  if (!employee) return `Com qual profissional deseja agendar? Disponíveis: ${employees.map((item) => `${item.name} (ID:${item.id})`).join(", ")}`;
  const times = buildScheduleTimes(date, time, Math.max(service.durationMinutes, 1));
  if (!times) return "Não foi possível montar o intervalo solicitado.";
  const requestKey = [foundClient.client.id, employee.id, service.id, times.startTime, times.endTime].join(":");
  const { data, error } = await supabase.rpc("scheduler_reserve_appointment", {
    p_request_key: requestKey,
    p_client_id: foundClient.client.id,
    p_employee_id: employee.id,
    p_service_id: service.id,
    p_start_time: times.startTime,
    p_end_time: times.endTime,
    p_confirm: confirmed,
    p_force_conflict: Boolean(params.forceConflict === true),
  });
  if (error) throw new Error(`Falha no executor transacional: ${error.message}`);
  const result = data as SchedulerRpcResult;
  if (result.ok && result.code === "HOLD_CREATED") {
    return `CONFIRMACAO:\nConfira o agendamento:\nCliente: ${result.client_name}\nServiço: ${result.service_name} (${result.service_duration} min)\nData: ${date} às ${time}\nProfissional: ${employee.name}\n\nConfirma? Responda sim ou não.`;
  }
  if (result.ok && (result.code === "CONFIRMED" || result.code === "ALREADY_CONFIRMED")) {
    return `Agendamento criado com sucesso!\nID: ${result.appointment_id}\nCliente: ${result.client_name}\nServiço: ${result.service_name}\nData: ${date} às ${time}\nProfissional: ${employee.name}`;
  }
  if (result.code === "CONFLICT") return `CONFLITO:${result.message ?? "O profissional já está ocupado neste intervalo."}`;
  return `${result.code ?? "SCHEDULER_ERROR"}:${result.message ?? "Não foi possível concluir o agendamento."}`;
}
