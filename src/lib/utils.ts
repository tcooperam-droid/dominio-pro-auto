import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";
import type { Locale } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Converte qualquer valor para Date; retorna null se inválido. */
export function safeDate(v: string | number | null | undefined): Date | null {
  if (v == null || v === "") return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** Formata uma data de forma segura; retorna `fallback` se o valor for inválido. */
export function safeFmt(
  v: string | number | null | undefined,
  fmt: string,
  opts?: { locale?: Locale },
  fallback = "—",
): string {
  const d = safeDate(v);
  if (!d) return fallback;
  try { return format(d, fmt, opts); } catch { return fallback; }
}
