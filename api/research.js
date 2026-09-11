import { requireAuthorizedUser } from "./_auth.js";

const DEFAULT_MODEL = "gemini-3.8-flash";

function readBody(req) {
  if (!req.body) return {};
  return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
}

function messageToText(message) {
  const role = message.role === "system" ? "Instruções do sistema" : message.role === "assistant" ? "Assistente" : "Usuário";
  return `${role}: ${typeof message.content === "string" ? message.content : ""}`;
}

function extractOutput(interaction) {
  const textParts = [];
  const citations = [];
  for (const step of interaction?.steps || []) {
    if (step?.type !== "model_output") continue;
    for (const block of step.content || []) {
      if (block?.type !== "text" || typeof block.text !== "string") continue;
      textParts.push(block.text);
      for (const annotation of block.annotations || []) {
        if (annotation?.type === "url_citation" && annotation.url) {
          citations.push({ title: annotation.title || annotation.url, url: annotation.url, startIndex: annotation.start_index, endIndex: annotation.end_index });
        }
      }
    }
  }
  return {
    text: textParts.join("\n").trim() || interaction?.output_text || "",
    citations: citations.filter((citation, index, list) => list.findIndex((item) => item.url === citation.url) === index),
  };
}

async function searchWithTavily(messages, apiKey) {
  const userMessage = [...messages].reverse().find((message) => message.role === "user");
  const query = typeof userMessage?.content === "string" ? userMessage.content.trim() : "";
  if (!query || !apiKey) return null;
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, max_results: 5, search_depth: "basic", include_answer: true }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  const results = Array.isArray(data.results) ? data.results : [];
  const text = data.answer || results.map((item, index) => `${index + 1}. ${item.title}\n${item.content}\n${item.url}`).join("\n\n");
  return {
    model: "tavily-search",
    choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }],
    citations: results.filter((item) => item.url).map((item) => ({ title: item.title || item.url, url: item.url })),
    grounded: true,
  };
}

async function searchWithBingRss(messages) {
  const userMessage = [...messages].reverse().find((message) => message.role === "user");
  const query = typeof userMessage?.content === "string" ? userMessage.content.trim() : "";
  if (!query) return null;
  const response = await fetch(`https://www.bing.com/search?format=rss&mkt=pt-BR&q=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": "dominio-pro-research/1.0" },
  });
  if (!response.ok) return null;
  const xml = await response.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 5).map((match) => {
    const item = match[1];
    const get = (tag) => item.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1]
      ?.replace(/<!\[CDATA\[|\]\]>/g, "")?.replace(/&amp;/g, "&")?.replace(/&quot;/g, '"')?.trim();
    return { title: get("title"), url: get("link"), content: get("description") };
  }).filter((item) => item.title && item.url);
  if (!items.length) return null;
  return {
    model: "bing-rss-search",
    choices: [{ message: { role: "assistant", content: items.map((item, index) => `${index + 1}. ${item.title}\n${item.content || ""}\nFonte: ${item.url}`).join("\n\n") }, finish_reason: "stop" }],
    citations: items.map((item) => ({ title: item.title, url: item.url })),
    grounded: true,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!await requireAuthorizedUser(req, res)) return;

  const apiKey = process.env.LLM_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "LLM_API_KEY não configurada no ambiente do servidor." });

  let body;
  try { body = readBody(req); } catch { return res.status(400).json({ error: "Body inválido (JSON esperado)." }); }
  if (!Array.isArray(body.messages) || body.messages.length === 0) return res.status(400).json({ error: "messages deve ser uma lista não vazia." });

  const input = body.messages.map(messageToText).join("\n\n");
  const model = process.env.LLM_MODEL || body.model || DEFAULT_MODEL;

  try {
    let upstream;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({ model, input, tools: [{ type: "google_search" }] }),
      });
      if (upstream.status !== 429 || attempt === 2) break;
      const retryAfter = Number(upstream.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 2500) : 500 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    const raw = await upstream.text();
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");

    if (!upstream.ok) {
      if (process.env.TAVILY_API_KEY && [429, 403, 402].includes(upstream.status)) {
        const fallback = await searchWithTavily(body.messages, process.env.TAVILY_API_KEY);
        if (fallback) return res.status(200).json(fallback);
      }
      if ([429, 403, 402].includes(upstream.status)) {
        const fallback = await searchWithBingRss(body.messages);
        if (fallback) return res.status(200).json(fallback);
        return res.status(503).json({ error: "O serviço de pesquisa atingiu o limite temporário. Tente novamente em alguns instantes." });
      }
      return res.status(upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502).send(raw.slice(0, 2000));
    }

    const interaction = JSON.parse(raw);
    const output = extractOutput(interaction);
    if (!output.text) return res.status(502).json({ error: "O Gemini não retornou texto após a pesquisa." });
    return res.status(200).json({ model, choices: [{ message: { role: "assistant", content: output.text }, finish_reason: "stop" }], citations: output.citations, grounded: true });
  } catch (error) {
    return res.status(502).json({ error: "Falha ao pesquisar na Internet com o Gemini.", details: String(error?.message || error).slice(0, 300) });
  }
}

// A chave permanece apenas no ambiente server-side da Vercel e nunca é enviada pelo navegador.
