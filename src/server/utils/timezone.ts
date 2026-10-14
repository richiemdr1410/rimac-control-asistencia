import { env } from "../config/env.js";

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:mm
  dayOfWeek: number; // 1=Lunes, 7=Domingo
}

/**
 * Convierte un timestamp UTC (ISO 8601 o Date) a los componentes desglosados
 * en la zona horaria operacional (por defecto America/Costa_Rica).
 */
export function getZonedTimeParts(dateOrIso: string | Date, timeZone: string = env.DEFAULT_TIMEZONE): ZonedParts {
  const date = typeof dateOrIso === "string" ? new Date(dateOrIso) : dateOrIso;

  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = dtf.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  const year = parseInt(partMap.year, 10);
  const month = parseInt(partMap.month, 10);
  const day = parseInt(partMap.day, 10);
  let hour = parseInt(partMap.hour, 10);
  if (hour === 24) hour = 0; // Manejo estándar 24h format
  const minute = parseInt(partMap.minute, 10);
  const second = parseInt(partMap.second, 10);

  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  // Calcular día de la semana (1 = Lunes, 7 = Domingo)
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const rawDay = utcDate.getUTCDay(); // 0 = Domingo, 1 = Lunes ... 6 = Sábado
  const dayOfWeek = rawDay === 0 ? 7 : rawDay;

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dateStr,
    timeStr,
    dayOfWeek,
  };
}

/**
 * Convierte "HH:mm" a minutos transcurridos desde medianoche (0 a 1439).
 */
export function parseHoraAMinutos(horaStr: string): number {
  const [hh, mm] = horaStr.split(":").map(Number);
  return hh * 60 + mm;
}
