import { useEffect } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "../components/ui/tooltip";
import { ThemeProvider } from "../contexts/ThemeContext";
import AgentChat from "../components/AgentChat";
import AppRoutes from "./AppRoutes";
import { subscribeToAgentConfig } from "./agentBootstrap";
import { fetchAllData } from "../features/agenda";

function useApplicationBootstrap(): void {
  useEffect(() => {
    fetchAllData().catch((error) => {
      console.warn("[App] fetchAllData falhou — agente usará busca direta:", error);
    });
  }, []);

  useEffect(() => subscribeToAgentConfig(), []);
}

/** Composição global da experiência, sem regras específicas de uma página. */
export default function AppShell() {
  useApplicationBootstrap();

  return (
    <ThemeProvider>
      <TooltipProvider>
        <Toaster position="top-center" richColors closeButton />
        <AppRoutes />
        <AgentChat />
      </TooltipProvider>
    </ThemeProvider>
  );
}
