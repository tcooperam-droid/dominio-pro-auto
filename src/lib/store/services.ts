/** Casos de uso e persistência do domínio de serviços. */

import { supabase } from "../supabase";
import type { Service } from "./types";
import { addAuditLog, cache, fetchAllFromTable, logDb, toService } from "./shared";

// ─── Services ────────────────────────────────────────────

export const servicesStore = {
  list(activeOnly = false): Service[] {
    return activeOnly ? cache.services.filter(s => s.active) : [...cache.services];
  },

  async fetchAll(): Promise<Service[]> {
    const data = await fetchAllFromTable("services", "id");
    cache.services = data.map(toService);
    return cache.services;
  },

  async create(data: Omit<Service, "id" | "createdAt">): Promise<Service> {
    logDb("services.create:start", data);

    const { data: row, error } = await supabase
      .from("services")
      .insert({
        name: data.name,
        description: data.description,
        duration_minutes: data.durationMinutes,
        price: data.price,
        material_cost_percent: data.materialCostPercent,
        commission_mode: data.commissionMode,
        color: data.color,
        active: data.active,
      })
      .select()
      .single();

    if (error) throw error;

    const svc = toService(row);
    cache.services.push(svc);

    await addAuditLog("service", svc.id, "create", `Serviço "${svc.name}" criado`);

    return svc;
  },

  async update(id: number, data: Partial<Service>): Promise<Service | null> {
    const p: any = {};

    if (data.name !== undefined) p.name = data.name;
    if (data.description !== undefined) p.description = data.description;
    if (data.durationMinutes !== undefined) p.duration_minutes = data.durationMinutes;
    if (data.price !== undefined) p.price = data.price;
    if (data.materialCostPercent !== undefined) p.material_cost_percent = data.materialCostPercent;
    if (data.commissionMode !== undefined) p.commission_mode = data.commissionMode;
    if (data.color !== undefined) p.color = data.color;
    if (data.active !== undefined) p.active = data.active;

    const { data: row, error } = await supabase
      .from("services")
      .update(p)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    const svc = toService(row);
    const idx = cache.services.findIndex(s => s.id === id);

    if (idx !== -1) cache.services[idx] = svc;

    await addAuditLog("service", id, "update", `Serviço "${svc.name}" atualizado`);

    return svc;
  },

  async delete(id: number): Promise<void> {
    const svc = cache.services.find(s => s.id === id);

    await supabase.from("services").delete().eq("id", id);

    cache.services = cache.services.filter(s => s.id !== id);

    if (svc) {
      await addAuditLog("service", id, "delete", `Serviço "${svc.name}" removido`);
    }
  },
};
