/**
 * Smart Slot Match engine — deterministic, pure, React- and DB-free.
 * Travel is NOT routed: it is a caller-supplied fixed gap added to the service buffer.
 */
import type {
  Appointment,
  Assignment,
  AvailabilityBlock,
  ID,
  ISODateTime,
  Priority,
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
  /** Defaults to [service.requiredSkillId]. */
  requiredSkillIds?: ID[];
  /** Defaults to service.estimatedMinutes. */
  durationMinutes?: number;
  /** Defaults to service.bufferMinutes. */
  bufferMinutes?: number;
  /** Deterministic travel gap between jobs, in minutes. Defaults to 0. */
  travelMinutes?: number;
  windowStart: ISODateTime;
  windowEnd: ISODateTime;
  priority: Priority;
  /** Candidate start step. Defaults to 30. */
  slotStepMinutes?: number;
  timezone?: string;
}

interface Resolved {
  requiredSkillIds: ID[];
  duration: number;
  gap: number;
  buffer: number;
  travel: number;
  windowStart: number;
  windowEnd: number;
  tz: string;
}

const BLOCKING_ASSIGNMENT = new Set<Assignment["status"]>(["active", "swap_requested"]);
const NON_BLOCKING_APPT = new Set<Appointment["status"]>(["cancelled", "completed"]);

function resolve(ctx: SchedulingContext): Resolved {
  const buffer = ctx.bufferMinutes ?? ctx.service.bufferMinutes;
  const travel = ctx.travelMinutes ?? 0;
  return {
    requiredSkillIds: ctx.requiredSkillIds ?? [ctx.service.requiredSkillId],
    duration: ctx.durationMinutes ?? ctx.service.estimatedMinutes,
    buffer,
    travel,
    gap: buffer + travel,
    windowStart: toMs(ctx.windowStart),
    windowEnd: toMs(ctx.windowEnd),
    tz: ctx.timezone ?? BUSINESS_TIMEZONE,
  };
}

/** Busy intervals [start, end) for a technician from blocking assignments. */
function busyIntervals(ctx: SchedulingContext, technicianId: ID) {
  const apptById = new Map(ctx.appointments.map((a) => [a.id, a]));
  const out: { appointmentId: ID; start: number; end: number }[] = [];
  for (const asg of ctx.assignments) {
    if (asg.technicianId !== technicianId || !BLOCKING_ASSIGNMENT.has(asg.status)) continue;
    const appt = apptById.get(asg.appointmentId);
    if (!appt || NON_BLOCKING_APPT.has(appt.status)) continue;
    const start = toMs(appt.windowStart);
    out.push({ appointmentId: appt.id, start, end: start + appt.estimatedMinutes * MINUTE });
  }
  return out;
}

const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE;

/** Evaluate a single candidate against every required constraint. */
export function evaluateCandidate(
  ctx: SchedulingContext,
  technicianId: ID,
  start: ISODateTime,
): CandidateSlot {
  const r = resolve(ctx);
  const s = toMs(start);
  const e = s + r.duration * MINUTE;
  const results: ConstraintResult[] = [];

  // skill_match
  const techSkills = new Set(
    ctx.technicianSkills.filter((ts) => ts.technicianId === technicianId).map((ts) => ts.skillId),
  );
  const missing = r.requiredSkillIds.filter((id) => !techSkills.has(id));
  const tech = ctx.technicians.find((t) => t.id === technicianId);
  const active = tech?.status === "active";
  results.push({
    code: "skill_match",
    passed: active && missing.length === 0,
    detail: !active
      ? "Technician is not active."
      : missing.length
        ? `Missing required skill(s): ${missing.join(", ")}.`
        : "Has every required skill.",
  });

  // availability_block
  const block = ctx.availabilityBlocks.find(
    (b) => b.technicianId === technicianId && overlaps(s, e, toMs(b.startsAt), toMs(b.endsAt)),
  );
  results.push({
    code: "availability_block",
    passed: !block,
    detail: block ? `Overlaps a ${block.kind} block.` : "No leave, sick, unavailable or training block.",
  });

  // working_hours — whole job must fit one shift on the same local day
  const ls = toLocalParts(s, r.tz);
  const le = toLocalParts(e, r.tz);
  const sameDay = ls.date === le.date;
  const shift = sameDay
    ? ctx.workingHours.find(
        (w) =>
          w.technicianId === technicianId &&
          w.weekday === ls.weekday &&
          parseLocalTime(w.start) <= ls.minutes &&
          le.minutes <= parseLocalTime(w.end),
      )
    : undefined;
  results.push({
    code: "working_hours",
    passed: !!shift,
    detail: shift
      ? `Fits shift ${shift.start}–${shift.end} (${r.tz}).`
      : "Job does not fit entirely inside the technician's working hours.",
  });

  // no_conflict + travel_buffer
  const busy = busyIntervals(ctx, technicianId);
  const conflict = busy.find((b) => overlaps(s, e, b.start, b.end));
  results.push({
    code: "no_conflict",
    passed: !conflict,
    detail: conflict ? `Overlaps appointment ${conflict.appointmentId}.` : "No overlapping assigned work.",
  });
  const gapMs = r.gap * MINUTE;
  const tight = busy.find((b) => !overlaps(s, e, b.start, b.end) && overlaps(s - gapMs, e + gapMs, b.start, b.end));
  results.push({
    code: "travel_buffer",
    passed: !conflict && !tight,
    detail: conflict
      ? "Cannot leave a gap around overlapping work."
      : tight
        ? `Less than ${r.gap} min (buffer ${r.buffer} + travel ${r.travel}) from appointment ${tight.appointmentId}.`
        : `Leaves at least ${r.gap} min (buffer ${r.buffer} + travel ${r.travel}) around other jobs.`,
  });

  // duration_fits
  const durOk = Number.isFinite(r.duration) && r.duration > 0;
  results.push({
    code: "duration_fits",
    passed: durOk,
    detail: durOk ? `Allows the full ${r.duration} min.` : "Service duration is invalid.",
  });

  // window_respected
  const inWindow = s >= r.windowStart && e <= r.windowEnd;
  results.push({
    code: "window_respected",
    passed: inWindow,
    detail: inWindow ? "Inside the requested customer window." : "Outside the requested customer window.",
  });

  return { technicianId, start: toIso(s), end: toIso(e), results };
}

/** Deterministically generate candidates inside the window (step-aligned starts per technician). */
export function generateCandidates(ctx: SchedulingContext): CandidateSlot[] {
  const r = resolve(ctx);
  const step = (ctx.slotStepMinutes ?? 30) * MINUTE;
  if (!(r.duration > 0) || !(r.windowEnd > r.windowStart) || step <= 0) return [];
  const first = Math.ceil(r.windowStart / step) * step;
  const out: CandidateSlot[] = [];
  const techs = [...ctx.technicians].sort((a, b) => a.id.localeCompare(b.id));
  for (const t of techs) {
    for (let s = first; s + r.duration * MINUTE <= r.windowEnd; s += step) {
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
 * Order: emergency ⇒ strictly earliest first (tie: technician id).
 * Otherwise ⇒ primary-skill technicians first, then earliest, then technician id.
 * Priority only orders — it never overrides a hard constraint.
 */
export function findFeasibleSlots(ctx: SchedulingContext): SlotMatchResult {
  const evaluated = generateCandidates(ctx);
  const r = resolve(ctx);
  const primary = new Set(
    ctx.technicianSkills
      .filter((ts) => ts.level === "primary" && r.requiredSkillIds.includes(ts.skillId))
      .map((ts) => ts.technicianId),
  );
  const byTime = (a: CandidateSlot, b: CandidateSlot) =>
    a.start.localeCompare(b.start) || a.technicianId.localeCompare(b.technicianId);
  const feasible = evaluated.filter(isFeasible).sort((a, b) => {
    if (ctx.priority === "emergency") return byTime(a, b);
    const pa = primary.has(a.technicianId) ? 0 : 1;
    const pb = primary.has(b.technicianId) ? 0 : 1;
    return pa - pb || byTime(a, b);
  });
  return { feasible, evaluated };
}
