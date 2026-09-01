import type { AccountingProductionRow, NfsePreparationRow } from "./types";

const money = (value: number) => value.toFixed(2).replace(".", ",");
const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export function productionToCsv(rows: AccountingProductionRow[]): string {
  const header = ["Data", "Horário", "Empresa", "CNPJ", "Colaborador", "Cliente", "Serviço", "Valor previsto", "Status"].map(csvCell).join(";");
  const lines = rows.flatMap(row => row.services.length ? row.services.map(service => [
    new Date(row.appointment.startTime).toLocaleDateString("pt-BR"),
    new Date(row.appointment.startTime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    row.company.name, row.company.cnpj, row.employee?.name ?? "", row.appointment.clientName ?? "", service.name,
    money(service.price), row.appointment.status,
  ].map(csvCell).join(";")) : [[
    new Date(row.appointment.startTime).toLocaleDateString("pt-BR"), "", row.company.name, row.company.cnpj,
    row.employee?.name ?? "", row.appointment.clientName ?? "", "", money(row.grossValue), row.appointment.status,
  ].map(csvCell).join(";")]);
  return `\uFEFF${[header, ...lines].join("\n")}`;
}

export function nfseToCsv(rows: NfsePreparationRow[]): string {
  const header = ["empresa_cnpj", "empresa_nome", "data_servico", "cliente_id", "cliente_nome", "cliente_cpf_cnpj", "descricao_servico", "servicos_de_origem", "valor_servico", "agendamento_ids", "quantidade_atendimentos", "status_nfe", "observacoes"].map(csvCell).join(";");
  const lines = rows.map(row => [
    row.company.cnpj,
    row.company.name,
    new Date(row.appointment.startTime).toLocaleDateString("pt-BR"),
    row.client?.id ?? row.appointment.clientId ?? "",
    row.client?.name ?? row.appointment.clientName ?? "",
    row.client?.cpf ?? "",
    row.serviceDescription,
    row.serviceNames.join(" + "),
    money(row.serviceValue),
    row.appointmentIds.join(","),
    row.appointmentIds.length,
    row.status === "ready" ? "pronta_para_exportar" : "falta_cpf_cnpj",
    row.appointment.notes ?? "",
  ].map(csvCell).join(";"));
  return `\uFEFF${[header, ...lines].join("\n")}`;
}

export function downloadText(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
