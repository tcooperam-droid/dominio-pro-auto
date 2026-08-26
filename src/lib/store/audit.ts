/** Consulta do histórico de auditoria. */

import type { AuditLog } from "./types";
import { cache, fetchAllFromTable, toAuditLog } from "./shared";

// ─── Audit Log ───────────────────────────────────────────

export const auditStore = {
  log(entityType?: string): AuditLog[] {
    const all = [...cache.auditLogs];
    const filtered = entityType ? all.filter(l => l.entityType === entityType) : all;

    return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async fetchAll(): Promise<AuditLog[]> {
    const data = await fetchAllFromTable("audit_logs", "created_at");
    cache.auditLogs = data.map(toAuditLog);
    return cache.auditLogs;
  },
};
