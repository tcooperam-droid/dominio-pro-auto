import { describe, expect, it } from "vitest";
import {
  buildScheduleTimes,
  intervalsOverlap,
  isCancellation,
  isConfirmation,
  isExplicitScheduleOverride,
  localDateKey,
  localTimeKey,
  normalizeTime,
  resolveDate,
} from "./agentSchedule";

describe("agentSchedule", () => {
  const now = new Date(2026, 7, 26, 15, 0, 0);

  it("normaliza horas com formatos comuns em português", () => {
    expect(normalizeTime("9h5")).toBe("09:05");
    expect(normalizeTime("14")).toBe("14:00");
    expect(normalizeTime("23:59")).toBe("23:59");
    expect(normalizeTime("24:00")).toBeNull();
  });

  it("resolve hoje, amanhã, dia da semana e datas brasileiras", () => {
    expect(resolveDate("hoje", now)).toBe("2026-08-26");
    expect(resolveDate("amanhã", now)).toBe("2026-08-27");
    expect(resolveDate("quarta-feira", now)).toBe("2026-09-02");
    expect(resolveDate("27/08/2026", now)).toBe("2026-08-27");
    expect(resolveDate("31/02/2026", now)).toBeNull();
    expect(resolveDate("data desconhecida", now)).toBeNull();
  });

  it("preserva a data e hora local ao construir o instante", () => {
    const result = buildScheduleTimes("2026-08-26", "21:30", 90);
    expect(result).not.toBeNull();
    expect(localDateKey(result!.startTime)).toBe("2026-08-26");
    expect(localTimeKey(result!.startTime)).toBe("21:30");
    expect(localDateKey(result!.endTime)).toBe("2026-08-26");
    expect(localTimeKey(result!.endTime)).toBe("23:00");
  });

  it("detecta sobreposição somente quando os intervalos cruzam", () => {
    expect(intervalsOverlap("2026-08-26T10:00:00", "2026-08-26T11:00:00", "2026-08-26T10:30:00", "2026-08-26T11:30:00")).toBe(true);
    expect(intervalsOverlap("2026-08-26T10:00:00", "2026-08-26T11:00:00", "2026-08-26T11:00:00", "2026-08-26T12:00:00")).toBe(false);
  });

  it("aceita somente confirmações curtas e explícitas", () => {
    expect(isConfirmation("sim")).toBe(true);
    expect(isConfirmation("sim, pode agendar.")).toBe(true);
    expect(isConfirmation("pode fazer")).toBe(true);
    expect(isConfirmation("talvez amanhã")).toBe(false);
    expect(isCancellation("não")).toBe(true);
    expect(isCancellation("não agora, talvez depois")).toBe(false);
  });

  it("exige a frase explícita para ignorar o expediente", () => {
    expect(isExplicitScheduleOverride("agenda mesmo assim")).toBe(true);
    expect(isExplicitScheduleOverride("pode agendar fora do horário")).toBe(true);
    expect(isExplicitScheduleOverride("sim")).toBe(false);
  });
});
