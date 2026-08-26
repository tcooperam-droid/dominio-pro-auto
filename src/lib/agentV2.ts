/**
 * agentV2.ts — Agente IA v2 reescrito do zero para Domínio Pro
 *
 * Arquitetura LLM-First limpa:
 *  - O LLM decide tudo com dados reais do sistema injetados no prompt
 *  - Ações são extraídas como blocos JSON e executadas no banco
 *  - Sistema de memória integrado (preferências, regras, feedback)
 *
 * Funcionalidades:
 *  - Agendamentos: criar, cancelar, mover, concluir
 *  - Consultas: agenda do dia, data específica, buscar cliente, serviços, profissionais
 *  - Financeiro: faturamento por período, serviços rentáveis, caixa, comissões
 *  - Comportamentos inteligentes: sugestão de último serviço, conflitos, resolução de nomes
 *  - Aprendizado: preferências de clientes, regras ensinadas, feedback negativo
 */

import { clientsStore } from "../features/clientes";
import { servicesStore, type Service } from "../features/servicos";
import { employeesStore, type Employee } from "../features/funcionarios";
import { appointmentsStore, type Appointment, type AppointmentService } from "../features/agenda";
import { cashSessionsStore } from "../features/financeiro";
import { createAgentHeaders, getAgentEndpoint, usesServerAgentEndpoint } from "../features/assistente/llmEndpoint";
import {
  calcPeriodStats,
  calcRevenueByEmployee,
  calcPopularServices,
  getAppointmentsInPeriod,
  getPeriodDates,
} from "../features/relatorios";
import {
  buildMemoryPrompt,
  detectTeachingIntent,
  addRule,
  loadRules,
  addFeedback as memoryAddFeedback,
  refreshPreferences,
} from "./agentMemory";
import {
  buildScheduleTimes,
  intervalsOverlap,
  isCancellation,
  isConfirmation,
  isExplicitScheduleOverride,
  localDateKey,
  localTimeKey,
  normalizeTime as normalizeScheduleTime,
  resolveDate as resolveScheduleDate,
} from "./agentSchedule";

// ─── Tipos públicos ───────────────────────────────────────

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentV2Config {
  apiToken: string;
  model?: string;
  businessContext?: string;
  salonName?: string;
  apiEndpoint?: string;
}

export interface AgentV2Response {
  text: string;
  actionExecuted?: boolean;
  navigateTo?: string;
  messageId?: string;
  userMessage?: string;
}

// ─── Constantes ───────────────────────────────────────────

const HISTORY_KEY = "agentv2_history";
const PENDING_KEY = "agentv2_pending";

// ─── Histórico ────────────────────────────────────────────

function loadHistory(): AgentMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(h: AgentMessage[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-20)));
  } catch { /* ignore */ }
}

function addToHistory(role: "user" | "assistant", content: string): void {
  const h = loadHistory();
  h.push({ role, content });
  saveHistory(h);
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
  clearPendingAction();
}

// ─── Ações pendentes (conflito / profissional) ────────────

interface PendingAction {
  action: ActionPayload;
  type: "conflict" | "professional" | "confirmation" | "override";
  timestamp: number;
}

interface ActionPayload {
  type: "agendar" | "cancelar" | "mover" | "concluir" | "criar_cliente" | "trocar_cliente";
  params: Record<string, unknown>;
}

function savePendingAction(action: ActionPayload, type: "conflict" | "professional" | "confirmation" | "override"): void {
  try {
    const data: PendingAction = { action, type, timestamp: Date.now() };
    localStorage.setItem(PENDING_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

function loadPendingAction(): PendingAction | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const data: PendingAction = JSON.parse(raw);
    if (Date.now() - data.timestamp > 10 * 60_000) {
      clearPendingAction();
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function clearPendingAction(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch { /* ignore */ }
}

// ─── Helpers de data/hora ─────────────────────────────────

function getTodayStr(): string {
  return localDateKey(new Date())!;
}

function getDayOfWeek(dateStr: string): number {
  return new Date(dateStr + "T12:00:00").getDay();
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function normalizeTime(raw: string): string | null {
  return normalizeScheduleTime(raw);
}

function resolveDate(raw: string): string | null {
  return resolveScheduleDate(raw);
}

function listAppointmentsByLocalDate(date: string): Appointment[] {
  return appointmentsStore.list({}).filter((appointment) => localDateKey(appointment.startTime) === date);
}

let schedulingDataPromise: Promise<void> | null = null;

async function refreshSchedulingData(): Promise<void> {
  if (schedulingDataPromise) return schedulingDataPromise;
  schedulingDataPromise = Promise.all([
    clientsStore.fetchAll(),
    servicesStore.fetchAll(),
    employeesStore.fetchAll(),
    appointmentsStore.fetchAll(),
  ]).then(() => undefined).finally(() => {
    schedulingDataPromise = null;
  });
  return schedulingDataPromise;
}

// ─── Validação de horário de trabalho ─────────────────────

function hasScheduleOverride(empName: string): boolean {
  try {
    const rules = loadRules();
    const nameNorm = empName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const firstName = nameNorm.split(" ")[0];
    return rules.some(r => {
      const rNorm = r.raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return (rNorm.includes(firstName)) &&
        (rNorm.includes("qualquer dia") || rNorm.includes("sem horario") ||
         rNorm.includes("sem restricao") || rNorm.includes("agenda sempre") ||
         rNorm.includes("ignora horario") || rNorm.includes("nao tem horario") ||
         rNorm.includes("atende qualquer") || rNorm.includes("disponivel sempre"));
    });
  } catch { return false; }
}

function isWithinWorkingHours(
  emp: Employee,
  dateStr: string,
  timeStr: string,
): { ok: boolean; message?: string } {
  const wh = emp.workingHours;
  if (!wh || Object.keys(wh).length === 0) return { ok: true };
  // Se só tem 1 chave no banco (dado corrompido/incompleto), não bloquear
  if (Object.keys(wh).length === 1) return { ok: true };
  // Override: usuário ensinou que este funcionário atende qualquer dia
  if (hasScheduleOverride(emp.name)) return { ok: true };

  const dayOfWeek = getDayOfWeek(dateStr);

  // Suporta chaves numéricas ("0"-"6"), abreviações pt-BR ("dom","seg","ter","qua","qui","sex","sab")
  // e nomes completos ("domingo","segunda","terca",...)
  const ptKeys: Record<number, string[]> = {
    0: ["dom", "domingo"],
    1: ["seg", "segunda", "segunda-feira"],
    2: ["ter", "terca", "terça", "terca-feira", "terça-feira"],
    3: ["qua", "quarta", "quarta-feira"],
    4: ["qui", "quinta", "quinta-feira"],
    5: ["sex", "sexta", "sexta-feira"],
    6: ["sab", "sábado", "sabado"],
  };
  const possibleKeys = [String(dayOfWeek), ...(ptKeys[dayOfWeek] ?? [])];
  const matchedKey = possibleKeys.find((k) => wh[k] !== undefined);
  const dayConfig = matchedKey ? wh[matchedKey] : undefined;

  if (!dayConfig || !dayConfig.active) {
    const dayNames = [
      "domingo", "segunda-feira", "terça-feira", "quarta-feira",
      "quinta-feira", "sexta-feira", "sábado",
    ];
    return {
      ok: false,
      message: `${emp.name} não trabalha ${dayNames[dayOfWeek]}. Se quiser agendar mesmo assim, diga "agenda mesmo assim" ou ensine: "lembra que ${emp.name.split(" ")[0]} atende qualquer dia".`,
    };
  }

  const startMin = timeToMinutes(dayConfig.start);
  const endMin = timeToMinutes(dayConfig.end);
  const reqMin = timeToMinutes(timeStr);

  if (reqMin < startMin || reqMin >= endMin) {
    return {
      ok: false,
      message: `${emp.name} trabalha das ${dayConfig.start} às ${dayConfig.end} neste dia. O horário ${timeStr} está fora do expediente. Para agendar mesmo assim, diga "agenda mesmo assim" ou ensine um novo horário.`,
    };
  }

  return { ok: true };
}

// ─── Dados do sistema para o prompt ───────────────────────

function getTodayData(): string {
  const today = getTodayStr();
  const appts = listAppointmentsByLocalDate(today);
  const emps = employeesStore.list(true);
  if (appts.length === 0) return `Hoje (${today}): nenhum agendamento.`;
  const lines = appts.map((a) => {
    const emp = emps.find((e) => e.id === a.employeeId);
    const hora = localTimeKey(a.startTime) ?? "";
    const horaFim = localTimeKey(a.endTime) ?? "";
    const svcs = a.services?.map((s) => s.name).join(", ") ?? "";
    return `  - ${hora}-${horaFim} | ${a.clientName} | ${svcs} | Prof: ${emp?.name ?? "?"} | ${a.status} | ID:${a.id}`;
  });
  return `Agendamentos hoje (${today}):\n${lines.join("\n")}`;
}

function getServicesData(): string {
  const svcs = servicesStore.list(true);
  if (svcs.length === 0) return "Nenhum serviço cadastrado.";
  return `Serviços disponíveis:\n${svcs.map((s) =>
    `  - ID:${s.id} | ${s.name} | R$${s.price?.toFixed(2)} | ${s.durationMinutes}min`
  ).join("\n")}`;
}

function getEmployeesData(): string {
  const emps = employeesStore.list(true);
  if (emps.length === 0) return "Nenhum profissional ativo.";
  return `Profissionais ativos:\n${emps.map((e) => {
    const wh = e.workingHours;
    let hoursInfo = "";
    if (wh && Object.keys(wh).length > 1) {
      // Só mostra horários se tiver dados completos (mais de 1 chave)
      const keyToLabel: Record<string, string> = {
        "0": "Dom", "dom": "Dom", "domingo": "Dom",
        "1": "Seg", "seg": "Seg", "segunda": "Seg",
        "2": "Ter", "ter": "Ter", "terca": "Ter",
        "3": "Qua", "qua": "Qua", "quarta": "Qua",
        "4": "Qui", "qui": "Qui", "quinta": "Qui",
        "5": "Sex", "sex": "Sex", "sexta": "Sex",
        "6": "Sab", "sab": "Sab", "sabado": "Sab",
      };
      const activeDays = Object.entries(wh)
        .filter(([, v]) => v && v.active)
        .map(([k, v]) => `${keyToLabel[k.toLowerCase()] ?? k}: ${v.start}-${v.end}`)
        .join(", ");
      if (activeDays) hoursInfo = ` | Horários: ${activeDays}`;
    } else if (wh && Object.keys(wh).length === 1) {
      hoursInfo = " | Horários: Seg-Sáb: 07:00-18:00";
    }
    return `  - ID:${e.id} | ${e.name} | Comissão: ${e.commissionPercent}%${hoursInfo}`;
  }).join("\n")}`;
}

function getApptsByDate(dateStr: string): string {
  const date = resolveDate(dateStr);
  if (!date) return `Data inválida: "${dateStr}".`;
  const appts = listAppointmentsByLocalDate(date);
  const emps = employeesStore.list(true);
  if (appts.length === 0) return `Nenhum agendamento em ${date}.`;

  // Agrupar por profissional para deixar claro quem está ocupado
  const byEmp = new Map<number, typeof appts>();
  for (const a of appts) {
    if (!byEmp.has(a.employeeId)) byEmp.set(a.employeeId, []);
    byEmp.get(a.employeeId)!.push(a);
  }

  const lines: string[] = [`Agendamentos de ${date} por profissional (ATENÇÃO: conflito só bloqueia o profissional específico):`];
  for (const [empId, empAppts] of byEmp.entries()) {
    const emp = emps.find(e => e.id === empId);
    lines.push(`  [${emp?.name ?? "?"}]:`);
    for (const a of empAppts) {
      const hora = a.startTime?.split("T")[1]?.slice(0, 5) ?? "";
      const horaFim = a.endTime?.split("T")[1]?.slice(0, 5) ?? "";
      const svcs = a.services?.map(s => s.name).join(", ") ?? "";
      if (a.status !== "cancelled") {
        lines.push(`    - ${hora}-${horaFim} OCUPADO: ${a.clientName} | ${svcs} | ID:${a.id}`);
      }
    }
  }
  return lines.join("\n");
}

// ─── Busca de clientes com histórico ─────────────────────

async function getClientWithHistory(query: string): Promise<string> {
  const q = query.trim();
  if (!q) {
    let totalStr = "(indisponível)";
    try {
      // Preferir cache local — mais confiável que count() com RLS anônimo
      const cached = await clientsStore.ensureLoaded();
      totalStr = String(cached.length > 0 ? cached.length : await clientsStore.count());
    } catch { /* Supabase indisponível */ }
    return `Total clientes: ${totalStr}`;
  }

  let found: Awaited<ReturnType<typeof clientsStore.search>> = [];
  try {
    found = await clientsStore.search(q, { limit: 15 });
  } catch (err) {
    console.warn("[agentV2] Busca Supabase falhou:", err);
  }

  if (found.length === 0) {
    let totalStr = "(indisponível)";
    try { totalStr = String(await clientsStore.count()); } catch { /* Supabase indisponível */ }
    return `Nenhum cliente encontrado com "${query}". Total no sistema: ${totalStr}.`;
  }

  let recentAppointments: Appointment[] = [];
  try {
    recentAppointments = await appointmentsStore.fetchByClientIds(
      found.map((c) => c.id),
    );
  } catch {
    // Ignorar falha na busca de histórico
  }

  const lastByClient = new Map<number, Appointment>();
  for (const appt of recentAppointments) {
    if (appt.clientId && !lastByClient.has(appt.clientId)) {
      lastByClient.set(appt.clientId, appt);
    }
  }

  const lines: string[] = [];
  for (const c of found) {
    let line = `  - ID:${c.id} | ${c.name}`;
    if (c.phone) line += ` | ${c.phone}`;
    const last = lastByClient.get(c.id);
    if (last) {
      const lastSvc = last.services?.[0]?.name ?? "";
      const lastDate = localDateKey(last.startTime) ?? "";
      line += ` | Último serviço: ${lastSvc} em ${lastDate}`;
    }
    lines.push(line);
  }

  return `Clientes encontrados (${found.length}):\n${lines.join("\n")}`;
}

// ─── Dados financeiros ────────────────────────────────────

function getFinancialSummary(scope: "dia" | "semana" | "mes"): string {
  const periodMap: Record<string, "hoje" | "semana" | "mes"> = {
    dia: "hoje",
    semana: "semana",
    mes: "mes",
  };
  const { start, end } = getPeriodDates(periodMap[scope]);
  const employees = employeesStore.list(false);
  const appts = getAppointmentsInPeriod(start, end);
  const stats = calcPeriodStats(appts, employees);
  const byEmployee = calcRevenueByEmployee(appts, employees);
  const popular = calcPopularServices(appts);

  const lines: string[] = [
    `Financeiro (${scope}):`,
    `  Faturamento bruto: R$ ${stats.totalRevenue.toFixed(2)}`,
    `  Custos de material: R$ ${stats.totalMaterial.toFixed(2)}`,
    `  Comissões: R$ ${stats.totalCommissions.toFixed(2)}`,
    `  Líquido: R$ ${stats.netRevenue.toFixed(2)}`,
    `  Atendimentos: ${stats.count}`,
    `  Ticket médio: R$ ${stats.avgTicket.toFixed(2)}`,
    `  Cancelamentos: ${stats.cancelCount} (${stats.cancelRate.toFixed(1)}%)`,
  ];

  if (byEmployee.length > 0) {
    lines.push(`  Comissões por profissional:`);
    for (const e of byEmployee.slice(0, 5)) {
      lines.push(`    - ${e.name}: R$ ${e.revenue.toFixed(2)} faturado | R$ ${e.commission.toFixed(2)} comissão (${e.commissionPercent}%) | ${e.count} atend.`);
    }
  }

  if (popular.length > 0) {
    lines.push(`  Serviços mais rentáveis:`);
    for (const s of popular.slice(0, 5)) {
      lines.push(`    - ${s.name}: ${s.count}x | R$ ${s.revenue.toFixed(2)}`);
    }
  }

  // Alerta de caixa
  const currentCash = cashSessionsStore.getCurrent();
  if (!currentCash) {
    lines.push(`  ⚠ ALERTA: Caixa NÃO está aberto!`);
  } else {
    lines.push(`  Caixa: aberto desde ${new Date(currentCash.openedAt).toLocaleString("pt-BR")}`);
  }

  return lines.join("\n");
}

// ─── Dados contextuais para o LLM ────────────────────────

async function gatherData(msg: string, history: AgentMessage[] = []): Promise<string> {
  const q = msg.toLowerCase();
  const parts: string[] = [getTodayData(), getEmployeesData(), getServicesData()];

  // Extrair nomes candidatos do histórico recente também (últimas 6 msgs)
  const recentHistory = history.slice(-6).map(m => m.content).join(" ");
  const fullContext = msg + " " + recentHistory;

  // Extrair candidatos a nome de cliente
  const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const empsLower = new Set(
    employeesStore.list(true).flatMap((e) => e.name.toLowerCase().split(" ").map(normalize))
  );
  // Normalizar palavras dos serviços para casar mesmo com acentos
  const svcsLower = new Set(
    servicesStore.list(true).flatMap((s) => s.name.split(" ").map(normalize))
  );

  const stopWords = new Set([
    // preposições e conectivos
    "com", "sem", "por", "ate", "das", "dos", "num", "uma", "uns",
    "ela", "ele", "elas", "eles", "seu", "sua", "seus", "suas",
    // verbos e ações
    "quero", "agendar", "marcar", "cliente", "para", "preciso", "cancelar",
    "mover", "agenda", "hoje", "amanha", "hora", "servico", "horario",
    "consegue", "executar", "agendamento", "voce", "fazer", "nome", "tenho",
    "qual", "quais", "pode", "como", "quanto", "tempo", "duracao",
    // serviços comuns e variações
    "corte", "escova", "tintura", "manicure", "pedicure",
    "barba", "hidrata", "hidratacao", "profunda", "progressiva",
    "termica", "relaxamento", "botox", "coloracao", "luzes",
    "alisamento", "massagem", "unhas", "masculino", "feminino",
    "selagem", "reflexo", "mechas", "penteado", "sobrancelha",
    // confirmações e comandos
    "sim", "nao", "forcar", "confirma", "confirmar", "forca",
    "mesmo", "assim", "deixa", "esquece", "cancelado", "mova", "mude",
    "concluir", "fechar", "abrir", "buscar", "procurar",
    // financeiro
    "faturamento", "financeiro", "receita", "comissao", "relatorio",
    "rendimento", "lucro", "caixa", "semana", "mes", "dia",
    // números como palavras (evita "60", "180" virarem candidatos)
    "160", "170", "180", "190", "200", "210", "220", "30", "35",
    "40", "45", "50", "55", "60", "65", "70", "80", "90",
  ]);

  const words = fullContext
    .split(/\s+/)
    .filter((w) => w.length > 2 && /^[A-Za-zÀ-ÖØ-öø-ÿ]/.test(w));
  const candidateNames = words.filter((w) => {
    const wl = normalize(w);
    return !stopWords.has(wl) && !empsLower.has(wl) && !svcsLower.has(wl);
  });

  if (candidateNames.length > 0) {
    // Buscar cada candidato individualmente — evita "ariele com" que quebra score
    let clientData = "";
    for (const candidate of candidateNames.slice(0, 3)) {
      const result = await getClientWithHistory(candidate);
      if (!result.startsWith("Nenhum cliente") && !result.startsWith("Total")) {
        clientData = result;
        break;
      }
    }
    // Se nenhum sozinho achou, tenta nome composto (ex: "Maria Silva")
    if (!clientData && candidateNames.length > 1) {
      clientData = await getClientWithHistory(candidateNames.slice(0, 2).join(" "));
    }
    if (!clientData) {
      clientData = await getClientWithHistory(candidateNames[0]);
    }
    parts.push(clientData);
  } else {
    let totalStr = "(indisponível)";
    try {
      const cached = await clientsStore.ensureLoaded();
      totalStr = String(cached.length > 0 ? cached.length : await clientsStore.count());
    } catch { /* Supabase indisponível */ }
    parts.push(`Total clientes cadastrados: ${totalStr}. Use busca por nome para localizar.`);
  }

  // Se menciona data específica
  const fullQ = fullContext.toLowerCase();
  const dateMatch = fullQ.match(
    /\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|amanha|amanhã|segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|domingo)\b/i
  );
  if (dateMatch) parts.push(getApptsByDate(dateMatch[1]));

  // Se menciona financeiro
  if (/faturamento|financeiro|receita|comiss[aã]o|rendimento|lucro|ganho|caixa/.test(fullQ)) {
    let scope: "dia" | "semana" | "mes" = "dia";
    if (/semana/.test(q)) scope = "semana";
    else if (/mes|mês/.test(q)) scope = "mes";
    parts.push(getFinancialSummary(scope));
  }

  return parts.join("\n\n");
}

// ─── System Prompt ────────────────────────────────────────

function buildSystemPrompt(config: AgentV2Config): string {
  const dateStr = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return `Você é o Agente IA do ${config.salonName ?? "Domínio Pro"}.
Data atual: ${dateStr}
${config.businessContext ?? ""}

Você gerencia agendamentos, clientes, serviços, profissionais e financeiro.
Dados reais do sistema são fornecidos em cada mensagem — use-os com precisão.

REGRAS:
1. Responda em português brasileiro, direto e natural
2. Você TEM ACESSO COMPLETO a clientes, serviços, profissionais, agendamentos e financeiro — os dados são fornecidos em cada mensagem
3. Nunca diga que não tem acesso a dados — use os nomes para localizar IDs nos dados
4. A lista de "Profissionais" e "Clientes" são SEPARADAS — não confunda
5. Para agendar: CLIENTE recebe o serviço; PROFISSIONAL executa
6. Se houver mais de um profissional e o usuário não informou qual, pergunte
7. Se houver apenas um profissional, use-o automaticamente
8. Mantenha contexto — se o cliente já foi identificado, não peça novamente
9. Quando cliente recorrente é identificado e serviço não foi informado, SUGIRA o último serviço
10. Use os horários de trabalho dos profissionais nos dados
11. Quando o usuário perguntar sobre financeiro, use os dados financeiros fornecidos
12. Se o caixa não estiver aberto e o usuário perguntar sobre financeiro, mencione isso. NUNCA bloqueie agendamentos por causa do caixa — agendamentos funcionam independente do caixa
13. HORÁRIOS OCUPADOS: cada agendamento tem um profissional (Prof: NOME). Um horário só está ocupado para um profissional SE houver agendamento com AQUELE profissional naquele horário. Agendamentos de outros profissionais NÃO bloqueiam o horário do profissional solicitado
14. Ao sugerir horários disponíveis, liste APENAS os horários que NÃO têm agendamento para o profissional específico solicitado
15. Para todo agendamento novo, o sistema exibirá um resumo e pedirá uma confirmação explícita antes de gravar; não diga que foi agendado antes do retorno da ação
16. Se houver conflito, nunca force por conta própria. Só prossiga depois que o usuário confirmar explicitamente o conflito pendente
17. Fora do expediente, só prossiga depois que o usuário disser exatamente "agenda mesmo assim"; a palavra "sim" sozinha não libera horário fora do expediente
18. Se o usuário ensinar "lembra que [funcionário] atende qualquer dia" ou similar, confirme e oriente que na próxima vez o agendamento será liberado automaticamente

AÇÕES — inclua ao final da resposta quando executar operação:
\`\`\`action
{"type":"agendar","params":{"clientName":"Nome Exato","serviceId":45,"employeeId":2,"date":"hoje","time":"14:00"}}
\`\`\`
Tipos: agendar | cancelar | mover | concluir | criar_cliente | trocar_cliente
- agendar: {clientName, serviceId, employeeId, date, time}
- cancelar: {appointmentId}
- mover: {appointmentId, newDate, newTime}
- concluir: {appointmentId}
- criar_cliente: {name, phone?} — use quando cliente não existe no sistema
- trocar_cliente: {appointmentId, newClientName} — troca o cliente de um agendamento existente

IMPORTANTE:
- NÃO inclua clientId — o SISTEMA resolve o cliente pelo nome automaticamente
- Use o nome EXATO como aparece nos dados (ex: "JOAO DA SILVA", não "João")
- Se houver múltiplos clientes com o mesmo nome nos dados, PERGUNTE qual deles antes de agendar
- Se cliente não existe no sistema, não crie cadastro sem uma solicitação clara do usuário
- NÃO decida sozinho ignorar conflitos, expediente ou qualquer regra de agenda
- SEMPRE inclua o bloco action quando tiver todos os dados necessários; o sistema fará a validação antes de gravar
- Se falta informação, pergunte o que falta — NÃO inclua action
- Para agendamento novo, o sistema sempre mostrará um resumo e pedirá confirmação antes de gravar
- NUNCA diga que agendou, cancelou ou moveu antes de receber o resultado real do sistema
- NUNCA inclua \`confirmed\`, \`forceConflict\` ou \`forceSchedule\` no action inicial; esses campos só aparecem no fluxo interno após confirmação explícita
- Se o usuário responder apenas “sim” a uma pergunta de conflito ou confirmação, o sistema executará a ação pendente uma única vez
- Para fora do expediente, só aceite a frase explícita “agenda mesmo assim”; não interprete “sim” como autorização de horário
- date pode ser: "hoje", "amanha", "DD/MM", dia da semana, ou YYYY-MM-DD
${buildMemoryPrompt()}`;
}

// ─── Chamada ao LLM ───────────────────────────────────────

async function callLLM(
  system: string,
  history: AgentMessage[],
  userMsg: string,
  data: string,
  config: AgentV2Config,
): Promise<string> {
  const messages = [
    { role: "system", content: system },
    { role: "system", content: `=== DADOS DO SISTEMA ===\n${data}\n=== FIM DOS DADOS ===` },
    ...history,
    { role: "user", content: userMsg },
  ];

  const ctrl = new AbortController();
  const tmr = setTimeout(() => ctrl.abort(), 25_000);

  const endpoint = getAgentEndpoint(config.apiEndpoint);
  const headers = createAgentHeaders(endpoint, config.apiToken);
  if (!usesServerAgentEndpoint(config.apiEndpoint) && !config.apiToken) {
    throw new Error("GitHub token ausente. Configure VITE_GITHUB_TOKEN no arquivo .env.");
  }

  // Retry automático — até 2 tentativas com backoff
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1200));
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: config.model ?? "openai/gpt-4o-mini",
          messages,
          temperature: 0.2,
          max_tokens: 1200,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(tmr);

      if (!res.ok) {
        if (res.status === 401)
          throw new Error("Token inválido. Verifique seu GitHub PAT em: github.com/settings/tokens");
        if (res.status === 429)
          throw new Error("Limite de requisições atingido. Aguarde alguns segundos.");
        throw new Error(`Erro ${res.status}`);
      }

      const json = await res.json();
      return json?.choices?.[0]?.message?.content ?? "";
    } catch (err) {
      lastErr = err;
      if (err instanceof DOMException && err.name === "AbortError") break; // timeout não faz retry
      if ((err as any)?.message?.includes("401")) break; // auth error não faz retry
    }
  }
  clearTimeout(tmr);
  if (lastErr instanceof DOMException && (lastErr as DOMException).name === "AbortError")
    throw new Error("Timeout — tente novamente.");
  throw lastErr;
}

// ─── Execução de ações ────────────────────────────────────

async function executeCreateClient(params: Record<string, unknown>, allowPendingConfirmation = false): Promise<string> {
  const name = params.name ? String(params.name).trim() : null;
  if (!name) return "Nome do cliente é obrigatório para criar o cadastro.";

  if (!allowPendingConfirmation) {
    savePendingAction(
      { type: "criar_cliente", params: { ...params, confirmed: true } },
      "confirmation",
    );
    return `CONFIRMACAO:Não encontrei o cliente "${name}". Deseja criar esse cadastro${params.phone ? ` com telefone ${String(params.phone)}` : ""}? Responda sim ou não.`;
  }

  // Verificar se já existe
  const allClients = await clientsStore.ensureLoaded();
  const exists = allClients.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (exists) return `Cliente "${exists.name}" já existe no sistema (ID:${exists.id}). Use este cliente para agendar.`;

  const phone = params.phone ? String(params.phone).trim() : null;
  const created = await clientsStore.create({
    name,
    phone: phone || null,
    email: null,
    birthDate: null,
    cpf: null,
    address: null,
    notes: null,
  });
  window.dispatchEvent(new Event("store_updated"));
  return `Cliente "${created.name}" criado com sucesso! ID:${created.id}. Agora pode agendar normalmente.`;
}

async function executeSwapClient(params: Record<string, unknown>): Promise<string> {
  const apptId = Number(params.appointmentId);
  const newClientName = params.newClientName ? String(params.newClientName).trim() : null;
  if (!newClientName) return "Nome do novo cliente é obrigatório.";

  const appt = appointmentsStore.list({}).find(a => a.id === apptId);
  if (!appt) return `Agendamento ID:${apptId} não encontrado.`;

  // Buscar novo cliente
  const allClients = await clientsStore.ensureLoaded();
  const nameLower = newClientName.toLowerCase();
  let client = allClients.find(c => c.name.toLowerCase() === nameLower) ?? null;
  if (!client) {
    client = allClients.find(c => c.name.toLowerCase().includes(nameLower) || nameLower.includes(c.name.toLowerCase())) ?? null;
  }
  if (!client) {
    try {
      const found = await clientsStore.search(newClientName, { limit: 5 });
      if (found.length === 1) client = found[0];
      else if (found.length > 1) {
        const names = found.slice(0, 5).map(c => `${c.name} (ID:${c.id})`).join(", ");
        return `Encontrei vários clientes com "${newClientName}": ${names}. Qual deles?`;
      }
    } catch { /* ignorar */ }
  }
  if (!client) return `Cliente "${newClientName}" não encontrado. Verifique o cadastro.`;

  await appointmentsStore.update(apptId, {
    clientName: client.name,
    clientId: client.id,
  });
  window.dispatchEvent(new Event("store_updated"));
  return `Cliente trocado com sucesso!\nAgendamento ID:${apptId}\nNovo cliente: ${client.name}`;
}

async function executeAction(action: ActionPayload, allowPendingConfirmation = false): Promise<string> {
  if (!action || !action.type || !action.params) {
    return "Ação inválida: estrutura incompleta. Tente reformular o pedido.";
  }
  const { type, params } = action;
  try {
    if (["agendar", "cancelar", "mover", "concluir", "trocar_cliente"].includes(type)) {
      await refreshSchedulingData();
    }
    if (type === "agendar") return await executeSchedule(params, allowPendingConfirmation);
    if (type === "cancelar") return await executeCancel(params);
    if (type === "mover") return await executeMove(params);
    if (type === "concluir") return await executeComplete(params);
    if (type === "criar_cliente") return await executeCreateClient(params, allowPendingConfirmation);
    if (type === "trocar_cliente") return await executeSwapClient(params);
    return `Ação desconhecida: "${type}".`;
  } catch (err) {
    console.error("[AgentV2] Erro em executeAction:", { type, params, err });
    const errMsg = err instanceof Error ? err.message : String(err);
    return `Erro ao executar "${type}": ${errMsg}`;
  }
}

async function executeCancel(params: Record<string, unknown>): Promise<string> {
  const apptId = Number(params.appointmentId);
  const appt = appointmentsStore.list({}).find((a) => a.id === apptId);
  if (!appt) return `Agendamento ID:${apptId} não encontrado.`;
  if (appt.status === "cancelled") return `Agendamento ID:${apptId} já está cancelado.`;
  await appointmentsStore.update(apptId, { status: "cancelled" });
  window.dispatchEvent(new Event("store_updated"));
  const hora = localTimeKey(appt.startTime) ?? "";
  return `Agendamento ID:${apptId} cancelado com sucesso.\nCliente: ${appt.clientName}\nHorário: ${hora}`;
}

async function executeMove(params: Record<string, unknown>): Promise<string> {
  const apptId = Number(params.appointmentId);
  const appt = appointmentsStore.list({}).find((a) => a.id === apptId);
  if (!appt) return `Agendamento ID:${apptId} não encontrado.`;

  const resolvedDate = resolveDate(String(params.newDate ?? ""));
  const resolvedTime = normalizeTime(String(params.newTime ?? ""));
  if (!resolvedDate) return `Data inválida: "${params.newDate}".`;
  if (!resolvedTime) return `Horário inválido: "${params.newTime}". Use HH:MM.`;

  const durMs = new Date(appt.endTime).getTime() - new Date(appt.startTime).getTime();
  const movedTimes = buildScheduleTimes(resolvedDate, resolvedTime, durMs / 60_000);
  if (!movedTimes) return "Não foi possível montar o novo horário.";
  const { startTime: newStart, endTime: newEnd } = movedTimes;

  const emp = employeesStore.list(true).find((e) => e.id === appt.employeeId);
  if (emp) {
    const whCheck = isWithinWorkingHours(emp, resolvedDate, resolvedTime);
    if (!whCheck.ok) return whCheck.message!;
  }

  // Verificar conflito
  const conflict = listAppointmentsByLocalDate(resolvedDate).find((a) => {
    if (a.id === appt.id || a.employeeId !== appt.employeeId || a.status === "cancelled") return false;
    return intervalsOverlap(a.startTime, a.endTime, newStart, newEnd);
  });

  if (conflict && !params.forceConflict) {
    const cHora = localTimeKey(conflict.startTime);
    const cFim = localTimeKey(conflict.endTime);
    savePendingAction(
      { type: "mover", params: { ...params, forceConflict: true } },
      "conflict",
    );
    return `CONFLITO:${emp?.name ?? "Profissional"} já tem agendamento das ${cHora} às ${cFim} (${conflict.clientName ?? "cliente"}). Para forçar, confirme explicitamente.`;
  }

  await appointmentsStore.update(appt.id, { startTime: newStart, endTime: newEnd });
  window.dispatchEvent(new Event("store_updated"));
  return `Agendamento movido com sucesso!\nCliente: ${appt.clientName}\nNovo horário: ${resolvedDate} às ${resolvedTime}`;
}

async function executeComplete(params: Record<string, unknown>): Promise<string> {
  const apptId = Number(params.appointmentId);
  const appt = appointmentsStore.list({}).find((a) => a.id === apptId);
  if (!appt) return `Agendamento ID:${apptId} não encontrado.`;
  await appointmentsStore.update(apptId, { status: "completed" });
  window.dispatchEvent(new Event("store_updated"));
  return `Agendamento ID:${apptId} concluído!\nCliente: ${appt.clientName}`;
}

async function executeSchedule(params: Record<string, unknown>, allowPendingConfirmation = false): Promise<string> {
  // Ignorar clientId do LLM — sempre resolver pelo nome para evitar ID alucinado
  const serviceId = params.serviceId != null ? Number(params.serviceId) : null;
  const employeeId = params.employeeId != null ? Number(params.employeeId) : null;
  const date = String(params.date ?? "hoje");
  const time = String(params.time ?? "");
  const paramClientName = params.clientName ? String(params.clientName) : null;

  const resolvedDate = resolveDate(date);
  const resolvedTime = normalizeTime(time);
  if (!resolvedDate) return `Data inválida: "${date}".`;
  if (!resolvedTime)
    return `Horário inválido: "${time}". Use formato HH:MM (ex: 14:00, 9:30).`;

  // 1. Localizar cliente sempre pelo nome (nunca pelo ID do LLM)
  const allClients = await clientsStore.ensureLoaded();
  let client: typeof allClients[0] | null = null;

  if (paramClientName) {
    const nameLower = paramClientName.toLowerCase().trim();

    // 1a. Busca exata no cache
    client = allClients.find((c) => c.name.toLowerCase() === nameLower) ?? null;

    // 1b. Busca parcial no cache — nunca escolher homônimo arbitrariamente
    if (!client) {
      const matches = allClients.filter((c) => {
        const cn = c.name.toLowerCase();
        return cn.includes(nameLower) || nameLower.includes(cn);
      });
      if (matches.length === 1) {
        client = matches[0];
      } else if (matches.length > 1) {
        const names = matches.slice(0, 5).map((c) => `${c.name} (ID:${c.id})`).join(", ");
        return `Encontrei vários clientes com "${paramClientName}": ${names}. Qual deles?`;
      }
    }

    // 1c. Por primeiro nome no cache
    if (!client) {
      const firstName = nameLower.split(" ")[0];
      if (firstName.length > 2) {
        const matches = allClients.filter((c) => c.name.toLowerCase().includes(firstName));
        if (matches.length === 1) {
          client = matches[0];
        } else if (matches.length > 1) {
          const names = matches.slice(0, 5).map((c) => `${c.name} (ID:${c.id})`).join(", ");
          return `Encontrei vários clientes com "${paramClientName}": ${names}. Qual deles?`;
        }
      }
    }

    // 1d. Fallback: busca direto no Supabase (garante que acha mesmo fora do cache)
    if (!client) {
      console.log("[agentV2] Cliente não achado no cache, buscando no Supabase:", paramClientName);
      try {
        const found = await clientsStore.search(paramClientName, { limit: 10 });
        if (found.length === 1) {
          client = found[0];
        } else if (found.length > 1) {
          const names = found.slice(0, 5).map((c) => `${c.name} (ID:${c.id})`).join(", ");
          return `Encontrei vários clientes com "${paramClientName}": ${names}. Qual deles?`;
        }
      } catch (err) {
        console.warn("[agentV2] Busca Supabase falhou em executeSchedule:", err);
      }
    }
  }

  if (!client) {
    return `Cliente "${paramClientName ?? "desconhecido"}" não encontrado no sistema. Verifique o cadastro.`;
  }

  // 2. Localizar serviço
  const svc = serviceId
    ? servicesStore.list(true).find((s) => s.id === serviceId) ?? null
    : null;
  if (!svc) {
    const svcs = servicesStore.list(true);
    if (svcs.length === 0) return "Nenhum serviço cadastrado no sistema.";
    return `Serviço ID:${serviceId} não encontrado. Disponíveis: ${svcs.map((s) => `${s.name} (ID:${s.id})`).join(", ")}`;
  }

  // 3. Localizar profissional
  const emps = employeesStore.list(true);
  if (emps.length === 0) return "Nenhum profissional ativo no sistema.";

  let emp: Employee | null = employeeId
    ? emps.find((e) => e.id === employeeId) ?? null
    : null;
  if (!emp && emps.length === 1) emp = emps[0];
  if (!emp) {
    // Fix 3: salvar clientName EXATO do banco para re-execução correta
    savePendingAction(
      { type: "agendar", params: { ...params, clientName: client.name } },
      "professional",
    );
    const lista = emps.map((e) => `${e.name} (ID:${e.id})`).join(", ");
    return `AGUARDANDO_PROFISSIONAL:${lista}`;
  }

  // 4. Validar horário de trabalho (ignora somente após override explícito do usuário)
  const scheduleOverride = allowPendingConfirmation && params.confirmed === true && params.forceSchedule === true;
  if (!scheduleOverride) {
    const whCheck = isWithinWorkingHours(emp, resolvedDate, resolvedTime);
    if (!whCheck.ok) {
      savePendingAction(
        { type: "agendar", params: { ...params, clientName: client.name, confirmed: true, forceSchedule: true } },
        "override",
      );
      return `FORA_HORARIO:${whCheck.message} Para continuar, responda exatamente "agenda mesmo assim".`;
    }
  }

  // 5. Calcular horários no fuso local e serializar como instante ISO
  const durationMinutes = svc.durationMinutes > 0 ? svc.durationMinutes : 60;
  const scheduleTimes = buildScheduleTimes(resolvedDate, resolvedTime, durationMinutes);
  if (!scheduleTimes) return "Não foi possível montar o horário solicitado.";
  const { startTime, endTime } = scheduleTimes;

  // 6. Verificar conflito
  const conflict = listAppointmentsByLocalDate(resolvedDate).find((a) => {
    if (a.employeeId !== emp!.id || a.status === "cancelled") return false;
    return intervalsOverlap(a.startTime, a.endTime, startTime, endTime);
  });

  const conflictOverride = allowPendingConfirmation && params.confirmed === true && params.forceConflict === true;
  if (conflict && !conflictOverride) {
    const conflictHour = localTimeKey(conflict.startTime);
    const conflictEnd = localTimeKey(conflict.endTime);
    // Fix 3: salvar clientName EXATO do banco para re-execução correta
    savePendingAction(
      { type: "agendar", params: { ...params, clientName: client.name, forceConflict: true, confirmed: true } },
      "conflict",
    );
    return `CONFLITO:${emp.name} já tem agendamento das ${conflictHour} às ${conflictEnd} (${conflict.clientName ?? "cliente"}). Para forçar mesmo assim, confirme explicitamente.`;
  }

  // 7. Confirmar antes de criar o registro
  if (!(allowPendingConfirmation && params.confirmed === true)) {
    savePendingAction(
      { type: "agendar", params: { ...params, clientName: client.name, confirmed: true } },
      "confirmation",
    );
    return [
      "CONFIRMACAO:",
      "Confira o agendamento:",
      `Cliente: ${client.name}`,
      `Serviço: ${svc.name} (${durationMinutes} min)`,
      `Data: ${resolvedDate} às ${resolvedTime}`,
      `Profissional: ${emp.name}`,
      "Confirma? Responda sim ou não.",
    ].join("\n");
  }

  // 8. Criar agendamento
  const serviceData: AppointmentService = {
    serviceId: svc.id,
    name: svc.name,
    price: svc.price,
    durationMinutes: svc.durationMinutes ?? 60,
    color: svc.color ?? "#ec4899",
    materialCostPercent: svc.materialCostPercent ?? 0,
    commissionMode: svc.commissionMode ?? "cost_first",
  };

  const created = await appointmentsStore.create({
    clientName: client.name,
    clientId: client.id,
    employeeId: emp.id,
    startTime,
    endTime,
    status: "scheduled",
    totalPrice: svc.price,
    notes: null,
    paymentStatus: null,
    groupId: null,
    services: [serviceData],
  });

  if (!created || !created.id) {
    return "Erro ao criar agendamento no banco. Verifique os dados e tente novamente.";
  }

  window.dispatchEvent(new Event("store_updated"));
  refreshPreferences();

  return [
    "Agendamento criado com sucesso!",
    `ID: ${created.id}`,
    `Cliente: ${client.name}`,
    `Serviço: ${svc.name} (${durationMinutes}min)`,
    `Data: ${resolvedDate} às ${resolvedTime}`,
    `Profissional: ${emp.name}`,
  ].join("\n");
}

// ─── Helpers de detecção ──────────────────────────────────

function isLikelyActionRequest(text: string): boolean {
  return /\b(agendar|marcar|agenda|cancelar|desmarcar|reagendar|mover|remarcar|concluir|finalizar)\b/i.test(text);
}

function claimsActionSuccess(text: string): boolean {
  return /\b(agendei|agendado com sucesso|marquei|cancelei|cancelado com sucesso|movi|reagendei|conclui|concluído com sucesso|agendamento realizado)\b/i.test(text);
}

// ─── Configuração e API pública ───────────────────────────

let cfg: AgentV2Config | null = null;

export function initAgentV2(config: AgentV2Config): void {
  cfg = config;
}

// ─── Detectar diretrizes de comportamento ─────────────────
function detectDirectiveIntent(msg: string): string | null {
  const m = msg.trim();
  const lower = m.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Padrões de diretriz: "seja sempre X", "nunca invente", "seja X", "sempre X"
  const patterns = [
    /^seja\s+sempre\s+.+/i,
    /^seja\s+.+/i,
    /^nunca\s+(invente|minta|confirme|execute|faca|diga).+/i,
    /^sempre\s+(confirme|pergunte|verifique|informe|seja).+/i,
    /^(comportamento|diretriz|regra de comportamento)[:：]\s*.+/i,
    /^a partir de agora\s+(seja|nunca|sempre).+/i,
    /^de agora em diante\s+(seja|nunca|sempre).+/i,
    /^quero que voce (seja|nunca|sempre|evite).+/i,
  ];

  const normalized = lower;
  for (const p of patterns) {
    if (p.test(normalized)) return m;
  }
  return null;
}

export async function handleMessageV2(userMessage: string): Promise<AgentV2Response> {
  if (!cfg) return { text: "Agente não configurado." };

  try {

  const msgTrimmed = userMessage.trim();

  // ── 1. Verificar ação pendente (conflito ou profissional) ──
  const pending = loadPendingAction();
  if (pending) {
    const result = await handlePendingAction(pending, msgTrimmed);
    if (result) return result;
  }

  // ── 2. Detectar comando de ensino (regra explícita ou diretriz) ──
  const teachIntent = detectTeachingIntent(msgTrimmed);
  // Detectar diretrizes de comportamento do agente
  const directiveIntent = detectDirectiveIntent(msgTrimmed);
  if (teachIntent || directiveIntent) {
    const intent = teachIntent || directiveIntent!;
    const rule = addRule(intent);
    const isDirective = !!directiveIntent;
    const confirmation = isDirective
      ? `Entendido! Vou adotar essa diretriz permanentemente:\n"${rule.raw}"\n\nEla será aplicada em todas as minhas respostas daqui em diante.`
      : `Entendido! Vou lembrar disso sempre:\n"${rule.raw}"`;
    addToHistory("user", msgTrimmed);
    addToHistory("assistant", confirmation);
    return { text: confirmation };
  }

  // ── 3. Fluxo normal: LLM + execução de ação ──
  if (isLikelyActionRequest(msgTrimmed)) {
    try {
      await refreshSchedulingData();
    } catch (error) {
      console.error("[agentV2] Não foi possível atualizar a agenda:", error);
      const text = "Não consegui atualizar os dados da agenda agora. Nenhum agendamento foi alterado; tente novamente em alguns segundos.";
      addToHistory("user", msgTrimmed);
      addToHistory("assistant", text);
      return { text, messageId: `m_${Date.now()}`, userMessage: msgTrimmed };
    }
  }
  addToHistory("user", msgTrimmed);
  const history = loadHistory().slice(0, -1);
  let systemData = "(dados indisponíveis)";
  try {
    systemData = await gatherData(msgTrimmed, history);
  } catch (err) {
    console.warn("[agentV2] gatherData falhou, prosseguindo sem dados:", err);
  }

  console.log("[agentV2] gatherData OK, chamando LLM...");

  let raw: string;
  try {
    raw = await callLLM(buildSystemPrompt(cfg), history, msgTrimmed, systemData, cfg);
  } catch (err) {
    console.warn("[agentV2] callLLM falhou:", err);
    const errText = `Erro: ${err instanceof Error ? err.message : "Tente novamente."}`;
    return { text: errText };
  }

  // Extrair e executar ação
  let text = raw;
  let actionExecuted = false;
  let navigateTo: string | undefined;

  const match = raw.match(/```action\s*([\s\S]*?)```/);
  if (match) {
    try {
      const act: ActionPayload = JSON.parse(match[1]);
      const result = await executeAction(act);

      if (result.startsWith("AGUARDANDO_PROFISSIONAL:")) {
        const lista = result.replace("AGUARDANDO_PROFISSIONAL:", "");
        text = `Com qual profissional deseja agendar? Disponíveis: ${lista}`;
      } else if (result.startsWith("CONFLITO:")) {
        const detalhe = result.replace("CONFLITO:", "");
        text = `Conflito de horário: ${detalhe}\nDeseja agendar mesmo assim? Responda "sim" ou "forçar" para confirmar.`;
      } else if (result.startsWith("FORA_HORARIO:")) {
        text = result.replace("FORA_HORARIO:", "");
      } else if (result.startsWith("CONFIRMACAO:")) {
        text = result.replace("CONFIRMACAO:", "").trim();
      } else {
        text = result;
        actionExecuted =
          result.includes("criado com sucesso") ||
          result.includes("cancelado com sucesso") ||
          result.includes("movido com sucesso") ||
          result.includes("concluído");
        if (actionExecuted && (act.type === "agendar" || act.type === "mover")) {
          navigateTo = "/agenda";
        }
      }
    } catch (err) {
      text = `Erro ao processar ação: ${err instanceof Error ? err.message : "Desconhecido"}`;
      console.error("[AgentV2] Erro ao processar ação:", err);
    }
  } else if (isLikelyActionRequest(msgTrimmed)) {
    if (claimsActionSuccess(raw)) {
      // LLM afirmou ter feito mas não gerou o bloco action — forçar extração via segunda chamada
      console.log("[agentV2] LLM não gerou action, tentando extração forçada...");
      try {
        // Montar contexto completo da conversa para o extrator
        const recentMsgs = history.slice(-6).map(m => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.content}`).join("\n");
        const forceRaw = await callLLM(
          `Você é um extrator de JSON para agendamentos de salão de beleza.
Analise o histórico da conversa e extraia os dados do agendamento solicitado.
Responda APENAS com o JSON, sem texto adicional, sem explicações, sem markdown.
Formato obrigatório: {"type":"agendar","params":{"clientName":"NOME EXATO","serviceId":0,"employeeId":0,"date":"YYYY-MM-DD","time":"HH:MM"}}
Use serviceId e employeeId dos dados do sistema fornecidos.
Se não tiver TODOS os dados necessários, responda apenas: {}`,
          [],
          `=== HISTÓRICO RECENTE ===\n${recentMsgs}\n\n=== MENSAGEM ATUAL ===\n${msgTrimmed}\n\n=== DADOS DO SISTEMA ===\n${systemData}`,
          "",
          cfg,
        );
        const cleaned = forceRaw.replace(/```[\s\S]*?```/g, "").trim();
        if (cleaned && cleaned !== "{}") {
          const act: ActionPayload = JSON.parse(cleaned);
          if (act.type && act.params) {
            const result = await executeAction(act);
            if (result.startsWith("AGUARDANDO_PROFISSIONAL:")) {
              text = `Com qual profissional deseja agendar? Disponíveis: ${result.replace("AGUARDANDO_PROFISSIONAL:", "")}`;
            } else if (result.startsWith("CONFLITO:")) {
              text = `Conflito de horário: ${result.replace("CONFLITO:", "")}\nDeseja agendar mesmo assim?`;
            } else if (result.startsWith("FORA_HORARIO:")) {
              text = result.replace("FORA_HORARIO:", "");
            } else if (result.startsWith("CONFIRMACAO:")) {
              text = result.replace("CONFIRMACAO:", "").trim();
            } else {
              text = result;
              actionExecuted = result.includes("criado com sucesso") || result.includes("cancelado com sucesso") || result.includes("movido com sucesso");
              if (actionExecuted && (act.type === "agendar" || act.type === "mover")) navigateTo = "/agenda";
            }
          } else {
            text = raw.replace(/```[\s\S]*?```/g, "").trim();
          }
        } else {
          text = raw.replace(/```[\s\S]*?```/g, "").trim();
        }
      } catch {
        text = raw.replace(/```[\s\S]*?```/g, "").trim();
      }
    } else {
      text = raw.replace(/```[\s\S]*?```/g, "").trim() || "Não consegui gerar a ação. Pode repetir o pedido?";
    }
  }

  addToHistory("assistant", text);
  const msgId = `m_${Date.now()}`;
  return { text, actionExecuted, navigateTo, messageId: msgId, userMessage: msgTrimmed };

  } catch (outerErr) {
    console.error("[agentV2] Erro inesperado em handleMessageV2:", outerErr);
    return { text: `Erro inesperado: ${outerErr instanceof Error ? outerErr.message : "Tente novamente."}` };
  }
}

// ─── Handler de ações pendentes ───────────────────────────

async function handlePendingAction(
  pending: PendingAction,
  msgTrimmed: string,
): Promise<AgentV2Response | null> {
  // ─ Confirmação explícita ou override: usuário confirmando ─
  if (pending.type === "confirmation" || pending.type === "conflict" || pending.type === "override") {
    const accepted = pending.type === "override"
      ? isExplicitScheduleOverride(msgTrimmed)
      : isConfirmation(msgTrimmed);

    if (accepted) {
      clearPendingAction();
      addToHistory("user", msgTrimmed);
      const result = await executeAction(pending.action, true);

      if (result.startsWith("AGUARDANDO_PROFISSIONAL:")) {
        const lista = result.replace("AGUARDANDO_PROFISSIONAL:", "");
        const aviso = `Com qual profissional deseja agendar? Disponíveis: ${lista}`;
        addToHistory("assistant", aviso);
        return { text: aviso, messageId: `m_${Date.now()}`, userMessage: msgTrimmed };
      }
      if (result.startsWith("CONFLITO:")) {
        const aviso = `Conflito de horário: ${result.replace("CONFLITO:", "")}\nDeseja agendar mesmo assim? Responda "sim" para confirmar.`;
        addToHistory("assistant", aviso);
        return { text: aviso, messageId: `m_${Date.now()}`, userMessage: msgTrimmed };
      }
      if (result.startsWith("FORA_HORARIO:")) {
        const aviso = result.replace("FORA_HORARIO:", "");
        addToHistory("assistant", aviso);
        return { text: aviso, messageId: `m_${Date.now()}`, userMessage: msgTrimmed };
      }

      addToHistory("assistant", result);
      const isSuccess = result.includes("criado com sucesso") || result.includes("movido com sucesso");
      return {
        text: result,
        actionExecuted: isSuccess,
        navigateTo: isSuccess ? "/agenda" : undefined,
        messageId: `m_${Date.now()}`,
        userMessage: msgTrimmed,
      };
    }

    if (isCancellation(msgTrimmed)) {
      clearPendingAction();
      addToHistory("user", msgTrimmed);
      const cancelMsg = "Ok, agendamento não realizado. Como posso ajudar?";
      addToHistory("assistant", cancelMsg);
      return { text: cancelMsg, messageId: `m_${Date.now()}`, userMessage: msgTrimmed };
    }

    if (pending.type === "confirmation" || pending.type === "override") {
      return {
        text: pending.type === "override"
          ? "Para esse horário, responda exatamente: agenda mesmo assim."
          : "Responda sim para confirmar o agendamento ou não para cancelar.",
        messageId: `m_${Date.now()}`,
        userMessage: msgTrimmed,
      };
    }

    clearPendingAction();
    return null;
  }

  // ─ Profissional: usuário escolhendo ─
  if (pending.type === "professional") {
    if (isCancellation(msgTrimmed)) {
      clearPendingAction();
      const cancelMsg = "Ok, agendamento não realizado. Como posso ajudar?";
      addToHistory("user", msgTrimmed);
      addToHistory("assistant", cancelMsg);
      return { text: cancelMsg, messageId: `m_${Date.now()}`, userMessage: msgTrimmed };
    }

    const emps = employeesStore.list(true);
    const empName = msgTrimmed.toLowerCase();

    const emp = emps.find(
      (e) =>
        e.name.toLowerCase() === empName ||
        e.name.toLowerCase().includes(empName) ||
        empName.includes(e.name.toLowerCase()),
    ) ?? null;

    if (emp) {
      clearPendingAction();
      addToHistory("user", msgTrimmed);
      const updatedAction: ActionPayload = {
        ...pending.action,
        params: { ...pending.action.params, employeeId: emp.id },
      };
      const result = await executeAction(updatedAction, false);

      if (result.startsWith("CONFLITO:")) {
        const detalhe = result.replace("CONFLITO:", "");
        const aviso = `Conflito de horário: ${detalhe}\nDeseja agendar mesmo assim? Responda "sim" para confirmar.`;
        addToHistory("assistant", aviso);
        return { text: aviso, messageId: `m_${Date.now()}`, userMessage: msgTrimmed };
      }

      if (result.startsWith("AGUARDANDO_PROFISSIONAL:")) {
        const lista = result.replace("AGUARDANDO_PROFISSIONAL:", "");
        const aviso = `Com qual profissional deseja agendar? Disponíveis: ${lista}`;
        addToHistory("assistant", aviso);
        return { text: aviso, messageId: `m_${Date.now()}`, userMessage: msgTrimmed };
      }

      addToHistory("assistant", result);
      const isSuccess = result.includes("criado com sucesso");
      return {
        text: result,
        actionExecuted: isSuccess,
        navigateTo: isSuccess ? "/agenda" : undefined,
        messageId: `m_${Date.now()}`,
        userMessage: msgTrimmed,
      };
    }

    clearPendingAction();
    return null;
  }

  return null;
}

// ─── Re-export de feedback ────────────────────────────────

export function addFeedback(userMessage: string, agentResponse: string, rating: "good" | "bad"): void {
  memoryAddFeedback(userMessage, agentResponse, rating);
}

// ─── Teste de conexão ─────────────────────────────────────

export async function testAgentV2Connection(
  token = "",
): Promise<{ ok: boolean; message: string }> {
  try {
    const endpoint = getAgentEndpoint();
    if (!usesServerAgentEndpoint() && !token) {
      return { ok: false, message: "GitHub token ausente. Configure VITE_GITHUB_TOKEN ou informe um token nas configurações." };
    }
    const res = await fetch(endpoint, {
      method: "POST",
      headers: createAgentHeaders(endpoint, token),
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "OK" }],
        max_tokens: 5,
      }),
    });
    if (!res.ok)
      return {
        ok: false,
        message: res.status === 401 ? "Token inválido." : `Erro ${res.status}`,
      };
    return { ok: true, message: "Conexão OK! Agente IA ativado." };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro de rede.",
    };
  }
}
