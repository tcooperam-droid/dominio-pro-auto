/** Regras puras de comissão, independentes de persistência ou UI. */

export type CommissionMode = "cost_first" | "commission_first";

export function calcCommission(
  amount: number,
  materialCostValue: number,
  commissionPct: number,
  mode: CommissionMode = "cost_first",
): number {
  if (mode === "commission_first") {
    return amount * (commissionPct / 100);
  }

  const base = Math.max(0, amount - materialCostValue);
  return base * (commissionPct / 100);
}
