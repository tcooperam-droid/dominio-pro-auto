import type { PersonalMemory } from "./types";
import { buildMemoryContext } from "./memory";

export const PERSONAL_AGENT_IDENTITY = `Você é o agente pessoal de Ricardo, um assistente de propósito geral.
Você ajuda a pensar, planejar, escrever, estudar, pesquisar conceitos, organizar objetivos e tomar decisões com clareza.
Você também pode conversar sobre o negócio e o sistema Domínio Pro, mas não é limitado ao salão.
Responda em português do Brasil, salvo se o usuário pedir outro idioma.
Seja prático, transparente e cuidadoso: não invente fatos, não diga que executou uma ação quando apenas sugeriu algo e deixe claro quando precisar de dados externos.
Trate a memória como contexto útil, não como autoridade absoluta: confirme informações conflitantes e não exponha segredos, tokens ou dados sensíveis.
Quando receber contexto de pesquisa na Internet, use-o como fonte principal, cite as fontes fornecidas e diferencie fatos atuais de conhecimento geral.
Quando o pedido for uma operação da agenda do salão (criar, mover, cancelar ou concluir agendamento, ou consultar horários/clientes do app), a camada de integração deve encaminhá-lo ao agente de agendamento; não simule essa operação nesta conversa.`;

export function buildPersonalSystemPrompt(
  memory: PersonalMemory,
  options: { salonName?: string; userName?: string } = {},
): string {
  const identity = PERSONAL_AGENT_IDENTITY
    .replace("Ricardo", options.userName?.trim() || "Ricardo")
    .concat(options.salonName ? `\nO negócio conectado se chama ${options.salonName}.` : "");
  return `${identity}${buildMemoryContext(memory)}\n\nCAPACIDADES ATUAIS:\n- Conversa geral e raciocínio assistido por IA.\n- Memória local de fatos, instruções, objetivos e feedback, controlável pelo usuário.\n- Ponte explícita para o agente de agendamento do Domínio Pro.\n- A memória não é treinamento de pesos do modelo; ela é contexto recuperado a cada conversa.`;
}

export function extractTeachingInstruction(message: string): string | null {
  const value = message.trim();
  if (!value) return null;
  const patterns = [
    /^(?:lembra(?:r)?(?:-se)?|anota|registre|guarde|aprenda)\s+(?:que\s+)?(.+)$/i,
    /^(?:sempre que|quando eu disser)\s+(.+)$/i,
    /^(?:regra|instrução|diretriz)\s*:\s*(.+)$/i,
  ];
  return patterns.some((pattern) => pattern.test(value)) ? value : null;
}

export function extractGoalCommand(message: string): { action: "add" | "complete"; title: string } | null {
  const value = message.trim();
  const add = value.match(/^(?:meu objetivo é|meu objetivo e|objetivo|quero alcançar|quero alcancar)\s*:?\s*(.+)$/i);
  if (add?.[1]) return { action: "add", title: add[1].trim() };
  const complete = value.match(/^(?:concluí|conclui|completei|finalizei)\s+(?:o objetivo de\s+)?(.+)$/i);
  if (complete?.[1]) return { action: "complete", title: complete[1].trim() };
  return null;
}

export function extractFactCommand(message: string): { key: string; value: string } | null {
  const match = message.trim().match(/^(?:meu nome é|meu nome e|sou)\s+(.+)$/i);
  if (match?.[1]) return { key: "nome", value: match[1].trim() };
  return null;
}

export function isSchedulerRequest(message: string): boolean {
  const value = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/\b(planejar|ideia de agenda|como organizar.*agenda|modelo de agenda|identificar.*erro|corrigir|correcao|explicar|por que|porque|na verdade|voce acertou|errou)\b/.test(value)) {
    return false;
  }
  const operation = /\b(agendar|marcar|remarcar|reagendar|desmarcar|cancelar|mover|concluir)\b/;
  const lookup = /\b(quais|qual|que|temos|existe|existem|verifique|consulte|listar|liste)\b.*\b(agendamento|agendamentos|agenda|horario|horarios|cliente cadastrado|servico cadastrado|profissional disponivel)\b/;
  const confirmation = /\b(agenda mesmo assim|confirma|confirmo|pode executar|pode fazer)\b/;
  return operation.test(value) || lookup.test(value) || confirmation.test(value);
}

export function isTechnicalRequest(message: string): boolean {
  const value = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return /\b(erro|bug|falha|503|tela|codigo|programacao|desenvolvimento|seguranca|diagnostico|corrigir o app|corrigir o aplicativo|analisar o app|analisar o aplicativo|revisar o codigo|agente tecnico)\b/.test(value);
}

export function isLikelyWebResearchRequest(message: string): boolean {
  const value = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return /\b(pesquis[ae]|procure|buscar na internet|na internet|na web|web|noticias?|atualizacoes?|ultimas? noticias?|hoje|agora|atualmente|tempo em|clima|cotacao|preco atual|quanto custa hoje|fonte|fontes|link|o que aconteceu|quem e o atual|qual e o atual)\b/.test(value);
}

export function buildConversationContext(messages: Array<{ role: "user" | "assistant"; content: string }>): string {
  return messages
    .slice(-12)
    .map((message) => `${message.role === "user" ? "Usuário" : "Agente"}: ${message.content}`)
    .join("\n");
}
