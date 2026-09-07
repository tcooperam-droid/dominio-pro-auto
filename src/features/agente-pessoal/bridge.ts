import { handleMessageV2 } from "@/lib/agentV2";
import type { SchedulerBridge } from "./types";

/** Adaptador único entre o agente pessoal e o agente transacional da agenda. */
export function createSchedulerBridge(): SchedulerBridge {
  return {
    handleMessage: async (message) => handleMessageV2(message),
  };
}
