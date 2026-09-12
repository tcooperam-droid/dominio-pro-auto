/**
 * agentContracts.ts — Contratos estruturados entre os agentes de IA do app.
 *
 * Antes deste arquivo, cada ponta inventava seu próprio formato solto
 * (Record<string, unknown>, strings livres) e validava (ou não) na mão.
 * Aqui centralizamos os formatos com zod, para que:
 *  - o agentV2 valide de verdade o bloco `action` que o LLM devolve, em vez
 *    de um JSON.parse cego com type assertion;
 *  - o agente pessoal use "tools" formais (function calling) em vez de
 *    regex sobre o texto da mensagem;
 *  - o mesmo tipo sirva de referência única para as duas pontas.
 *
 * Observação: a Groq (usada em /api/agent e /api/personal-agent) suporta
 * tool calling nativo, mas não garante 100% de aderência ao JSON schema —
 * por isso toda leitura de `arguments`/`params` passa pelos schemas abaixo
 * em vez de confiar direto no que o modelo devolveu.
 */

import { z } from "zod";

// ─── Ações do agente de agendamento (agentV2) ──────────────────────────

const AgendarParamsSchema = z
  .object({
    serviceId: z.union([z.number(), z.string()]).optional(),
    employeeId: z.union([z.number(), z.string()]).optional(),
    date: z.string().optional(),
    time: z.string(),
    clientName: z.string().optional(),
    confirmed: z.boolean().optional(),
    forceSchedule: z.boolean().optional(),
    forceConflict: z.boolean().optional(),
  })
  .passthrough();

const CancelarParamsSchema = z
  .object({
    appointmentId: z.union([z.number(), z.string()]),
  })
  .passthrough();

const MoverParamsSchema = z
  .object({
    appointmentId: z.union([z.number(), z.string()]),
    newDate: z.string(),
    newTime: z.string(),
    forceConflict: z.boolean().optional(),
  })
  .passthrough();

const ConcluirParamsSchema = z
  .object({
    appointmentId: z.union([z.number(), z.string()]),
  })
  .passthrough();

const CriarClienteParamsSchema = z
  .object({
    name: z.string(),
    phone: z.string().optional(),
    confirmed: z.boolean().optional(),
  })
  .passthrough();

const TrocarClienteParamsSchema = z
  .object({
    appointmentId: z.union([z.number(), z.string()]),
    newClientName: z.string(),
  })
  .passthrough();

export const ActionPayloadSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("agendar"), params: AgendarParamsSchema }),
  z.object({ type: z.literal("cancelar"), params: CancelarParamsSchema }),
  z.object({ type: z.literal("mover"), params: MoverParamsSchema }),
  z.object({ type: z.literal("concluir"), params: ConcluirParamsSchema }),
  z.object({ type: z.literal("criar_cliente"), params: CriarClienteParamsSchema }),
  z.object({ type: z.literal("trocar_cliente"), params: TrocarClienteParamsSchema }),
]);

export type ActionPayload = z.infer<typeof ActionPayloadSchema>;
export type ActionType = ActionPayload["type"];

const KNOWN_ACTION_TYPES: ActionType[] = [
  "agendar",
  "cancelar",
  "mover",
  "concluir",
  "criar_cliente",
  "trocar_cliente",
];

/**
 * Valida um payload de ação vindo do LLM (já parseado de JSON).
 * Nunca lança: em caso de formato inválido, devolve uma mensagem em
 * português pronta para exibir ao usuário, no mesmo estilo dos erros que
 * executeAction() já retorna hoje.
 */
export function parseActionPayload(
  raw: unknown,
): { ok: true; action: ActionPayload } | { ok: false; message: string } {
  const result = ActionPayloadSchema.safeParse(raw);
  if (result.success) return { ok: true, action: result.data };

  const tipo = (raw as { type?: unknown } | null)?.type;
  if (typeof tipo !== "string" || !KNOWN_ACTION_TYPES.includes(tipo as ActionType)) {
    return {
      ok: false,
      message: `Ação inválida: tipo "${String(tipo)}" desconhecido. Tente reformular o pedido.`,
    };
  }
  const firstIssue = result.error.issues[0];
  const campo = firstIssue?.path?.join(".") || "params";
  return {
    ok: false,
    message: `Ação "${tipo}" com dados incompletos (${campo}: ${firstIssue?.message ?? "inválido"}). Tente reformular o pedido.`,
  };
}

// ─── Ferramentas formais do agente pessoal ─────────────────────────────
//
// Substituem os classificadores por regex (isTechnicalRequest,
// isSchedulerRequest, isLikelyWebResearchRequest, extractFactCommand,
// extractGoalCommand, extractTeachingInstruction em prompt.ts). Essas
// funções continuam existindo e testadas em prompt.test.ts, mas deixam de
// ser o mecanismo de roteamento — agora é o próprio modelo que decide,
// via tool calling, qual delas equivale a chamar.

export const PersonalAgentToolArgsSchema = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("remember_fact"), key: z.string(), value: z.string() }),
  z.object({ tool: z.literal("add_goal"), title: z.string() }),
  z.object({ tool: z.literal("complete_goal"), title: z.string() }),
  z.object({ tool: z.literal("add_instruction"), instruction: z.string() }),
  z.object({ tool: z.literal("diagnose_current_screen"), question: z.string().optional() }),
  z.object({ tool: z.literal("run_schedule_test"), scenario: z.enum(["conflict_same_employee", "no_conflict_other_employee", "invalid_time", "outside_working_hours"]), date: z.string().optional(), startTime: z.string().optional(), endTime: z.string().optional() }),
  z.object({ tool: z.literal("propose_scheduler_rule"), rule: z.string(), confirmed: z.boolean().optional() }),
  z.object({ tool: z.literal("route_to_scheduler"), message: z.string() }),
  z.object({ tool: z.literal("route_to_technical_agent"), question: z.string() }),
  z.object({ tool: z.literal("search_web"), query: z.string() }),
]);

export type PersonalAgentToolArgs = z.infer<typeof PersonalAgentToolArgsSchema>;
export type PersonalAgentToolName = PersonalAgentToolArgs["tool"];

/** Definições no formato "tools" da API OpenAI-compatible (Groq). */
export const PERSONAL_AGENT_TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "remember_fact",
      description:
        "Guarda um fato permanente sobre o usuário na memória do agente pessoal (ex: nome, preferência, dado pessoal estável).",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Chave curta do fato, ex: 'nome'." },
          value: { type: "string", description: "Valor do fato." },
        },
        required: ["key", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_goal",
      description: "Registra um novo objetivo pessoal do usuário.",
      parameters: {
        type: "object",
        properties: { title: { type: "string", description: "Descrição do objetivo." } },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_goal",
      description: "Marca um objetivo existente do usuário como concluído.",
      parameters: {
        type: "object",
        properties: { title: { type: "string", description: "Título (ou parte dele) do objetivo a concluir." } },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_instruction",
      description: "Guarda uma instrução/regra permanente sobre como o agente deve se comportar daqui em diante.",
      parameters: {
        type: "object",
        properties: { instruction: { type: "string", description: "A instrução, no texto do próprio usuário." } },
        required: ["instruction"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "diagnose_current_screen",
      description: "Coleta retrato da tela, divergências locais e captura visual sem alterar dados.",
      parameters: { type: "object", properties: { question: { type: "string" } }, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "run_schedule_test",
      description: "Executa teste determinístico e somente leitura de horários e conflitos.",
      parameters: { type: "object", properties: { scenario: { type: "string", enum: ["conflict_same_employee", "no_conflict_other_employee", "invalid_time", "outside_working_hours"] }, date: { type: "string" }, startTime: { type: "string" }, endTime: { type: "string" } }, required: ["scenario"] },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_scheduler_rule",
      description: "Propõe uma regra para o agente de agendamento e só grava após confirmação explícita.",
      parameters: { type: "object", properties: { rule: { type: "string" }, confirmed: { type: "boolean" } }, required: ["rule"] },
    },
  },
  {
    type: "function",
    function: {
      name: "route_to_scheduler",
      description:
        "Encaminha uma operação de agenda do salão (criar, mover, cancelar ou concluir agendamento, ou consulta de horários/clientes/profissionais) para o agente de agendamento (agentV2), que tem acesso real ao banco de dados. Nunca simule esse resultado você mesmo.",
      parameters: {
        type: "object",
        properties: { message: { type: "string", description: "A mensagem do usuário, no texto original." } },
        required: ["message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "route_to_technical_agent",
      description:
        "Encaminha uma pergunta técnica sobre bugs, erros, comportamento incorreto do app ou do código-fonte para o agente técnico especializado, que lê o repositório e faz diagnóstico.",
      parameters: {
        type: "object",
        properties: { question: { type: "string", description: "A pergunta técnica, no texto original." } },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_web",
      description:
        "Pesquisa informação atual na Internet (notícias, cotações, preços, fatos recentes) quando o conhecimento do modelo pode estar desatualizado.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "O que pesquisar." } },
        required: ["query"],
      },
    },
  },
] as const;
