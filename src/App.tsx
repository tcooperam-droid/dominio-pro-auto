import ErrorBoundary from "./components/ErrorBoundary";
import AppShell from "./app/AppShell";
import AuthGate from "./components/AuthGate";

/** Ponto de entrada da aplicação e última barreira contra erros de renderização. */
export default function App() {
  return (
    <ErrorBoundary>
      <AuthGate>
        <AppShell />
      </AuthGate>
    </ErrorBoundary>
  );
}
