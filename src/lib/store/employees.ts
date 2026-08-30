/** Casos de uso e persistência do domínio de funcionários. */

import { supabase } from "../supabase";
import type { Employee } from "./types";
import { addAuditLog, cache, fetchAllFromTable, toEmployee } from "./shared";

// ─── Employees ───────────────────────────────────────────

export const employeesStore = {
  list(activeOnly = false): Employee[] {
    return activeOnly ? cache.employees.filter(e => e.active) : [...cache.employees];
  },

  async fetchAll(): Promise<Employee[]> {
    const data = await fetchAllFromTable("employees", "id");
    cache.employees = data.map(toEmployee);
    return cache.employees;
  },

  async create(data: Omit<Employee, "id" | "createdAt">): Promise<Employee> {
    const { data: row, error } = await supabase
      .from("employees")
      .insert({
        name: data.name,
        email: data.email,
        phone: data.phone,
        color: data.color,
        photo_url: data.photoUrl ?? null,
        specialties: data.specialties,
        commission_percent: data.commissionPercent,
        working_hours: data.workingHours,
        active: data.active,
      })
      .select()
      .single();

    if (error) throw error;

    const emp = toEmployee(row);
    cache.employees.push(emp);
    window.dispatchEvent(new Event("store_updated"));

    await addAuditLog("employee", emp.id, "create", `Funcionário "${emp.name}" criado`);

    return emp;
  },

  async update(id: number, data: Partial<Employee>): Promise<Employee | null> {
    const p: any = {};

    if (data.name !== undefined) p.name = data.name;
    if (data.email !== undefined) p.email = data.email;
    if (data.phone !== undefined) p.phone = data.phone;
    if (data.color !== undefined) p.color = data.color;
    if (data.photoUrl !== undefined) p.photo_url = data.photoUrl;
    if (data.specialties !== undefined) p.specialties = data.specialties;
    if (data.commissionPercent !== undefined) p.commission_percent = data.commissionPercent;
    if (data.workingHours !== undefined) p.working_hours = data.workingHours;
    if (data.active !== undefined) p.active = data.active;

    const { data: row, error } = await supabase
      .from("employees")
      .update(p)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    const emp = toEmployee(row);
    const idx = cache.employees.findIndex(e => e.id === id);

    if (idx !== -1) cache.employees[idx] = emp;
    window.dispatchEvent(new Event("store_updated"));

    await addAuditLog("employee", id, "update", `Funcionário "${emp.name}" atualizado`);

    return emp;
  },

  async delete(id: number): Promise<void> {
    const emp = cache.employees.find(e => e.id === id);

    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) throw error;

    cache.employees = cache.employees.filter(e => e.id !== id);
    window.dispatchEvent(new Event("store_updated"));

    if (emp) {
      await addAuditLog("employee", id, "delete", `Funcionário "${emp.name}" removido`);
    }
  },
};
