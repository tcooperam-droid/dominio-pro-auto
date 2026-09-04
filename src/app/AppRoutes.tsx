import { lazy, Suspense } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import DominioLayout from "../components/DominioLayout";
import ProfileSelector from "../components/ProfileSelector";
import { canAccess, getDefaultRoute, getSession, isAccessControlEnabled } from "../lib/access";

const NotFound = lazy(() => import("../pages/NotFound"));
const DashboardPage = lazy(() => import("../pages/DashboardPage"));
const AgendaPage = lazy(() => import("../pages/AgendaPage"));
const ClientesPage = lazy(() => import("../pages/ClientesPage"));
const FuncionariosPage = lazy(() => import("../pages/FuncionariosPage"));
const ServicosPage = lazy(() => import("../pages/ServicosPage"));
const DashboardCaixaPage = lazy(() => import("../pages/DashboardCaixaPage"));
const RelatoriosPage = lazy(() => import("../pages/RelatoriosPage"));
const BackupPage = lazy(() => import("../pages/BackupPage"));
const ConfiguracoesPage = lazy(() => import("../pages/ConfiguracoesPage"));
const FerramentasClientesPage = lazy(() => import("../pages/FerramentasClientesPage"));
const DespesasPage = lazy(() => import("../pages/DespesasPage"));
const ComissoesPage = lazy(() => import("../pages/ComissoesPage"));
const FinanceiroDashboardPage = lazy(() => import("../pages/FinanceiroDashboardPage"));
const ContabilidadePage = lazy(() => import("../pages/ContabilidadePage"));

function RouteLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center bg-background text-sm text-muted-foreground">
      Carregando módulo…
    </div>
  );
}

function ProtectedContent() {
  const [location] = useLocation();
  const accessEnabled = isAccessControlEnabled();
  const session = getSession();

  if (accessEnabled && !session) {
    return <ProfileSelector />;
  }

  if (accessEnabled && session && !canAccess(session.role, location)) {
    return <Redirect to={getDefaultRoute(session.role)} />;
  }

  return (
    <>
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>

      <DominioLayout>
        <Switch>
          <Route path="/dashboard" component={DashboardPage} />
          <Route path="/agenda" component={AgendaPage} />
          <Route path="/clientes" component={ClientesPage} />
          <Route path="/funcionarios" component={FuncionariosPage} />
          <Route path="/servicos" component={ServicosPage} />
          <Route path="/caixa">
            <Redirect to="/financeiro" />
          </Route>
          <Route path="/financeiro" component={FinanceiroDashboardPage} />
          <Route path="/despesas" component={DespesasPage} />
          <Route path="/comissoes" component={ComissoesPage} />
          <Route path="/contabilidade" component={ContabilidadePage} />
          <Route path="/dashboard-caixa" component={DashboardCaixaPage} />
          <Route path="/relatorios" component={RelatoriosPage} />
          <Route path="/backup" component={BackupPage} />
          <Route path="/configuracoes" component={ConfiguracoesPage} />
          <Route path="/ferramentas-clientes" component={FerramentasClientesPage} />
          <Route component={NotFound} />
        </Switch>
      </DominioLayout>
    </>
  );
}

/** Rotas protegidas e compatibilidades legadas do painel Domínio Pro. */
export default function AppRoutes() {
  const accessEnabled = isAccessControlEnabled();

  return (
    <Suspense fallback={<RouteLoading />}>
      <Switch>
        <Route path="/login">
          {accessEnabled ? <ProfileSelector /> : <Redirect to="/dashboard" />}
        </Route>
        <Route>
          <ProtectedContent />
        </Route>
      </Switch>
    </Suspense>
  );
}
