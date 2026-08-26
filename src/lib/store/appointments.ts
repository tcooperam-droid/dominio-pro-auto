/** Casos de uso e persistência do domínio de agenda. */

import { supabase } from "../supabase";
import type { Appointment } from "./types";
import { autoLaunchCashEntry } from "./cash";
import { addAuditLog, cache, fetchAllFromTable, logDb, toAppointment } from "./shared";
import { localDateKey } from "../agentSchedule";

// ─── Appointments ────────────────────────────────────────

export const appointmentsStore = {
  list(filter?: { date?: string; employeeId?: number; startDate?: string; endDate?: string }): Appointment[] {
    let list = [...cache.appointments];

    if (filter?.date) list = list.filter(a => localDateKey(a.startTime) === filter.date);
    if (filter?.startDate) list = list.filter(a => (localDateKey(a.startTime) ?? "") >= filter.startDate!);
    if (filter?.endDate) list = list.filter(a => (localDateKey(a.startTime) ?? "") <= filter.endDate!);
    if (filter?.employeeId) list = list.filter(a => a.employeeId === filter.employeeId);

    return list;
  },

  get(id: number): Appointment | null {
    return cache.appointments.find(a => a.id === id) ?? null;
  },

  async fetchAll(): Promise<Appointment[]> {
    const data = await fetchAllFromTable("appointments", "start_time");
    cache.appointments = data.map(toAppointment);
    return cache.appointments;
  },

  async create(data: Omit<Appointment, "id" | "createdAt">): Promise<Appointment> {
    logDb("appointments.create:start", data);

    const { data: row, error } = await supabase
      .from("appointments")
      .insert({
        client_name: data.clientName,
        client_id: data.clientId,
        employee_id: data.employeeId,
        start_time: data.startTime,
        end_time: data.endTime,
        status: data.status,
        total_price: data.totalPrice,
        notes: data.notes,
        payment_status: data.paymentStatus,
        group_id: data.groupId,
        services: data.services,
      })
      .select()
      .single();

    if (error) {
      const enriched = new Error(
        `Supabase insert falhou [appointments]: ${error.message}` +
          (error.code ? ` (code: ${error.code})` : "") +
          (error.details ? ` | details: ${error.details}` : "") +
          (error.hint ? ` | hint: ${error.hint}` : ""),
      );

      (enriched as any).code = error.code;
      (enriched as any).details = error.details;
      (enriched as any).hint = error.hint;

      logDb("appointments.create:error", { error, data });

      throw enriched;
    }

    const appt = toAppointment(row);
    cache.appointments.push(appt);

    logDb("appointments.create:success", appt);

    window.dispatchEvent(new Event("appointments_updated"));

    await addAuditLog("appointment", appt.id, "create", `Agendamento para "${appt.clientName}" criado`);

    return appt;
  },

  async update(id: number, data: Partial<Appointment>): Promise<Appointment | null> {
    logDb("appointments.update:start", { id, data });

    const p: any = {};

    if (data.clientName !== undefined) p.client_name = data.clientName;
    if (data.clientId !== undefined) p.client_id = data.clientId;
    if (data.employeeId !== undefined) p.employee_id = data.employeeId;
    if (data.startTime !== undefined) p.start_time = data.startTime;
    if (data.endTime !== undefined) p.end_time = data.endTime;
    if (data.status !== undefined) p.status = data.status;
    if (data.totalPrice !== undefined) p.total_price = data.totalPrice;
    if (data.notes !== undefined) p.notes = data.notes;
    if (data.paymentStatus !== undefined) p.payment_status = data.paymentStatus;
    if (data.groupId !== undefined) p.group_id = data.groupId;
    if (data.services !== undefined) p.services = data.services;

    const { data: row, error } = await supabase
      .from("appointments")
      .update(p)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      logDb("appointments.update:error", { id, error, payload: p });
      throw error;
    }

    const appt = toAppointment(row);
    const idx = cache.appointments.findIndex(a => a.id === id);

    if (idx !== -1) cache.appointments[idx] = appt;

    logDb("appointments.update:success", appt);

    window.dispatchEvent(new Event("appointments_updated"));

    if (data.status === "completed" && appt.paymentStatus !== "paid") {
      await autoLaunchCashEntry(appt);
    }

    await addAuditLog("appointment", id, "update", `Agendamento #${id} atualizado`);

    return appt;
  },

  async delete(id: number): Promise<void> {
    await supabase.from("appointments").delete().eq("id", id);

    cache.appointments = cache.appointments.filter(a => a.id !== id);

    window.dispatchEvent(new Event("appointments_updated"));

    await addAuditLog("appointment", id, "delete", `Agendamento #${id} removido`);
  },

  updateLocal(id: number, data: Partial<Appointment>): void {
    const idx = cache.appointments.findIndex(a => a.id === id);

    if (idx !== -1) {
      cache.appointments[idx] = {
        ...cache.appointments[idx],
        ...data,
      };
    }
  },

  async fetchByClientIds(clientIds: number[]): Promise<Appointment[]> {
    const ids = Array.from(new Set(clientIds.filter(Boolean)));

    if (!ids.length) return [];

    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .in("client_id", ids)
      .neq("status", "cancelled")
      .order("start_time", { ascending: false })
      .limit(Math.max(ids.length * 4, 20));

    if (error) throw error;

    return (data ?? []).map(toAppointment);
  },

  async move(
    id: number,
    employeeId: number,
    startTime: string,
    endTime: string,
  ): Promise<void> {
    const { error } = await supabase
      .from("appointments")
      .update({
        employee_id: employeeId,
        start_time: startTime,
        end_time: endTime,
      })
      .eq("id", id);

    if (error) throw error;

    const idx = cache.appointments.findIndex(a => a.id === id);

    if (idx !== -1) {
      cache.appointments[idx] = {
        ...cache.appointments[idx],
        employeeId,
        startTime,
        endTime,
      };
    }

    await addAuditLog("appointment", id, "update", `Agendamento #${id} reagendado via drag-and-drop`);
  },

  // Restaura a agenda de um dia a partir de um snapshot (para undo/redo)
  async restoreForDate(date: string, snapshot: Appointment[]): Promise<void> {
    const current = cache.appointments.filter(a => localDateKey(a.startTime) === date);
    const snapMap = new Map(snapshot.map(a => [a.id, a]));
    const currMap = new Map(current.map(a => [a.id, a]));

    // Apagar agendamentos que não existiam no snapshot
    for (const [id] of currMap) {
      if (!snapMap.has(id)) {
        await supabase.from("appointments").delete().eq("id", id);
        cache.appointments = cache.appointments.filter(a => a.id !== id);
      }
    }

    // Recriar ou actualizar agendamentos do snapshot
    for (const [id, appt] of snapMap) {
      const curr = currMap.get(id);
      if (!curr) {
        // Recriar com o ID original via upsert
        const { data: row, error } = await supabase
          .from("appointments")
          .upsert({
            id,
            client_name: appt.clientName,
            client_id: appt.clientId,
            employee_id: appt.employeeId,
            start_time: appt.startTime,
            end_time: appt.endTime,
            status: appt.status,
            total_price: appt.totalPrice,
            notes: appt.notes,
            payment_status: appt.paymentStatus,
            group_id: appt.groupId,
            services: appt.services,
          })
          .select()
          .single();
        if (!error && row) cache.appointments.push(toAppointment(row));
      } else if (JSON.stringify(curr) !== JSON.stringify(appt)) {
        // Actualizar campos que mudaram
        await supabase.from("appointments").update({
          client_name: appt.clientName,
          client_id: appt.clientId,
          employee_id: appt.employeeId,
          start_time: appt.startTime,
          end_time: appt.endTime,
          status: appt.status,
          total_price: appt.totalPrice,
          notes: appt.notes,
          payment_status: appt.paymentStatus,
          group_id: appt.groupId,
          services: appt.services,
        }).eq("id", id);
        const idx = cache.appointments.findIndex(a => a.id === id);
        if (idx !== -1) cache.appointments[idx] = appt;
      }
    }

    window.dispatchEvent(new Event("appointments_updated"));
  },
};
