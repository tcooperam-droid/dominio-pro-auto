export const DIRECT_LLM_ENDPOINT = "https://models.github.ai/inference/chat/completions";

/**
 * Em produção, usa o proxy serverless para manter o token fora do bundle.
 * Em desenvolvimento, preserva o fallback direto para facilitar testes locais.
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

export function usesServerAgentEndpoint(endpoint?: string): boolean {
  return getAgentEndpoint(endpoint) !== DIRECT_LLM_ENDPOINT;
}
