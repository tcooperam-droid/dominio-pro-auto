import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { accountingStore } from "@/lib/accounting/store";
import { downloadText, productionToCsv } from "@/lib/accounting/exports";
import type { AccountingCompany, AccountingMembership, AccountingProductionRow } from "@/lib/accounting/types";
import { employeesStore } from "@/features/funcionarios";
import { appointmentsStore } from "@/features/agenda";
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
  const dateKey = value.includes("T") ? value.slice(0, 10) : value.slice(0, 10);
  const parsed = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("pt-BR");
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // A tela pode ser aberta antes do bootstrap global terminar. Faça a
      // hidratação explícita para que a agenda continue sendo a fonte da verdade.
      const [loadedEmployees] = await Promise.all([
        employeesStore.fetchAll(),
        appointmentsStore.fetchAll(),
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
      setCompanies(production.companies);
      setMemberships(currentMemberships);
      setRows(production.rows);
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
    if (start > end) {
      setError("A data inicial não pode ser posterior à data final.");
      return;
    }
    setAppliedStart(start);
    setAppliedEnd(end);
  };

  const summary = useMemo(() => ({
    appointments: rows.length,
    services: rows.reduce((sum, row) => sum + row.services.length, 0),
    value: rows.reduce((sum, row) => sum + row.grossValue, 0),
  }), [rows]);

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
