import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  addNote,
  decideChange,
  getJob,
  jobRecordPdf,
  markNotificationHandled,
  proposeChange,
  reassignOptions,
  setJobStatus,
} from "@/services/staff.functions";
import { StatusBadge } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { formatLocalDay, formatLocalTime } from "@/lib/scheduling/time";

type Tone = "ok" | "warn" | "urgent" | "info" | "idle";
export const JOB_STATUS: Record<string, [string, Tone]> = {
  proposed: ["Proposed", "warn"],
  confirmed: ["Confirmed", "info"],
  en_route: ["En route", "info"],
  in_progress: ["In progress", "ok"],
  delayed: ["Delayed", "warn"],
  completed: ["Completed", "idle"],
  cancelled: ["Cancelled", "idle"],
};
export const PRIORITY: Record<string, [string, Tone]> = {
  emergency: ["Emergency", "urgent"],
  high: ["High", "warn"],
  normal: ["Normal", "idle"],
  routine: ["Routine", "idle"],
};
export const AVAILABILITY: Record<string, [string, Tone]> = {
  available: ["Available", "ok"],
  busy: ["On a job", "info"],
  sick: ["Sick", "urgent"],
  off_today: ["Off today", "idle"],
  on_leave: ["On leave", "idle"],
  unavailable: ["Unavailable", "warn"],
};

export const t = (iso: string) => formatLocalTime(iso);
export const win = (a: string, b: string) => `${t(a)}–${t(b)}`;
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

export function JobStatus({ status }: { status: string }) {
  const [l, tone] = JOB_STATUS[status] ?? [status, "idle" as Tone];
  return <StatusBadge tone={tone}>{l}</StatusBadge>;
}
export function Priority({ p }: { p: string }) {
  if (p === "normal" || p === "routine") return null;
  const [l, tone] = PRIORITY[p] ?? [p, "idle" as Tone];
  return <StatusBadge tone={tone}>{l}</StatusBadge>;
}

const EVENT_LABEL: Record<string, string> = {
  inquiry_received: "Request received",
  inquiry_qualified: "Request qualified",
  slot_offered: "Times offered",
  appointment_confirmed: "Booking confirmed",
  technician_assigned: "Technician assigned",
  status_changed: "Status changed",
  job_started: "Work started",
  job_completed: "Job completed",
  delay_reported: "Delay reported",
  technician_unavailable: "Technician became unavailable",
  swap_requested: "Reassignment proposed",
  reschedule_proposed: "New time proposed",
  reschedule_requested: "Customer asked to reschedule",
  swap_approved: "Reassignment approved",
  reschedule_approved: "Reschedule approved",
  appointment_changed: "Appointment changed",
  cancelled: "Cancelled",
  note_added: "Note",
  customer_notified: "Customer notified",
};

function fmtVal(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return `${formatLocalDay(v)} ${t(v)}`;
  if (typeof v === "object") return "";
  return String(v).replace(/_/g, " ");
}
function Diff({ before, after }: { before: any; after: any }) {
  if (!after || typeof after !== "object") return null;
  const keys = Object.keys(after).filter((k) => ["window_start", "window_end", "technician", "status", "delay_minutes", "kind"].includes(k));
  if (!keys.length) return null;
  return (
    <div className="mt-1 space-y-0.5 font-mono text-[11px]">
      {keys.map((k) => (
        <div key={k}>
          <span className="text-muted-foreground">{k.replace(/_/g, " ")}: </span>
          {before && k in before && <span className="line-through text-muted-foreground">{fmtVal(before[k])}</span>}
          {before && k in before && " → "}
          <span>{fmtVal(after[k])}</span>
        </div>
      ))}
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t pt-4">
      <h3 className="eyebrow mb-2">{title}</h3>
      {children}
    </div>
  );
}

export function JobDrawer({ id, onClose, mode }: { id: string | null; onClose: () => void; mode: "owner" | "tech" }) {
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {id && <JobDetail id={id} mode={mode} />}
      </SheetContent>
    </Sheet>
  );
}

function JobDetail({ id, mode }: { id: string; mode: "owner" | "tech" }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getJob);
  const q = useQuery({ queryKey: ["job", id], queryFn: () => getFn({ data: { id } }) });
  const refresh = () => qc.invalidateQueries();
  const statusFn = useServerFn(setJobStatus);
  const noteFn = useServerFn(addNote);
  const pdfFn = useServerFn(jobRecordPdf);
  const notifFn = useServerFn(markNotificationHandled);
  const decideFn = useServerFn(decideChange);
  const [note, setNote] = useState("");
  const [delay, setDelay] = useState({ open: false, minutes: "30", reason: "" });

  const status = useMutation({
    mutationFn: (v: { status: "en_route" | "in_progress" | "completed" | "delayed"; delayMinutes?: number; reason?: string }) =>
      statusFn({ data: { id, ...v } }),
    onSuccess: () => { toast.success("Status updated"); setDelay({ open: false, minutes: "30", reason: "" }); refresh(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const addN = useMutation({
    mutationFn: () => noteFn({ data: { id, body: note } }),
    onSuccess: () => { setNote(""); refresh(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const pdf = useMutation({
    mutationFn: () => pdfFn({ data: { id } }),
    onSuccess: (r) => {
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url; a.download = `coolflow-job-${id.slice(0, 8)}.pdf`; a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const notif = useMutation({ mutationFn: (nid: string) => notifFn({ data: { id: nid } }), onSuccess: refresh, onError: (e) => toast.error(errMsg(e)) });
  const decide = useMutation({
    mutationFn: (v: { id: string; approve: boolean }) => decideFn({ data: v }),
    onSuccess: (r: any) => { if (r && r.ok === false) toast.error(`Not approved: ${r.reason}`); else toast.success("Decision recorded"); refresh(); },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (q.isLoading) return <div className="mt-10 h-40 animate-pulse rounded-lg bg-muted" />;
  if (q.isError || !q.data) return <p className="mt-10 text-sm text-destructive">{errMsg(q.error)}</p>;
  const j = q.data;
  const closed = ["completed", "cancelled"].includes(j.status);
  const pending = (j.changeRequests as any[]).filter((c) => c.status === "pending");

  return (
    <div className="space-y-4 pb-10">
      <SheetHeader className="p-0 text-left">
        <div className="flex flex-wrap gap-2"><JobStatus status={j.status} /><Priority p={j.priority} /></div>
        <SheetTitle className="text-xl">{j.customer?.full_name}</SheetTitle>
        <SheetDescription>{j.service} · {j.problem}</SheetDescription>
      </SheetHeader>

      <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Arrival</dt><dd>{formatLocalDay(j.windowStart)} · {win(j.windowStart, j.windowEnd)}</dd>
        <dt className="text-muted-foreground">Duration</dt><dd>About {j.estimatedMinutes} min{j.delayMinutes ? ` · running ${j.delayMinutes} min late` : ""}</dd>
        <dt className="text-muted-foreground">Technician</dt><dd>{j.technician?.name ?? "Unassigned"}</dd>
        <dt className="text-muted-foreground">Address</dt><dd>{j.address}</dd>
        <dt className="text-muted-foreground">Phone</dt><dd><a className="underline" href={`tel:${j.customer?.phone}`}>{j.customer?.phone}</a></dd>
      </dl>

      {!closed && (
        <Block title="Update status">
          <div className="flex flex-wrap gap-2">
            {j.status !== "en_route" && j.status !== "in_progress" && (
              <Button size="sm" variant="outline" disabled={status.isPending} onClick={() => status.mutate({ status: "en_route" })}>En route</Button>
            )}
            {j.status !== "in_progress" && (
              <Button size="sm" variant="outline" disabled={status.isPending} onClick={() => status.mutate({ status: "in_progress" })}>In progress</Button>
            )}
            {(j.status === "in_progress" || j.status === "delayed") && (
              <Button size="sm" disabled={status.isPending} onClick={() => status.mutate({ status: "completed" })}>Completed</Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setDelay((d) => ({ ...d, open: !d.open }))}>Delayed…</Button>
          </div>
          {delay.open && (
            <div className="mt-3 grid gap-2 rounded-lg border bg-surface p-3">
              <label className="text-sm">Minutes late
                <Input type="number" min={5} max={480} value={delay.minutes} onChange={(e) => setDelay({ ...delay, minutes: e.target.value })} />
              </label>
              <label className="text-sm">Reason
                <Input value={delay.reason} placeholder="e.g. compressor replacement took longer" onChange={(e) => setDelay({ ...delay, reason: e.target.value })} />
              </label>
              <p className="text-xs text-muted-foreground">The customer's promised window stays as booked. The delay is logged and later jobs are flagged if at risk.</p>
              <Button size="sm" disabled={!delay.reason.trim() || status.isPending}
                onClick={() => status.mutate({ status: "delayed", delayMinutes: Number(delay.minutes), reason: delay.reason })}>Report delay</Button>
            </div>
          )}
        </Block>
      )}

      {mode === "owner" && pending.length > 0 && (
        <Block title="Waiting for your decision">
          {pending.map((c) => (
            <div key={c.id} className="rounded-lg border bg-status-warn-soft/40 p-3 text-sm">
              <p className="font-medium">{c.kind === "reschedule" ? "Reschedule" : "Reassignment"} · {c.requested_by}</p>
              <p className="text-muted-foreground">{c.reason}</p>
              {c.proposed_window_start ? (
                <>
                  <p className="mt-1">Proposed: {formatLocalDay(c.proposed_window_start)} {win(c.proposed_window_start, c.proposed_window_end)} with {c.proposedTechnician}</p>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: c.id, approve: true })}>Validate & approve</Button>
                    <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: c.id, approve: false })}>Reject</Button>
                  </div>
                </>
              ) : <p className="mt-1">No time proposed yet. Pick a validated alternative below.</p>}
            </div>
          ))}
        </Block>
      )}

      {mode === "owner" && !closed && <Alternatives id={id} onDone={refresh} />}

      <Block title="Notes">
        <ul className="space-y-2 text-sm">
          {(j.notes as any[]).map((n) => (
            <li key={n.id} className="rounded-md bg-surface p-2"><span className="text-muted-foreground">{n.author_label}, {t(n.created_at)}:</span> {n.body}</li>
          ))}
          {!j.notes.length && <li className="text-muted-foreground">No notes yet.</li>}
        </ul>
        <div className="mt-2 flex gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note" />
          <Button size="sm" variant="outline" disabled={!note.trim() || addN.isPending} onClick={() => addN.mutate()}>Add</Button>
        </div>
      </Block>

      {mode === "owner" && (
        <Block title="Customer messages">
          <ul className="space-y-2 text-sm">
            {(j.notifications as any[]).map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-2">
                <div>
                  <p>{n.subject}</p>
                  <p className="text-xs text-muted-foreground">{n.status_detail}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge tone={n.status === "sent" ? "ok" : n.status === "failed" ? "urgent" : "warn"}>{n.status === "pending" ? "Not sent" : n.status}</StatusBadge>
                  {n.status === "pending" && (
                    <button className="text-xs underline" onClick={() => notif.mutate(n.id)}>I told them by phone</button>
                  )}
                </div>
              </li>
            ))}
            {!j.notifications.length && <li className="text-muted-foreground">No messages.</li>}
          </ul>
        </Block>
      )}

      <Block title="History">
        <ol className="space-y-3 border-l pl-4 text-sm">
          {(j.events as any[]).map((e) => (
            <li key={e.id}>
              <p className="font-medium">{EVENT_LABEL[e.type] ?? e.type}</p>
              <p className="text-xs text-muted-foreground">{formatLocalDay(e.created_at)} {t(e.created_at)} · {e.actor_label}</p>
              {e.reason && <p className="text-muted-foreground">{e.reason}</p>}
              <Diff before={e.before} after={e.after} />
            </li>
          ))}
        </ol>
      </Block>

      <Button variant="outline" className="w-full" disabled={pdf.isPending} onClick={() => pdf.mutate()}>
        {pdf.isPending ? "Preparing PDF…" : "Download job record (PDF)"}
      </Button>
    </div>
  );
}

function Alternatives({ id, onDone }: { id: string; onDone: () => void }) {
  const optFn = useServerFn(reassignOptions);
  const propFn = useServerFn(proposeChange);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<{ technicianId: string; start: string; label: string } | null>(null);
  const [reason, setReason] = useState("");
  const q = useQuery({ queryKey: ["alts", id], queryFn: () => optFn({ data: { id } }), enabled: open });
  const prop = useMutation({
    mutationFn: () => propFn({ data: { id, technicianId: pick!.technicianId, start: pick!.start, reason } }),
    onSuccess: () => { toast.success("Proposal saved — validate & approve above"); setPick(null); setReason(""); setOpen(false); onDone(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Block title="Reassign or reschedule">
      {!open ? (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Find validated alternatives</Button>
      ) : q.isLoading ? (
        <p className="text-sm text-muted-foreground">Running Smart Slot Match…</p>
      ) : q.isError ? (
        <p className="text-sm text-destructive">{errMsg(q.error)}</p>
      ) : q.data ? (
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">Same time ({win(q.data.windowStart, q.data.windowEnd)}), different technician:</p>
          <ul className="space-y-1.5">
            {q.data.sameTime.map((s) => (
              <li key={s.technicianId}>
                <button disabled={!s.feasible}
                  onClick={() => setPick({ technicianId: s.technicianId, start: q.data!.windowStart, label: `${s.name} at the same time` })}
                  className={`w-full rounded-md border p-2 text-left ${s.feasible ? "hover:border-primary" : "cursor-not-allowed opacity-60"} ${pick?.technicianId === s.technicianId && pick.start === q.data!.windowStart ? "border-primary bg-surface" : ""}`}>
                  <span className="font-medium">{s.name}</span> {s.feasible ? <StatusBadge tone="ok">Valid</StatusBadge> : <StatusBadge tone="idle">Not valid</StatusBadge>}
                  {!s.feasible && <span className="mt-0.5 block text-xs text-muted-foreground">{s.failed[0]}</span>}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">Other valid times that day:</p>
          {q.data.otherTimes.length ? (
            <div className="flex flex-wrap gap-2">
              {q.data.otherTimes.map((o) => (
                <button key={o.technicianId + o.start}
                  onClick={() => setPick({ technicianId: o.technicianId, start: o.start, label: `${o.name} at ${t(o.start)}` })}
                  className={`rounded-md border px-2.5 py-1.5 ${pick?.start === o.start && pick.technicianId === o.technicianId ? "border-primary bg-surface" : "hover:border-primary"}`}>
                  {t(o.start)} · {o.name.split(" ")[0]}
                </button>
              ))}
            </div>
          ) : <p>No other valid time that day.</p>}
          {pick && (
            <div className="grid gap-2 rounded-lg border bg-surface p-3">
              <p>Propose: <strong>{pick.label}</strong></p>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (shown in history and to the customer)" />
              <Button size="sm" disabled={reason.trim().length < 3 || prop.isPending} onClick={() => prop.mutate()}>Save proposal</Button>
            </div>
          )}
        </div>
      ) : null}
    </Block>
  );
}
