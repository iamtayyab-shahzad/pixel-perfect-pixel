/** PDF job record export. The database stays the source of truth. */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { admin } from "./ops.server";
import { formatLocalDay, formatLocalTime } from "@/lib/scheduling";

const clean = (s: unknown) =>
  String(s ?? "")
    .replace(/[^\x20-\x7E]/g, (c) => ({ "—": "-", "–": "-", "°": " deg", "’": "'", "“": '"', "”": '"' })[c] ?? "")
    .trim();

export async function buildJobPdf(id: string): Promise<string> {
  const db = await admin();
  const { data: a } = await db
    .from("appointments")
    .select("*, services(label), customers(full_name, phone, email), assignments(status, technicians(full_name))")
    .eq("id", id)
    .single();
  const [{ data: ev }, { data: notes }, { data: notif }] = await Promise.all([
    db.from("job_events").select("*").eq("appointment_id", id).order("created_at"),
    db.from("job_notes").select("*").eq("appointment_id", id).order("created_at"),
    db.from("notifications").select("*").eq("appointment_id", id).order("created_at"),
  ]);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([612, 792]);
  let y = 740;
  const steel = rgb(0.17, 0.31, 0.45);
  const ink = rgb(0.12, 0.13, 0.15);
  const muted = rgb(0.42, 0.44, 0.47);
  const line = (text: string, o: { size?: number; b?: boolean; color?: ReturnType<typeof rgb>; x?: number } = {}) => {
    const size = o.size ?? 10;
    const f = o.b ? bold : font;
    const words = clean(text).split(" ");
    let cur = "";
    const flush = () => {
      if (y < 60) { page = pdf.addPage([612, 792]); y = 740; }
      page.drawText(cur, { x: o.x ?? 56, y, size, font: f, color: o.color ?? ink });
      y -= size + 5;
      cur = "";
    };
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(next, size) > 500 - ((o.x ?? 56) - 56)) flush();
      cur = cur ? `${cur} ${w}` : w;
    }
    if (cur) flush();
  };
  page.drawRectangle({ x: 0, y: 762, width: 612, height: 30, color: steel });
  page.drawText("CoolFlow HVAC  -  Job record", { x: 56, y: 772, size: 12, font: bold, color: rgb(1, 1, 1) });
  line(`${a.services?.label} for ${a.customers?.full_name}`, { size: 16, b: true });
  line(`Status: ${a.status.replace("_", " ")}  |  Priority: ${a.priority}  |  Record ${a.id.slice(0, 8)}`, { color: muted });
  y -= 6;
  const tech = (a.assignments as any[]).find((s) => s.status !== "replaced")?.technicians?.full_name ?? "Unassigned";
  for (const [k, v] of [
    ["Customer", `${a.customers?.full_name}  ${a.customers?.phone ?? ""}  ${a.customers?.email ?? ""}`],
    ["Address (at booking)", `${a.address_line}, ${a.city} ${a.postal_code}`],
    ["Problem", a.problem_summary],
    ["Arrival window", `${formatLocalDay(a.window_start)}, ${formatLocalTime(a.window_start)} - ${formatLocalTime(a.window_end)} (Austin time)`],
    ["Estimated duration", `${a.estimated_minutes} min${a.delay_minutes ? ` (+${a.delay_minutes} min reported delay)` : ""}`],
    ["Technician", tech],
  ] as const) {
    line(k, { b: true, size: 9, color: muted });
    line(String(v));
    y -= 2;
  }
  y -= 8;
  line("Notes", { b: true, size: 12, color: steel });
  if (!notes?.length) line("No notes.", { color: muted });
  for (const n of notes ?? []) line(`${formatLocalDay(n.created_at)} ${formatLocalTime(n.created_at)} - ${n.author_label}: ${n.body}`);
  y -= 8;
  line("Booking & change history", { b: true, size: 12, color: steel });
  for (const e of ev ?? []) {
    line(`${formatLocalDay(e.created_at)} ${formatLocalTime(e.created_at)} - ${e.type.replace(/_/g, " ")} by ${e.actor_label}`, { b: true, size: 9 });
    if (e.reason) line(`Reason: ${e.reason}`, { x: 68, size: 9 });
    if (e.before) line(`Before: ${JSON.stringify(e.before)}`, { x: 68, size: 8, color: muted });
    if (e.after) line(`After: ${JSON.stringify(e.after)}`, { x: 68, size: 8, color: muted });
  }
  y -= 8;
  line("Customer notifications", { b: true, size: 12, color: steel });
  for (const n of notif ?? []) line(`${n.subject} - ${n.status}${n.status_detail ? ` (${n.status_detail})` : ""}`, { size: 9 });
  y -= 10;
  line(`Exported ${new Date().toISOString()}. The CoolFlow database remains the source of truth.`, { size: 8, color: muted });
  const bytes = await pdf.save();
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}
