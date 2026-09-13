import { supabase } from "./supabase";

export interface SupervisorEvidence {
  runs: Array<Record<string, unknown>>;
  toolCalls: Array<Record<string, unknown>>;
  incidents: Array<Record<string, unknown>>;
}

export async function loadSupervisorEvidence(limit = 8): Promise<SupervisorEvidence> {
  const safeLimit = Math.min(Math.max(limit, 1), 20);
  const [{ data: runs }, { data: incidents }] = await Promise.all([
    supabase.from("agent_runs").select("id,agent_name,input,output,status,error_code,error_message,started_at,finished_at").order("started_at", { ascending: false }).limit(safeLimit),
    supabase.from("agent_incidents").select("id,agent_run_id,agent_name,code,message,evidence,status,created_at").order("created_at", { ascending: false }).limit(safeLimit),
  ]);
  const runIds = (runs ?? []).map((run) => run.id);
  const { data: toolCalls } = runIds.length
    ? await supabase.from("agent_tool_calls").select("id,agent_run_id,tool_name,arguments,result,status,error_message,created_at,finished_at").in("agent_run_id", runIds).order("created_at", { ascending: false }).limit(safeLimit * 3)
    : { data: [] };
  return { runs: runs ?? [], toolCalls: toolCalls ?? [], incidents: incidents ?? [] };
}

export function formatSupervisorEvidence(evidence: SupervisorEvidence): string {
  return JSON.stringify(evidence, null, 2).slice(0, 18_000);
}
