export type PersonalMessageRole = "user" | "assistant";

export interface PersonalMessage {
  id: string;
  role: PersonalMessageRole;
  content: string;
  createdAt: string;
  feedback?: "good" | "bad";
  routedTo?: "personal" | "scheduler";
}

export interface PersonalFeedback {
  id: string;
  userMessage: string;
  assistantResponse: string;
  rating: "good" | "bad";
  createdAt: string;
}

export interface PersonalGoal {
  id: string;
  title: string;
  status: "active" | "completed";
  createdAt: string;
  completedAt?: string;
}

export interface PersonalMemory {
  profileScope: string;
  facts: Record<string, string>;
  instructions: string[];
  goals: PersonalGoal[];
  feedback: PersonalFeedback[];
  summaries: string[];
  updatedAt: string;
}

export interface PersonalAgentConfig {
  apiToken: string;
  model?: string;
  salonName?: string;
  userName?: string;
  apiEndpoint?: string;
}

export interface PersonalAgentResponse {
  text: string;
  messageId: string;
  routedTo: "personal" | "scheduler";
  actionExecuted?: boolean;
  navigateTo?: string;
  userMessage: string;
}

export interface SchedulerBridge {
  handleMessage(message: string): Promise<{
    text: string;
    actionExecuted?: boolean;
    navigateTo?: string;
    messageId?: string;
    userMessage?: string;
  }>;
}

export const PERSONAL_AGENT_MODEL = "openai/gpt-4o-mini";
export const PERSONAL_AGENT_SCOPE = "personal-agent";
export const PERSONAL_AGENT_MAX_HISTORY = 24;

export function createEmptyMemory(profileScope: string): PersonalMemory {
  return {
    profileScope,
    facts: {},
    instructions: [],
    goals: [],
    feedback: [],
    summaries: [],
    updatedAt: new Date().toISOString(),
  };
}
