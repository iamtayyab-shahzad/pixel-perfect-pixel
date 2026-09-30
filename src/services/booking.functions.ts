/**
 * Public customer booking API. No sign-in; every function validates input and
 * returns only customer-safe fields. Operational data never leaves the server.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const priority = z.enum(["emergency", "high", "normal", "routine"]);
const part = z.enum(["morning", "afternoon", "anytime"]);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const token = z.string().regex(/^[a-f0-9]{64}$/);
const contact = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(30),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  addressLine: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().regex(/^\d{5}$/, "5-digit ZIP"),
});
const problem = z.object({
  description: z.string().trim().min(5).max(2000),
  answers: z.record(z.string(), z.string().max(300)).default({}),
});

export const getCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const { admin, BUSINESS_ID } = await import("./ops.server");
  const db = await admin();
  const { data, error } = await db
    .from("services")
    .select("id, code, label, customer_description, estimated_minutes")
    .eq("business_id", BUSINESS_ID)
    .order("label");
  if (error) throw new Error("Could not load services");
  return (data as { id: string; code: string; label: string; customer_description: string; estimated_minutes: number }[]).map(
    (s) => ({ id: s.id, code: s.code, label: s.label, description: s.customer_description, minutes: s.estimated_minutes }),
  );
});

export const findSlots = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ serviceId: z.string().uuid(), date, part, priority }).parse(d))
  .handler(async ({ data }) => {
    const { admin } = await import("./ops.server");
    const { computeOptions } = await import("./booking.server");
    const r = await computeOptions(await admin(), data);
    return { options: r.options, summary: r.summary, pastWindow: r.pastWindow, serviceLabel: r.service.label };
  });

async function upsertCustomer(db: any, c: z.infer<typeof contact>, BUSINESS_ID: string) {
  const { data: existing } = await db
    .from("customers")
    .select("id")
    .eq("business_id", BUSINESS_ID)
    .eq("phone", c.phone)
    .maybeSingle();
  const row = {
    business_id: BUSINESS_ID,
    full_name: c.fullName,
    phone: c.phone,
    email: c.email || null,
    address_line: c.addressLine,
    city: c.city,
    postal_code: c.postalCode,
  };
  if (existing) {
    await db.from("customers").update(row).eq("id", existing.id);
    return existing.id as string;
  }
  const { data, error } = await db.from("customers").insert(row).select("id").single();
  if (error) throw new Error("Could not save your details");
  return data.id as string;
}

export const submitBooking = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        serviceId: z.string().uuid(),
        technicianId: z.string().uuid(),
        start: z.string().datetime(),
        date,
        part,
        priority,
        contact,
        problem,
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { admin, BUSINESS_ID, loadOps, logEvent, ARRIVAL_SPREAD_MINUTES } = await import("./ops.server");
    const { recheck } = await import("./booking.server");
    const { zonedToUtc } = await import("@/lib/scheduling");
    const db = await admin();
    const dayStart = zonedToUtc(data.date, "00:00");
    const ops = await loadOps(db, dayStart, new Date(Date.parse(dayStart) + 36 * 3600_000).toISOString());
    const service = ops.services.find((s) => s.id === data.serviceId);
    if (!service) return { ok: false as const, reason: "That service is no longer offered." };
    // 1) Re-check feasibility on fresh data
    const { ok } = recheck(ops, service, data.technicianId, data.start, data.date, data.part, data.priority);
    if (!ok) return { ok: false as const, reason: "That time was just taken. Please pick another option." };

    const customerId = await upsertCustomer(db, data.contact, BUSINESS_ID);
    const { data: inq, error: ie } = await db
      .from("inquiries")
      .insert({
        business_id: BUSINESS_ID,
        customer_id: customerId,
        service_id: service.id,
        priority: data.priority,
        description: data.problem.description,
        answers: data.problem.answers,
        status: "offered",
      })
      .select("id")
      .single();
    if (ie) throw new Error("Could not save your request");
    const who = `${data.contact.fullName} (customer)`;
    await logEvent(db, { inquiry_id: inq.id, type: "inquiry_received", actor_label: who });
    await logEvent(db, { inquiry_id: inq.id, type: "inquiry_qualified", actor_label: "CoolFlow system", reason: `Identified as ${service.label}` });
    await logEvent(db, { inquiry_id: inq.id, type: "slot_offered", actor_label: "Smart Slot Match", after: { start: data.start, technician_id: data.technicianId } });

    // 2) Atomic write (lock + recheck + insert; DB exclusion constraint blocks races)
    const start = data.start;
    const end = new Date(Date.parse(start) + ARRIVAL_SPREAD_MINUTES * 60_000).toISOString();
    const { data: res, error } = await db.rpc("confirm_booking", {
      _business_id: BUSINESS_ID,
      _inquiry_id: inq.id,
      _customer_id: customerId,
      _service_id: service.id,
      _technician_id: data.technicianId,
      _priority: data.priority,
      _window_start: start,
      _window_end: end,
      _estimated_minutes: service.estimatedMinutes,
      _buffer_minutes: service.bufferMinutes,
      _required_skill_ids: service.requiredSkillIds,
      _address_line: data.contact.addressLine,
      _city: data.contact.city,
      _postal_code: data.contact.postalCode,
      _problem_summary: data.problem.description.slice(0, 200),
      _actor_label: who,
      _explanation: { service: service.label },
    });
    if (error) {
      await db.from("inquiries").update({ status: "qualified", missing_info: "Chosen slot was taken during confirmation" }).eq("id", inq.id);
      return { ok: false as const, reason: "That time was just taken by another booking. Please pick another option." };
    }
    const row = (res as { appointment_id: string; access_token: string }[])[0]!;
    return { ok: true as const, token: row.access_token };
  });

/** For "not sure what's wrong" or "nothing fits": file an inquiry the owner follows up on. */
export const submitInquiry = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        serviceId: z.string().uuid().optional(),
        priority,
        contact,
        problem,
        kind: z.enum(["needs_info", "no_feasible_slot"]),
        date: date.optional(),
        part: part.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { admin, BUSINESS_ID, logEvent } = await import("./ops.server");
    const { zonedToUtc } = await import("@/lib/scheduling");
    const db = await admin();
    const customerId = await upsertCustomer(db, data.contact, BUSINESS_ID);
    const missing =
      data.kind === "needs_info"
        ? "Customer wasn't sure of the problem type — call to qualify."
        : `No technician fits the requested ${data.part ?? ""} window on ${data.date ?? "the chosen day"} — call back with options.`;
    const { data: inq, error } = await db
      .from("inquiries")
      .insert({
        business_id: BUSINESS_ID,
        customer_id: customerId,
        service_id: data.serviceId ?? null,
        priority: data.priority,
        description: data.problem.description,
        answers: data.problem.answers,
        status: data.kind === "needs_info" ? "needs_info" : "qualified",
        missing_info: missing,
        preferred_window_start: data.date ? zonedToUtc(data.date, "08:00") : null,
        preferred_window_end: data.date ? zonedToUtc(data.date, "17:00") : null,
      })
      .select("id")
      .single();
    if (error) throw new Error("Could not save your request");
    await logEvent(db, { inquiry_id: inq.id, type: "inquiry_received", actor_label: `${data.contact.fullName} (customer)`, reason: missing });
    if (data.kind === "needs_info")
      await logEvent(db, { inquiry_id: inq.id, type: "info_requested", actor_label: "CoolFlow system", reason: missing });
    return { ok: true };
  });

async function byToken(db: any, t: string) {
  const { data } = await db
    .from("appointments")
    .select("*, services(label), customers(full_name, phone), assignments(status, technician_id, technicians(full_name))")
    .eq("access_token", t)
    .maybeSingle();
  return data;
}

export const getBooking = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token }).parse(d))
  .handler(async ({ data }) => {
    const { admin } = await import("./ops.server");
    const db = await admin();
    const a = await byToken(db, data.token);
    if (!a) return null;
    const [ev, cr, nt] = await Promise.all([
      db.from("job_events").select("type, reason, before, after, created_at, actor_label").eq("appointment_id", a.id).order("created_at"),
      db.from("change_requests").select("id, kind, status, reason, proposed_window_start, proposed_window_end, created_at").eq("appointment_id", a.id).order("created_at"),
      db.from("notifications").select("subject, body, status, status_detail, created_at").eq("appointment_id", a.id).order("created_at"),
    ]);
    const active = (a.assignments as any[]).find((s) => s.status !== "replaced");
    const CUSTOMER_EVENTS = new Set([
      "appointment_confirmed", "technician_assigned", "reassigned", "swap_approved", "appointment_changed",
      "reschedule_proposed", "reschedule_approved", "delay_reported", "cancelled", "job_started", "job_completed", "status_changed",
    ]);
    return {
      id: a.id as string,
      status: a.status as string,
      priority: a.priority as string,
      service: a.services?.label as string,
      problem: a.problem_summary as string,
      customerName: a.customers?.full_name as string,
      address: `${a.address_line}, ${a.city} ${a.postal_code}`,
      windowStart: a.window_start as string,
      windowEnd: a.window_end as string,
      delayMinutes: a.delay_minutes as number,
      technicianFirstName: active ? (active.technicians?.full_name ?? "").split(" ")[0] : null,
      history: ((ev.data ?? []) as any[])
        .filter((e) => CUSTOMER_EVENTS.has(e.type))
        .map((e) => ({ type: e.type, reason: e.reason, before: e.before, after: e.after, at: e.created_at })),
      changeRequests: cr.data ?? [],
      notifications: nt.data ?? [],
    };
  });

export const cancelBooking = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, reason: z.string().trim().min(2).max(500) }).parse(d))
  .handler(async ({ data }) => {
    const { admin, logEvent, queueNotification } = await import("./ops.server");
    const db = await admin();
    const a = await byToken(db, data.token);
    if (!a) return { ok: false, reason: "Booking not found." };
    if (["cancelled", "completed", "in_progress"].includes(a.status))
      return { ok: false, reason: "This visit can no longer be cancelled online — please call us." };
    await db.from("appointments").update({ status: "cancelled" }).eq("id", a.id);
    await db.from("assignments").update({ status: "replaced" }).eq("appointment_id", a.id).neq("status", "replaced");
    await db.from("change_requests").update({ status: "withdrawn" }).eq("appointment_id", a.id).eq("status", "pending");
    await logEvent(db, {
      appointment_id: a.id, type: "cancelled", actor_label: `${a.customers?.full_name} (customer)`, reason: data.reason,
      before: { status: a.status, window_start: a.window_start }, after: { status: "cancelled" },
    });
    await queueNotification(db, { appointment_id: a.id, customer_id: a.customer_id, subject: "Visit cancelled", body: "Your CoolFlow visit has been cancelled." });
    return { ok: true };
  });

export const rescheduleOptions = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, date, part }).parse(d))
  .handler(async ({ data }) => {
    const { admin } = await import("./ops.server");
    const { computeOptions } = await import("./booking.server");
    const db = await admin();
    const a = await byToken(db, data.token);
    if (!a) return { options: [], summary: [], pastWindow: false };
    const r = await computeOptions(db, { serviceId: a.service_id, date: data.date, part: data.part, priority: a.priority, excludeAppointmentId: a.id });
    return { options: r.options, summary: r.summary, pastWindow: r.pastWindow };
  });

export const requestReschedule = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ token, technicianId: z.string().uuid(), start: z.string().datetime(), date, part, reason: z.string().trim().min(2).max(500) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { admin, BUSINESS_ID, loadOps, logEvent, ARRIVAL_SPREAD_MINUTES } = await import("./ops.server");
    const { recheck } = await import("./booking.server");
    const { zonedToUtc } = await import("@/lib/scheduling");
    const db = await admin();
    const a = await byToken(db, data.token);
    if (!a || ["cancelled", "completed"].includes(a.status)) return { ok: false, reason: "Booking can't be changed." };
    const dayStart = zonedToUtc(data.date, "00:00");
    const ops = await loadOps(db, dayStart, new Date(Date.parse(dayStart) + 36 * 3600_000).toISOString());
    const service = ops.services.find((s) => s.id === a.service_id)!;
    if (!recheck(ops, service, data.technicianId, data.start, data.date, data.part, a.priority, a.id).ok)
      return { ok: false, reason: "That time is no longer available." };
    await db.from("change_requests").update({ status: "withdrawn" }).eq("appointment_id", a.id).eq("status", "pending");
    const end = new Date(Date.parse(data.start) + ARRIVAL_SPREAD_MINUTES * 60_000).toISOString();
    await db.from("change_requests").insert({
      business_id: BUSINESS_ID, appointment_id: a.id, kind: "reschedule", requested_by: "customer", reason: data.reason,
      proposed_technician_id: data.technicianId, proposed_window_start: data.start, proposed_window_end: end,
    });
    await logEvent(db, {
      appointment_id: a.id, type: "reschedule_proposed", actor_label: `${a.customers?.full_name} (customer)`, reason: data.reason,
      before: { window_start: a.window_start, window_end: a.window_end }, after: { window_start: data.start, window_end: end },
    });
    return { ok: true };
  });
