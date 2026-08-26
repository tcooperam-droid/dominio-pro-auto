/** Casos de uso e persistência do domínio de clientes. */

import { supabase } from "../supabase";
import type { Client } from "./types";
import {
  addAuditLog,
  cache,
  escapeLike,
  fetchAllFromTable,
  logDb,
  normalizeSearchText,
  scoreClientMatch,
  toClient,
} from "./shared";

// ─── Clients ─────────────────────────────────────────────

export const clientsStore = {
  list(): Client[] {
    return [...cache.clients];
  },

  async ensureLoaded(): Promise<Client[]> {
    if (cache.clients.length > 0) return cache.clients;
    return this.fetchAll();
  },

  async count(): Promise<number> {
    if (cache.clients.length > 0) return cache.clients.length;

    const { count, error } = await supabase
      .from("clients")
      .select("id", { count: "exact", head: true });

    if (error) throw error;

    return count ?? 0;
  },

  async search(query: string, options?: { limit?: number }): Promise<Client[]> {
    const q = query.trim();
    const limit = options?.limit ?? 20;

    if (!q) return [];

    const uniqueRows = new Map<number, any>();

    const addRows = (rows?: any[] | null) => {
      for (const row of rows ?? []) uniqueRows.set(row.id, row);
    };

    const digits = q.replace(/\D/g, "");
    const normalized = normalizeSearchText(q);
    const tokens = Array.from(new Set(normalized.split(" ").filter(token => token.length >= 2)));
    const safeQ = escapeLike(q);

    logDb("clients.search:start", { query: q, limit, digitsLength: digits.length, tokens });

    const wildcardOr = [
      `name.ilike.%${safeQ}%`,
      digits.length >= 3 ? `phone.ilike.%${digits}%` : null,
      q.includes("@") ? `email.ilike.%${safeQ}%` : null,
    ]
      .filter(Boolean)
      .join(",");

    if (wildcardOr) {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .or(wildcardOr)
        .order("name")
        .limit(Math.max(limit, 30));

      if (error) throw error;
      addRows(data);
    }

    if (uniqueRows.size < limit) {
      for (const token of tokens.slice(0, 3)) {
        const { data, error } = await supabase
          .from("clients")
          .select("*")
          .ilike("name", `%${escapeLike(token)}%`)
          .order("name")
          .limit(30);

        if (error) throw error;
        addRows(data);

        if (uniqueRows.size >= limit * 2) break;
      }
    }

    if (uniqueRows.size < limit) {
      const firstLetter = q[0];

      if (firstLetter) {
        const { data, error } = await supabase
          .from("clients")
          .select("*")
          .ilike("name", `${escapeLike(firstLetter)}%`)
          .order("name")
          .limit(120);

        if (error) throw error;
        addRows(data);
      }
    }

    const ranked = Array.from(uniqueRows.values())
      .map(toClient)
      .map(client => ({
        client,
        score: Math.max(
          scoreClientMatch(q, client),
          digits.length >= 3 && client.phone?.replace(/\D/g, "").includes(digits) ? 0.92 : 0,
          q.includes("@") && client.email && normalizeSearchText(client.email).includes(normalizeSearchText(q)) ? 0.9 : 0,
        ),
      }))
      .filter(item => item.score >= 0.45)
      .sort((a, b) => b.score - a.score || a.client.name.localeCompare(b.client.name, "pt-BR"))
      .slice(0, limit)
      .map(item => item.client);

    return ranked;
  },

  async fetchAll(): Promise<Client[]> {
    const data = await fetchAllFromTable("clients", "name");
    cache.clients = data.map(toClient);
    return cache.clients;
  },

  async create(data: Omit<Client, "id" | "createdAt">): Promise<Client> {
    logDb("clients.create:start", data);

    const { data: row, error } = await supabase
      .from("clients")
      .insert({
        name: data.name,
        email: data.email,
        phone: data.phone,
        birth_date: data.birthDate,
        cpf: data.cpf,
        address: data.address,
        notes: data.notes,
      })
      .select()
      .single();

    if (error) {
      logDb("clients.create:error", error);
      throw error;
    }

    const cli = toClient(row);
    cache.clients.push(cli);

    logDb("clients.create:success", cli);

    await addAuditLog("client", cli.id, "create", `Cliente "${cli.name}" criado`);

    return cli;
  },

  async createMany(items: Omit<Client, "id" | "createdAt">[]): Promise<Client[]> {
    if (!items.length) return [];

    const payload = items.map(data => ({
      name: data.name,
      email: data.email,
      phone: data.phone,
      birth_date: data.birthDate,
      cpf: data.cpf,
      address: data.address,
      notes: data.notes,
    }));

    const { data: rows, error } = await supabase
      .from("clients")
      .insert(payload)
      .select();

    if (error) throw error;

    const created = (rows ?? []).map(toClient);
    cache.clients.push(...created);

    return created;
  },

  async update(id: number, data: Partial<Client>): Promise<Client | null> {
    logDb("clients.update:start", { id, data });

    const p: any = {};

    if (data.name !== undefined) p.name = data.name;
    if (data.email !== undefined) p.email = data.email;
    if (data.phone !== undefined) p.phone = data.phone;
    if (data.birthDate !== undefined) p.birth_date = data.birthDate;
    if (data.cpf !== undefined) p.cpf = data.cpf;
    if (data.address !== undefined) p.address = data.address;
    if (data.notes !== undefined) p.notes = data.notes;

    const { data: row, error } = await supabase
      .from("clients")
      .update(p)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    const cli = toClient(row);
    const idx = cache.clients.findIndex(c => c.id === id);

    if (idx !== -1) cache.clients[idx] = cli;

    await addAuditLog("client", id, "update", `Cliente "${cli.name}" atualizado`);

    return cli;
  },

  async delete(id: number): Promise<void> {
    const cli = cache.clients.find(c => c.id === id);

    const { error } = await supabase.from("clients").delete().eq("id", id);

    if (error) throw error;

    cache.clients = cache.clients.filter(c => c.id !== id);

    if (cli) {
      await addAuditLog("client", id, "delete", `Cliente "${cli.name}" removido`);
    }
  },

  async clearAll(): Promise<void> {
    const { error } = await supabase.from("clients").delete().neq("id", 0);

    if (error) throw error;

    cache.clients = [];
  },
};
