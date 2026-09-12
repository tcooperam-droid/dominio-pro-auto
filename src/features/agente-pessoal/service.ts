import { createAuthenticatedAgentHeaders, getAgentEndpoint } from "@/features/assistente/llmEndpoint";
import { getSession } from "@/lib/access";
import { buildAppContext } from "./appContext";
import { addFeedback, addGoal, addInstruction, appendSummary, completeGoal, loadConversation, loadMemory, rememberFact, saveConversation } from "./memory";
import { buildConversationContext, buildPersonalSystemPrompt } from "./prompt";
import { createSchedulerBridge } from "./bridge";
import { addRule } from "@/lib/agentMemory";
import { collectDiagnosticSnapshot, findLocalDivergences, formatDiagnosticContext, refreshDiagnosticSnapshot, runScheduleScenario } from "@/lib/agentDiagnostics";
import { captureVisibleScreen } from "@/lib/screenCapture";
import { formatSchedulerTrace } from "@/lib/agentObservability";
import { PERSONAL_AGENT_TOOL_DEFINITIONS, PersonalAgentToolArgsSchema, type PersonalAgentToolArgs } from "@/lib/agentContracts";
import {
  PERSONAL_AGENT_MODEL,
  PERSONAL_AGENT_SCOPE,
  type PersonalAgentConfig,
  type PersonalAgentResponse,
  type PersonalMessage,
  type WebCitation,
} from "./types";

// NOTA (evolução dos agentes, set/2026): o roteamento por regex
// (isTechnicalRequest, isSchedulerRequest, isLikelyWebResearchRequest,
// extractFactCommand, extractGoalCommand, extractTeachingInstruction) saiu
// de uso AQUI, substituído por tool calling de verdade — o próprio LLM
// decide qual ferramenta chamar (ver PERSONAL_AGENT_TOOL_DEFINITIONS em
// agentContracts.ts). As funções continuam definidas e testadas em
// prompt.ts / prompt.test.ts; não foram removidas para não derrubar essa
// cobertura de teste, mas hoje são código órfão — candidatas a limpeza
// futura assim que o fluxo novo estiver validado em produção.

let config: PersonalAgentConfig | null = null;
const schedulerBridge = createSchedulerBridge();

function currentScope(): string {
  const profile = getSession()?.profileName?.trim();
  return `${PERSONAL_AGENT_SCOPE}:${profile || "owner"}`;
}

function messageId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function userMessage(text: string, routedTo: "personal" | "scheduler"): PersonalMessage {
  return { id: messageId("user"), role: "user", content: text, createdAt: new Date().toISOString(), routedTo };
}

function assistantMessage(text: string, routedTo: "personal" | "scheduler"): PersonalMessage {
  return { id: messageId("assistant"), role: "assistant", content: text, createdAt: new Date().toISOString(), routedTo };
}

function saveExchange(scope: string, user: PersonalMessage, assistant: PersonalMessage): void {
  saveConversation(scope, [...loadConversation(scope), user, assistant]);
}

export function initPersonalAgent(nextConfig: PersonalAgentConfig): void {
  config = { ...nextConfig, model: nextConfig.model || PERSONAL_AGENT_MODEL };
}

export function getPersonalAgentScope(): string {
  return currentScope();
}

export function getPersonalConversation(): PersonalMessage[] {
  return loadConversation(currentScope());
}

interface PersonalLLMToolCall {
  id: string;
  name: string;
  arguments: string;
}

interface PersonalLLMResult {
  content: string | null;
  toolCalls?: PersonalLLMToolCall[];
}

/**
 * Chama o agente pessoal (Groq/gpt-oss-20b via /api/personal-agent) com as
 * ferramentas formais anexadas. O próprio modelo decide se responde direto
 * (content) ou pede para executar uma ferramenta (toolCalls).
 */
async function callPersonalLLM(scope: string, message: string): Promise<PersonalLLMResult> {
  if (!config) return { content: "O agente pessoal ainda não foi configurado." };
  const endpoint = getAgentEndpoint(config.apiEndpoint);
  const memory = loadMemory(scope);
  const history = loadConversation(scope).slice(-12);
  const system = buildPersonalSystemPrompt(memory, {
    salonName: config.salonName,
    userName: config.userName || getSession()?.profileName,
  }) + `\n\n${buildAppContext()}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: await createAuthenticatedAgentHeaders(endpoint, config.apiToken),
    body: JSON.stringify({
      model: config.model || PERSONAL_AGENT_MODEL,
      messages: [
        { role: "system", content: system },
        ...history.map((item) => ({ role: item.role, content: item.content })),
        { role: "user", content: message },
      ],
      temperature: 0.35,
      max_tokens: 1400,
      tools: PERSONAL_AGENT_TOOL_DEFINITIONS,
      tool_choice: "auto",
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`;
    throw new Error(`Não foi possível consultar o agente pessoal: ${detail}`);
  }
  const msg = payload?.choices?.[0]?.message;
  const hasToolCalls = Array.isArray(msg?.tool_calls) && msg.tool_calls.length > 0;
  if (!msg || (typeof msg.content !== "string" && !hasToolCalls)) {
    throw new Error("O modelo não retornou uma resposta válida.");
  }
  return {
    content: typeof msg.content === "string" ? msg.content.trim() : null,
    toolCalls: hasToolCalls
      ? msg.tool_calls.map((tc: { id: string; function?: { name?: string; arguments?: string } }) => ({
          id: tc.id,
          name: tc.function?.name || "",
          arguments: tc.function?.arguments || "{}",
        }))
      : undefined,
  };
}

/** Pesquisa na Internet via /api/research (Gemini com grounding + fallback). */
async function callResearch(query: string): Promise<{ text: string; citations?: WebCitation[] }> {
  const endpoint = "/api/research";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: await createAuthenticatedAgentHeaders(endpoint, config?.apiToken || ""),
    body: JSON.stringify({
      model: config?.model || PERSONAL_AGENT_MODEL,
      messages: [{ role: "user", content: query }],
      temperature: 0.35,
      max_tokens: 1400,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`;
    throw new Error(`Não consegui pesquisar na Internet: ${detail}`);
  }
  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("A pesquisa não retornou uma resposta válida.");
  return { text: text.trim(), citations: Array.isArray(payload?.citations) ? payload.citations : undefined };
}

async function callTechnicalAgent(scope: string, message: string, extraContext = "", screenImage?: string | null): Promise<string> {
  const endpoint = "/api/technical-agent";
  const history = loadConversation(scope).slice(-3).map((item) => ({
    role: item.role,
    content: item.content.slice(0, 700),
  }));
  const response = await fetch(endpoint, {
    method: "POST",
    headers: await createAuthenticatedAgentHeaders(endpoint, config?.apiToken || ""),
    body: JSON.stringify({
      question: message,
      appContext: `${buildAppContext()}\n\nDIAGNÓSTICO ESTRUTURADO:\n${extraContext}`.slice(0, 10000),
      // A Vercel rejeita bodies grandes com 413; a captura já é comprimida,
      // mas este teto protege também contra imagens antigas ou customizadas.
      screenImage: screenImage && screenImage.length < 360_000 ? screenImage : undefined,
      messages: history,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`;
    throw new Error(`Não foi possível consultar o agente técnico: ${detail}`);
  }
  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("O agente técnico não retornou uma análise válida.");
  return text.trim();
}

interface ToolOutcome {
  text: string;
  routedTo: "personal" | "scheduler";
  actionExecuted?: boolean;
  navigateTo?: string;
  schedulerMessageId?: string;
  citations?: WebCitation[];
}

/**
 * Executa a ferramenta escolhida pelo LLM. Cada capacidade devolve o mesmo
 * texto final que devolvia no fluxo antigo por regex — só muda quem decide
 * chamá-la.
 */
async function executeToolCall(scope: string, name: string, argsJson: string): Promise<ToolOutcome> {
  let parsedArgs: unknown;
  try {
    parsedArgs = JSON.parse(argsJson || "{}");
  } catch {
    return { text: `Não consegui interpretar os parâmetros de "${name}". Pode reformular o pedido?`, routedTo: "personal" };
  }

  const validated = PersonalAgentToolArgsSchema.safeParse({
    tool: name,
    ...(typeof parsedArgs === "object" && parsedArgs ? parsedArgs : {}),
  });
  if (!validated.success) {
    return { text: `Ferramenta "${name}" chamada com dados incompletos. Pode reformular o pedido?`, routedTo: "personal" };
  }
  const args: PersonalAgentToolArgs = validated.data;

  switch (args.tool) {
    case "remember_fact":
      rememberFact(scope, args.key, args.value);
      return { text: `Anotado: ${args.key} = ${args.value}.`, routedTo: "personal" };

    case "add_goal": {
      const created = addGoal(scope, args.title);
      return {
        text: created ? `Objetivo registrado: ${created.title}.` : "Não consegui registrar esse objetivo.",
        routedTo: "personal",
      };
    }

    case "complete_goal": {
      const completed = completeGoal(scope, args.title);
      return {
        text: completed
          ? `Objetivo concluído: ${completed.title}.`
          : `Não encontrei um objetivo ativo correspondente a "${args.title}".`,
        routedTo: "personal",
      };
    }

    case "add_instruction":
      addInstruction(scope, args.instruction);
      return {
        text: `Entendido. Vou usar esta instrução como contexto daqui em diante:\n"${args.instruction}"`,
        routedTo: "personal",
      };

    case "diagnose_current_screen": {
      const snapshot = await refreshDiagnosticSnapshot();
      const findings = findLocalDivergences(snapshot);
      const screenImage = await captureVisibleScreen().catch(() => null);
      const text = await callTechnicalAgent(scope, args.question || "Analise a tela atual e procure divergências entre tela, dados e regras.", formatDiagnosticContext(snapshot, findings), screenImage);
      return { text: `${text}\n\nAchados locais: ${findings.length ? findings.map((item) => `${item.severity}: ${item.title}`).join("; ") : "nenhuma divergência determinística encontrada"}.`, routedTo: "personal" };
    }

    case "run_schedule_test": {
      const result = runScheduleScenario(args);
      return { text: `${result.passed ? "PASSOU" : "FALHOU"}: ${result.scenario}\nEsperado: ${result.expected}\nAtual: ${result.actual}\nEvidências: ${result.evidence.join("; ") || "nenhuma"}`, routedTo: "personal" };
    }

    case "propose_scheduler_rule":
      if (args.confirmed === true) {
        const rule = addRule(args.rule);
        return { text: `Regra ensinada ao agente de agendamento: ${rule.raw}`, routedTo: "personal" };
      }
      return { text: `Proposta de regra para o agente de agendamento:\n"${args.rule}"\n\nConfirme explicitamente dizendo: confirmar esta regra.`, routedTo: "personal" };

    case "route_to_scheduler": {
      const result = await schedulerBridge.handleMessage(args.message);
      return {
        text: result.text || "Não recebi uma resposta do agente de agendamento.",
        routedTo: "scheduler",
        actionExecuted: result.actionExecuted,
        navigateTo: result.navigateTo,
        schedulerMessageId: result.messageId,
      };
    }

    case "route_to_technical_agent": {
      const trace = formatSchedulerTrace();
      const text = await callTechnicalAgent(scope, args.question, `DIÁLOGOS E ERROS RECENTES DO AGENTE DE AGENDAMENTO:\n${trace}`);
      return { text, routedTo: "personal" };
    }

    case "diagnose_scheduler_agent": {
      const trace = formatSchedulerTrace();
      const question = args.question || "Analise os diálogos e erros recentes do agente de agendamento e identifique a causa provável, os arquivos envolvidos, os testes necessários e uma correção segura.";
      const text = await callTechnicalAgent(scope, question, `DIÁLOGOS E ERROS RECENTES DO AGENTE DE AGENDAMENTO:\n${trace}`);
      return { text, routedTo: "personal" };
    }

    case "search_web": {
      const { text, citations } = await callResearch(args.query);
      return { text, routedTo: "personal", citations };
    }
  }
}

export async function sendPersonalMessage(text: string): Promise<PersonalAgentResponse> {
  const message = text.trim();
  const scope = currentScope();
  if (!message) throw new Error("Digite uma mensagem antes de enviar.");

  const llmResult = await callPersonalLLM(scope, message);
  const toolCall = llmResult.toolCalls?.[0];

  if (toolCall) {
    const outcome = await executeToolCall(scope, toolCall.name, toolCall.arguments);
    const user = userMessage(message, outcome.routedTo);
    const assistant = { ...assistantMessage(outcome.text, outcome.routedTo), citations: outcome.citations };
    saveExchange(scope, user, assistant);
    return {
      text: outcome.text,
      messageId: outcome.schedulerMessageId || assistant.id,
      routedTo: outcome.routedTo,
      actionExecuted: outcome.actionExecuted,
      navigateTo: outcome.navigateTo,
      userMessage: message,
      citations: outcome.citations,
    };
  }

  const responseText = llmResult.content || "Não consegui gerar uma resposta.";
  const user = userMessage(message, "personal");
  const assistant = assistantMessage(responseText, "personal");
  saveExchange(scope, user, assistant);
  return { text: responseText, messageId: assistant.id, routedTo: "personal", userMessage: message };
}

export function ratePersonalResponse(userMessage: string, assistantResponse: string, rating: "good" | "bad"): void {
  addFeedback(currentScope(), userMessage, assistantResponse, rating);
}

export function savePersonalSummary(summary: string): void {
  appendSummary(currentScope(), summary);
}
