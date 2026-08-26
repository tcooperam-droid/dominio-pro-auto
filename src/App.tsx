import ErrorBoundary from "./components/ErrorBoundary";
import AppShell from "./app/AppShell";

/** Ponto de entrada da aplicação e última barreira contra erros de renderização. */
export default function App() {
  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}
