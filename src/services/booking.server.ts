/** Server-only booking logic shared by customer and owner flows. */
import type { Priority, Service } from "@/domain/types";
import {
  evaluateCandidate,
  findFeasibleSlots,
  isFeasible,
  zonedToUtc,
  localDate,
  BUSINESS_TIMEZONE,
} from "@/lib/scheduling";
import { technicianSummary, whyThisSlot } from "@/lib/scheduling/explain";
import { ARRIVAL_SPREAD_MINUTES, loadOps, schedulingContext, type OpsData } from "./ops.server";

export type DayPart = "morning" | "afternoon" | "anytime";
const PARTS: Record<DayPart, [string, string]> = {
  morning: ["08:00", "12:00"],
  afternoon: ["12:00", "17:00"],
  anytime: ["08:00", "17:00"],
};
const MIN = 60_000;

export interface SlotOption {
  technicianId: string;
  technicianFirstName: string;
  start: string;
  arrivalStart: string;
  arrivalEnd: string;
  reasons: string[];
}

/** Engine window for an arrival request: arrival [s, s+spread] must fit inside the asked range. */
export function engineWindow(date: string, part: DayPart, service: Service, priority: Priority, nowMs = Date.now()) {
  const [a, b] = PARTS[part];
  let start = Date.parse(zonedToUtc(date, a));
  const arrivalEnd = Date.parse(zonedToUtc(date, b));
  // Never offer a time in the past; routine bookings need at least 1h notice.
  const lead = priority === "emergency" ? 15 : 60;
  const earliest = Math.ceil((nowMs + lead * MIN) / (15 * MIN)) * 15 * MIN;
  if (start < earliest) start = earliest;
  const end = arrivalEnd + service.estimatedMinutes * MIN;
  return { windowStart: new Date(start).toISOString(), windowEnd: new Date(end).toISOString(), arrivalEnd };
}

export async function computeOptions(
  db: unknown,
  args: { serviceId: string; date: string; part: DayPart; priority: Priority; excludeAppointmentId?: string },
) {
  const dayStart = zonedToUtc(args.date, "00:00");
  const dayEnd = new Date(Date.parse(dayStart) + 36 * 3600_000).toISOString();
  const ops = await loadOps(db, dayStart, dayEnd);
  const service = ops.services.find((s) => s.id === args.serviceId);
  if (!service) throw new Error("Unknown service");
  const w = engineWindow(args.date, args.part, service, args.priority);
  if (Date.parse(w.windowStart) >= w.arrivalEnd) {
    return { ops, service, options: [] as SlotOption[], summary: [], windowStart: w.windowStart, pastWindow: true };
  }
  const ctx = schedulingContext(ops, service, w.windowStart, w.windowEnd, args.priority, {
    excludeAppointmentId: args.excludeAppointmentId,
  });
  const { feasible, evaluated } = findFeasibleSlots(ctx);
  const names = new Map(ops.technicians.map((t) => [t.id, t.fullName]));
  const seen = new Set<string>();
  const options: SlotOption[] = [];
  for (const f of feasible) {
    if (seen.has(f.start)) continue;
    seen.add(f.start);
    options.push({
      technicianId: f.technicianId,
      technicianFirstName: (names.get(f.technicianId) ?? "").split(" ")[0]!,
      start: f.start,
      arrivalStart: f.start,
      arrivalEnd: new Date(Date.parse(f.start) + ARRIVAL_SPREAD_MINUTES * MIN).toISOString(),
      reasons: whyThisSlot(names.get(f.technicianId) ?? "", service.label, ops.business.travel_minutes),
    });
    if (options.length >= 6) break;
  }
  return {
    ops,
    service,
    options,
    summary: technicianSummary(evaluated, names).map(({ name, fits, reason }) => ({ name, fits, reason })),
    windowStart: w.windowStart,
    pastWindow: false,
  };
}

/** Re-check one exact candidate right before writing. */
export function recheck(
  ops: OpsData,
  service: Service,
  technicianId: string,
  start: string,
  date: string,
  part: DayPart,
  priority: Priority,
  excludeAppointmentId?: string,
) {
  const w = engineWindow(date, part, service, priority);
  const ctx = schedulingContext(ops, service, w.windowStart, w.windowEnd, priority, { excludeAppointmentId });
  const slot = evaluateCandidate(ctx, technicianId, start);
  return { slot, ok: isFeasible(slot) };
}

export const todayLocal = () => localDate(Date.now(), BUSINESS_TIMEZONE);
