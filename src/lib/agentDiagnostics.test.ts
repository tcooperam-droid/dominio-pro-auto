import { describe, expect, it } from "vitest";
import { intervalsOverlap } from "./agentSchedule";
import { findLocalDivergences } from "./agentDiagnostics";

describe("agentDiagnostics", () => {
  it("detecta intervalos sobrepostos", () => {
    expect(intervalsOverlap("2026-09-12T10:00:00.000Z", "2026-09-12T11:00:00.000Z", "2026-09-12T10:30:00.000Z", "2026-09-12T11:30:00.000Z")).toBe(true);
  });

  it("detecta divergência textual entre tela e cache", () => {
    const findings = findLocalDivergences({
      capturedAt: new Date().toISOString(),
      route: "/agenda",
      screenText: "nenhum agendamento",
      appointments: [{ id: 1, clientName: "Ana", clientId: 1, employeeId: 2, startTime: "2026-09-12T10:00:00.000Z", endTime: "2026-09-12T11:00:00.000Z", status: "scheduled", totalPrice: 10, notes: null, paymentStatus: null, groupId: null, services: [], createdAt: "2026-09-01" }],
      counts: { clients: 1, employees: 1, services: 1, appointments: 1 },
    });
    expect(findings.some((finding) => finding.id === "screen-data-mismatch")).toBe(true);
  });
});
