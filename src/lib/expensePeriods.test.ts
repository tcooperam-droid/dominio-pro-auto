import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { getExpenseMonthRange, shiftExpenseMonth } from "./expensePeriods";

describe("navegação mensal de despesas", () => {
  it("retorna o intervalo civil completo do mês", () => {
    const range = getExpenseMonthRange(new Date("2026-08-18T15:00:00"));

    expect(format(range.start, "yyyy-MM-dd")).toBe("2026-08-01");
    expect(format(range.end, "yyyy-MM-dd")).toBe("2026-08-31");
  });

  it("avança e retrocede exatamente um mês, inclusive na virada do ano", () => {
    const anchor = new Date("2026-12-18T15:00:00");

    expect(format(shiftExpenseMonth(anchor, 1), "yyyy-MM-dd")).toBe("2027-01-01");
    expect(format(shiftExpenseMonth(anchor, -1), "yyyy-MM-dd")).toBe("2026-11-01");
  });
});
