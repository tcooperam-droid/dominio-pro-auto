import { supabase } from "../../lib/supabase";

export const DIRECT_LLM_ENDPOINT =
  (import.meta.env.VITE_LLM_API_URL as string | undefined) ||
  "https://api.openai.com/v1/chat/completions";

/**
 * Em produção, usa o proxy serverless para manter o token fora do bundle.
 * Em desenvolvimento, usa o endpoint OpenAI-compatible configurado no .env.
 */
export function getAgentEndpoint(configuredEndpoint?: string): string {
  return (
    configuredEndpoint ||
    (import.meta.env.VITE_AGENT_API_URL as string | undefined) ||
    (import.meta.env.PROD ? "/api/agent" : DIRECT_LLM_ENDPOINT)
  );
}

export function createAgentHeaders(endpoint: string, token?: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (endpoint === DIRECT_LLM_ENDPOINT && token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function createAuthenticatedAgentHeaders(endpoint: string, token?: string): Promise<Record<string, string>> {
  const headers = createAgentHeaders(endpoint, token);
  if (usesServerAgentEndpoint(endpoint)) {
    let { data } = await supabase.auth.getSession();
    const expiresAt = data.session?.expires_at ?? 0;
    if (!data.session?.access_token || (expiresAt > 0 && expiresAt * 1000 < Date.now() + 60_000)) {
      const refreshed = await supabase.auth.refreshSession();
      if (!refreshed.error && refreshed.data.session) data = refreshed.data;
    }
    if (!data.session?.access_token) throw new Error("Sessão autenticada obrigatória. Faça login novamente.");
    headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  return headers;
}

export function usesServerAgentEndpoint(endpoint?: string): boolean {
  return getAgentEndpoint(endpoint) !== DIRECT_LLM_ENDPOINT;
}
