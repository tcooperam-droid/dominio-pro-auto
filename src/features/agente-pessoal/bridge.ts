import { handleMessageV2 } from "@/lib/agentV2";
import { looksLikeSchedulerError, recordSchedulerTrace } from "@/lib/agentObservability";
import { finishAgentRun, recordAgentIncident, recordAgentToolCall, startAgentRun } from "@/lib/agentRunStore";
import type { SchedulerBridge } from "./types";

/** Adaptador único entre o agente pessoal e o agente transacional da agenda. */
export function createSchedulerBridge(): SchedulerBridge {
  return {
    handleMessage: async (message) => {
      const run = await startAgentRun({ agentName: "scheduler", request: message });
      try {
        const result = await handleMessageV2(message);
        const failed = looksLikeSchedulerError(result.text || "");
        await recordAgentToolCall({
          run,
          toolName: "scheduler.handle_message",
          arguments: { message },
          result,
          status: failed ? "error" : "success",
          errorMessage: failed ? result.text : undefined,
        });
        await finishAgentRun(run, {
          status: failed ? "error" : "success",
          output: result,
          errorCode: failed ? "SCHEDULER_RESPONSE_ERROR" : undefined,
          errorMessage: failed ? result.text : undefined,
        });
        if (failed) {
          await recordAgentIncident({
            run,
            agentName: "scheduler",
            code: "SCHEDULER_RESPONSE_ERROR",
            message: result.text,
            evidence: { request: message, response: result },
          });
        }
        recordSchedulerTrace({
          request: message,
          response: result.text || "",
          status: failed ? "error" : "success",
          error: failed ? result.text : undefined,
          phase: "handleMessageV2",
          actionExecuted: result.actionExecuted,
          messageId: result.messageId,
        });
        return result;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        await recordAgentToolCall({ run, toolName: "scheduler.handle_message", arguments: { message }, status: "error", errorMessage: detail });
        await finishAgentRun(run, { status: "error", errorCode: "SCHEDULER_UNHANDLED_ERROR", errorMessage: detail });
        await recordAgentIncident({ run, agentName: "scheduler", code: "SCHEDULER_UNHANDLED_ERROR", message: detail, evidence: { request: message } });
        recordSchedulerTrace({ request: message, response: "", status: "error", error: detail, phase: "bridge" });
        throw error;
      }
    },
  };
}
