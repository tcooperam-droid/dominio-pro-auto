import { appointmentsStore, clientsStore, employeesStore, servicesStore } from "@/lib/store";
import { localDateKey, localTimeKey } from "@/lib/agentSchedule";

function visibleScreenContext(): string {
  if (typeof window === "undefined" || typeof document === "undefined") return "Tela: indisponível fora do navegador.";
  const bodyText = document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 6000);
  const buttons = Array.from(document.querySelectorAll("button"))
    .map((button) => button.textContent?.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 40);
  const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
    .map((heading) => heading.textContent?.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 20);
  return [
    `Rota: ${window.location.pathname}`,
    `Título: ${document.title}`,
    `Cabeçalhos: ${headings.join(" | ") || "nenhum"}`,
    `Botões visíveis: ${buttons.join(" | ") || "nenhum"}`,
    `Texto visível: ${bodyText || "vazio"}`,
  ].join("\n");
}

export function buildAppContext(): string {
  const today = new Date().toISOString().slice(0, 10);
  const appointments = appointmentsStore.list({ startDate: today }).slice(0, 30);
  const employees = employeesStore.list(true);
  const services = servicesStore.list(true);
  const clients = clientsStore.list();
  const employeeById = new Map(employees.map((employee) => [employee.id, employee.name]));
  const appointmentLines = appointments.map((appointment) => {
    const servicesText = appointment.services?.map((service) => service.name).join(", ") || "serviço não informado";
    return `- ID:${appointment.id} ${localDateKey(appointment.startTime) ?? "?"} ${localTimeKey(appointment.startTime) ?? "?"}-${localTimeKey(appointment.endTime) ?? "?"} | ${appointment.clientName} | ${servicesText} | Profissional: ${employeeById.get(appointment.employeeId) ?? "?"} | Status: ${appointment.status}`;
  });
  return [
    "CONTEXTO REAL DO APLICATIVO (somente leitura):",
    `Dados carregados: ${clients.length} clientes, ${employees.length} profissionais ativos, ${services.length} serviços ativos, ${appointments.length} agendamentos a partir de hoje.`,
    appointmentLines.length ? `Próximos agendamentos:\n${appointmentLines.join("\n")}` : "Próximos agendamentos: nenhum carregado.",
    visibleScreenContext(),
    "Use este contexto para diagnosticar a tela e os dados atuais; não invente registros e não diga que executou uma operação sem retorno real do sistema.",
  ].join("\n\n");
}

export function getVisibleScreenContext(): string {
  return visibleScreenContext();
}
