import type { VercelRequest, VercelResponse } from "@vercel/node";

const GITHUB_MODELS_URL =
  "https://models.github.ai/inference/chat/completions";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  // Only allow POST
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Resolve token: header from client → env var fallback
  const token =
    (req.headers["x-github-token"] as string | undefined) ||
    process.env.NEXT_PUBLIC_GITHUB_TOKEN ||
    process.env.GITHUB_TOKEN ||
    "";

  if (!token) {
    return res.status(401).json({
      error:
        "Token não configurado. Defina NEXT_PUBLIC_GITHUB_TOKEN nas variáveis de ambiente do Vercel ou envie x-github-token no header.",
    });
  }

  try {
    const upstream = await fetch(GITHUB_MODELS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.json();

    // Forward status and relevant headers
    res.status(upstream.status);
    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("Content-Type", ct);

    return res.json(data);
  } catch (err) {
    console.error("[api/llm] proxy error:", err);
    return res.status(502).json({
      error: "Falha ao conectar com GitHub Models API.",
    });
  }
}
