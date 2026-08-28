import { addMonths, endOfMonth, startOfMonth } from "date-fns";

export function getExpenseMonthRange(anchor: Date) {
  const start = startOfMonth(anchor);
  return {
    start,
    end: endOfMonth(start),
  };
}

export function shiftExpenseMonth(anchor: Date, amount: number) {
  return startOfMonth(addMonths(anchor, amount));
}
