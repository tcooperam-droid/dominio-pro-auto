import { requireAuthorizedUser } from "./_auth.js";

const DEFAULT_LLM_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-20b";

function readBody(req) {
  if (!req.body) return {};
  return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
}

function providerConfig(prefix = "") {
  if (prefix === "PERSONAL_") {
    return {
      token: process.env.PERSONAL_LLM_API_KEY,
      endpoint: process.env.PERSONAL_LLM_API_URL || DEFAULT_LLM_ENDPOINT,
      model: process.env.PERSONAL_LLM_MODEL || DEFAULT_MODEL,
    };
  }
  return {
    token: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY,
    endpoint: process.env.LLM_API_URL || process.env.OPENAI_API_URL || DEFAULT_LLM_ENDPOINT,
    model: process.env.LLM_MODEL || DEFAULT_MODEL,
  };
}

async function callProvider(provider, payload) {
  const upstream = await fetch(provider.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.token}`,
    },
    body: JSON.stringify({ ...payload, model: provider.model }),
  });
  return { upstream, text: await upstream.text() };
}

function compactPayload(payload) {
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  return {
    ...payload,
    messages: messages.slice(-5).map((message) => ({
      role: message.role,
      content: String(message.content || "").slice(-5000),
    })),
    max_tokens: Math.min(Number(payload.max_tokens) || 1200, 1800),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!await requireAuthorizedUser(req, res)) return;

  let body;
  try {
    body = readBody(req);
  } catch {
    return res.status(400).json({ error: "Body inválido (JSON esperado)." });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ error: "messages deve ser uma lista não vazia." });
  }

  const primary = providerConfig();
  if (!primary.token) {
    return res.status(500).json({
      error: "LLM_API_KEY ou OPENAI_API_KEY não configurada no ambiente do servidor.",
    });
  }

  const payload = {
    messages: body.messages,
    temperature: typeof body.temperature === "number" ? body.temperature : 0.2,
    max_tokens: Math.min(Math.max(Number(body.max_tokens) || 1200, 1), 4000),
  };

  try {
    let result = await callProvider(primary, payload);
    let usedFallback = false;

    // O agente de agenda usa um provedor separado, mas pode continuar operando
    // com o provedor pessoal quando o primeiro estiver temporariamente indisponível.
    if ((result.upstream.status === 413 || result.upstream.status === 502 || result.upstream.status === 503) && process.env.PERSONAL_LLM_API_KEY) {
      result = await callProvider(providerConfig("PERSONAL_"), payload);
      usedFallback = true;
    }

    // Alguns provedores rejeitam contextos grandes com HTTP 413. Tente uma
    // segunda vez com apenas as mensagens recentes, preservando o pedido atual.
    if (result.upstream.status === 413) {
      result = await callProvider(providerConfig(usedFallback ? "PERSONAL_" : ""), compactPayload(payload));
      usedFallback = true;
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    if (usedFallback) res.setHeader("X-Agent-Provider", "personal-fallback");

    if (result.upstream.status === 410) {
      return res.status(502).json({
        error: "O provedor de IA configurado foi descontinuado (HTTP 410). Atualize as variáveis do agente e publique novamente.",
        code: "provider_retired",
      });
    }

    if (result.upstream.status === 413) {
      return res.status(413).json({
        error: "O contexto da conversa ficou grande demais para o provedor. O histórico foi reduzido; tente o agendamento novamente.",
        code: "context_too_large",
      });
    }

    res.status(result.upstream.status);
    try {
      return res.send(result.text);
    } catch {
      return res.json({ error: result.text.slice(0, 500) });
    }
  } catch (error) {
    return res.status(502).json({
      error: "Falha ao chamar o provedor de IA.",
      details: String(error?.message || error).slice(0, 300),
    });
  }
}
