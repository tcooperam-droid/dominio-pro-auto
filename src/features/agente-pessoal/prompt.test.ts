import { describe, expect, it } from "vitest";
import { extractFactCommand, extractGoalCommand, extractTeachingInstruction, isSchedulerRequest } from "./prompt";


describe("agente pessoal: comandos e roteamento", () => {
  it("detecta instrução explícita sem confundir conversa comum", () => {
    expect(extractTeachingInstruction("Lembra que eu prefiro respostas objetivas")).toBe("Lembra que eu prefiro respostas objetivas");
    expect(extractTeachingInstruction("Como posso organizar minha semana?")).toBeNull();
  });

  it("detecta fatos e objetivos em português", () => {
    expect(extractFactCommand("Meu nome é Ricardo")).toEqual({ key: "nome", value: "Ricardo" });
    expect(extractGoalCommand("Meu objetivo é estudar marketing")).toEqual({ action: "add", title: "estudar marketing" });
    expect(extractGoalCommand("Concluí o objetivo de estudar marketing")).toEqual({ action: "complete", title: "estudar marketing" });
  });

  it("encaminha operações da agenda, mas não ideias sobre planejamento", () => {
    expect(isSchedulerRequest("Quais agendamentos temos hoje?")).toBe(true);
    expect(isSchedulerRequest("Cancelar o agendamento da Maria")).toBe(true);
    expect(isSchedulerRequest("Como organizar melhor minha agenda pessoal?")).toBe(false);
    expect(isSchedulerRequest("Me dê uma ideia de agenda semanal")).toBe(false);
  });
});
