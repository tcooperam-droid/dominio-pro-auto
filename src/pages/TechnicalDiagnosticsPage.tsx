import { useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, Code2, Play, RefreshCw, ShieldCheck } from "lucide-react";
import { buildAppContext } from "@/features/agente-pessoal/appContext";
import { createAuthenticatedAgentHeaders } from "@/features/assistente/llmEndpoint";
import { captureVisibleScreen } from "@/lib/screenCapture";
import { collectDiagnosticSnapshot, findLocalDivergences, formatDiagnosticContext, refreshDiagnosticSnapshot, runScheduleScenario, type DiagnosticFinding, type ScheduleScenarioResult } from "@/lib/agentDiagnostics";

export default function TechnicalDiagnosticsPage() {
  const [findings, setFindings] = useState<DiagnosticFinding[]>([]);
  const [tests, setTests] = useState<ScheduleScenarioResult[]>([]);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [technicalReport, setTechnicalReport] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Pronto para investigar.");

  async function scanScreen() {
    setBusy(true);
    setStatus("Coletando tela e comparando dados carregados...");
    try {
      const snapshot = await refreshDiagnosticSnapshot();
      setFindings(findLocalDivergences(snapshot));
      setScreenshot(await captureVisibleScreen());
      setStatus("Diagnóstico local concluído. A imagem não foi enviada automaticamente.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao capturar a tela.");
    } finally {
      setBusy(false);
    }
  }

  function runTests() {
    const scenarios = ["invalid_time", "conflict_same_employee", "no_conflict_other_employee", "outside_working_hours"] as const;
    setTests(scenarios.map((scenario) => runScheduleScenario({ scenario })));
    setStatus("Testes determinísticos concluídos sem alterar registros.");
  }

  async function requestReport(mode: "diagnose" | "patch") {
    setBusy(true);
    setStatus(mode === "patch" ? "Gerando sugestão de patch somente leitura..." : "Consultando o agente técnico...");
    try {
      const snapshot = await refreshDiagnosticSnapshot();
      const localFindings = findLocalDivergences(snapshot);
      const screenImage = screenshot || await captureVisibleScreen();
      const question = mode === "patch"
        ? "Com base no diagnóstico, produza uma sugestão de patch em formato diff unificado. Não aplique alterações. Separe arquivos, riscos e testes."
        : "Faça um diagnóstico técnico das divergências entre tela, dados carregados, regras de agenda e código. Separe fatos, hipóteses, riscos e testes.";
      const endpoint = "/api/technical-agent";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: await createAuthenticatedAgentHeaders(endpoint),
        body: JSON.stringify({ question, appContext: `${buildAppContext()}\n\n${formatDiagnosticContext(snapshot, localFindings)}`, screenImage, messages: [] }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`);
      setTechnicalReport(payload?.choices?.[0]?.message?.content || "O agente técnico não retornou relatório.");
      setStatus(mode === "patch" ? "Sugestão gerada. Nenhuma alteração foi aplicada." : "Relatório técnico atualizado.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao consultar o agente técnico.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container py-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Agente técnico</p>
          <h1 className="text-3xl font-bold tracking-tight">Painel de diagnóstico</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">Investigue divergências entre tela, dados e regras. O painel é somente leitura e nunca aplica patches automaticamente.</p>
        </div>
        <div className="rounded-xl border px-4 py-3 text-sm text-muted-foreground"><ShieldCheck className="mr-2 inline h-4 w-4" />Modo seguro</div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" disabled={busy} onClick={() => void scanScreen()}><Camera className="mr-2 inline h-4 w-4" />Capturar e analisar tela</button>
        <button className="rounded-lg border px-4 py-2 disabled:opacity-50" disabled={busy} onClick={runTests}><Play className="mr-2 inline h-4 w-4" />Executar testes de agenda</button>
        <button className="rounded-lg border px-4 py-2 disabled:opacity-50" disabled={busy} onClick={() => void requestReport("diagnose")}><RefreshCw className="mr-2 inline h-4 w-4" />Pedir diagnóstico técnico</button>
        <button className="rounded-lg border px-4 py-2 disabled:opacity-50" disabled={busy} onClick={() => void requestReport("patch")}><Code2 className="mr-2 inline h-4 w-4" />Sugerir patch</button>
      </div>
      <p className="text-sm text-muted-foreground">{status}</p>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="mb-4 text-lg font-semibold">Divergências locais ({findings.length})</h2>
          {findings.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum achado determinístico nesta coleta.</p> : <div className="space-y-3">{findings.map((finding) => <div key={finding.id} className="rounded-xl border p-3"><div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4 text-amber-500" />{finding.title}<span className="text-xs text-muted-foreground">{finding.severity}</span></div><p className="mt-1 text-sm text-muted-foreground">{finding.description}</p><p className="mt-2 text-xs">Evidências: {finding.evidence.join(" | ")}</p><p className="mt-2 text-xs text-muted-foreground">Recomendação: {finding.recommendedFix}</p></div>)}</div>}
        </section>

        <section className="rounded-2xl border bg-card p-5">
          <h2 className="mb-4 text-lg font-semibold">Testes de horários e conflitos ({tests.length})</h2>
          {tests.length === 0 ? <p className="text-sm text-muted-foreground">Execute os cenários para validar as regras sem criar ou alterar agendamentos.</p> : <div className="space-y-2">{tests.map((test) => <div key={test.scenario} className="flex items-start gap-2 rounded-xl border p-3"><CheckCircle2 className={`mt-0.5 h-4 w-4 ${test.passed ? "text-emerald-500" : "text-red-500"}`} /><div><p className="font-medium">{test.scenario}: {test.passed ? "passou" : "falhou"}</p><p className="text-xs text-muted-foreground">Esperado: {test.expected}. Atual: {test.actual}.</p></div></div>)}</div>}
        </section>
      </div>

      {screenshot && <section className="rounded-2xl border bg-card p-5"><h2 className="mb-3 text-lg font-semibold">Captura visual da tela atual</h2><img src={screenshot} alt="Captura visual da tela atual" className="max-h-[520px] w-full rounded-xl border object-contain" /></section>}
      {technicalReport && <section className="rounded-2xl border bg-card p-5"><h2 className="mb-3 text-lg font-semibold">Relatório do agente técnico</h2><pre className="max-h-[620px] overflow-auto whitespace-pre-wrap rounded-xl bg-muted p-4 text-sm">{technicalReport}</pre></section>}
    </div>
  );
}
