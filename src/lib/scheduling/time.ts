/** Timezone helpers — pure, Intl-based, no external deps. */
import type { LocalTime, Weekday } from "@/domain/types";

export const BUSINESS_TIMEZONE = "America/Chicago";

const WEEKDAYS: Record<string, Weekday> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};
const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export interface LocalParts {
  /** YYYY-MM-DD in the given timezone */
  date: string;
  weekday: Weekday;
  /** minutes since local midnight */
  minutes: number;
}

export function toLocalParts(ms: number, tz: string = BUSINESS_TIMEZONE): LocalParts {
  const parts: Record<string, string> = Object.fromEntries(
    formatter(tz)
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  const get = (k: string) => parts[k] ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: WEEKDAYS[get("weekday")] ?? 0,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

export function parseLocalTime(t: LocalTime): number {
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h * 60 + m;
}

export const MINUTE = 60_000;
export const toMs = (iso: string): number => Date.parse(iso);
export const toIso = (ms: number): string => new Date(ms).toISOString();
