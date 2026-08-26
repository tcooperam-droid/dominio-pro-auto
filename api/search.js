// Vercel Serverless Function — pesquisa na internet via Tavily API
// Tavily é uma API de busca feita para agentes IA, com cota grátis de 1000/mês.
// Configure a chave na Vercel: Settings → Environment Variables → TAVILY_API_KEY

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "TAVILY_API_KEY não configurada na Vercel.",
    });
  }

  let query, limit;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    query = body.query;
    limit = body.limit;
  } catch {
    return res.status(400).json({ error: "Body inválido (JSON esperado)." });
  }

  if (typeof query !== "string" || !query.trim()) {
    return res.status(400).json({ error: "query required" });
  }

  const max = Math.min(Math.max(parseInt(limit || "5", 10), 1), 10);

  try {
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: query.trim(),
        max_results: max,
        search_depth: "basic",
        include_answer: true,
        include_raw_content: false,
        include_images: false,
      }),
    });

    if (!r.ok) {
      const txt = await r.text();
      return res.status(502).json({
        error: `Tavily HTTP ${r.status}`,
        details: txt.slice(0, 300),
      });
    }

    const data = await r.json();
    const results = (data.results || []).map((it) => ({
      title: it.title || "",
      url: it.url || "",
      snippet: it.content || "",
    }));

    return res.status(200).json({
      query,
      answer: data.answer || null,
      results,
      source: "tavily",
    });
  } catch (err) {
    return res.status(502).json({
      error: "Falha ao chamar Tavily.",
      details: String(err?.message || err).slice(0, 300),
    });
  }
}
