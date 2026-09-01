import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { accountingStore } from "@/lib/accounting/store";
import { downloadText, nfseToCsv, productionToCsv } from "@/lib/accounting/exports";
import type { AccountingCompany, AccountingMembership, AccountingProductionRow, NfsePreparationRow } from "@/lib/accounting/types";
import { employeesStore } from "@/features/funcionarios";
import { appointmentsStore } from "@/features/agenda";
import { clientsStore } from "@/features/clientes";
import { isFinancialAppointment } from "@/lib/analytics";
import type { Employee } from "@/lib/store/types";

const INITIAL_COMPANIES = [
  { name: "Rosa de Sarom1", cnpj: "12787723000161", employees: ["Ricardo", "Bruna", "Taiane"] },
  { name: "Rosa de Sarom2", cnpj: "17711263000101", employees: ["Ariene", "Monalisa"] },
];

const isoToday = new Date().toISOString().slice(0, 10);
const firstOfAccountingPeriod = "2026-01-01";

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function matchesEmployee(employee: Employee, wantedName: string) {
  const actual = normalizeName(employee.name);
  const wanted = normalizeName(wantedName);
  return actual === wanted || actual.startsWith(`${wanted} `);
}

function formatDate(value: string) {
  const dateKey = value.slice(0, 10);
  const parsed = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("pt-BR");
}

function calendarDays(start: string, end: string) {
  const from = new Date(`${start}T12:00:00`).getTime();
  const to = new Date(`${end}T12:00:00`).getTime();
  return Math.max(1, Math.floor((to - from) / 86400000) + 1);
}

function addDays(date: string, days: number) {
  const result = new Date(`${date}T12:00:00`);
  result.setDate(result.getDate() + days);
  return result.toISOString().slice(0, 10);
}

function monthPeriod(monthKey: string, includeFuture = false) {
  const todayMonth = isoToday.slice(0, 7);
  const safeMonth = !includeFuture && monthKey > todayMonth ? todayMonth : monthKey;
  const [yearText, monthText] = safeMonth.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!year || !month || month < 1 || month > 12) return { start: firstOfAccountingPeriod, end: isoToday };
  const lastDay = new Date(year, month, 0).getDate();
  const fullEnd = `${safeMonth}-${String(lastDay).padStart(2, "0")}`;
  return { start: `${safeMonth}-01`, end: !includeFuture && safeMonth === todayMonth ? isoToday : fullEnd };
}

function shiftMonth(monthKey: string, delta: number) {
  const [yearText, monthText] = monthKey.split("-");
  const date = new Date(Number(yearText), Number(monthText) - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function projectionPeriod(month: number) {
  const start = month === 1 ? "2026-01-15" : "2026-02-01";
  const end = month === 1 ? "2026-01-31" : "2026-02-28";
  return { start, end, label: month === 1 ? "Janeiro/2026" : "Fevereiro/2026" };
}

export default function ContabilidadePage() {
  const [start, setStart] = useState(firstOfAccountingPeriod);
  const [end, setEnd] = useState(isoToday);
  const [appliedStart, setAppliedStart] = useState(firstOfAccountingPeriod);
  const [appliedEnd, setAppliedEnd] = useState(isoToday);
  const [companyId, setCompanyId] = useState("all");
  const [companies, setCompanies] = useState<AccountingCompany[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [memberships, setMemberships] = useState<AccountingMembership[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [membershipStart, setMembershipStart] = useState(firstOfAccountingPeriod);
  const [rows, setRows] = useState<AccountingProductionRow[]>([]);
  const [referenceRows, setReferenceRows] = useState<AccountingProductionRow[]>([]);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [unassignedEmployees, setUnassignedEmployees] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nfseFilter, setNfseFilter] = useState<"all" | "missing_document" | "ready">("all");
  const [selectedMonth, setSelectedMonth] = useState(firstOfAccountingPeriod.slice(0, 7));
  const [nfseGrouping, setNfseGrouping] = useState<"client_day" | "appointment">("client_day");
  const [includeFuture, setIncludeFuture] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // A tela pode ser aberta antes do bootstrap global terminar. Faça a
      // hidratação explícita para que a agenda continue sendo a fonte da verdade.
      const [loadedEmployees] = await Promise.all([
        employeesStore.fetchAll(),
        appointmentsStore.fetchAll(),
        clientsStore.fetchAll(),
      ]);
      // Vínculos históricos também precisam incluir colaboradores atualmente
      // inativos, pois o período contábil começa em janeiro de 2026.
      const currentEmployees = loadedEmployees;
      setEmployees(currentEmployees);
      let currentCompanies = await accountingStore.listCompanies();
      if (!currentCompanies.length) {
        for (const company of INITIAL_COMPANIES) {
          await accountingStore.createCompany({ name: company.name, cnpj: company.cnpj });
        }
        currentCompanies = await accountingStore.listCompanies();
      }
      // Exibe as empresas antes das etapas de vínculos e produção. Assim,
      // uma falha posterior não deixa a seção de empresas visualmente vazia.
      setCompanies(currentCompanies);
      let currentMemberships = await accountingStore.listMemberships();
      for (const company of INITIAL_COMPANIES) {
        const saved = currentCompanies.find(item => item.cnpj === company.cnpj);
        if (!saved) continue;
        for (const wantedName of company.employees) {
          const employee = currentEmployees.find(item => matchesEmployee(item, wantedName));
          if (employee && !currentMemberships.some(m => m.companyId === saved.id && m.employeeId === employee.id)) {
            await accountingStore.createMembership({ companyId: saved.id, employeeId: employee.id, validFrom: "2026-01-01" });
            currentMemberships = await accountingStore.listMemberships();
          }
        }
      }
      currentMemberships = await accountingStore.listMemberships();
      const production = await accountingStore.loadProduction(appliedStart, appliedEnd, companyId === "all" ? undefined : companyId);
      const referenceEnd = isoToday >= "2026-03-01" ? isoToday : "2026-03-01";
      const referenceProduction = await accountingStore.loadProduction("2026-03-01", referenceEnd, companyId === "all" ? undefined : companyId);
      const validAppointments = appointmentsStore.list({ startDate: appliedStart, endDate: appliedEnd }).filter(isFinancialAppointment);
      const classifiedIds = new Set(production.rows.map(row => row.appointment.id));
      const missingAppointments = validAppointments.filter(appointment => !classifiedIds.has(appointment.id));
      const employeeNames = [...new Set(missingAppointments.map(appointment => {
        const employee = currentEmployees.find(item => item.id === appointment.employeeId);
        return employee?.name ?? `ID ${appointment.employeeId}`;
      }))];
      setCompanies(production.companies);
      setMemberships(currentMemberships);
      setRows(production.rows);
      setReferenceRows(referenceProduction.rows);
      setUnassignedCount(companyId === "all" ? missingAppointments.length : 0);
      setUnassignedEmployees(companyId === "all" ? employeeNames : []);
    } catch (cause: any) {
      setError(cause?.message ?? "Não foi possível carregar o módulo contábil.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [appliedStart, appliedEnd, companyId]);

  const addMembership = async () => {
    const employeeId = Number(selectedEmployeeId);
    if (!selectedCompanyId || !employeeId || !membershipStart) {
      toast.error("Escolha a empresa, o funcionário e a data de início.");
      return;
    }
    const openMembership = memberships.find(item => item.employeeId === employeeId && !item.validUntil);
    if (openMembership) {
      toast.error("Este funcionário já possui um vínculo aberto. Encerre o vínculo atual antes de transferi-lo.");
      return;
    }
    try {
      await accountingStore.createMembership({ companyId: selectedCompanyId, employeeId, validFrom: membershipStart });
      toast.success("Vínculo contábil adicionado.");
      setSelectedEmployeeId("");
      await load();
    } catch (cause: any) {
      toast.error(cause?.message ?? "Não foi possível adicionar o vínculo.");
    }
  };

  const removeMembership = async (membership: AccountingMembership) => {
    const defaultEnd = new Date().toISOString().slice(0, 10);
    const validUntil = window.prompt("Informe a data final do vínculo (AAAA-MM-DD):", defaultEnd);
    if (!validUntil) return;
    if (validUntil < membership.validFrom) {
      toast.error("A data final não pode ser anterior à data inicial.");
      return;
    }
    try {
      await accountingStore.closeMembership(membership.id, validUntil);
      toast.success("Vínculo encerrado. O histórico anterior foi preservado.");
      await load();
    } catch (cause: any) {
      toast.error(cause?.message ?? "Não foi possível encerrar o vínculo.");
    }
  };

  const applyPeriod = () => {
    if (!start || !end) return;
    const effectiveEnd = includeFuture ? end : (end > isoToday ? isoToday : end);
    if (start > effectiveEnd) {
      setError("A data inicial não pode ser posterior ao fim permitido do período.");
      return;
    }
    setEnd(effectiveEnd);
    setAppliedStart(start);
    setAppliedEnd(effectiveEnd);
    setSelectedMonth(start.slice(0, 7));
  };

  const summary = useMemo(() => ({
    appointments: rows.length,
    services: rows.reduce((sum, row) => sum + row.services.length, 0),
    value: rows.reduce((sum, row) => sum + row.grossValue, 0),
  }), [rows]);

  const projections = useMemo(() => {
    if (!referenceRows.length) return [];
    const referenceEnd = isoToday >= "2026-03-01" ? isoToday : "2026-03-01";
    const observedDays = calendarDays("2026-03-01", referenceEnd);
    const byProfessional = new Map<string, { employee: string; company: string; appointments: number; services: number; value: number }>();
    for (const row of referenceRows) {
      const key = `${row.company.id}:${row.employee?.id ?? "unknown"}`;
      const current = byProfessional.get(key) ?? { employee: row.employee?.name ?? "Sem colaborador", company: row.company.name, appointments: 0, services: 0, value: 0 };
      current.appointments += 1;
      current.services += row.services.length;
      current.value += row.grossValue;
      byProfessional.set(key, current);
    }
    return [1, 2].map(month => {
      const period = projectionPeriod(month);
      const days = calendarDays(period.start, period.end);
      return { ...period, rows: [...byProfessional.values()].map(item => ({ ...item, appointments: Math.round(item.appointments / observedDays * days), services: Math.round(item.services / observedDays * days), value: item.value / observedDays * days })).filter(item => item.appointments > 0 || item.services > 0 || item.value > 0) };
    });
  }, [referenceRows]);

  const nfseDetailedRows = useMemo<NfsePreparationRow[]>(() => {
    const clients = clientsStore.list();
    const clientsById = new Map(clients.map(client => [client.id, client]));
    const clientsByName = new Map(clients.map(client => [normalizeName(client.name), client]));
    return rows.map(row => {
      const client = row.appointment.clientId
        ? clientsById.get(row.appointment.clientId) ?? null
        : clientsByName.get(normalizeName(row.appointment.clientName ?? "")) ?? null;
      const serviceNames = row.services.map(service => service.name).filter(Boolean);
      const serviceDescription = serviceNames.join(" + ") || "Serviço prestado";
      const serviceValue = Number(row.appointment.totalPrice ?? row.grossValue ?? 0);
      return {
        appointmentId: row.appointment.id,
        appointmentIds: [row.appointment.id],
        company: row.company,
        employee: row.employee,
        appointment: row.appointment,
        client,
        serviceDescription,
        serviceNames,
        serviceValue,
        status: client?.cpf?.replace(/\D/g, "") ? "ready" : "missing_document",
      } satisfies NfsePreparationRow;
    });
  }, [rows]);

  const nfseAllRows = useMemo<NfsePreparationRow[]>(() => {
    if (nfseGrouping === "appointment") return nfseDetailedRows;
    const grouped = new Map<string, NfsePreparationRow>();
    for (const row of nfseDetailedRows) {
      const date = row.appointment.startTime.slice(0, 10);
      const clientKey = row.client?.id ?? normalizeName(row.appointment.clientName ?? `appointment-${row.appointmentId}`);
      const key = `${row.company.id}|${date}|${clientKey}`;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, { ...row, serviceDescription: "Serviços prestados no dia" });
        continue;
      }
      existing.appointmentIds = [...existing.appointmentIds, ...row.appointmentIds];
      existing.serviceNames = [...new Set([...existing.serviceNames, ...row.serviceNames])];
      existing.serviceValue += row.serviceValue;
      if (existing.employee?.id !== row.employee?.id) existing.employee = null;
      if (existing.status === "ready" && row.status === "missing_document") existing.status = "missing_document";
    }
    return [...grouped.values()].sort((a, b) => a.appointment.startTime.localeCompare(b.appointment.startTime));
  }, [nfseDetailedRows, nfseGrouping]);

  const nfseRows = useMemo(() => nfseFilter === "all" ? nfseAllRows : nfseAllRows.filter(row => row.status === nfseFilter), [nfseAllRows, nfseFilter]);

  const applyMonth = (monthKey: string) => {
    const period = monthPeriod(monthKey, includeFuture);
    setSelectedMonth(period.start.slice(0, 7));
    setStart(period.start);
    setEnd(period.end);
    setAppliedStart(period.start);
    setAppliedEnd(period.end);
  };

  const exportNfseCsv = async () => {
    if (!nfseRows.length) return;
    downloadText(`preparacao-nfse-${appliedStart}-${appliedEnd}.csv`, nfseToCsv(nfseRows));
    const selected = companyId === "all" ? companies[0] : companies.find(company => company.id === companyId);
    if (selected) await accountingStore.recordExport({ companyId: selected.id, periodStart: appliedStart, periodEnd: appliedEnd, format: "csv", rowCount: nfseRows.length });
    toast.success("CSV da NFS-e criado", { description: "O arquivo foi baixado para conferência no outro aplicativo." });
  };

  const exportCsv = async () => {
    if (!rows.length) return;
    downloadText(`producao-prevista-${appliedStart}-${appliedEnd}.csv`, productionToCsv(rows));
    const selected = companyId === "all" ? companies[0] : companies.find(company => company.id === companyId);
    if (selected) await accountingStore.recordExport({ companyId: selected.id, periodStart: appliedStart, periodEnd: appliedEnd, format: "csv", rowCount: rows.length });
    toast.success("Exportação criada", { description: "O arquivo CSV da produção prevista foi baixado." });
  };

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <p className="text-sm font-medium text-primary">Módulo contábil</p>
          <h1 className="text-3xl font-bold tracking-tight">Produção prevista</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">A agenda é a fonte da verdade. Este módulo apenas organiza os agendamentos mantidos na agenda por empresa e colaborador, sem alterar os modelos existentes.</p>
        </header>

        {unassignedCount > 0 && <section className="rounded-xl border border-amber-400/50 bg-amber-500/10 p-4 text-sm"><p className="font-semibold text-amber-200">{unassignedCount} atendimento(s) válido(s) ainda sem vínculo contábil</p><p className="mt-1 text-amber-100/80">O Financeiro conta esses agendamentos, mas a Contabilidade só os inclui após o colaborador ser associado a uma empresa.</p>{unassignedEmployees.length > 0 && <p className="mt-2 text-xs text-amber-100/70">Colaboradores identificados: {unassignedEmployees.join(", ")}</p>}</section>}

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Agendamentos na agenda</p><p className="mt-1 text-2xl font-semibold">{summary.appointments}</p></div>
          <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Serviços previstos</p><p className="mt-1 text-2xl font-semibold">{summary.services}</p></div>
          <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Valor previsto</p><p className="mt-1 text-2xl font-semibold">{formatMoney(summary.value)}</p></div>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_2fr_auto] md:items-end">
            <label className="text-sm">Início<input type="date" value={start} onChange={event => setStart(event.currentTarget.value)} className="mt-1 block w-full rounded-md border bg-background px-3 py-2" /></label>
            <label className="text-sm">Fim<input type="date" value={end} onChange={event => setEnd(event.currentTarget.value)} className="mt-1 block w-full rounded-md border bg-background px-3 py-2" /></label>
            <label className="text-sm">Empresa<select value={companyId} onChange={event => setCompanyId(event.currentTarget.value)} className="mt-1 block w-full rounded-md border bg-background px-3 py-2"><option value="all">Todas as empresas</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name} — {company.cnpj}</option>)}</select></label>
            <div className="flex gap-2"><button onClick={applyPeriod} disabled={loading} className="rounded-md border px-4 py-2 font-medium disabled:opacity-50">Aplicar período</button><button onClick={() => void exportCsv()} disabled={!rows.length || loading} className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50">Exportar CSV</button></div>
          </div>
        </section>

        <section className="rounded-xl border border-emerald-400/40 bg-emerald-500/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-lg font-semibold">Preparar NFS-e</h2><p className="mt-1 text-sm text-muted-foreground">Fila de conferência baseada nos atendimentos válidos do período. O Domínio Pro não emite a nota automaticamente.</p></div>
            <button onClick={() => void exportNfseCsv()} disabled={!nfseRows.length || loading} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Exportar CSV NFS-e</button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">Registros no período</p><p className="mt-1 text-xl font-semibold">{nfseAllRows.length}</p></div>
            <div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">Prontos para exportar</p><p className="mt-1 text-xl font-semibold text-emerald-400">{nfseAllRows.filter(row => row.status === "ready").length}</p></div>
            <div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">Falta CPF/CNPJ</p><p className="mt-1 text-xl font-semibold text-amber-400">{nfseAllRows.filter(row => row.status === "missing_document").length}</p></div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="text-sm">Mês<input type="month" value={selectedMonth} onChange={event => applyMonth(event.currentTarget.value)} className="ml-2 rounded-md border bg-background px-3 py-2" /></label>
            <button onClick={() => applyMonth(shiftMonth(selectedMonth, -1))} className="rounded-md border px-3 py-2 text-sm">← Mês anterior</button><button onClick={() => applyMonth(shiftMonth(selectedMonth, 1))} className="rounded-md border px-3 py-2 text-sm">Próximo mês →</button>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeFuture} onChange={event => setIncludeFuture(event.currentTarget.checked)} /> Incluir futuros</label>
            <label className="text-sm">Exibir<select value={nfseFilter} onChange={event => setNfseFilter(event.currentTarget.value as typeof nfseFilter)} className="ml-2 rounded-md border bg-background px-3 py-2"><option value="all">Todos</option><option value="missing_document">Falta CPF/CNPJ</option><option value="ready">Prontos</option></select></label>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">O mês selecionado atualiza a fila e o CSV. Por padrão, a Contabilidade termina hoje; marque “Incluir futuros” somente quando quiser preparar notas de agendamentos futuros.</p>
          <div className="mt-3"><label className="text-sm">Formato da preparação<select value={nfseGrouping} onChange={event => setNfseGrouping(event.currentTarget.value as typeof nfseGrouping)} className="ml-2 rounded-md border bg-background px-3 py-2"><option value="client_day">Uma linha por cliente e dia (recomendado)</option><option value="appointment">Uma linha por atendimento</option></select></label><span className="ml-3 text-xs text-muted-foreground">No modo agrupado, todos os serviços do cliente no mesmo dia formam um único valor.</span></div>
          {nfseRows.length > 0 ? <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40"><tr><th className="px-3 py-2">Data</th><th className="px-3 py-2">Empresa</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">CPF/CNPJ</th><th className="px-3 py-2">Serviço/agrupamento</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2">Situação</th></tr></thead><tbody>{nfseRows.slice(0, 200).map(row => <tr key={`nfse-${row.appointmentId}`} className="border-t"><td className="px-3 py-2 whitespace-nowrap">{formatDate(row.appointment.startTime)}</td><td className="px-3 py-2">{row.company.name}</td><td className="px-3 py-2">{row.client?.name ?? row.appointment.clientName ?? "—"}</td><td className="px-3 py-2">{row.client?.cpf || <span className="text-amber-400">Não informado</span>}</td><td className="px-3 py-2" title={row.serviceNames.join(" + ") || "Serviço prestado"}><span>{row.serviceDescription}</span>{row.appointmentIds.length > 1 && <span className="ml-2 text-xs text-muted-foreground">({row.appointmentIds.length} atend.; {row.serviceNames.length} serviço(s) de origem)</span>}{row.appointmentIds.length === 1 && row.serviceNames.length > 1 && <span className="ml-2 text-xs text-muted-foreground">({row.serviceNames.length} serviços)</span>}</td><td className="px-3 py-2 text-right font-medium">{formatMoney(row.serviceValue)}</td><td className="px-3 py-2">{row.status === "ready" ? <span className="text-emerald-400">Pronta</span> : <span className="text-amber-400">Completar cadastro</span>}</td></tr>)}</tbody></table>{nfseRows.length > 200 && <p className="border-t p-3 text-xs text-muted-foreground">Mostrando 200 de {nfseRows.length}; o CSV contém todos os registros filtrados.</p>}</div> : <p className="mt-4 text-sm text-muted-foreground">Nenhum registro corresponde ao filtro selecionado.</p>}
        </section>

        {projections.length > 0 && <section className="rounded-xl border border-blue-400/40 bg-blue-500/5 p-4">
          <h2 className="text-lg font-semibold">Projeção provável — janeiro e fevereiro/2026</h2>
          <p className="mt-1 text-sm text-muted-foreground">Estimativa calculada pela média diária observada por profissional a partir de março. Janeiro considera somente 15 a 31/01; fevereiro considera 01 a 28/02. Estes valores não substituem os dados reais da Agenda.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">{projections.map(projection => { const total = projection.rows.reduce((sum, row) => sum + row.value, 0); const appointments = projection.rows.reduce((sum, row) => sum + row.appointments, 0); const services = projection.rows.reduce((sum, row) => sum + row.services, 0); return <div key={projection.label} className="rounded-lg border bg-card p-4"><div className="flex items-center justify-between"><h3 className="font-medium">{projection.label}</h3><span className="rounded-full bg-blue-500/15 px-2 py-1 text-xs text-blue-300">Estimativa</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-sm"><div><p className="text-muted-foreground">Atend.</p><p className="font-semibold">{appointments}</p></div><div><p className="text-muted-foreground">Serviços</p><p className="font-semibold">{services}</p></div><div><p className="text-muted-foreground">Valor</p><p className="font-semibold">{formatMoney(total)}</p></div></div><div className="mt-4 space-y-2">{projection.rows.map(row => <div key={`${projection.label}-${row.company}-${row.employee}`} className="flex items-center justify-between gap-3 border-t pt-2 text-sm"><div><p className="font-medium">{row.employee}</p><p className="text-xs text-muted-foreground">{row.company}</p></div><div className="text-right"><p>{row.appointments} atend. · {row.services} serv.</p><p className="font-medium">{formatMoney(row.value)}</p></div></div>)}</div></div>; })}</div>
        </section>}

        <section className="rounded-xl border bg-card p-4">
          <h2 className="text-lg font-semibold">Empresas e vínculos contábeis</h2>
          <p className="mt-1 text-sm text-muted-foreground">Adicione ou encerre vínculos aqui. Isso não exclui funcionários nem altera agendamentos.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_180px_auto] md:items-end">
            <label className="text-sm">Empresa<select value={selectedCompanyId} onChange={event => setSelectedCompanyId(event.currentTarget.value)} className="mt-1 block w-full rounded-md border bg-background px-3 py-2"><option value="">Escolher empresa</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
            <label className="text-sm">Funcionário<select value={selectedEmployeeId} onChange={event => setSelectedEmployeeId(event.currentTarget.value)} className="mt-1 block w-full rounded-md border bg-background px-3 py-2"><option value="">Escolher funcionário</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
            <label className="text-sm">Início do vínculo<input type="date" value={membershipStart} onChange={event => setMembershipStart(event.currentTarget.value)} className="mt-1 block w-full rounded-md border bg-background px-3 py-2" /></label>
            <button onClick={() => void addMembership()} className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground">Adicionar vínculo</button>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">{companies.map(company => <div key={company.id} className="rounded-lg border p-3"><p className="font-medium">{company.name}</p><p className="text-sm text-muted-foreground">CNPJ: {company.cnpj}</p><div className="mt-3 space-y-2">{memberships.filter(membership => membership.companyId === company.id).map(membership => { const employee = employees.find(item => item.id === membership.employeeId); return <div key={membership.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/30 px-3 py-2 text-sm"><div><p className="font-medium">{employee?.name ?? `Funcionário #${membership.employeeId}`}</p><p className="text-xs text-muted-foreground">Desde {formatDate(membership.validFrom)}{membership.validUntil ? ` até ${formatDate(membership.validUntil)}` : " · ativo"}</p></div>{!membership.validUntil && <button onClick={() => void removeMembership(membership)} className="rounded-md border px-2 py-1 text-xs text-destructive">Remover vínculo</button>}</div>; })}</div></div>)}</div>
        </section>

        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b p-4"><h2 className="text-lg font-semibold">Detalhamento da produção prevista</h2><p className="text-sm text-muted-foreground">Agendamentos passados e futuros são exibidos enquanto permanecerem na agenda.</p></div>
          {loading ? <div className="p-6 text-sm text-muted-foreground">Carregando produção prevista…</div> : error ? <div className="p-6 text-sm text-destructive">{error}</div> : !rows.length ? <div className="p-6 text-sm text-muted-foreground">Nenhum agendamento encontrado no período.</div> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Empresa</th><th className="px-4 py-3">Colaborador</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Serviços</th><th className="px-4 py-3 text-right">Valor previsto</th></tr></thead><tbody>{rows.map(row => <tr key={row.appointment.id} className="border-t"><td className="px-4 py-3">{formatDate(row.appointment.startTime)}</td><td className="px-4 py-3">{row.company.name}</td><td className="px-4 py-3">{row.employee?.name ?? "—"}</td><td className="px-4 py-3">{row.appointment.clientName ?? "—"}</td><td className="px-4 py-3">{row.services.map(service => service.name).join(", ") || "—"}</td><td className="px-4 py-3 text-right font-medium">{formatMoney(row.grossValue)}</td></tr>)}</tbody></table></div>}
        </section>
      </div>
    </main>
  );
}
