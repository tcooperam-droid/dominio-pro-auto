import { initAgentV2 } from "../lib/agentV2";
import { initPersonalAgent } from "../features/agente-pessoal";

const DEFAULT_SALON_NAME = "Domínio Pro";
const DEFAULT_MODEL = "gpt-5-mini";

interface SalonConfig {
  salonName?: string;
  llmToken?: string;
  githubToken?: string;
}

function readSalonConfig(): SalonConfig {
  try {
    const saved = localStorage.getItem("salon_config");
    return saved ? (JSON.parse(saved) as SalonConfig) : {};
  } catch {
    return {};
  }
}

/** Inicializa o agente com configuração de ambiente e preferências do salão. */
export function initializeAgent(): void {
  try {
    const config = readSalonConfig();
    const salonName = config.salonName || DEFAULT_SALON_NAME;
    const apiToken = config.llmToken || config.githubToken ||
      (import.meta.env.VITE_LLM_API_KEY as string) ||
      (import.meta.env.VITE_GITHUB_TOKEN as string) || "";

    initAgentV2({
      apiToken,
      model: DEFAULT_MODEL,
      salonName,
      businessContext: `${salonName} — Sistema de gestão para salões e barbearias.`,
    });

    initPersonalAgent({
      apiToken,
      model: DEFAULT_MODEL,
      salonName,
      userName: "Ricardo",
    });

    console.info("[App] Agente IA v2 inicializado.");
  } catch (error) {
    console.error("Erro ao inicializar Agente IA:", error);
  }
}

/** Registra a reação à atualização das configurações e devolve o cleanup. */
export function subscribeToAgentConfig(): () => void {
  initializeAgent();
  window.addEventListener("salon_config_updated", initializeAgent);
  return () => window.removeEventListener("salon_config_updated", initializeAgent);
}
