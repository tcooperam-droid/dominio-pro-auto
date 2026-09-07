const DEFAULT_LLM_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-5-mini";

function readBody(req) {
  if (!req.body) return {};
  return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  const endpoint = process.env.LLM_API_URL || process.env.OPENAI_API_URL || DEFAULT_LLM_ENDPOINT;
  if (!token) {
    return res.status(500).json({
      error: "LLM_API_KEY ou OPENAI_API_KEY não configurada no ambiente do servidor.",
    });
  }

  let body;
  try {
    body = readBody(req);
  } catch {
    return res.status(400).json({ error: "Body inválido (JSON esperado)." });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ error: "messages deve ser uma lista não vazia." });
  }

  const payload = {
    model: typeof body.model === "string" ? body.model : DEFAULT_MODEL,
    messages: body.messages,
    temperature: typeof body.temperature === "number" ? body.temperature : 0.2,
    max_tokens: Math.min(Math.max(Number(body.max_tokens) || 1200, 1), 4000),
  };

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");

    if (upstream.status === 410) {
      return res.status(502).json({
        error: "O provedor de IA configurado foi descontinuado (HTTP 410). Atualize LLM_API_URL/LLM_API_KEY e publique novamente.",
        code: "provider_retired",
      });
    }

    res.status(upstream.status);
    try {
      return res.send(text);
    } catch {
      return res.json({ error: text.slice(0, 500) });
    }
  } catch (error) {
    return res.status(502).json({
      error: "Falha ao chamar o provedor de IA.",
      details: String(error?.message || error).slice(0, 300),
    });
  }
}
