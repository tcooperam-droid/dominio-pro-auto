/** Casos de uso e persistência do domínio de pacotes de serviços. */

import { supabase } from "../supabase";
import type { ServicePackage } from "./types";
import { addAuditLog, cache, fetchAllFromTable, logDb, toServicePackage } from "./shared";

export const servicePackagesStore = {
  list(activeOnly = false): ServicePackage[] {
    return activeOnly ? cache.servicePackages.filter(pkg => pkg.active) : [...cache.servicePackages];
  },

  async fetchAll(): Promise<ServicePackage[]> {
    const data = await fetchAllFromTable("service_packages", "id");
    cache.servicePackages = data.map(toServicePackage);
    return cache.servicePackages;
  },

  async create(data: Omit<ServicePackage, "id" | "createdAt">): Promise<ServicePackage> {
    logDb("servicePackages.create:start", data);
    const { data: row, error } = await supabase
      .from("service_packages")
      .insert({
        name: data.name,
        description: data.description,
        service_ids: JSON.stringify(data.serviceIds),
        discount: data.discount ?? null,
        active: data.active,
      })
      .select()
      .single();
    if (error) throw error;
    const pkg = toServicePackage(row);
    cache.servicePackages.push(pkg);
    window.dispatchEvent(new Event("service_packages_updated"));
    window.dispatchEvent(new Event("store_updated"));
    await addAuditLog("service_package", pkg.id, "create", `Pacote "${pkg.name}" criado`);
    return pkg;
  },

  async update(id: number, data: Partial<Omit<ServicePackage, "id" | "createdAt">>): Promise<ServicePackage> {
    const payload: Record<string, unknown> = {};
    if (data.name !== undefined) payload.name = data.name;
    if (data.description !== undefined) payload.description = data.description;
    if (data.serviceIds !== undefined) payload.service_ids = JSON.stringify(data.serviceIds);
    if (data.discount !== undefined) payload.discount = data.discount;
    if (data.active !== undefined) payload.active = data.active;

    const { data: row, error } = await supabase
      .from("service_packages")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    const pkg = toServicePackage(row);
    const index = cache.servicePackages.findIndex(item => item.id === id);
    if (index >= 0) cache.servicePackages[index] = pkg;
    window.dispatchEvent(new Event("service_packages_updated"));
    window.dispatchEvent(new Event("store_updated"));
    await addAuditLog("service_package", id, "update", `Pacote "${pkg.name}" atualizado`);
    return pkg;
  },

  async delete(id: number): Promise<void> {
    const pkg = cache.servicePackages.find(item => item.id === id);
    const { error } = await supabase.from("service_packages").delete().eq("id", id);
    if (error) throw error;
    cache.servicePackages = cache.servicePackages.filter(item => item.id !== id);
    window.dispatchEvent(new Event("service_packages_updated"));
    window.dispatchEvent(new Event("store_updated"));
    if (pkg) await addAuditLog("service_package", id, "delete", `Pacote "${pkg.name}" removido`);
  },
};
