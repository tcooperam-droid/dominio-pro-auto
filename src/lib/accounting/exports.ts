import type { AccountingProductionRow } from "./types";

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

export function downloadText(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
