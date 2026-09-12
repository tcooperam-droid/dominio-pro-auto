import { createAuthenticatedAgentHeaders, getAgentEndpoint } from "@/features/assistente/llmEndpoint";
import { getSession } from "@/lib/access";
import { supabase } from "@/lib/supabase";
import { buildAppContext } from "./appContext";
import { addFeedback, addGoal, addInstruction, appendSummary, completeGoal, loadConversation, loadMemory, rememberFact, saveConversation } from "./memory";
import { buildConversationContext, buildPersonalSystemPrompt, extractFactCommand, extractGoalCommand, extractTeachingInstruction, isLikelyWebResearchRequest, isSchedulerRequest, isTechnicalRequest } from "./prompt";
import { createSchedulerBridge } from "./bridge";
import {
  PERSONAL_AGENT_MODEL,
  PERSONAL_AGENT_SCOPE,
  type PersonalAgentConfig,
  type PersonalAgentResponse,
  type PersonalMessage,
  type WebCitation,
} from "./types";

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

async function postAuthenticated(endpoint: string, body: Record<string, unknown>, apiToken?: string): Promise<Response> {
  const firstHeaders = await createAuthenticatedAgentHeaders(endpoint, apiToken);
  let response = await fetch(endpoint, { method: "POST", headers: firstHeaders, body: JSON.stringify(body) });
  if (response.status === 401) {
    const refreshed = await supabase.auth.refreshSession();
    if (!refreshed.error && refreshed.data.session) {
      const headers = await createAuthenticatedAgentHeaders(endpoint, apiToken);
      response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
    }
  }
  return response;
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

async function callPersonalLLM(scope: string, message: string): Promise<{ text: string; citations?: WebCitation[] }> {
  if (!config) return { text: "O agente pessoal ainda não foi configurado." };
  const endpoint = getAgentEndpoint(config.apiEndpoint);
  const memory = loadMemory(scope);
  const history = loadConversation(scope).slice(-12);
  const system = buildPersonalSystemPrompt(memory, {
    salonName: config.salonName,
    userName: config.userName || getSession()?.profileName,
  }) + `\n\n${buildAppContext()}`;
  const research = isLikelyWebResearchRequest(message);
  const requestEndpoint = research
    ? (import.meta.env.PROD ? "/api/research" : "/api/research")
    : endpoint;
  const response = await postAuthenticated(requestEndpoint, {
      model: config.model || PERSONAL_AGENT_MODEL,
      messages: [
        { role: "system", content: system },
        ...history.map((item) => ({ role: item.role, content: item.content })),
        { role: "user", content: message },
      ],
      temperature: 0.35,
      max_tokens: 1400,
    }, config.apiToken);

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`;
    if (research) throw new Error(`Não consegui pesquisar na Internet: ${detail}`);
    throw new Error(`Não foi possível consultar o agente pessoal: ${detail}`);
  }
  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error(research ? "A pesquisa não retornou uma resposta válida." : "O modelo não retornou uma resposta válida.");
  return { text: text.trim(), citations: Array.isArray(payload?.citations) ? payload.citations : undefined };
}

async function callTechnicalAgent(scope: string, message: string): Promise<string> {
  const endpoint = "/api/technical-agent";
  const history = loadConversation(scope).slice(-8);
  const response = await postAuthenticated(endpoint, {
      question: message,
      appContext: buildAppContext(),
      messages: history.map((item) => ({ role: item.role, content: item.content })),
    }, config?.apiToken || "");
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`;
    throw new Error(`Não foi possível consultar o agente técnico: ${detail}`);
  }
  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("O agente técnico não retornou uma análise válida.");
  return text.trim();
}

function localCommandResponse(scope: string, message: string): string | null {
  const teaching = extractTeachingInstruction(message);
  if (teaching) {
    addInstruction(scope, teaching);
    return `Entendido. Vou usar esta instrução como contexto daqui em diante:\n“${teaching}”`;
  }

  const fact = extractFactCommand(message);
  if (fact) {
    rememberFact(scope, fact.key, fact.value);
    return `Anotado: ${fact.key} = ${fact.value}.`;
  }

  const goal = extractGoalCommand(message);
  if (goal?.action === "add") {
    const created = addGoal(scope, goal.title);
    return created ? `Objetivo registrado: ${created.title}.` : "Não consegui registrar esse objetivo.";
  }
  if (goal?.action === "complete") {
    const completed = completeGoal(scope, goal.title);
    return completed ? `Objetivo concluído: ${completed.title}.` : `Não encontrei um objetivo ativo correspondente a “${goal.title}”.`;
  }
  return null;
}

export async function sendPersonalMessage(text: string): Promise<PersonalAgentResponse> {
  const message = text.trim();
  const scope = currentScope();
  if (!message) throw new Error("Digite uma mensagem antes de enviar.");

  if (isTechnicalRequest(message)) {
    const responseText = await callTechnicalAgent(scope, message);
    const user = userMessage(message, "personal");
    const assistant = assistantMessage(responseText, "personal");
    saveExchange(scope, user, assistant);
    return { text: responseText, messageId: assistant.id, routedTo: "personal", userMessage: message };
  }

  if (isSchedulerRequest(message)) {
    const result = await schedulerBridge.handleMessage(message);
    const responseText = result.text || "Não recebi uma resposta do agente de agendamento.";
    const user = userMessage(message, "scheduler");
    const assistant = assistantMessage(responseText, "scheduler");
    saveExchange(scope, user, assistant);
    return {
      text: responseText,
      messageId: result.messageId || assistant.id,
      routedTo: "scheduler",
      actionExecuted: result.actionExecuted,
      navigateTo: result.navigateTo,
      userMessage: message,
    };
  }

  const localResponse = localCommandResponse(scope, message);
  const llmResponse = localResponse ? { text: localResponse } : await callPersonalLLM(scope, message);
  const responseText = llmResponse.text;
  const user = userMessage(message, "personal");
  const assistant = { ...assistantMessage(responseText, "personal"), citations: llmResponse.citations };
  saveExchange(scope, user, assistant);
  return { text: responseText, messageId: assistant.id, routedTo: "personal", userMessage: message, citations: llmResponse.citations };
}

export function ratePersonalResponse(userMessage: string, assistantResponse: string, rating: "good" | "bad"): void {
  addFeedback(currentScope(), userMessage, assistantResponse, rating);
}

export function savePersonalSummary(summary: string): void {
  appendSummary(currentScope(), summary);
}
