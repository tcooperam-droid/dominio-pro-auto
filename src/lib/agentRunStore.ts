import { supabase } from "./supabase";

type AgentRunStatus = "running" | "success" | "error";

export interface AgentRunHandle {
  id: string;
  agentName: string;
  startedAt: string;
}

function safeJson(value: unknown): unknown {
  try {
    JSON.stringify(value);
    return value;
  } catch {
    return { value: String(value) };
  }
}

export async function startAgentRun(input: {
  agentName: string;
  userId?: string;
  conversationId?: string;
  request: unknown;
}): Promise<AgentRunHandle | null> {
  try {
    const startedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("agent_runs")
      .insert({
        agent_name: input.agentName,
        user_id: input.userId ?? null,
        conversation_id: input.conversationId ?? null,
        input: safeJson(input.request),
        status: "running",
        started_at: startedAt,
      })
      .select("id,agent_name,started_at")
      .single();
    if (error || !data) return null;
    return { id: data.id, agentName: data.agent_name, startedAt: data.started_at };
  } catch {
    return null;
  }
}

export async function finishAgentRun(
  run: AgentRunHandle | null,
  input: { status: Exclude<AgentRunStatus, "running">; output?: unknown; errorCode?: string; errorMessage?: string },
): Promise<void> {
  if (!run) return;
  try {
    await supabase.from("agent_runs").update({
      status: input.status,
      output: input.output === undefined ? null : safeJson(input.output),
      error_code: input.errorCode ?? null,
      error_message: input.errorMessage ?? null,
      finished_at: new Date().toISOString(),
    }).eq("id", run.id);
  } catch {
    // Telemetria nunca pode impedir a operação do agente.
  }
}

export async function recordAgentToolCall(input: {
  run: AgentRunHandle | null;
  toolName: string;
  arguments: unknown;
  result?: unknown;
  status: Exclude<AgentRunStatus, "running">;
  errorMessage?: string;
}): Promise<void> {
  if (!input.run) return;
  try {
    await supabase.from("agent_tool_calls").insert({
      agent_run_id: input.run.id,
      tool_name: input.toolName,
      arguments: safeJson(input.arguments),
      result: input.result === undefined ? null : safeJson(input.result),
      status: input.status,
      error_message: input.errorMessage ?? null,
      finished_at: new Date().toISOString(),
    });
  } catch {
    // Best effort.
  }
}

export async function recordAgentIncident(input: {
  run: AgentRunHandle | null;
  agentName: string;
  code: string;
  message: string;
  evidence?: unknown;
}): Promise<void> {
  try {
    await supabase.from("agent_incidents").insert({
      agent_run_id: input.run?.id ?? null,
      agent_name: input.agentName,
      code: input.code,
      message: input.message,
      evidence: safeJson(input.evidence ?? {}),
      status: "open",
    });
  } catch {
    // Best effort.
  }
}
