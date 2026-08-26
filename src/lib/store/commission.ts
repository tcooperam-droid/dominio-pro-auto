/** Regras puras de comissão, independentes de persistência ou UI. */

export type CommissionMode = "cost_first";

/** Regra oficial: o material é compartilhado antes da comissão. */
export function calcCommission(
  amount: number,
  materialCostValue: number,
  commissionPct: number,
  _mode: CommissionMode = "cost_first",
): number {
  const base = Math.max(0, amount - materialCostValue);
  return base * (commissionPct / 100);
}
