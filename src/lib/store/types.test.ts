import { describe, expect, it } from "vitest";
import { isTimeBlock, TIME_BLOCK_MARKER, type Appointment } from "./types";

const appointment = (notes: string | null): Appointment => ({
  id: 1,
  clientName: null,
  clientId: null,
  employeeId: 2,
  startTime: "2026-08-25T10:00:00.000Z",
  endTime: "2026-08-25T11:00:00.000Z",
  status: "scheduled",
  totalPrice: 0,
  notes,
  paymentStatus: null,
  groupId: null,
  services: [],
  createdAt: "2026-08-25T09:00:00.000Z",
});

describe("isTimeBlock", () => {
  it("reconhece uma anotação marcada como bloqueio", () => {
    expect(isTimeBlock(appointment(`${TIME_BLOCK_MARKER}: almoço`))).toBe(true);
  });

  it("não confunde observações comuns com bloqueios", () => {
    expect(isTimeBlock(appointment("Cliente pediu horário especial"))).toBe(false);
    expect(isTimeBlock(appointment(null))).toBe(false);
  });
});
