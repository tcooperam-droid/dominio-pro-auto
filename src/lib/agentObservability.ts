export type SchedulerTraceStatus = "success" | "error";

export interface SchedulerTrace {
  id: string;
  createdAt: string;
  request: string;
  response: string;
  status: SchedulerTraceStatus;
  error?: string;
  phase?: string;
  actionExecuted?: boolean;
  messageId?: string;
}

const TRACE_KEY = "agent_scheduler_trace_v1";
const MAX_TRACES = 80;
const MAX_FIELD = 1800;
let memoryTraces: SchedulerTrace[] = [];

function clip(value: unknown, limit = MAX_FIELD): string {
  return String(value ?? "").trim().slice(0, limit);
}

function readTraces(): SchedulerTrace[] {
  if (typeof window === "undefined") return memoryTraces;
  try {
    const raw = window.localStorage.getItem(TRACE_KEY);
    const value = raw ? JSON.parse(raw) : [];
    memoryTraces = Array.isArray(value) ? value : [];
    return memoryTraces;
  } catch {
    return memoryTraces;
  }
}

function writeTraces(traces: SchedulerTrace[]): void {
  memoryTraces = traces.slice(-MAX_TRACES);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TRACE_KEY, JSON.stringify(memoryTraces));
  } catch {
    // Observabilidade não pode impedir o agendamento.
  }
}

export function recordSchedulerTrace(input: Omit<SchedulerTrace, "id" | "createdAt">): SchedulerTrace {
  const trace: SchedulerTrace = {
    ...input,
    id: `scheduler_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    request: clip(input.request),
    response: clip(input.response),
    error: input.error ? clip(input.error, 800) : undefined,
    phase: input.phase ? clip(input.phase, 120) : undefined,
  };
  writeTraces([...readTraces(), trace]);
  return trace;
}

export function loadSchedulerTraces(limit = 30): SchedulerTrace[] {
  return readTraces().slice(-Math.max(1, Math.min(limit, MAX_TRACES)));
}

export function clearSchedulerTraces(): void {
  memoryTraces = [];
  if (typeof window !== "undefined") window.localStorage.removeItem(TRACE_KEY);
}

export function formatSchedulerTrace(limit = 20): string {
  const traces = loadSchedulerTraces(limit);
  if (!traces.length) return "Nenhum diálogo ou erro do agente de agendamento foi registrado nesta sessão/dispositivo.";
  return traces.map((trace) => [
    `[${trace.createdAt}] status=${trace.status}${trace.phase ? ` fase=${trace.phase}` : ""}`,
    `Usuário: ${trace.request}`,
    `Agendamento: ${trace.response || "(sem resposta)"}`,
    trace.error ? `Erro: ${trace.error}` : "",
    typeof trace.actionExecuted === "boolean" ? `Ação executada: ${trace.actionExecuted ? "sim" : "não"}` : "",
  ].filter(Boolean).join("\n")).join("\n\n").slice(0, 24000);
}

export function looksLikeSchedulerError(text: string): boolean {
  return /^(erro|falha|não consegui|não foi possível|não recebi|não entendi)/i.test(text.trim());
}
