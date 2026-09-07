const DEFAULT_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

function readBody(req) {
  if (!req.body) return {};
  return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.PERSONAL_LLM_API_KEY;
  const endpoint = process.env.PERSONAL_LLM_API_URL || DEFAULT_ENDPOINT;
  if (!token) {
    return res.status(500).json({ error: "PERSONAL_LLM_API_KEY não configurada no ambiente do servidor." });
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

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        model: process.env.PERSONAL_LLM_MODEL || body.model || DEFAULT_MODEL,
        messages: body.messages,
        temperature: typeof body.temperature === "number" ? body.temperature : 0.35,
        max_tokens: Math.min(Math.max(Number(body.max_tokens) || 1400, 1), 4000),
      }),
    });
    const text = await upstream.text();
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    res.status(upstream.status);
    try {
      return res.send(text);
    } catch {
      return res.json({ error: text.slice(0, 500) });
    }
  } catch (error) {
    return res.status(502).json({
      error: "Falha ao chamar o provedor do agente pessoal.",
      details: String(error?.message || error).slice(0, 300),
    });
  }
}
