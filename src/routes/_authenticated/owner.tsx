import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { clearBlock, getDispatch, markUnavailable, updateInquiry } from "@/services/staff.functions";
import { EmptyState, PageHeader, Section, StatusBadge } from "@/components/app/primitives";
import { AVAILABILITY, JobDrawer, JobStatus, Priority, errMsg, win } from "@/components/app/jobs";
import { TeamEditor } from "@/components/app/TeamEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { localDate, formatLocalDay } from "@/lib/scheduling/time";

export const Route = createFileRoute("/_authenticated/owner")({
  head: () => ({
    meta: [
      { title: "Dispatch — CoolFlow HVAC" },
      { name: "description", content: "Owner dispatch board for CoolFlow HVAC." },
      { property: "og:title", content: "Dispatch — CoolFlow HVAC" },
      { property: "og:description", content: "Inquiries, today's schedule and technicians in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Owner,
});

function Owner() {
  const [date, setDate] = useState(() => localDate(Date.now()));
  const [job, setJob] = useState<string | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [blockFor, setBlockFor] = useState<{ id: string; name: string } | null>(null);
  const qc = useQueryClient();
  const fn = useServerFn(getDispatch);
  const q = useQuery({ queryKey: ["dispatch", date], queryFn: () => fn({ data: { date } }), refetchInterval: 30_000, retry: false });
  const clearFn = useServerFn(clearBlock);
  const inqFn = useServerFn(updateInquiry);
  const clear = useMutation({ mutationFn: (id: string) => clearFn({ data: { id } }), onSuccess: () => qc.invalidateQueries(), onError: (e) => toast.error(errMsg(e)) });
  const inq = useMutation({
    mutationFn: (v: { id: string; status: "qualified" | "closed_lost" }) => inqFn({ data: v }),
    onSuccess: () => { toast.success("Inquiry updated"); qc.invalidateQueries(); },
    onError: (e) => toast.error(errMsg(e)),
  });

  const day = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <PageHeader
        eyebrow="Owner"
        title="Dispatch"
        description={`${formatLocalDay(`${date}T17:00:00Z`)} · Austin time`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setDate(day(date, -1))} aria-label="Previous day">←</Button>
            <Button variant="outline" size="sm" onClick={() => setDate(localDate(Date.now()))}>Today</Button>
            <Button variant="outline" size="sm" onClick={() => setDate(day(date, 1))} aria-label="Next day">→</Button>
          </div>
        }
      />

      {q.isLoading ? (
        <div className="mt-8 grid gap-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : q.isError ? (
        <EmptyState className="mt-8" title="Couldn't load dispatch" description={errMsg(q.error)}>
          <Button variant="outline" onClick={() => q.refetch()}>Try again</Button>
        </EmptyState>
      ) : q.data ? (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
            {[
              ["Needs attention", q.data.attention.length, q.data.attention.length ? "text-cta" : ""],
              ["Jobs today", q.data.jobs.filter((j) => j.status !== "cancelled").length, ""],
              ["Technicians available", `${q.data.technicians.filter((x) => x.availability === "available" || x.availability === "busy").length}/${q.data.technicians.length}`, ""],
              ["Messages to send", q.data.pendingNotifications.length, ""],
            ].map(([k, v, c]) => (
              <div key={k as string} className="bg-card p-4">
                <dt className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{k}</dt>
                <dd className={`mt-1 text-2xl font-semibold ${c}`}>{v}</dd>
              </div>
            ))}
          </dl>
          <Section title={`Needs attention · ${q.data.attention.length}`}>
            {q.data.attention.length ? (
              <ul className="grid gap-2 md:grid-cols-2">
                {q.data.attention.map((a, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 rounded-xl border bg-card p-4">
                    <div className="min-w-0">
                      <StatusBadge tone={a.tone}>{a.kind.replace("_", " ")}</StatusBadge>
                      <p className="mt-1.5 font-medium">{a.title}</p>
                      <p className="text-sm text-muted-foreground">{a.detail}</p>
                    </div>
                    {a.appointmentId && <Button size="sm" variant="outline" onClick={() => setJob(a.appointmentId!)}>Open</Button>}
                    {a.inquiryId && (
                      <div className="flex shrink-0 flex-col gap-1">
                        <Button size="sm" variant="outline" disabled={inq.isPending} onClick={() => inq.mutate({ id: a.inquiryId!, status: "qualified" })}>Called back</Button>
                        <Button size="sm" variant="ghost" disabled={inq.isPending} onClick={() => inq.mutate({ id: a.inquiryId!, status: "closed_lost" })}>Close</Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="Nothing needs you right now" description="Exceptions like sick technicians, delays and change requests show up here." />}
          </Section>

          <Section title="Team">
            <div className="mb-3 flex justify-end"><Button size="sm" variant="outline" onClick={() => setEdit("new")}>Add technician</Button></div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {q.data.technicians.map((tch) => {
                const [label, tone] = AVAILABILITY[tch.availability] ?? ["—", "idle" as const];
                return (
                  <div key={tch.id} className="rounded-xl border bg-card p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{tch.name}{tch.isOwner ? " · owner" : ""}</p>
                      <StatusBadge tone={tone}>{label}</StatusBadge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{tch.skills.map((s) => s.label).join(" · ")}</p>
                    {tch.block?.note && <p className="mt-1 text-xs">{tch.block.note}</p>}
                    <div className="mt-3 flex flex-wrap gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEdit(tch.id)}>Edit</Button>
                      {tch.block ? (
                        <Button size="sm" variant="ghost" disabled={clear.isPending} onClick={() => clear.mutate(tch.block!.id)}>Mark available again</Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setBlockFor({ id: tch.id, name: tch.name })}>Mark unavailable</Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title={`Board · ${q.data.jobs.filter((j) => j.status !== "cancelled").length} jobs`}>
            {q.data.jobs.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {q.data.technicians.map((tch) => {
                  const jobs = q.data!.jobs.filter((j) => j.technicianId === tch.id && j.status !== "cancelled");
                  return (
                    <div key={tch.id} className="rounded-xl border bg-card">
                      <div className="flex items-center justify-between border-b px-4 py-2.5">
                        <p className="font-medium">{tch.name}</p>
                        <span className="font-mono text-xs text-muted-foreground">{jobs.length} job{jobs.length === 1 ? "" : "s"}</span>
                      </div>
                      {jobs.length ? (
                        <ol className="divide-y">
                          {jobs.map((j) => (
                            <li key={j.id}>
                              <button onClick={() => setJob(j.id)} className="grid w-full grid-cols-[5.5rem_1fr] gap-3 px-4 py-3 text-left hover:bg-surface">
                                <span className="font-mono text-xs leading-5">{win(j.windowStart, j.windowEnd)}<br /><span className="text-muted-foreground">{j.estimatedMinutes} min</span></span>
                                <span className="min-w-0">
                                  <span className="flex flex-wrap items-center gap-1.5"><span className="font-medium">{j.customer}</span><JobStatus status={j.status} /><Priority p={j.priority} /></span>
                                  <span className="block truncate text-sm text-muted-foreground">{j.service} · {j.problem}</span>
                                  {j.warnings.map((w) => <span key={w} className="mt-1 block text-xs text-status-warn">{w}</span>)}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ol>
                      ) : <p className="px-4 py-5 text-sm text-muted-foreground">No jobs.</p>}
                    </div>
                  );
                })}
              </div>
            ) : <EmptyState title="No appointments this day" description="Bookings made through the customer page land here automatically." />}
          </Section>

          <Section title={`Customer messages not yet sent · ${q.data.pendingNotifications.length}`}>
            {q.data.pendingNotifications.length ? (
              <ul className="divide-y rounded-xl border bg-card text-sm">
                {q.data.pendingNotifications.map((n) => (
                  <li key={n.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span><span className="font-medium">{n.customer}</span> · {n.subject}<span className="block text-xs text-muted-foreground">{n.detail}</span></span>
                    <Button size="sm" variant="ghost" onClick={() => setJob(n.appointmentId)}>Open</Button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">All customer messages handled.</p>}
          </Section>
        </>
      ) : null}

      <JobDrawer id={job} mode="owner" onClose={() => setJob(null)} />
      <TeamEditor target={edit} onClose={() => setEdit(null)} />
      <BlockDialog tech={blockFor} date={date} onClose={() => setBlockFor(null)} />
    </div>
  );
}

const KINDS = [["sick", "Sick"], ["off", "Off today"], ["leave", "On leave"], ["unavailable", "Unavailable"]] as const;

function BlockDialog({ tech, date, onClose }: { tech: { id: string; name: string } | null; date: string; onClose: () => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(markUnavailable);
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("sick");
  const [to, setTo] = useState(date);
  const [note, setNote] = useState("");
  const m = useMutation({
    mutationFn: () => fn({ data: { technicianId: tech!.id, kind, fromDate: date, toDate: to < date ? date : to, note: note || undefined } }),
    onSuccess: (r) => {
      toast.success(r.affectedJobs ? `${r.affectedJobs} booked job(s) need a decision — nothing was moved` : "Marked unavailable");
      qc.invalidateQueries(); setNote(""); onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Dialog open={!!tech} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark {tech?.name} unavailable</DialogTitle>
          <DialogDescription>New bookings will skip them. Booked jobs stay as they are and show up under Needs attention for you to reassign.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {KINDS.map(([k, l]) => (
            <button key={k} onClick={() => setKind(k)} className={`min-h-11 rounded-md border px-3 ${kind === k ? "border-primary bg-surface font-medium" : ""}`}>{l}</button>
          ))}
        </div>
        <label className="text-sm">Through (last day)<Input type="date" value={to} min={date} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="text-sm">Note<Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></label>
        <Button disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Saving…" : "Save"}</Button>
      </DialogContent>
    </Dialog>
  );
}
