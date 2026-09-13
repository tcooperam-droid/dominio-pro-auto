import { supabase } from "../supabase";

export interface AppointmentHold {
  id: string;
  requestKey: string;
  clientId: number | null;
  clientName: string;
  employeeId: number;
  serviceId: number;
  startTime: string;
  endTime: string;
  status: "pending" | "confirmed" | "expired" | "cancelled";
  expiresAt: string;
  confirmedAppointmentId: number | null;
}

function mapRow(row: any): AppointmentHold {
  return {
    id: row.id, requestKey: row.request_key, clientId: row.client_id, clientName: row.client_name,
    employeeId: row.employee_id, serviceId: row.service_id, startTime: row.start_time, endTime: row.end_time,
    status: row.status, expiresAt: row.expires_at, confirmedAppointmentId: row.confirmed_appointment_id,
  };
}

export async function createOrRefreshAppointmentHold(input: {
  requestKey: string; clientId: number | null; clientName: string; employeeId: number; serviceId: number; startTime: string; endTime: string;
}): Promise<AppointmentHold> {
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const { data, error } = await supabase.from("appointment_holds").upsert({
    request_key: input.requestKey, client_id: input.clientId, client_name: input.clientName,
    employee_id: input.employeeId, service_id: input.serviceId, start_time: input.startTime,
    end_time: input.endTime, status: "pending", expires_at: expiresAt,
  }, { onConflict: "request_key" }).select().single();
  if (error || !data) throw new Error(`Não foi possível reservar o horário temporariamente: ${error?.message ?? "resposta vazia"}`);
  return mapRow(data);
}

export async function getActiveAppointmentHold(requestKey: string): Promise<AppointmentHold | null> {
  const { data, error } = await supabase.from("appointment_holds").select("*").eq("request_key", requestKey).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const hold = mapRow(data);
  if (hold.status !== "pending" || new Date(hold.expiresAt).getTime() <= Date.now()) return null;
  return hold;
}

export async function confirmAppointmentHold(requestKey: string, appointmentId: number): Promise<void> {
  const { error } = await supabase.from("appointment_holds").update({ status: "confirmed", confirmed_appointment_id: appointmentId }).eq("request_key", requestKey).eq("status", "pending");
  if (error) throw error;
}

export function appointmentRequestKey(input: { clientId: number; employeeId: number; serviceId: number; startTime: string; endTime: string }): string {
  return [input.clientId, input.employeeId, input.serviceId, input.startTime, input.endTime].join(":");
}
