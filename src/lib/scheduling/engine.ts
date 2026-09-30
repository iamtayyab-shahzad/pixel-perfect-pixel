/**
 * Smart Slot Match engine — deterministic, pure, React- and DB-free.
 *
 * Time model for a candidate job [s, e):
 *  - pre-gap  = travel minutes (getting to site) — must fit after shift start / previous commitment.
 *  - post-gap = service buffer + travel         — must fit before shift end / next commitment.
 *  - Between two jobs the gap is buffer + travel. Travel is a caller-supplied fixed gap, NOT GPS routing.
 *  - Existing appointments block windowStart → windowEnd + estimatedMinutes (the whole promise).
 */
import type {
  Appointment,
  Assignment,
  AvailabilityBlock,
  ID,
  ISODateTime,
  Priority,
  Resource,
  Service,
  Technician,
  TechnicianSkill,
  WorkingHours,
} from "@/domain/types";
import { isFeasible, type CandidateSlot, type ConstraintResult } from "./constraints";
import { BUSINESS_TIMEZONE, MINUTE, parseLocalTime, toIso, toLocalParts, toMs } from "./time";

export interface SchedulingContext {
  technicians: Technician[];
  technicianSkills: TechnicianSkill[];
  workingHours: WorkingHours[];
  availabilityBlocks: AvailabilityBlock[];
  appointments: Appointment[];
  assignments: Assignment[];
  service: Service;
  /** All services (for resource usage of existing jobs). Defaults to [service]. */
  services?: Service[];
  resources?: Resource[];
  /** Explicit skills; an empty or missing list falls back to service.requiredSkillIds. */
  requiredSkillIds?: ID[];
  durationMinutes?: number;
  bufferMinutes?: number;
  /** Deterministic travel gap between jobs, in minutes. Defaults to 0. */
  travelMinutes?: number;
  windowStart: ISODateTime;
  windowEnd: ISODateTime;
  priority: Priority;
  /** Candidate start step from windowStart. Defaults to 30. */
  slotStepMinutes?: number;
  timezone?: string;
  /** Appointment being rescheduled/reassigned — its own commitment is ignored. */
  excludeAppointmentId?: ID;
}

interface Resolved {
  requiredSkillIds: ID[];
  duration: number;
  buffer: number;
  travel: number;
  windowStart: number;
  windowEnd: number;
  tz: string;
}

const BLOCKING_ASSIGNMENT = new Set<Assignment["status"]>(["active", "swap_requested"]);
const NON_BLOCKING_APPT = new Set<Appointment["status"]>(["cancelled", "completed"]);

function resolve(ctx: SchedulingContext): Resolved {
  const explicit = ctx.requiredSkillIds?.length ? ctx.requiredSkillIds : undefined;
  return {
    requiredSkillIds: explicit ?? ctx.service.requiredSkillIds,
    duration: ctx.durationMinutes ?? ctx.service.estimatedMinutes,
    buffer: ctx.bufferMinutes ?? ctx.service.bufferMinutes,
    travel: ctx.travelMinutes ?? 0,
    windowStart: toMs(ctx.windowStart),
    windowEnd: toMs(ctx.windowEnd),
    tz: ctx.timezone ?? BUSINESS_TIMEZONE,
  };
}

/** Committed interval of an appointment: whole promised window + estimated duration. */
export function commitmentOf(appt: Pick<Appointment, "windowStart" | "windowEnd" | "estimatedMinutes">) {
  const start = toMs(appt.windowStart);
  const end = Math.max(start, toMs(appt.windowEnd)) + appt.estimatedMinutes * MINUTE;
  return { start, end };
}

function liveAppointments(ctx: SchedulingContext) {
  return ctx.appointments.filter(
    (a) => !NON_BLOCKING_APPT.has(a.status) && a.id !== ctx.excludeAppointmentId,
  );
}

function busyIntervals(ctx: SchedulingContext, technicianId: ID) {
  const apptById = new Map(liveAppointments(ctx).map((a) => [a.id, a]));
  const out: { appointmentId: ID; start: number; end: number }[] = [];
  for (const asg of ctx.assignments) {
    if (asg.technicianId !== technicianId || !BLOCKING_ASSIGNMENT.has(asg.status)) continue;
    const appt = apptById.get(asg.appointmentId);
    if (!appt) continue;
    out.push({ appointmentId: appt.id, ...commitmentOf(appt) });
  }
  return out;
}

const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE;
const fmt = (ms: number, tz: string) => {
  const m = toLocalParts(ms, tz).minutes;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Evaluate a single candidate against every required constraint. */
export function evaluateCandidate(
  ctx: SchedulingContext,
  technicianId: ID,
  start: ISODateTime,
): CandidateSlot {
  const r = resolve(ctx);
  const s = toMs(start);
  const durOk = Number.isFinite(r.duration) && r.duration > 0;
  const e = s + (durOk ? r.duration : 0) * MINUTE;
  const pre = r.travel * MINUTE;
  const post = (r.buffer + r.travel) * MINUTE;
  const results: ConstraintResult[] = [];

  // technician_eligible
  const tech = ctx.technicians.find((t) => t.id === technicianId);
  results.push({
    code: "technician_eligible",
    passed: tech?.status === "active",
    detail: !tech
      ? `Unknown technician ${technicianId}.`
      : tech.status !== "active"
        ? `${tech.fullName} is inactive.`
        : `${tech.fullName} is active.`,
  });

  // skill_match — ALL required skills; no required skills ⇒ fail (never "anyone qualifies")
  const techSkills = new Set(
    ctx.technicianSkills.filter((ts) => ts.technicianId === technicianId).map((ts) => ts.skillId),
  );
  const missing = r.requiredSkillIds.filter((id) => !techSkills.has(id));
  const noSkills = r.requiredSkillIds.length === 0;
  results.push({
    code: "skill_match",
    passed: !noSkills && missing.length === 0,
    detail: noSkills
      ? "Service defines no required skills — cannot qualify anyone."
      : missing.length
        ? `Missing required skill(s): ${missing.join(", ")}.`
        : "Has every required skill.",
  });

  // availability_block — job plus its gaps must not touch a block
  const block = ctx.availabilityBlocks.find(
    (b) => b.technicianId === technicianId && overlaps(s - pre, e + post, toMs(b.startsAt), toMs(b.endsAt)),
  );
  results.push({
    code: "availability_block",
    passed: !block,
    detail: block
      ? `Conflicts with a ${block.kind} block (incl. required gaps).`
      : "No leave, sick, unavailable or training block.",
  });

  // working_hours — start (and pre-gap) inside a shift on that local day
  const ls = toLocalParts(s, r.tz);
  const preLocal = toLocalParts(s - pre, r.tz);
  const shift = ctx.workingHours.find(
    (w) =>
      w.technicianId === technicianId &&
      w.weekday === ls.weekday &&
      preLocal.date === ls.date &&
      parseLocalTime(w.start) <= preLocal.minutes &&
      ls.minutes < parseLocalTime(w.end),
  );
  results.push({
    code: "working_hours",
    passed: !!shift,
    detail: shift
      ? `Starts within shift ${shift.start}–${shift.end}${r.travel ? ` after ${r.travel} min travel` : ""}.`
      : "Start (with travel) is outside the technician's working hours.",
  });

  // duration_fits — full duration + post buffer inside that same shift
  let durDetail: string;
  let durPass = false;
  if (!durOk) durDetail = "Service duration is invalid.";
  else if (!shift) durDetail = "No shift contains this start.";
  else {
    const endLocal = toLocalParts(e + post, r.tz);
    durPass = endLocal.date === ls.date && endLocal.minutes <= parseLocalTime(shift.end);
    durDetail = durPass
      ? `${r.duration} min + ${r.buffer + r.travel} min buffer ends by ${shift.end}.`
      : `${r.duration} min + ${r.buffer + r.travel} min buffer runs past ${shift.end}.`;
  }
  results.push({ code: "duration_fits", passed: durPass, detail: durDetail });

  // no_conflict + travel_buffer
  const busy = busyIntervals(ctx, technicianId);
  const conflict = busy.find((b) => overlaps(s, e, b.start, b.end));
  results.push({
    code: "no_conflict",
    passed: !conflict,
    detail: conflict
      ? `Overlaps the committed window of appointment ${conflict.appointmentId}.`
      : "No overlapping assigned work.",
  });
  const gap = (r.buffer + r.travel) * MINUTE;
  const tight = busy.find(
    (b) => !overlaps(s, e, b.start, b.end) && (overlaps(s - gap, s, b.start, b.end) || overlaps(e, e + gap, b.start, b.end)),
  );
  results.push({
    code: "travel_buffer",
    passed: !conflict && !tight,
    detail: conflict
      ? "Cannot leave a gap around overlapping work."
      : tight
        ? `Less than ${r.buffer + r.travel} min (buffer ${r.buffer} + travel ${r.travel}) from appointment ${tight.appointmentId}.`
        : `Leaves at least ${r.buffer + r.travel} min around other jobs.`,
  });

  // window_respected — job must start and finish inside the customer window
  const inWindow = durOk && s >= r.windowStart && e <= r.windowEnd;
  results.push({
    code: "window_respected",
    passed: inWindow,
    detail: inWindow
      ? `Inside the requested window (${fmt(r.windowStart, r.tz)}–${fmt(r.windowEnd, r.tz)}).`
      : "Outside the requested customer window.",
  });

  // resource_available
  const reqs = ctx.service.resourceRequirements;
  if (reqs.length === 0) {
    results.push({ code: "resource_available", passed: true, detail: "Service needs no shared equipment." });
  } else {
    const services = new Map((ctx.services ?? [ctx.service]).map((sv) => [sv.id, sv]));
    const short: string[] = [];
    for (const req of reqs) {
      const res = ctx.resources?.find((x) => x.id === req.resourceId);
      const total = res?.quantity ?? 0;
      let used = 0;
      for (const a of liveAppointments(ctx)) {
        const c = commitmentOf(a);
        if (!overlaps(s, e, c.start, c.end)) continue;
        used += services.get(a.serviceId)?.resourceRequirements.find((x) => x.resourceId === req.resourceId)?.quantity ?? 0;
      }
      if (used + req.quantity > total) short.push(res?.label ?? req.resourceId);
    }
    results.push({
      code: "resource_available",
      passed: short.length === 0,
      detail: short.length ? `Equipment unavailable: ${short.join(", ")}.` : "Required equipment is free.",
    });
  }

  return { technicianId, start: toIso(s), end: toIso(e), results };
}

/** Candidates start at windowStart and step forward — never snapped to a global grid. */
export function generateCandidates(ctx: SchedulingContext): CandidateSlot[] {
  const r = resolve(ctx);
  const step = (ctx.slotStepMinutes ?? 30) * MINUTE;
  if (!(r.duration > 0) || !(r.windowEnd > r.windowStart) || step <= 0) return [];
  const out: CandidateSlot[] = [];
  const techs = [...ctx.technicians].sort((a, b) => a.id.localeCompare(b.id));
  for (const t of techs) {
    for (let s = r.windowStart; s + r.duration * MINUTE <= r.windowEnd; s += step) {
      out.push(evaluateCandidate(ctx, t.id, toIso(s)));
    }
  }
  return out;
}

export interface SlotMatchResult {
  /** Feasible slots only, ordered. Empty ⇒ no feasible booking slot exists. */
  feasible: CandidateSlot[];
  /** Every evaluated candidate (feasible or not) for explanation UIs. */
  evaluated: CandidateSlot[];
}

/**
 * Ordering (feasibility is always first — infeasible slots are never returned):
 *  - emergency: earliest start, then technician id.
 *  - others:    earliest start, then primary-skill technician, then technician id.
 * Skill preference only breaks ties; it never hides an earlier slot. Priority never overrides a rule.
 */
export function findFeasibleSlots(ctx: SchedulingContext): SlotMatchResult {
  const evaluated = generateCandidates(ctx);
  const r = resolve(ctx);
  const primaryCount = new Map<ID, number>();
  for (const ts of ctx.technicianSkills)
    if (ts.level === "primary" && r.requiredSkillIds.includes(ts.skillId))
      primaryCount.set(ts.technicianId, (primaryCount.get(ts.technicianId) ?? 0) + 1);
  const feasible = evaluated.filter(isFeasible).sort((a, b) => {
    const t = a.start.localeCompare(b.start);
    if (t) return t;
    if (ctx.priority !== "emergency") {
      const p = (primaryCount.get(b.technicianId) ?? 0) - (primaryCount.get(a.technicianId) ?? 0);
      if (p) return p;
    }
    return a.technicianId.localeCompare(b.technicianId);
  });
  return { feasible, evaluated };
}
