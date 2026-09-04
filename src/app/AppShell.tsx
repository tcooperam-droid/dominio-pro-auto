import { useCallback, useEffect, useState } from "react";
import { Toaster } from "sonner";
import { AlertCircle, RefreshCw } from "lucide-react";
import { TooltipProvider } from "../components/ui/tooltip";
import { ThemeProvider } from "../contexts/ThemeContext";
import AgentChat from "../components/AgentChat";
import AppRoutes from "./AppRoutes";
import { subscribeToAgentConfig } from "./agentBootstrap";
import { fetchAllData } from "../features/agenda";
import { getSession, isAccessControlEnabled } from "../lib/access";

interface BootstrapState {
  loading: boolean;
  failed: string[];
  error: string | null;
}

function useApplicationBootstrap(): {
  bootstrap: BootstrapState;
  retry: () => void;
} {
  const canBootstrap = () => !isAccessControlEnabled() || Boolean(getSession());
  const [bootstrap, setBootstrap] = useState<BootstrapState>({
    loading: canBootstrap(),
    failed: [],
    error: null,
  });

  const load = useCallback(async (force = false) => {
    setBootstrap(current => ({ ...current, loading: true, error: null }));

    try {
      const result = await fetchAllData({ force });
      setBootstrap({ loading: false, failed: result.failed, error: null });
    } catch (error) {
      console.warn("[App] fetchAllData falhou:", error);
      setBootstrap({
        loading: false,
        failed: [],
        error: "Não foi possível carregar os dados do Supabase.",
      });
    }
  }, []);

  useEffect(() => {
    const syncBootstrapWithSession = () => {
      if (canBootstrap()) {
        void load();
      } else {
        setBootstrap({ loading: false, failed: [], error: null });
      }
    };

    syncBootstrapWithSession();
    window.addEventListener("dominio_session_changed", syncBootstrapWithSession);
    return () => window.removeEventListener("dominio_session_changed", syncBootstrapWithSession);
  }, [load]);

  useEffect(() => subscribeToAgentConfig(), []);

  return { bootstrap, retry: () => void load(true) };
}

function BootstrapNotice({ state, onRetry }: { state: BootstrapState; onRetry: () => void }) {
  if (state.loading || (!state.error && state.failed.length === 0)) return null;

  const message = state.error
    ?? `Alguns dados não carregaram: ${state.failed.join(", ")}.`;

  return (
    <div className="fixed left-1/2 top-3 z-[100] flex w-[min(92vw,760px)] -translate-x-1/2 items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-950/95 px-4 py-3 text-sm text-amber-50 shadow-2xl backdrop-blur">
      <AlertCircle className="size-5 shrink-0 text-amber-300" aria-hidden="true" />
      <span className="min-w-0 flex-1">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-amber-300 px-3 py-2 font-semibold text-amber-950 transition hover:bg-amber-200"
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        Tentar novamente
      </button>
    </div>
  );
}

/** Composição global da experiência, sem regras específicas de uma página. */
export default function AppShell() {
  const { bootstrap, retry } = useApplicationBootstrap();

  return (
    <ThemeProvider>
      <TooltipProvider>
        <Toaster position="top-center" richColors closeButton />
        <BootstrapNotice state={bootstrap} onRetry={retry} />
        <AppRoutes />
        <AgentChat />
      </TooltipProvider>
    </ThemeProvider>
  );
}
