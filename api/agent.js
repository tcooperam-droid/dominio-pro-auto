const GITHUB_MODELS_ENDPOINT = "https://models.github.ai/inference/chat/completions";

function readBody(req) {
  if (!req.body) return {};
  return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // `NEXT_PUBLIC_GITHUB_TOKEN` é mantido apenas como fallback de migração
  // para o projeto Vercel legado; o frontend nunca lê essa variável.
  const token =
    process.env.GITHUB_MODELS_TOKEN ||
    process.env.GITHUB_TOKEN ||
    process.env.NEXT_PUBLIC_GITHUB_TOKEN;
  if (!token) {
    return res.status(500).json({
      error: "GITHUB_MODELS_TOKEN não configurado no ambiente do servidor.",
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
    model: typeof body.model === "string" ? body.model : "openai/gpt-4o-mini",
    messages: body.messages,
    temperature: typeof body.temperature === "number" ? body.temperature : 0.2,
    max_tokens: Math.min(Math.max(Number(body.max_tokens) || 1200, 1), 4000),
  };

  try {
    const upstream = await fetch(GITHUB_MODELS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    res.setHeader("Cache-Control", "no-store");
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");

    try {
      return res.send(text);
    } catch {
      return res.json({ error: text.slice(0, 500) });
    }
  } catch (error) {
    return res.status(502).json({
      error: "Falha ao chamar o GitHub Models.",
      details: String(error?.message || error).slice(0, 300),
    });
  }
}
