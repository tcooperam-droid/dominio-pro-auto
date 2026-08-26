/** Utilitários determinísticos usados pelo agente ao agendar. */

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function localDateKey(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localTimeKey(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function normalizeText(value: string): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function normalizeTime(raw: string): string | null {
  if (!raw) return null;
  let value = normalizeText(raw).replace(/h/g, ":").replace(/\s+/g, "").replace(/:$/, "");
  if (/^\d{1,2}$/.test(value)) value = `${value}:00`;

  const match = value.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

function validLocalDate(year: number, month: number, day: number): string | null {
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return null;
  return localDateKey(date);
}

export function resolveDate(raw: string, now = new Date()): string | null {
  const value = normalizeText(raw);
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);

  if (!value || value === "hoje") return localDateKey(today);

  if (value === "amanha") {
    today.setDate(today.getDate() + 1);
    return localDateKey(today);
  }

  const dayMap: Record<string, number> = {
    domingo: 0,
    segunda: 1,
    "segunda-feira": 1,
    terca: 2,
    "terca-feira": 2,
    quarta: 3,
    "quarta-feira": 3,
    quinta: 4,
    "quinta-feira": 4,
    sexta: 5,
    "sexta-feira": 5,
    sabado: 6,
  };
  if (dayMap[value] !== undefined) {
    const diff = (dayMap[value] - today.getDay() + 7) % 7 || 7;
    today.setDate(today.getDate() + diff);
    return localDateKey(today);
  }

  const shortDate = value.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (shortDate) {
    const day = Number(shortDate[1]);
    const month = Number(shortDate[2]);
    const yearPart = shortDate[3];
    const year = yearPart
      ? (Number(yearPart) < 100 ? 2000 + Number(yearPart) : Number(yearPart))
      : today.getFullYear();
    return validLocalDate(year, month, day);
  }

  if (/^\d{1,2}$/.test(value)) {
    return validLocalDate(today.getFullYear(), today.getMonth() + 1, Number(value));
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return validLocalDate(year, month, day);
  }

  return null;
}

export function buildScheduleTimes(
  dateKey: string,
  timeKey: string,
  durationMinutes: number,
): { startTime: string; endTime: string } | null {
  const normalizedTime = normalizeTime(timeKey);
  if (!normalizedTime) return null;

  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = normalizedTime.split(":").map(Number);
  const start = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(start.getTime()) || localDateKey(start) !== dateKey) return null;

  const safeDuration = Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 60;
  const end = new Date(start.getTime() + safeDuration * 60_000);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

export function intervalsOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  const aStart = new Date(startA).getTime();
  const aEnd = new Date(endA).getTime();
  const bStart = new Date(startB).getTime();
  const bEnd = new Date(endB).getTime();
  if (![aStart, aEnd, bStart, bEnd].every(Number.isFinite)) return false;
  return aStart < bEnd && aEnd > bStart;
}

function normalizeReply(text: string): string {
  return normalizeText(text)
    .replace(/[.!?,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isConfirmation(text: string): boolean {
  const value = normalizeReply(text);
  return /^(sim|s|sim pode|sim pode agendar|pode|pode agendar|pode marcar|confirmo|confirmar|ok|okay|certo|isso|fechado|claro|vai|manda|pode seguir|pode fazer|agenda mesmo assim|agendar mesmo assim|forcar|forca)$/.test(value);
}

export function isCancellation(text: string): boolean {
  const value = normalizeReply(text);
  return /^(nao|n|cancelar|cancela|deixa|esquece|outro|nada)$/.test(value);
}

export function isExplicitScheduleOverride(text: string): boolean {
  const value = normalizeText(text);
  return /agenda mesmo assim|agendar mesmo assim|pode agendar fora|forcar horario|forca o horario|ignora.*horario/.test(value);
}
