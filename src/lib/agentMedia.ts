/**
 * agentMedia.ts — Capacidades multimídia do Agente (versão GitHub Models + Vercel API).
 *
 *   - describeImage  : visão por imagem via GitHub Models (gpt-4o-mini)
 *   - searchWeb      : pesquisa via /api/search (Vercel serverless function)
 *   - transcribeAudio: voz → texto via Web Speech API do navegador
 *   - speakWithOpenAI: texto → voz via Web Speech API do navegador
 *
 * Produção: usa /api/agent com token server-side. Desenvolvimento: aceita VITE_GITHUB_TOKEN ou token local.
 */

import { createAgentHeaders, DIRECT_LLM_ENDPOINT, getAgentEndpoint } from "../features/assistente/llmEndpoint";

function getToken(): string {
  // 1. Build-time env var (Vercel / local .env)
  const envToken = import.meta.env.VITE_GITHUB_TOKEN as string | undefined;
  if (envToken) return envToken;

  // 2. Runtime fallback: user-configured token stored in localStorage
  try {
    const saved = localStorage.getItem("salon_config");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.githubToken) return parsed.githubToken as string;
    }
  } catch {}

  throw new Error(
    "GitHub token não configurado. Acesse Configurações → Agente IA e insira seu token.",
  );
}

function getLlmRequest(): { endpoint: string; headers: Record<string, string> } {
  const endpoint = getAgentEndpoint();
  const token = endpoint === DIRECT_LLM_ENDPOINT ? getToken() : undefined;
  return { endpoint, headers: createAgentHeaders(endpoint, token) };
}

// ─── Vision ────────────────────────────────────────────────

export async function describeImage(
  imageDataUrl: string,
  prompt?: string,
): Promise<string> {
  const userPrompt =
    prompt?.trim() ||
    "Analise esta imagem e descreva o que vê em português brasileiro. Se for um comprovante, recibo, agenda ou documento, extraia as informações relevantes.";

  const { endpoint, headers } = getLlmRequest();
  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      max_tokens: 1024,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "Você é um assistente que analisa imagens enviadas em um sistema de gestão de salão de beleza. Responda em português brasileiro, de forma objetiva.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Falha ao analisar imagem: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "Não consegui analisar a imagem.";
}

// ─── Web Search (via /api/search serverless da Vercel) ─────

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

export async function searchWeb(query: string, limit = 5): Promise<WebResult[]> {
  const q = query.trim();
  if (!q) return [];

  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: q, limit }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Falha na pesquisa: ${res.status} ${err}`);
  }

  const data = await res.json();
  return Array.isArray(data?.results) ? (data.results as WebResult[]) : [];
}

export async function searchAndSummarize(query: string): Promise<string> {
  const q = query.trim();
  if (!q) return "Digite o que pesquisar.";

  let results: WebResult[];
  try {
    results = await searchWeb(q, 5);
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    return `🌐 Não consegui pesquisar: ${m}`;
  }

  if (results.length === 0) {
    return `🌐 Nenhum resultado encontrado para "${q}".`;
  }

  // Monta contexto e pede resumo ao LLM
  const context = results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`)
    .join("\n\n");

  try {
    const { endpoint, headers } = getLlmRequest();
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        max_tokens: 600,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "Você resume resultados de busca da web em português brasileiro. Seja claro, objetivo e cite as fontes usando [1], [2] etc. Termine listando as fontes.",
          },
          {
            role: "user",
            content: `Pergunta: ${q}\n\nResultados:\n\n${context}\n\nResponda à pergunta usando os resultados acima e cite as fontes.`,
          },
        ],
      }),
    });

    if (!res.ok) {
      // fallback: lista os resultados crus
      const list = results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
        .join("\n\n");
      return `🌐 Resultados para "${q}":\n\n${list}`;
    }

    const data = await res.json();
    const summary = data?.choices?.[0]?.message?.content ?? "";
    const sources = results.map((r, i) => `[${i + 1}] ${r.url}`).join("\n");
    return `${summary}\n\n📎 Fontes:\n${sources}`;
  } catch {
    const list = results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
      .join("\n\n");
    return `🌐 Resultados para "${q}":\n\n${list}`;
  }
}

// ─── STT (voz → texto via Web Speech API) ──────────────────

export async function transcribeAudio(_blob: Blob): Promise<string> {
  // Em modo standalone usamos a Web Speech API ao vivo (em AgentChat).
  // Esta função é um placeholder mantido para compatibilidade.
  throw new Error(
    "Transcrição de áudio gravado não está disponível. Use ditado nativo do teclado do celular.",
  );
}

// ─── TTS (texto → voz via Web Speech API) ──────────────────

let currentAudio: HTMLAudioElement | null = null;

export async function speakWithOpenAI(
  text: string,
  _voice = "nova",
  onEnd?: () => void,
): Promise<void> {
  const clean = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\[[0-9]+\]/g, "")
    .replace(/📎[\s\S]*$/, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\n+/g, ". ")
    .trim();
  if (!clean) {
    onEnd?.();
    return;
  }
  stopSpeaking();
  speakBrowser(clean, onEnd);
}

function speakBrowser(text: string, onEnd?: () => void): void {
  if (!("speechSynthesis" in window)) {
    onEnd?.();
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = "pt-BR";
    utt.rate = 1.05;
    utt.pitch = 1.05;
    const voices = window.speechSynthesis.getVoices();
    const ptVoices = voices.filter((v) => v.lang.startsWith("pt"));
    const fem =
      ptVoices.find((v) =>
        /female|feminina|francisca|vitoria|vitória|luciana|renata|google/i.test(v.name),
      ) ?? ptVoices[0];
    if (fem) utt.voice = fem;
    if (onEnd) utt.onend = onEnd;
    window.speechSynthesis.speak(utt);
  } catch {
    onEnd?.();
  }
}

export function stopSpeaking(): void {
  if (currentAudio) {
    try {
      currentAudio.pause();
    } catch {}
    currentAudio = null;
  }
  try {
    window.speechSynthesis?.cancel();
  } catch {}
}

// ─── Helpers ──────────────────────────────────────────────

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
