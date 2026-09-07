import {
  createEmptyMemory,
  PERSONAL_AGENT_MAX_HISTORY,
  type PersonalFeedback,
  type PersonalGoal,
  type PersonalMemory,
} from "./types";

const MEMORY_KEY = "personal_agent_memory_v1";
const MESSAGES_KEY = "personal_agent_messages_v1";
const MAX_FACTS = 40;
const MAX_INSTRUCTIONS = 30;
const MAX_GOALS = 30;
const MAX_FEEDBACK = 40;
const MAX_SUMMARIES = 12;
const MAX_TEXT = 500;

function storageAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function safeScope(scope: string): string {
  return scope.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 80) || "default";
}

function scopedKey(base: string, scope: string): string {
  return `${base}:${safeScope(scope)}`;
}

function now(): string {
  return new Date().toISOString();
}

function clip(value: string, limit = MAX_TEXT): string {
  return value.trim().slice(0, limit);
}

function readJson<T>(key: string, fallback: T): T {
  if (!storageAvailable()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (!storageAvailable()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A memória é um aprimoramento; a conversa continua funcionando sem storage.
  }
}

function normalizeMemory(value: Partial<PersonalMemory>, profileScope: string): PersonalMemory {
  const base = createEmptyMemory(profileScope);
  const facts = value.facts && typeof value.facts === "object" ? value.facts : {};
  const goals = Array.isArray(value.goals) ? value.goals : [];
  const feedback = Array.isArray(value.feedback) ? value.feedback : [];
  const instructions = Array.isArray(value.instructions) ? value.instructions : [];
  const summaries = Array.isArray(value.summaries) ? value.summaries : [];

  return {
    profileScope,
    facts: Object.fromEntries(
      Object.entries(facts)
        .filter(([key, item]) => typeof key === "string" && typeof item === "string")
        .slice(-MAX_FACTS)
        .map(([key, item]) => [clip(key, 100), clip(item)]),
    ),
    instructions: instructions.filter((item): item is string => typeof item === "string").map(clip).filter(Boolean).slice(-MAX_INSTRUCTIONS),
    goals: goals
      .filter((item): item is PersonalGoal => Boolean(item && typeof item.title === "string"))
      .map((item) => ({
        id: String(item.id || `goal_${Date.now()}`),
        title: clip(item.title),
        status: (item.status === "completed" ? "completed" : "active") as PersonalGoal["status"],
        createdAt: item.createdAt || now(),
        completedAt: item.completedAt,
      }))
      .slice(-MAX_GOALS),
    feedback: feedback
      .filter((item): item is PersonalFeedback => Boolean(item && typeof item.userMessage === "string" && typeof item.assistantResponse === "string"))
      .map((item) => ({
        id: String(item.id || `feedback_${Date.now()}`),
        userMessage: clip(item.userMessage),
        assistantResponse: clip(item.assistantResponse),
        rating: (item.rating === "good" ? "good" : "bad") as PersonalFeedback["rating"],
        createdAt: item.createdAt || now(),
      }))
      .slice(-MAX_FEEDBACK),
    summaries: summaries.filter((item): item is string => typeof item === "string").map(clip).filter(Boolean).slice(-MAX_SUMMARIES),
    updatedAt: value.updatedAt || base.updatedAt,
  };
}

export function loadMemory(profileScope: string): PersonalMemory {
  return normalizeMemory(readJson<Partial<PersonalMemory>>(scopedKey(MEMORY_KEY, profileScope), {}), profileScope);
}

export function saveMemory(memory: PersonalMemory): void {
  writeJson(scopedKey(MEMORY_KEY, memory.profileScope), normalizeMemory(memory, memory.profileScope));
}

function updateMemory(profileScope: string, updater: (memory: PersonalMemory) => void): PersonalMemory {
  const memory = loadMemory(profileScope);
  updater(memory);
  memory.updatedAt = now();
  saveMemory(memory);
  return memory;
}

export function rememberFact(profileScope: string, key: string, value: string): PersonalMemory {
  const factKey = clip(key, 100);
  const factValue = clip(value);
  return updateMemory(profileScope, (memory) => {
    if (factKey && factValue) memory.facts[factKey] = factValue;
  });
}

export function addInstruction(profileScope: string, instruction: string): PersonalMemory {
  return updateMemory(profileScope, (memory) => {
    const normalized = clip(instruction);
    if (normalized && !memory.instructions.includes(normalized)) memory.instructions.push(normalized);
    memory.instructions = memory.instructions.slice(-MAX_INSTRUCTIONS);
  });
}

export function addGoal(profileScope: string, title: string): PersonalGoal | null {
  const normalized = clip(title);
  if (!normalized) return null;
  const goal: PersonalGoal = {
    id: `goal_${Date.now()}`,
    title: normalized,
    status: "active",
    createdAt: now(),
  };
  updateMemory(profileScope, (memory) => {
    memory.goals.push(goal);
    memory.goals = memory.goals.slice(-MAX_GOALS);
  });
  return goal;
}

export function completeGoal(profileScope: string, query: string): PersonalGoal | null {
  const normalized = query.trim().toLowerCase();
  let completed: PersonalGoal | null = null;
  updateMemory(profileScope, (memory) => {
    const target = memory.goals.find((goal) => goal.status === "active" && goal.title.toLowerCase().includes(normalized));
    if (!target) return;
    target.status = "completed";
    target.completedAt = now();
    completed = target;
  });
  return completed;
}

export function addFeedback(
  profileScope: string,
  userMessage: string,
  assistantResponse: string,
  rating: "good" | "bad",
): void {
  updateMemory(profileScope, (memory) => {
    memory.feedback.push({
      id: `feedback_${Date.now()}`,
      userMessage: clip(userMessage),
      assistantResponse: clip(assistantResponse),
      rating,
      createdAt: now(),
    });
    memory.feedback = memory.feedback.slice(-MAX_FEEDBACK);
  });
}

export function appendSummary(profileScope: string, summary: string): void {
  updateMemory(profileScope, (memory) => {
    const normalized = clip(summary);
    if (normalized) memory.summaries.push(normalized);
    memory.summaries = memory.summaries.slice(-MAX_SUMMARIES);
  });
}

export function loadConversation(profileScope: string) {
  const stored = readJson<unknown>(scopedKey(MESSAGES_KEY, profileScope), []);
  if (!Array.isArray(stored)) return [];
  return stored.slice(-PERSONAL_AGENT_MAX_HISTORY) as import("./types").PersonalMessage[];
}

export function saveConversation(profileScope: string, messages: import("./types").PersonalMessage[]): void {
  writeJson(scopedKey(MESSAGES_KEY, profileScope), messages.slice(-PERSONAL_AGENT_MAX_HISTORY));
}

export function clearPersonalData(profileScope: string): void {
  if (!storageAvailable()) return;
  window.localStorage.removeItem(scopedKey(MEMORY_KEY, profileScope));
  window.localStorage.removeItem(scopedKey(MESSAGES_KEY, profileScope));
}

export function buildMemoryContext(memory: PersonalMemory): string {
  const sections: string[] = [];
  const facts = Object.entries(memory.facts);
  const activeGoals = memory.goals.filter((goal) => goal.status === "active");
  const badFeedback = memory.feedback.filter((item) => item.rating === "bad").slice(-5);

  if (facts.length) sections.push(`FATOS CONFIRMADOS PELO USUÁRIO:\n${facts.map(([key, value]) => `- ${key}: ${value}`).join("\n")}`);
  if (memory.instructions.length) sections.push(`INSTRUÇÕES ENSINADAS PELO USUÁRIO:\n${memory.instructions.map((item) => `- ${item}`).join("\n")}`);
  if (activeGoals.length) sections.push(`OBJETIVOS ATIVOS:\n${activeGoals.map((goal) => `- ${goal.title}`).join("\n")}`);
  if (memory.summaries.length) sections.push(`RESUMOS DE CONTEXTO:\n${memory.summaries.slice(-3).map((item) => `- ${item}`).join("\n")}`);
  if (badFeedback.length) {
    sections.push(`APRENDIZADOS DE FEEDBACK NEGATIVO (evite repetir):\n${badFeedback.map((item) => `- Pedido: ${item.userMessage}\n  Resposta mal avaliada: ${item.assistantResponse}`).join("\n")}`);
  }

  return sections.length ? `\n=== MEMÓRIA DO AGENTE PESSOAL ===\n${sections.join("\n\n")}\n=== FIM DA MEMÓRIA ===` : "";
}

export function exportPersonalData(profileScope: string): string {
  return JSON.stringify({ memory: loadMemory(profileScope), messages: loadConversation(profileScope) }, null, 2);
}
