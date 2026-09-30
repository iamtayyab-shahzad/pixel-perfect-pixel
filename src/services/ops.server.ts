/**
 * Server-only data access: loads operational rows and maps them to domain types.
 * Only imported from server function handlers (dynamic import) — never from UI.
 */
import type {
  Appointment,
  Assignment,
  AvailabilityBlock,
  Resource,
  Service,
  Technician,
  TechnicianSkill,
  WorkingHours,
  Weekday,
} from "@/domain/types";
import type { SchedulingContext } from "@/lib/scheduling";

export const BUSINESS_ID = "00000000-0000-4000-a000-000000000001";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export async function admin(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

export interface OpsData {
  business: { id: string; name: string; timezone: string; travel_minutes: number };
  technicians: Technician[];
  technicianSkills: TechnicianSkill[];
  workingHours: WorkingHours[];
  availabilityBlocks: AvailabilityBlock[];
  appointments: Appointment[];
  assignments: Assignment[];
  services: Service[];
  resources: Resource[];
  skills: { id: string; code: string; label: string }[];
  /** raw rows for UI composition */
  raw: {
    appointments: any[];
    customers: any[];
    technicians: any[];
  };
}

/** Load everything the scheduler needs for [from, to). */
export async function loadOps(db: Db, from: string, to: string): Promise<OpsData> {
  const [biz, techs, tskills, hours, blocks, appts, services, sres, resources, skills] = await Promise.all([
    db.from("businesses").select("id,name,timezone,travel_minutes").eq("id", BUSINESS_ID).single(),
    db.from("technicians").select("*").eq("business_id", BUSINESS_ID).order("full_name"),
    db.from("technician_skills").select("*"),
    db.from("working_hours").select("*"),
    db.from("availability_blocks").select("*").lt("starts_at", to).gt("ends_at", from),
    db
      .from("appointments")
      .select("*, customers(full_name, phone), assignments(*)")
      .eq("business_id", BUSINESS_ID)
      .lt("window_start", to)
      .gte("window_end", new Date(Date.parse(from) - 12 * 3600_000).toISOString()),
    db.from("services").select("*").eq("business_id", BUSINESS_ID).order("label"),
    db.from("service_resources").select("*"),
    db.from("resources").select("*").eq("business_id", BUSINESS_ID),
    db.from("skills").select("id,code,label").eq("business_id", BUSINESS_ID),
  ]);
  const techRows = must(techs) as Record<string, any>[];
  const apptRows = must(appts) as Record<string, any>[];
  const sresRows = must(sres) as Record<string, any>[];
  return {
    business: must(biz),
    technicians: techRows.map((t) => ({
      id: t.id,
      businessId: t.business_id,
      userId: t.user_id ?? undefined,
      fullName: t.full_name,
      status: t.status,
      isOwner: t.is_owner,
      createdAt: t.created_at,
    })),
    technicianSkills: (must(tskills) as any[]).map((s) => ({
      technicianId: s.technician_id,
      skillId: s.skill_id,
      level: s.level,
    })),
    workingHours: (must(hours) as any[]).map((h) => ({
      id: h.id,
      technicianId: h.technician_id,
      weekday: h.weekday as Weekday,
      start: h.start_time,
      end: h.end_time,
    })),
    availabilityBlocks: (must(blocks) as any[]).map((b) => ({
      id: b.id,
      technicianId: b.technician_id,
      kind: b.kind,
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      note: b.note ?? undefined,
    })),
    appointments: apptRows.map((a) => ({
      id: a.id,
      businessId: a.business_id,
      inquiryId: a.inquiry_id ?? undefined,
      customerId: a.customer_id,
      serviceId: a.service_id,
      priority: a.priority,
      status: a.status,
      requiredSkillIds: a.required_skill_ids,
      address: { addressLine: a.address_line, city: a.city, postalCode: a.postal_code },
      windowStart: a.window_start,
      windowEnd: a.window_end,
      // A reported delay extends the technician's real commitment.
      estimatedMinutes: a.estimated_minutes + (a.delay_minutes ?? 0),
      createdAt: a.created_at,
    })),
    assignments: apptRows.flatMap((a) =>
      (a.assignments as any[]).map((s) => ({
        id: s.id,
        appointmentId: s.appointment_id,
        technicianId: s.technician_id,
        status: s.status,
        blockedStart: s.blocked_start,
        blockedEnd: s.blocked_end,
        assignedBy: s.assigned_by ?? "",
        assignedAt: s.assigned_at,
      })),
    ),
    services: (must(services) as any[]).map((s) => ({
      id: s.id,
      businessId: s.business_id,
      code: s.code,
      label: s.label,
      requiredSkillIds: s.required_skill_ids,
      resourceRequirements: sresRows
        .filter((r) => r.service_id === s.id)
        .map((r) => ({ resourceId: r.resource_id, quantity: r.quantity })),
      estimatedMinutes: s.estimated_minutes,
      bufferMinutes: s.buffer_minutes,
    })),
    resources: (must(resources) as any[]).map((r) => ({
      id: r.id,
      businessId: r.business_id,
      code: r.code,
      label: r.label,
      quantity: r.quantity,
    })),
    skills: must(skills),
    raw: { appointments: apptRows, customers: [], technicians: techRows },
  };
}

/** Customer arrival promise: the technician may arrive any time in [start, start + 30]. */
export const ARRIVAL_SPREAD_MINUTES = 30;

export function schedulingContext(
  ops: OpsData,
  service: Service,
  windowStart: string,
  windowEnd: string,
  priority: SchedulingContext["priority"],
  extra: Partial<SchedulingContext> = {},
): SchedulingContext {
  return {
    technicians: ops.technicians,
    technicianSkills: ops.technicianSkills,
    workingHours: ops.workingHours,
    availabilityBlocks: ops.availabilityBlocks,
    appointments: ops.appointments,
    assignments: ops.assignments,
    service,
    services: ops.services,
    resources: ops.resources,
    // Booked commitment = arrival spread + work, so the promise is always keepable.
    durationMinutes: service.estimatedMinutes + ARRIVAL_SPREAD_MINUTES,
    travelMinutes: ops.business.travel_minutes,
    windowStart,
    windowEnd,
    priority,
    slotStepMinutes: 30,
    ...extra,
  };
}

export async function logEvent(
  db: Db,
  e: {
    appointment_id?: string | null;
    inquiry_id?: string | null;
    type: string;
    actor_label: string;
    actor_user_id?: string | null;
    reason?: string | null;
    before?: unknown;
    after?: unknown;
  },
) {
  must(await db.from("job_events").insert({ business_id: BUSINESS_ID, ...e }));
}

export async function queueNotification(
  db: Db,
  n: { appointment_id: string; customer_id: string; subject: string; body: string },
) {
  must(
    await db.from("notifications").insert({
      business_id: BUSINESS_ID,
      status: "pending",
      status_detail: "Queued — no SMS/email provider connected",
      ...n,
    }),
  );
}

export { must };
