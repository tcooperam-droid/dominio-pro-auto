import { requireAuthorizedUser } from "./_auth.js";

const REPO_API = "https://api.github.com/repos/tcooperam-droid/dominio-pro-auto";
const RAW_BASE = "https://raw.githubusercontent.com/tcooperam-droid/dominio-pro-auto/main";
const DEFAULT_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b";
const MAX_FILES = 4;
const MAX_FILE_CHARS = 7000;
const MAX_CONTEXT_CHARS = 28000;

function readBody(req) {
  if (!req.body) return {};
  return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
}

function isPrivileged(user) {
  return user?.authorized?.role === "owner" || user?.authorized?.role === "manager";
}

function scorePath(path, question) {
  const value = `${path} ${question}`.toLowerCase();
  let score = 0;
  for (const [term, weight] of [
    ["agent", 8], ["agente", 8], ["agenda", 8], ["appointment", 7], ["personal", 7],
    ["api/", 6], ["auth", 5], ["store", 5], ["supabase", 5], ["error", 4],
    ["config", 3], ["page", 2], ["test", 1],
  ]) if (value.includes(term)) score += weight;
  if (/\.(tsx?|jsx?|js)$/.test(path)) score += 2;
  if (/node_modules|dist|\.map$/.test(path)) score = -100;
  return score;
}

async function readRepository(question) {
  const treeResponse = await fetch(`${REPO_API}/git/trees/main?recursive=1`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "dominio-pro-technical-agent" },
  });
  if (!treeResponse.ok) throw new Error(`GitHub tree HTTP ${treeResponse.status}`);
  const tree = await treeResponse.json();
  const paths = (tree.tree || [])
    .filter((item) => item.type === "blob")
    .map((item) => item.path)
    .filter((path) => /^(src|api|public)\//.test(path))
    .sort((a, b) => scorePath(b, question) - scorePath(a, question))
    .slice(0, MAX_FILES);
  const files = await Promise.all(paths.map(async (path) => {
    const response = await fetch(`${RAW_BASE}/${path}`, { headers: { "User-Agent": "dominio-pro-technical-agent" } });
    if (!response.ok) return `===== ${path} =====\nNão foi possível ler este arquivo (HTTP ${response.status}).`;
    const text = (await response.text()).slice(0, MAX_FILE_CHARS);
    return `===== ${path} =====\n${text}`;
  }));
  return files.join("\n\n").slice(0, MAX_CONTEXT_CHARS);
}

function provider() {
  return {
    token: process.env.TECHNICAL_LLM_API_KEY || process.env.PERSONAL_LLM_API_KEY,
    endpoint: process.env.TECHNICAL_LLM_API_URL || process.env.PERSONAL_LLM_API_URL || DEFAULT_ENDPOINT,
    model: process.env.TECHNICAL_LLM_MODEL || process.env.PERSONAL_LLM_MODEL || DEFAULT_MODEL,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const user = await requireAuthorizedUser(req, res);
  if (!user || !isPrivileged(user)) {
    if (user) res.status(403).json({ error: "O agente técnico exige perfil de proprietário ou gerente." });
    return;
  }

  let body;
  try { body = readBody(req); } catch { return res.status(400).json({ error: "Body inválido (JSON esperado)." }); }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return res.status(400).json({ error: "Informe a pergunta técnica." });

  const config = provider();
  if (!config.token) return res.status(500).json({ error: "Nenhuma credencial do agente técnico está configurada no servidor." });

  try {
    const repository = await readRepository(question);
    const system = [
      "Você é o agente técnico do Domínio Pro.",
      "Sua função é diagnosticar o aplicativo ponta a ponta, analisar código, identificar bugs, sugerir correções, propor testes e revisar segurança.",
      "Você tem acesso somente leitura ao contexto do aplicativo e a um recorte dos arquivos do repositório. Não diga que alterou código, banco ou deployment.",
      "Separe fatos observados, hipótese, causa provável, correção recomendada, riscos e testes. Quando faltar evidência, peça o log ou arquivo específico.",
      "Não revele tokens, chaves, sessões ou dados pessoais desnecessários. Nunca recomende remover autenticação, RLS ou confirmação transacional.",
      `Contexto atual do aplicativo:\n${String(body.appContext || "indisponível").slice(0, 8000)}`,
      `Arquivos consultados:\n${repository}`,
    ].join("\n\n");
    const userContent = body.screenImage
      ? [
          { type: "text", text: question },
          { type: "image_url", image_url: { url: String(body.screenImage).slice(0, 350000) } },
        ]
      : question;
    const upstream = await fetch(config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
      body: JSON.stringify({ model: config.model, messages: [{ role: "system", content: system }, ...(Array.isArray(body.messages) ? body.messages.slice(-3).map((item) => ({ role: item.role, content: String(item.content || "").slice(0, 700) })) : []), { role: "user", content: userContent }], temperature: 0.15, max_tokens: 1800 }),
    });
    const text = await upstream.text();
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    return res.status(upstream.status).send(text);
  } catch (error) {
    return res.status(502).json({ error: "Não foi possível consultar o repositório ou o provedor técnico.", details: String(error?.message || error).slice(0, 300) });
  }
}
