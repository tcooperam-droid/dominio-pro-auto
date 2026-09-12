import { describe, expect, it, beforeEach } from "vitest";
import { clearSchedulerTraces, formatSchedulerTrace, recordSchedulerTrace } from "./agentObservability";

describe("observabilidade do agente de agendamento", () => {
  beforeEach(() => {
    clearSchedulerTraces();
  });

  it("preserva diálogo, resposta e erro para o diagnóstico técnico", () => {
    recordSchedulerTrace({
      request: "Agende para amanhã às 10:00",
      response: "Erro: horário fora do expediente",
      status: "error",
      error: "horário fora do expediente",
      phase: "handleMessageV2",
    });

    const context = formatSchedulerTrace();
    expect(context).toContain("Agende para amanhã às 10:00");
    expect(context).toContain("horário fora do expediente");
    expect(context).toContain("status=error");
  });

  it("limpa o histórico local sob demanda", () => {
    recordSchedulerTrace({ request: "teste", response: "ok", status: "success" });
    clearSchedulerTraces();
    expect(formatSchedulerTrace()).toContain("Nenhum diálogo");
  });
});
