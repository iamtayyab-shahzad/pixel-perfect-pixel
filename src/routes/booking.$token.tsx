import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { cancelBooking, getBooking } from "@/services/booking.functions";
import { EmptyState, StatusBadge } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatLocalDay, formatLocalTime } from "@/lib/scheduling/time";

function CancelBox({ token, onDone }: { token: string; onDone: () => void }) {
  const fn = useServerFn(cancelBooking);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!open)
    return (
      <div className="mt-6 rounded-xl border bg-card p-4 text-sm">
        <p className="font-medium">Need to change plans?</p>
        <p className="mt-1 text-muted-foreground">To pick a different time, call us and we'll move it — you'll see the old and new time here.</p>
        <Button className="mt-3" variant="outline" size="sm" onClick={() => setOpen(true)}>Cancel this visit</Button>
      </div>
    );
  return (
    <div className="mt-6 rounded-xl border bg-card p-4 text-sm">
      <label className="grid gap-1.5">
        <span className="font-medium">Why are you cancelling?</span>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. The AC started working again" />
      </label>
      {err && <p role="alert" className="mt-2 text-destructive">{err}</p>}
      <div className="mt-3 flex gap-2">
        <Button variant="destructive" size="sm" disabled={busy || reason.trim().length < 2} onClick={async () => {
          setBusy(true); setErr(null);
          try { const r = await fn({ data: { token, reason } }); if (!r.ok) setErr(r.reason ?? "Couldn't cancel."); else onDone(); }
          catch { setErr("Couldn't cancel right now. Please call us."); }
          finally { setBusy(false); }
        }}>{busy ? "Cancelling…" : "Confirm cancellation"}</Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Keep my visit</Button>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/booking/$token")({
  head: () => ({
    meta: [
      { title: "Your CoolFlow visit" },
      { name: "description", content: "Details of your confirmed CoolFlow HVAC visit." },
      { property: "og:title", content: "Your CoolFlow visit" },
      { property: "og:description", content: "Your confirmed CoolFlow HVAC appointment." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BookingPage,
});

const STATUS: Record<string, [string, "ok" | "warn" | "urgent" | "info" | "idle"]> = {
  confirmed: ["Confirmed", "ok"], en_route: ["On the way", "info"], in_progress: ["In progress", "info"],
  delayed: ["Running late", "warn"], completed: ["Completed", "idle"], cancelled: ["Cancelled", "urgent"], proposed: ["Proposed", "warn"],
};

function BookingPage() {
  const { token } = Route.useParams();
  const fn = useServerFn(getBooking);
  const q = useQuery({ queryKey: ["booking", token], queryFn: () => fn({ data: { token } }), retry: false });

  if (q.isLoading) return <div className="mx-auto max-w-2xl px-5 py-12"><div className="h-64 animate-pulse rounded-xl border bg-card" /></div>;
  if (q.isError || !q.data)
    return (
      <div className="mx-auto max-w-2xl px-5 py-12">
        <EmptyState title="We couldn't find that booking" description="The link may be incomplete. Please check your confirmation message or call us.">
          <Button asChild variant="outline"><Link to="/">Back to home</Link></Button>
        </EmptyState>
      </div>
    );

  const b = q.data;
  const [label, tone] = STATUS[b.status] ?? [b.status, "idle"];
  const ref = b.id.slice(0, 8).toUpperCase();
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-5 sm:py-12">
      <p className="eyebrow mb-2">Booking {ref}</p>
      <h1 className="text-3xl font-semibold">{b.status === "confirmed" ? "You're booked." : "Your visit"}</h1>
      <p className="mt-2 text-muted-foreground">
        {b.status === "confirmed" ? `Thanks, ${b.customerName.split(" ")[0]}. A qualified technician is reserved for you — this time is locked in.` : "Here's the latest on your visit."}
      </p>

      <div className="mt-6 rounded-xl border bg-card">
        <div className="flex items-start justify-between gap-3 border-b p-5">
          <div>
            <p className="font-mono text-[11px] uppercase text-muted-foreground">Arrival window</p>
            <p className="mt-1 text-xl font-semibold">{formatLocalDay(b.windowStart)}</p>
            <p className="text-lg">{formatLocalTime(b.windowStart)} – {formatLocalTime(b.windowEnd)} <span className="text-sm text-muted-foreground">Austin time</span></p>
            {b.delayMinutes > 0 && <p className="mt-1 text-sm text-status-warn">Running about {b.delayMinutes} min late</p>}
          </div>
          <StatusBadge tone={tone}>{label}</StatusBadge>
        </div>
        <dl className="grid gap-4 p-5 sm:grid-cols-2">
          <Item k="Service" v={b.service} />
          <Item k="Technician" v={b.technicianFirstName ?? "Being assigned"} />
          <Item k="Customer" v={b.customerName} />
          <Item k="Address" v={b.address} />
          <Item k="Problem" v={b.problem} wide />
          <Item k="Reference" v={ref} mono />
        </dl>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">Bookmark this page — it's your private link to check on the visit.</p>
      {b.notifications.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">Confirmation message: {b.notifications[0]!.status_detail ?? b.notifications[0]!.status}</p>
      )}
      {["confirmed", "proposed", "delayed"].includes(b.status) && <CancelBox token={token} onDone={() => q.refetch()} />}
      <div className="mt-6"><Button asChild variant="outline"><Link to="/">Back to home</Link></Button></div>
    </div>
  );
}

function Item({ k, v, wide, mono }: { k: string; v: string; wide?: boolean; mono?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="font-mono text-[11px] uppercase text-muted-foreground">{k}</dt>
      <dd className={mono ? "mt-0.5 font-mono" : "mt-0.5"}>{v}</dd>
    </div>
  );
}
