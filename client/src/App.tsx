import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DominioLayout from "./components/DominioLayout";
import DashboardPage from "./pages/DashboardPage";
import AgendaPage from "./pages/AgendaPage";
import ClientesPage from "./pages/ClientesPage";
import FuncionariosPage from "./pages/FuncionariosPage";
import ServicosPage from "./pages/ServicosPage";
import CaixaPage from "./pages/CaixaPage";
import DashboardCaixaPage from "./pages/DashboardCaixaPage";
import RelatoriosPage from "./pages/RelatoriosPage";
import HistoricoPage from "./pages/HistoricoPage";
import HistoricoAgendamentosPage from "./pages/HistoricoAgendamentosPage";
import BackupPage from "./pages/BackupPage";
import ConfiguracoesPage from "./pages/ConfiguracoesPage";
import FerramentasClientesPage from "./pages/FerramentasClientesPage";
import { useState, useEffect } from "react";
import { getSession, getDefaultRoute, type Session } from "./lib/access";
import ProfileSelector from "./components/ProfileSelector";
import AgentChat from "./components/AgentChat";

import { fetchAllData } from "./lib/store";

// --- IMPORTAÇÃO DO AGENTE ---
import { initAgentV2 } from "./lib/agentV2";

function getAccent() {
  try {
    const s = localStorage.getItem("salon_config");
    if (s) return JSON.parse(s).accentColor || "#ec4899";
  } catch { /* ignore */ }
  return "#ec4899";
}

function AppContent() {
  const [, setLocation] = useLocation();
  const [session, setSession] = useState(getSession);

  // ── CARREGAR DADOS DO SISTEMA AO INICIAR ──
  useEffect(() => {
    // Tenta carregar todos os dados. Se falhar (ex: rede instável), o agente
    // vai buscar diretamente no Supabase via ensureLoaded() quando precisar.
    fetchAllData().catch(err => {
      console.warn("[App] fetchAllData falhou — agente usará busca direta:", err);
    });
  }, []);

  // ── INICIALIZAÇÃO DO AGENTE IA v2 ──
  useEffect(() => {
    const isLocalhost =
      typeof window !== "undefined" &&
      ["localhost", "127.0.0.1"].includes(window.location.hostname);

    // Em produção (Vercel), o proxy /api/llm já tem o token via env var.
    // Só precisa de token local do navegador em desenvolvimento (localhost).
    let token = localStorage.getItem("github_token") || "";
    if (!token && isLocalhost) {
      token = window.prompt(
        "Configure seu GitHub Token para ativar o Agente IA (apenas desenvolvimento local):\n" +
        "Acesse: github.com/settings/tokens → Fine-grained → Models: Read"
      ) || "";
      if (token.trim()) {
        localStorage.setItem("github_token", token.trim());
        token = token.trim();
      }
    }

    // Em produção sem token local, usar "proxy" como sentinel
    if (!token && !isLocalhost) {
      token = "proxy";
    }

    if (!token) return;

    try {
      let salonName = "Domínio Pro";
      try {
        const cfg = localStorage.getItem("salon_config");
        if (cfg) salonName = JSON.parse(cfg).salonName || salonName;
      } catch {}

      initAgentV2({
        apiToken: token,
        model: "openai/gpt-4o-mini",
        salonName,
        businessContext: `${salonName} — Sistema de gestão para salões e barbearias.`,
      });
    } catch (err) {
      console.error("Erro ao inicializar Agente IA:", err);
    }
  }, []);

  return (
    <ThemeProvider>
      <TooltipProvider>
        <Toaster position="top-center" richColors closeButton />
        <Switch>
          <Route path="/login">
            <ProfileSelector onSelect={(p) => {
              setSession(p);
              setLocation(getDefaultRoute(p.role));
            }} />
          </Route>
          
          <Route path="/">
            {!session ? <Redirect to="/login" /> : <Redirect to={getDefaultRoute(session.role)} />}
          </Route>

          <DominioLayout>
            <Switch>
              <Route path="/dashboard" component={DashboardPage} />
              <Route path="/agenda" component={AgendaPage} />
              <Route path="/clientes" component={ClientesPage} />
              <Route path="/funcionarios" component={FuncionariosPage} />
              <Route path="/servicos" component={ServicosPage} />
              <Route path="/caixa" component={CaixaPage} />
              <Route path="/dashboard-caixa" component={DashboardCaixaPage} />
              <Route path="/relatorios" component={RelatoriosPage} />
              <Route path="/historico" component={HistoricoPage} />
              <Route path="/historico-agendamentos" component={HistoricoAgendamentosPage} />
              <Route path="/backup" component={BackupPage} />
              <Route path="/configuracoes" component={ConfiguracoesPage} />
              <Route path="/ferramentas-clientes" component={FerramentasClientesPage} />
              <Route component={NotFound} />
            </Switch>
          </DominioLayout>
        </Switch>
        <AgentChat />
      </TooltipProvider>
    </ThemeProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

export default App;
