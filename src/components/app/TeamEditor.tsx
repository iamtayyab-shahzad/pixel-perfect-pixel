import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getTeam, saveTechnician } from "@/services/staff.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errMsg } from "@/components/app/jobs";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type Level = "primary" | "capable";
type Hours = Record<number, { start: string; end: string } | undefined>;

/** target: null = closed, "new" = add, otherwise a technician id to edit. */
export function TeamEditor({ target, onClose }: { target: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const teamFn = useServerFn(getTeam);
  const saveFn = useServerFn(saveTechnician);
  const q = useQuery({ queryKey: ["team"], queryFn: () => teamFn(), enabled: !!target, retry: false });
  const existing = target && target !== "new" ? q.data?.technicians.find((t) => t.id === target) : undefined;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [active, setActive] = useState(true);
  const [skills, setSkills] = useState<Record<string, Level | undefined>>({});
  const [hours, setHours] = useState<Hours>({});

  useEffect(() => {
    if (!target) return;
    if (existing) {
      setName(existing.fullName); setEmail(existing.email); setPhone(existing.phone); setActive(existing.active);
      setSkills(Object.fromEntries(existing.skills.map((s) => [s.skillId, s.level])));
      setHours(Object.fromEntries(existing.hours.map((h) => [h.weekday, { start: h.start, end: h.end }])));
    } else if (target === "new") {
      setName(""); setEmail(""); setPhone(""); setActive(true); setSkills({});
      setHours(Object.fromEntries([1, 2, 3, 4, 5].map((d) => [d, { start: "08:00", end: "17:00" }])));
    }
  }, [target, existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = useMutation({
    mutationFn: () => saveFn({ data: {
      id: existing?.id, fullName: name, email, phone, active,
      skills: Object.entries(skills).filter(([, l]) => l).map(([skillId, level]) => ({ skillId, level: level! })),
      hours: Object.entries(hours).filter(([, h]) => h).map(([d, h]) => ({ weekday: Number(d), start: h!.start, end: h!.end })),
    } }),
    onSuccess: () => { toast.success(existing ? "Technician updated" : "Technician added"); qc.invalidateQueries(); onClose(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const cycle = (id: string) => setSkills((s) => ({ ...s, [id]: s[id] === undefined ? "capable" : s[id] === "capable" ? "primary" : undefined }));

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? `Edit ${existing.fullName}` : "Add technician"}</DialogTitle>
          <DialogDescription>Smart Slot Match only offers a technician for jobs that match their specialties and working hours.</DialogDescription>
        </DialogHeader>
        {q.isLoading ? <div className="h-40 animate-pulse rounded-md bg-muted" /> : q.isError ? <p className="text-sm text-destructive">{errMsg(q.error)}</p> : (
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
            <label className="grid gap-1 text-sm">Full name<Input required value={name} onChange={(e) => setName(e.target.value)} className="h-11" /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">Email (used to sign in)<Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" /></label>
              <label className="grid gap-1 text-sm">Phone<Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11" /></label>
            </div>
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Specialties</legend>
              <p className="mb-2 text-xs text-muted-foreground">Tap to cycle: not offered → capable → primary (preferred).</p>
              <div className="flex flex-wrap gap-2">
                {q.data?.skills.map((s) => {
                  const l = skills[s.id];
                  return (
                    <button type="button" key={s.id} onClick={() => cycle(s.id)}
                      className={`min-h-11 rounded-md border px-3 text-sm ${l === "primary" ? "border-primary bg-primary text-primary-foreground" : l === "capable" ? "border-primary bg-surface" : "text-muted-foreground"}`}>
                      {s.label}{l ? ` · ${l}` : ""}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Working hours (Austin time)</legend>
              <div className="grid gap-1.5">
                {DAYS.map((d, i) => {
                  const h = hours[i];
                  return (
                    <div key={d} className="grid grid-cols-[4.5rem_1fr_1fr] items-center gap-2">
                      <label className="flex min-h-11 items-center gap-2 text-sm">
                        <input type="checkbox" className="size-4" checked={!!h} onChange={(e) => setHours((x) => ({ ...x, [i]: e.target.checked ? { start: "08:00", end: "17:00" } : undefined }))} />{d}
                      </label>
                      {h ? <>
                        <Input type="time" aria-label={`${d} start`} value={h.start} onChange={(e) => setHours((x) => ({ ...x, [i]: { ...h, start: e.target.value } }))} />
                        <Input type="time" aria-label={`${d} end`} value={h.end} onChange={(e) => setHours((x) => ({ ...x, [i]: { ...h, end: e.target.value } }))} />
                      </> : <span className="col-span-2 text-xs text-muted-foreground">Off</span>}
                    </div>
                  );
                })}
              </div>
            </fieldset>
            {!existing?.isOwner && (
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" className="size-4" checked={active} onChange={(e) => setActive(e.target.checked)} />
                Active — can receive new bookings
              </label>
            )}
            <Button type="submit" className="h-11" disabled={m.isPending}>{m.isPending ? "Saving…" : existing ? "Save changes" : "Add technician"}</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
