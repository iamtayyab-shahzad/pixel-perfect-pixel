/**
 * Staff API (owner + technicians). Every function requires a signed-in account and
 * checks the caller's role on the server. Writes go through the service client only
 * after that check; every confirmed-appointment change writes a JobEvent.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuid = z.string().uuid();

type Ctx = { supabase: any; userId: string };

async function whoAmI(ctx: Ctx) {
  await ctx.supabase.rpc("claim_staff_access");
  const [{ data: roles }, { data: tech }] = await Promise.all([
    ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId),
    ctx.supabase.from("technicians").select("id, full_name, is_owner").eq("user_id", ctx.userId).maybeSingle(),
  ]);
  const r = new Set(((roles ?? []) as { role: string }[]).map((x) => x.role));
  return {
    isOwner: r.has("owner"),
    isTech: r.has("technician"),
    technicianId: (tech?.id as string | undefined) ?? null,
    name: (tech?.full_name as string | undefined) ?? null,
  };
}
async function requireOwner(ctx: Ctx) {
  const me = await whoAmI(ctx);
  if (!me.isOwner) throw new Error("Owner access required");
  return me;
}
async function requireStaff(ctx: Ctx) {
  const me = await whoAmI(ctx);
  if (!me.isOwner && !me.isTech) throw new Error("Staff access required");
  return me;
}

const AVAIL: Record<string, string> = {
  off: "off_today",
  leave: "on_leave",
  sick: "sick",
  unavailable: "unavailable",
  training: "unavailable",
};

async function dayOps(d: string) {
  const { admin, loadOps } = await import("./ops.server");
  const { zonedToUtc } = await import("@/lib/scheduling");
  const db = await admin();
  const from = zonedToUtc(d, "00:00");
  const to = new Date(Date.parse(from) + 24 * 3600_000).toISOString();
  const ops = await loadOps(db, from, to);
  return { db, ops, from, to };
}

function jobView(a: any, ops: any) {
  const active = (a.assignments as any[]).find((s) => s.status !== "replaced");
  const svc = ops.services.find((s: any) => s.id === a.service_id);
  const end = Date.parse(a.window_end) + (a.estimated_minutes + a.delay_minutes) * 60_000;
  return {
    id: a.id as string,
    status: a.status as string,
    priority: a.priority as string,
    service: svc?.label ?? "",
    problem: a.problem_summary as string,
    customer: a.customers?.full_name as string,
    phone: a.customers?.phone as string,
    address: `${a.address_line}, ${a.city} ${a.postal_code}`,
    windowStart: a.window_start as string,
    windowEnd: a.window_end as string,
    estimatedMinutes: a.estimated_minutes as number,
    delayMinutes: a.delay_minutes as number,
    projectedEnd: new Date(end).toISOString(),
    technicianId: (active?.technician_id as string | undefined) ?? null,
    warnings: [] as string[],
  };
}
type Job = ReturnType<typeof jobView>;

function annotate(jobs: Job[], ops: any, bufferFor: (j: Job) => number) {
  const byTech = new Map<string, Job[]>();
  for (const j of jobs) if (j.technicianId && !["cancelled"].includes(j.status)) byTech.set(j.technicianId, [...(byTech.get(j.technicianId) ?? []), j]);
  for (const list of byTech.values()) {
    list.sort((a, b) => a.windowStart.localeCompare(b.windowStart));
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]!;
      const cur = list[i]!;
      if (["completed", "cancelled"].includes(cur.status)) continue;
      const needBy = Date.parse(cur.windowEnd);
      const free = Date.parse(prev.projectedEnd) + (bufferFor(prev) + ops.business.travel_minutes) * 60_000;
      if (prev.delayMinutes > 0 && prev.status !== "completed" && free > needBy)
        cur.warnings.push(`At risk: ${prev.customer}'s job is running ${prev.delayMinutes} min late`);
    }
  }
  for (const j of jobs) {
    if (!j.technicianId || ["completed", "cancelled"].includes(j.status)) continue;
    const blk = ops.availabilityBlocks.find(
      (b: any) => b.technicianId === j.technicianId && Date.parse(b.startsAt) < Date.parse(j.projectedEnd) && Date.parse(b.endsAt) > Date.parse(j.windowStart),
    );
    if (blk) j.warnings.push(`Technician is ${blk.kind === "off" ? "off" : blk.kind} — needs reassignment`);
  }
}

export const getMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => whoAmI(context as Ctx));

export const getDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ date }).parse(d))
  .handler(async ({ data, context }) => {
    await requireOwner(context as Ctx);
    const { db, ops } = await dayOps(data.date);
    const dayAppts = ops.raw.appointments.filter((a: any) => a.window_start.slice(0, 10) >= "" );
    const { localDate } = await import("@/lib/scheduling");
    const jobs = dayAppts.filter((a: any) => localDate(Date.parse(a.window_start)) === data.date).map((a) => jobView(a, ops));
    annotate(jobs, ops, (j) => ops.services.find((s) => s.label === j.service)?.bufferMinutes ?? 30);
    const now = Date.now();
    const technicians = ops.technicians.map((t) => {
      const blk = ops.availabilityBlocks.find((b) => b.technicianId === t.id);
      const busy = jobs.some((j) => j.technicianId === t.id && ["en_route", "in_progress", "delayed"].includes(j.status));
      return {
        id: t.id,
        name: t.fullName,
        isOwner: t.isOwner,
        availability: t.status !== "active" ? "unavailable" : blk ? AVAIL[blk.kind]! : busy ? "busy" : "available",
        block: blk ? { id: blk.id, kind: blk.kind, note: blk.note ?? null, endsAt: blk.endsAt } : null,
        skills: ops.technicianSkills
          .filter((s) => s.technicianId === t.id)
          .map((s) => ({ label: ops.skills.find((k) => k.id === s.skillId)?.label ?? "", level: s.level })),
      };
    });
    const [inq, cr, notif] = await Promise.all([
      db.from("inquiries").select("id, status, priority, description, missing_info, created_at, customers(full_name, phone), services(label)")
        .in("status", ["new", "needs_info", "qualified"]).order("created_at", { ascending: false }),
      db.from("change_requests").select("id, kind, reason, requested_by, proposed_window_start, proposed_technician_id, appointment_id, created_at, appointments(window_start, customers(full_name))")
        .eq("status", "pending").order("created_at"),
      db.from("notifications").select("id, subject, status, status_detail, created_at, appointment_id, customers(full_name)")
        .eq("status", "pending").order("created_at", { ascending: false }).limit(20),
    ]);
    const attention: { kind: string; tone: "urgent" | "warn" | "info"; title: string; detail: string; appointmentId?: string; inquiryId?: string; changeRequestId?: string }[] = [];
    for (const j of jobs) {
      if (["completed", "cancelled"].includes(j.status)) continue;
      if (j.warnings.some((w) => w.includes("needs reassignment")))
        attention.push({ kind: "tech_unavailable", tone: "urgent", title: `${j.customer} — technician unavailable`, detail: j.warnings.join(" · "), appointmentId: j.id });
      if (j.priority === "emergency")
        attention.push({ kind: "emergency", tone: "urgent", title: `Emergency: ${j.customer}`, detail: `${j.service} · ${j.status.replace("_", " ")}`, appointmentId: j.id });
      if (j.status === "delayed")
        attention.push({ kind: "delayed", tone: "warn", title: `${j.customer} running ${j.delayMinutes} min late`, detail: j.problem, appointmentId: j.id });
      for (const w of j.warnings.filter((w) => w.startsWith("At risk")))
        attention.push({ kind: "at_risk", tone: "warn", title: `${j.customer} arrival at risk`, detail: w, appointmentId: j.id });
    }
    for (const c of (cr.data ?? []) as any[])
      attention.push({ kind: "change", tone: "warn", title: `${c.kind === "reschedule" ? "Reschedule" : "Reassignment"} awaiting approval`, detail: `${c.appointments?.customers?.full_name}: ${c.reason}`, appointmentId: c.appointment_id, changeRequestId: c.id });
    for (const i of (inq.data ?? []) as any[])
      attention.push({
        kind: "inquiry", tone: i.priority === "emergency" ? "urgent" : "info",
        title: `${i.status === "needs_info" ? "Needs info" : "Awaiting response"}: ${i.customers?.full_name ?? "Unknown"}`,
        detail: i.missing_info ?? i.description, inquiryId: i.id,
      });
    const order = { urgent: 0, warn: 1, info: 2 };
    attention.sort((a, b) => order[a.tone] - order[b.tone]);
    return {
      technicians,
      jobs: jobs.sort((a, b) => a.windowStart.localeCompare(b.windowStart)),
      attention,
      inquiries: ((inq.data ?? []) as any[]).map((i) => ({ id: i.id, status: i.status, priority: i.priority, description: i.description, missingInfo: i.missing_info, customer: i.customers?.full_name, phone: i.customers?.phone, service: i.services?.label ?? null, createdAt: i.created_at })),
      pendingNotifications: ((notif.data ?? []) as any[]).map((n) => ({ id: n.id, subject: n.subject, detail: n.status_detail, customer: n.customers?.full_name, appointmentId: n.appointment_id, createdAt: n.created_at })),
      now,
    };
  });

export const getTechDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ date, technicianId: uuid.optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const me = await requireStaff(context as Ctx);
    const techId = me.isOwner && data.technicianId ? data.technicianId : me.technicianId;
    if (!techId) throw new Error("Your account isn't linked to a technician yet");
    const { ops } = await dayOps(data.date);
    const { localDate } = await import("@/lib/scheduling");
    const jobs = ops.raw.appointments
      .filter((a: any) => localDate(Date.parse(a.window_start)) === data.date)
      .map((a) => jobView(a, ops));
    annotate(jobs, ops, (j) => ops.services.find((s) => s.label === j.service)?.bufferMinutes ?? 30);
    const tech = ops.technicians.find((t) => t.id === techId);
    return {
      me,
      technician: tech ? { id: tech.id, name: tech.fullName } : null,
      technicians: me.isOwner ? ops.technicians.map((t) => ({ id: t.id, name: t.fullName })) : [],
      block: ops.availabilityBlocks.find((b) => b.technicianId === techId) ?? null,
      jobs: jobs.filter((j) => j.technicianId === techId && j.status !== "cancelled").sort((a, b) => a.windowStart.localeCompare(b.windowStart)),
    };
  });

export const getJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const me = await requireStaff(context as Ctx);
    const { admin } = await import("./ops.server");
    const db = await admin();
    const { data: a } = await db
      .from("appointments")
      .select("*, services(label), customers(full_name, phone, email), assignments(*, technicians(full_name))")
      .eq("id", data.id).maybeSingle();
    if (!a) throw new Error("Job not found");
    const [ev, notes, notif, cr] = await Promise.all([
      db.from("job_events").select("*").eq("appointment_id", a.id).order("created_at"),
      db.from("job_notes").select("*").eq("appointment_id", a.id).order("created_at"),
      db.from("notifications").select("*").eq("appointment_id", a.id).order("created_at"),
      db.from("change_requests").select("*, technicians:proposed_technician_id(full_name)").eq("appointment_id", a.id).order("created_at"),
    ]);
    const active = (a.assignments as any[]).find((s) => s.status !== "replaced");
    return {
      me,
      id: a.id as string,
      status: a.status as string,
      priority: a.priority as string,
      service: a.services?.label as string,
      problem: a.problem_summary as string,
      customer: a.customers,
      address: `${a.address_line}, ${a.city} ${a.postal_code}`,
      windowStart: a.window_start as string,
      windowEnd: a.window_end as string,
      estimatedMinutes: a.estimated_minutes as number,
      delayMinutes: a.delay_minutes as number,
      technician: active ? { id: active.technician_id as string, name: active.technicians?.full_name as string } : null,
      assignments: (a.assignments as any[]).map((s) => ({ id: s.id, status: s.status, name: s.technicians?.full_name, assignedAt: s.assigned_at })),
      events: ev.data ?? [],
      notes: notes.data ?? [],
      notifications: notif.data ?? [],
      changeRequests: ((cr.data ?? []) as any[]).map((c) => ({ ...c, proposedTechnician: c.technicians?.full_name ?? null })),
    };
  });

const NEXT: Record<string, string[]> = {
  confirmed: ["en_route", "delayed"],
  en_route: ["in_progress", "delayed"],
  in_progress: ["completed", "delayed"],
  delayed: ["en_route", "in_progress", "completed", "delayed"],
};

export const setJobStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: uuid, status: z.enum(["en_route", "in_progress", "completed", "delayed"]), delayMinutes: z.number().int().min(5).max(480).optional(), reason: z.string().trim().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const me = await requireStaff(context as Ctx);
    const { admin, logEvent, queueNotification } = await import("./ops.server");
    const db = await admin();
    const { data: a } = await db.from("appointments").select("*, assignments(technician_id, status), customers(full_name)").eq("id", data.id).single();
    const mine = (a.assignments as any[]).some((s) => s.status !== "replaced" && s.technician_id === me.technicianId);
    if (!me.isOwner && !mine) throw new Error("Only the assigned technician or the owner can update this job");
    if (!(NEXT[a.status] ?? []).includes(data.status)) throw new Error(`Can't move a ${a.status} job to ${data.status}`);
    if (data.status === "delayed" && (!data.delayMinutes || !data.reason)) throw new Error("A delay needs minutes and a reason");
    const patch: any = { status: data.status };
    if (data.status === "delayed") patch.delay_minutes = (a.delay_minutes ?? 0) + data.delayMinutes!;
    await db.from("appointments").update(patch).eq("id", a.id);
    await logEvent(db, {
      appointment_id: a.id,
      type: data.status === "delayed" ? "delay_reported" : data.status === "completed" ? "job_completed" : data.status === "in_progress" ? "job_started" : "status_changed",
      actor_label: me.name ?? "Staff", actor_user_id: (context as Ctx).userId, reason: data.reason ?? null,
      before: { status: a.status, delay_minutes: a.delay_minutes }, after: patch,
    });
    if (data.status === "delayed")
      await queueNotification(db, { appointment_id: a.id, customer_id: a.customer_id, subject: "Running late", body: `Your technician is running about ${patch.delay_minutes} minutes behind. Reason: ${data.reason}` });
    if (data.status === "en_route")
      await queueNotification(db, { appointment_id: a.id, customer_id: a.customer_id, subject: "Technician on the way", body: "Your CoolFlow technician is on the way." });
    return { ok: true };
  });

export const markUnavailable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ technicianId: uuid, kind: z.enum(["off", "leave", "sick", "unavailable", "training"]), fromDate: date, toDate: date, note: z.string().trim().max(300).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const me = await requireOwner(context as Ctx);
    const { admin, BUSINESS_ID, logEvent } = await import("./ops.server");
    const { zonedToUtc } = await import("@/lib/scheduling");
    const db = await admin();
    const starts = zonedToUtc(data.fromDate, "00:00");
    const endDay = new Date(Date.parse(zonedToUtc(data.toDate, "12:00")) + 24 * 3600_000).toISOString().slice(0, 10);
    const ends = zonedToUtc(endDay, "00:00");
    if (ends <= starts) throw new Error("End must be after start");
    await db.from("availability_blocks").insert({ business_id: BUSINESS_ID, technician_id: data.technicianId, kind: data.kind, starts_at: starts, ends_at: ends, note: data.note ?? null, created_by: (context as Ctx).userId });
    const { data: hit } = await db.from("assignments").select("appointment_id, appointments!inner(status)")
      .eq("technician_id", data.technicianId).in("status", ["active", "swap_requested"]).lt("blocked_start", ends).gt("blocked_end", starts);
    const affected = ((hit ?? []) as any[]).filter((h) => !["completed", "cancelled"].includes(h.appointments.status));
    const { data: t } = await db.from("technicians").select("full_name").eq("id", data.technicianId).single();
    for (const h of affected)
      await logEvent(db, { appointment_id: h.appointment_id, type: "technician_unavailable", actor_label: me.name ?? "Owner", actor_user_id: (context as Ctx).userId, reason: data.note ?? data.kind, after: { technician: t?.full_name, kind: data.kind } });
    return { ok: true, affectedJobs: affected.length };
  });

export const clearBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireOwner(context as Ctx);
    const { admin } = await import("./ops.server");
    await (await admin()).from("availability_blocks").delete().eq("id", data.id);
    return { ok: true };
  });

/** Swap candidates: same customer time with another technician, validated by Smart Slot Match. */
export const reassignOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireOwner(context as Ctx);
    const { admin, loadOps, schedulingContext } = await import("./ops.server");
    const { evaluateCandidate, isFeasible, findFeasibleSlots, localDate, zonedToUtc } = await import("@/lib/scheduling");
    const db = await admin();
    const { data: a } = await db.from("appointments").select("*, assignments(technician_id, status)").eq("id", data.id).single();
    const d = localDate(Date.parse(a.window_start));
    const from = zonedToUtc(d, "00:00");
    const ops = await loadOps(db, from, new Date(Date.parse(from) + 36 * 3600_000).toISOString());
    const service = ops.services.find((s) => s.id === a.service_id)!;
    const current = (a.assignments as any[]).find((s) => s.status !== "replaced")?.technician_id;
    const spread = (Date.parse(a.window_end) - Date.parse(a.window_start)) / 60_000;
    const ctx = schedulingContext(ops, service, a.window_start, new Date(Date.parse(a.window_start) + (spread + service.estimatedMinutes) * 60_000).toISOString(), a.priority, {
      excludeAppointmentId: a.id, requiredSkillIds: a.required_skill_ids, durationMinutes: service.estimatedMinutes + spread,
    });
    const sameTime = ops.technicians.filter((t) => t.id !== current).map((t) => {
      const slot = evaluateCandidate(ctx, t.id, a.window_start);
      return { technicianId: t.id, name: t.fullName, feasible: isFeasible(slot), failed: slot.results.filter((r) => !r.passed).map((r) => r.detail) };
    });
    const dayCtx = schedulingContext(ops, service, new Date(Math.max(Date.now() + 30 * 60_000, Date.parse(zonedToUtc(d, "08:00")))).toISOString(), zonedToUtc(d, "19:00"), a.priority, {
      excludeAppointmentId: a.id, requiredSkillIds: a.required_skill_ids,
    });
    const other = findFeasibleSlots(dayCtx).feasible.slice(0, 8).map((f) => ({ technicianId: f.technicianId, name: ops.technicians.find((t) => t.id === f.technicianId)?.fullName ?? "", start: f.start }));
    return { current: ops.technicians.find((t) => t.id === current)?.fullName ?? null, windowStart: a.window_start, windowEnd: a.window_end, sameTime, otherTimes: other };
  });

export const proposeChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid, technicianId: uuid, start: z.string().datetime(), reason: z.string().trim().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const me = await requireOwner(context as Ctx);
    const { admin, BUSINESS_ID, logEvent } = await import("./ops.server");
    const db = await admin();
    const { data: a } = await db.from("appointments").select("*").eq("id", data.id).single();
    const spread = Date.parse(a.window_end) - Date.parse(a.window_start);
    const sameTime = data.start === new Date(Date.parse(a.window_start)).toISOString();
    await db.from("change_requests").update({ status: "withdrawn" }).eq("appointment_id", a.id).eq("status", "pending");
    await db.from("change_requests").insert({
      business_id: BUSINESS_ID, appointment_id: a.id, kind: sameTime ? "reassign" : "reschedule", requested_by: me.name ?? "Owner", reason: data.reason,
      proposed_technician_id: data.technicianId, proposed_window_start: data.start, proposed_window_end: new Date(Date.parse(data.start) + spread).toISOString(),
    });
    await logEvent(db, { appointment_id: a.id, type: sameTime ? "swap_requested" : "reschedule_proposed", actor_label: me.name ?? "Owner", actor_user_id: (context as Ctx).userId, reason: data.reason, before: { window_start: a.window_start }, after: { window_start: data.start, technician_id: data.technicianId } });
    return { ok: true };
  });

export const decideChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid, approve: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const me = await requireOwner(context as Ctx);
    const { admin, BUSINESS_ID, loadOps, schedulingContext, logEvent, queueNotification } = await import("./ops.server");
    const { evaluateCandidate, isFeasible, localDate, zonedToUtc, formatLocalTime, formatLocalDay } = await import("@/lib/scheduling");
    const db = await admin();
    const { data: c } = await db.from("change_requests").select("*").eq("id", data.id).single();
    if (!c || c.status !== "pending") throw new Error("This change is no longer pending");
    const { data: a } = await db.from("appointments").select("*, assignments(*, technicians(full_name))").eq("id", c.appointment_id).single();
    const actor = { actor_label: me.name ?? "Owner", actor_user_id: (context as Ctx).userId };
    if (!data.approve) {
      await db.from("change_requests").update({ status: "rejected", decided_at: new Date().toISOString(), decided_by: (context as Ctx).userId }).eq("id", c.id);
      await logEvent(db, { appointment_id: a.id, type: "note_added", ...actor, reason: `Change request rejected: ${c.reason}` });
      return { ok: true };
    }
    // Validate the proposed assignment with Smart Slot Match before approval
    const d = localDate(Date.parse(c.proposed_window_start));
    const from = zonedToUtc(d, "00:00");
    const ops = await loadOps(db, from, new Date(Date.parse(from) + 36 * 3600_000).toISOString());
    const service = ops.services.find((s) => s.id === a.service_id)!;
    const spread = (Date.parse(c.proposed_window_end) - Date.parse(c.proposed_window_start)) / 60_000;
    const dur = service.estimatedMinutes + spread;
    const ctx = schedulingContext(ops, service, c.proposed_window_start, new Date(Date.parse(c.proposed_window_start) + dur * 60_000).toISOString(), a.priority, {
      excludeAppointmentId: a.id, requiredSkillIds: a.required_skill_ids, durationMinutes: dur,
    });
    const slot = evaluateCandidate(ctx, c.proposed_technician_id, c.proposed_window_start);
    if (!isFeasible(slot)) return { ok: false, reason: slot.results.filter((r) => !r.passed).map((r) => r.detail).join(" ") };
    const old = (a.assignments as any[]).find((s) => s.status !== "replaced");
    const { data: newTech } = await db.from("technicians").select("full_name").eq("id", c.proposed_technician_id).single();
    const blockedEnd = new Date(Date.parse(c.proposed_window_end) + (a.estimated_minutes + service.bufferMinutes) * 60_000).toISOString();
    if (old) await db.from("assignments").update({ status: "replaced" }).eq("id", old.id);
    const ins = await db.from("assignments").insert({ business_id: BUSINESS_ID, appointment_id: a.id, technician_id: c.proposed_technician_id, blocked_start: c.proposed_window_start, blocked_end: blockedEnd, assigned_by: (context as Ctx).userId });
    if (ins.error) {
      if (old) await db.from("assignments").update({ status: old.status }).eq("id", old.id);
      return { ok: false, reason: "The database refused this change because it would double-book the technician." };
    }
    await db.from("appointments").update({ window_start: c.proposed_window_start, window_end: c.proposed_window_end, status: a.status === "delayed" ? "confirmed" : a.status }).eq("id", a.id);
    await db.from("change_requests").update({ status: "approved", decided_at: new Date().toISOString(), decided_by: (context as Ctx).userId }).eq("id", c.id);
    const before = { technician: old?.technicians?.full_name ?? null, window_start: a.window_start, window_end: a.window_end };
    const after = { technician: newTech?.full_name ?? null, window_start: c.proposed_window_start, window_end: c.proposed_window_end };
    await logEvent(db, { appointment_id: a.id, type: c.kind === "reassign" ? "swap_approved" : "reschedule_approved", ...actor, reason: c.reason, before, after });
    await logEvent(db, { appointment_id: a.id, type: "appointment_changed", ...actor, reason: c.reason, before, after });
    const timeChanged = a.window_start !== c.proposed_window_start;
    await queueNotification(db, {
      appointment_id: a.id, customer_id: a.customer_id, subject: "Your appointment changed",
      body: timeChanged
        ? `Your visit moved from ${formatLocalDay(a.window_start)} ${formatLocalTime(a.window_start)} to ${formatLocalDay(c.proposed_window_start)} ${formatLocalTime(c.proposed_window_start)}–${formatLocalTime(c.proposed_window_end)}. Reason: ${c.reason}`
        : `Your technician changed to ${(newTech?.full_name ?? "").split(" ")[0]}. Your time is unchanged. Reason: ${c.reason}`,
    });
    return { ok: true };
  });

export const cancelAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid, reason: z.string().trim().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const me = await requireOwner(context as Ctx);
    const { admin, logEvent, queueNotification } = await import("./ops.server");
    const db = await admin();
    const { data: a } = await db.from("appointments").select("*").eq("id", data.id).single();
    if (["cancelled", "completed"].includes(a.status)) throw new Error("Already closed");
    await db.from("appointments").update({ status: "cancelled" }).eq("id", a.id);
    await db.from("assignments").update({ status: "replaced" }).eq("appointment_id", a.id).neq("status", "replaced");
    await db.from("change_requests").update({ status: "withdrawn" }).eq("appointment_id", a.id).eq("status", "pending");
    await logEvent(db, { appointment_id: a.id, type: "cancelled", actor_label: me.name ?? "Owner", actor_user_id: (context as Ctx).userId, reason: data.reason, before: { status: a.status, window_start: a.window_start }, after: { status: "cancelled" } });
    await queueNotification(db, { appointment_id: a.id, customer_id: a.customer_id, subject: "Visit cancelled", body: `Your CoolFlow visit was cancelled. Reason: ${data.reason}` });
    return { ok: true };
  });

export const addNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid, body: z.string().trim().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const me = await requireStaff(context as Ctx);
    const { admin, BUSINESS_ID, logEvent } = await import("./ops.server");
    const db = await admin();
    await db.from("job_notes").insert({ business_id: BUSINESS_ID, appointment_id: data.id, author_label: me.name ?? "Staff", author_user_id: (context as Ctx).userId, body: data.body });
    await logEvent(db, { appointment_id: data.id, type: "note_added", actor_label: me.name ?? "Staff", actor_user_id: (context as Ctx).userId, reason: data.body.slice(0, 140) });
    return { ok: true };
  });

export const updateInquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid, status: z.enum(["qualified", "closed_lost", "needs_info"]), note: z.string().trim().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const me = await requireOwner(context as Ctx);
    const { admin, logEvent } = await import("./ops.server");
    const db = await admin();
    const { data: i } = await db.from("inquiries").select("status").eq("id", data.id).single();
    await db.from("inquiries").update({ status: data.status }).eq("id", data.id);
    await logEvent(db, { inquiry_id: data.id, type: data.status === "qualified" ? "inquiry_qualified" : "note_added", actor_label: me.name ?? "Owner", actor_user_id: (context as Ctx).userId, reason: data.note ?? null, before: { status: i?.status }, after: { status: data.status } });
    return { ok: true };
  });

/** Owner confirms they told the customer directly (e.g. by phone). Never claims an SMS/email was delivered. */
export const markNotificationHandled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const me = await requireOwner(context as Ctx);
    const { admin, logEvent } = await import("./ops.server");
    const db = await admin();
    const { data: n } = await db.from("notifications").update({ status: "sent", sent_at: new Date().toISOString(), status_detail: `Told customer directly — marked by ${me.name ?? "owner"}` }).eq("id", data.id).select("appointment_id, subject").single();
    if (n) await logEvent(db, { appointment_id: n.appointment_id, type: "customer_notified", actor_label: me.name ?? "Owner", actor_user_id: (context as Ctx).userId, reason: `${n.subject} — told customer directly` });
    return { ok: true };
  });

export const jobRecordPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context as Ctx);
    const { buildJobPdf } = await import("./pdf.server");
    return { base64: await buildJobPdf(data.id) };
  });
