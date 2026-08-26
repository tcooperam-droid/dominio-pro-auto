import { describe, expect, it } from "vitest";
import { calcCommission } from "./commission";

describe("calcCommission", () => {
  it("desconta o custo antes da comissão no modo cost_first", () => {
    expect(calcCommission(200, 50, 10, "cost_first")).toBe(15);
  });

  it("calcula a comissão sobre o valor bruto no modo commission_first", () => {
    expect(calcCommission(200, 50, 10, "commission_first")).toBe(20);
  });

  it("não permite base negativa quando o custo supera o valor", () => {
    expect(calcCommission(40, 50, 50, "cost_first")).toBe(0);
  });

  it("usa cost_first como padrão para dados antigos", () => {
    expect(calcCommission(100, 20, 10)).toBe(8);
  });
});
