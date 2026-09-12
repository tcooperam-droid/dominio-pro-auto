import { handleMessageV2 } from "@/lib/agentV2";
import { looksLikeSchedulerError, recordSchedulerTrace } from "@/lib/agentObservability";
import type { SchedulerBridge } from "./types";

/** Adaptador único entre o agente pessoal e o agente transacional da agenda. */
export function createSchedulerBridge(): SchedulerBridge {
  return {
    handleMessage: async (message) => {
      try {
        const result = await handleMessageV2(message);
        recordSchedulerTrace({
          request: message,
          response: result.text || "",
          status: looksLikeSchedulerError(result.text || "") ? "error" : "success",
          error: looksLikeSchedulerError(result.text || "") ? result.text : undefined,
          phase: "handleMessageV2",
          actionExecuted: result.actionExecuted,
          messageId: result.messageId,
        });
        return result;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        recordSchedulerTrace({
          request: message,
          response: "",
          status: "error",
          error: detail,
          phase: "bridge",
        });
        throw error;
      }
    },
  };
}
