import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";

export type ReportGranularity = "dia" | "semana" | "mes";

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function getReportRange(granularity: ReportGranularity, cursorDate: Date) {
  const base = startOfDay(cursorDate);

  if (granularity === "dia") {
    return {
      start: base,
      end: endOfDay(base),
      label: capitalize(format(base, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })),
      shortLabel: format(base, "dd/MM/yyyy"),
    };
  }

  if (granularity === "semana") {
    const start = startOfWeek(base, { weekStartsOn: 1 });
    const end = endOfWeek(base, { weekStartsOn: 1 });
    return {
      start,
      end,
      label: `${format(start, "dd/MM", { locale: ptBR })} – ${format(end, "dd/MM/yyyy", { locale: ptBR })}`,
      shortLabel: "Semana",
    };
  }

  return {
    start: startOfMonth(base),
    end: endOfMonth(base),
    label: capitalize(format(base, "MMMM 'de' yyyy", { locale: ptBR })),
    shortLabel: "Mês",
  };
}

export function shiftReportPeriod(date: Date, granularity: ReportGranularity, direction: -1 | 1) {
  if (granularity === "dia") return addDays(date, direction);
  if (granularity === "semana") return addWeeks(date, direction);
  return addMonths(date, direction);
}
