import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PageHeader, EmptyState } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getCatalog, findSlots, submitBooking, submitInquiry } from "@/services/booking.functions";
import { formatLocalDay, formatLocalTime, localDate, zonedToUtc } from "@/lib/scheduling/time";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/book")({
  head: () => ({
    meta: [
      { title: "Request a visit — CoolFlow HVAC" },
      { name: "description", content: "Tell CoolFlow what's wrong and when you need help. We only show times a qualified technician can actually make." },
      { property: "og:title", content: "Request a visit — CoolFlow HVAC" },
      { property: "og:description", content: "Book heating and cooling service in Austin, TX — only real, feasible times." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Book,
});

type Priority = "emergency" | "high" | "normal" | "routine";
type Part = "morning" | "afternoon" | "anytime";

/** Problem → follow-up → service code. `null` means we can't qualify it online. */
const PROBLEMS: {
  id: string;
  label: string;
  hint: string;
  code?: string;
  followUp?: { q: string; options: { label: string; code: string | null }[] };
}[] = [
  { id: "not_cooling", label: "AC not cooling", hint: "Running, but the air isn't cold", code: "ac_repair" },
  {
    id: "stopped", label: "AC completely stopped", hint: "Nothing turns on",
    followUp: { q: "Does the breaker keep tripping, or is there no power to the unit?", options: [
      { label: "Yes — breaker trips / no power", code: "electrical" },
      { label: "No — power is fine, unit won't start", code: "ac_repair" },
      { label: "I'm not sure", code: null },
    ] },
  },
  {
    id: "noise", label: "Strange noise", hint: "Rattling, buzzing, whistling",
    followUp: { q: "Where is the noise coming from?", options: [
      { label: "Outdoor unit", code: "ac_repair" },
      { label: "Vents or ducts inside", code: "ductwork" },
      { label: "I'm not sure", code: null },
    ] },
  },
  {
    id: "leak", label: "Leaking", hint: "Water, ice or hissing",
    followUp: { q: "What does the leak look like?", options: [
      { label: "Ice on the lines or a hissing sound", code: "refrigerant" },
      { label: "Water dripping from the indoor unit", code: "ac_repair" },
      { label: "I'm not sure", code: null },
    ] },
  },
  {
    id: "heating", label: "Heating problem", hint: "No heat or weak heat",
    followUp: { q: "Is your system a heat pump?", options: [
      { label: "Yes, a heat pump", code: "heat_pump" },
      { label: "No / I'm not sure", code: null },
    ] },
  },
  { id: "tuneup", label: "Seasonal tune-up", hint: "Routine check, nothing broken", code: "tuneup" },
  { id: "other", label: "Something else", hint: "We'll call you to figure it out" },
];

const contactSchema = z.object({
  fullName: z.string().trim().min(2, "Please enter your name"),
  phone: z.string().trim().regex(/^[\d\s()+.-]{7,30}$/, "Enter a phone number we can call"),
  email: z.string().trim().email("Enter a valid email").or(z.literal("")),
  addressLine: z.string().trim().min(3, "Enter the street address"),
  city: z.string().trim().min(2, "Enter the city"),
  postalCode: z.string().trim().regex(/^\d{5}$/, "5-digit ZIP"),
});
type Contact = z.infer<typeof contactSchema>;

const STEPS = ["Problem", "Details", "When", "Options"];

function Book() {
  const navigate = useNavigate();
  const catalogFn = useServerFn(getCatalog);
  const findFn = useServerFn(findSlots);
  const bookFn = useServerFn(submitBooking);
  const inquiryFn = useServerFn(submitInquiry);
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => catalogFn() });

  const [step, setStep] = useState(0);
  const [problemId, setProblemId] = useState<string>();
  const [followCode, setFollowCode] = useState<string | null | undefined>();
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState<Contact>({ fullName: "", phone: "", email: "", addressLine: "", city: "Austin", postalCode: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof Contact, string>>>({});
  const [days, setDays] = useState<string[]>([]);
  const [date, setDate] = useState<string>();
  const [part, setPart] = useState<Part>("anytime");
  const [priority, setPriority] = useState<Priority>("normal");
  const [slots, setSlots] = useState<Awaited<ReturnType<typeof findSlots>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [inquiryDone, setInquiryDone] = useState<string>();

  useEffect(() => {
    const out: string[] = [];
    for (let i = 0; i < 10; i++) out.push(localDate(Date.now() + i * 86400_000));
    setDays(out);
    setDate(out[0]);
  }, []);

  const problem = PROBLEMS.find((p) => p.id === problemId);
  const code = problem?.code ?? (problem?.followUp ? followCode : undefined);
  const service = useMemo(() => catalog.data?.find((s) => s.code === code), [catalog.data, code]);
  const needsCall = problem && (problem.id === "other" || (problem.followUp && followCode === null));
  const problemReady = !!problem && description.trim().length >= 5 && (!!service || needsCall);

  useEffect(() => { if (problemId === "stopped" || problemId === "leak") setPriority((p) => (p === "routine" ? "normal" : p)); }, [problemId]);
  useEffect(() => window.scrollTo({ top: 0, behavior: "smooth" }), [step]);

  const answers = () => {
    const a: Record<string, string> = { problem: problem?.label ?? "" };
    if (problem?.followUp && followCode !== undefined) {
      a[problem.followUp.q] = problem.followUp.options.find((o) => o.code === followCode)?.label ?? "";
    }
    return a;
  };

  function validateContact() {
    const r = contactSchema.safeParse(contact);
    if (r.success) { setErrors({}); return true; }
    const e: Partial<Record<keyof Contact, string>> = {};
    for (const i of r.error.issues) e[i.path[0] as keyof Contact] = i.message;
    setErrors(e);
    return false;
  }

  async function sendInquiry(kind: "needs_info" | "no_feasible_slot") {
    setBusy(true); setErr(undefined);
    try {
      await inquiryFn({ data: { serviceId: service?.id, priority, contact, problem: { description, answers: answers() }, kind, date, part } });
      setInquiryDone(kind);
    } catch { setErr("We couldn't send your request. Please try again or call us."); }
    setBusy(false);
  }

  async function search() {
    if (!service || !date) return;
    setBusy(true); setErr(undefined); setSlots(null); setStep(3);
    try { setSlots(await findFn({ data: { serviceId: service.id, date, part, priority } })); }
    catch { setErr("We couldn't check the schedule just now. Please try again."); }
    setBusy(false);
  }

  async function choose(o: { technicianId: string; start: string }) {
    if (!service || !date) return;
    setBusy(true); setErr(undefined);
    try {
      const r = await bookFn({ data: { serviceId: service.id, technicianId: o.technicianId, start: o.start, date, part, priority, contact, problem: { description, answers: answers() } } });
      if (r.ok) { navigate({ to: "/booking/$token", params: { token: r.token } }); return; }
      setErr(r.reason);
      setSlots(await findFn({ data: { serviceId: service.id, date, part, priority } }));
    } catch { setErr("Something went wrong confirming your visit. Nothing was booked — please try again."); }
    setBusy(false);
  }

  if (inquiryDone) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-12">
        <EmptyState
          title="Request received — we'll call you"
          description={inquiryDone === "needs_info"
            ? `Thanks, ${contact.fullName.split(" ")[0]}. We need a quick call to pin down the problem before booking the right technician. We'll ring ${contact.phone}.`
            : `Thanks, ${contact.fullName.split(" ")[0]}. No technician fit that window, so we'll call ${contact.phone} with the closest options.`}
        >
          <Button asChild variant="outline"><Link to="/">Back to home</Link></Button>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-5 sm:py-12">
      <PageHeader eyebrow="Booking" title="Request a visit" description="Tell us what's wrong and when you need help. CoolFlow works out which times a qualified technician can actually make." />

      <ol className="my-6 grid grid-cols-4 gap-1.5" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className={cn("rounded-md border px-2 py-2 text-center sm:text-left", i === step ? "border-primary bg-card" : "bg-card/50", i > step && "opacity-60")}>
            <p className="font-mono text-[10px] text-muted-foreground">{i + 1}</p>
            <p className="text-xs font-medium sm:text-sm">{s}</p>
          </li>
        ))}
      </ol>

      {err && <p role="alert" className="mb-4 rounded-lg border border-status-urgent/40 bg-status-urgent-soft px-4 py-3 text-sm text-status-urgent">{err}</p>}

      {step === 0 && (
        <section className="space-y-6">
          <div>
            <h2 className="mb-3 font-medium">What's going on?</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {PROBLEMS.map((p) => (
                <button key={p.id} type="button" onClick={() => { setProblemId(p.id); setFollowCode(undefined); }}
                  className={cn("rounded-lg border bg-card p-4 text-left transition-colors", problemId === p.id ? "border-primary ring-1 ring-primary" : "hover:border-foreground/30")}>
                  <p className="font-medium">{p.label}</p>
                  <p className="text-sm text-muted-foreground">{p.hint}</p>
                </button>
              ))}
            </div>
          </div>
          {problem?.followUp && (
            <div>
              <h2 className="mb-3 font-medium">{problem.followUp.q}</h2>
              <div className="flex flex-col gap-2">
                {problem.followUp.options.map((o) => (
                  <button key={o.label} type="button" onClick={() => setFollowCode(o.code)}
                    className={cn("rounded-lg border bg-card px-4 py-3 text-left text-sm", followCode === o.code ? "border-primary ring-1 ring-primary" : "hover:border-foreground/30")}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {problem && (
            <div>
              <Label htmlFor="desc">Describe it in your own words</Label>
              <Textarea id="desc" className="mt-2" rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Upstairs is 85°F since last night, outdoor fan is spinning." />
            </div>
          )}
          {service && <p className="text-sm text-muted-foreground">We'll book this as <span className="font-medium text-foreground">{service.label}</span> (about {service.minutes} min) with a technician qualified for it.</p>}
          {needsCall && <p className="text-sm text-muted-foreground">We can't pick the right specialist from that alone, so we'll take your details and call you — no guessing.</p>}
          {catalog.isError && <p className="text-sm text-status-urgent">Couldn't load our services. Please refresh.</p>}
          <div className="flex justify-end">
            <Button variant="cta" disabled={!problemReady} onClick={() => setStep(1)}>Continue</Button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-4">
          <h2 className="font-medium">Your details & service address</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="fullName" label="Full name" value={contact.fullName} error={errors.fullName} onChange={(v) => setContact({ ...contact, fullName: v })} autoComplete="name" />
            <Field id="phone" label="Phone" type="tel" value={contact.phone} error={errors.phone} onChange={(v) => setContact({ ...contact, phone: v })} autoComplete="tel" />
            <Field id="email" label="Email (for your confirmation)" type="email" value={contact.email} error={errors.email} onChange={(v) => setContact({ ...contact, email: v })} autoComplete="email" className="sm:col-span-2" />
            <Field id="addressLine" label="Street address" value={contact.addressLine} error={errors.addressLine} onChange={(v) => setContact({ ...contact, addressLine: v })} autoComplete="street-address" className="sm:col-span-2" />
            <Field id="city" label="City" value={contact.city} error={errors.city} onChange={(v) => setContact({ ...contact, city: v })} autoComplete="address-level2" />
            <Field id="postalCode" label="ZIP" inputMode="numeric" value={contact.postalCode} error={errors.postalCode} onChange={(v) => setContact({ ...contact, postalCode: v })} autoComplete="postal-code" />
          </div>
          <Nav onBack={() => setStep(0)}>
            {needsCall
              ? <Button variant="cta" disabled={busy} onClick={() => validateContact() && sendInquiry("needs_info")}>{busy ? "Sending…" : "Request a call back"}</Button>
              : <Button variant="cta" onClick={() => validateContact() && setStep(2)}>Continue</Button>}
          </Nav>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-6">
          <div>
            <h2 className="mb-3 font-medium">Which day? <span className="text-sm font-normal text-muted-foreground">(Austin time)</span></h2>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
              {days.map((d, i) => {
                const iso = zonedToUtc(d, "12:00");
                return (
                  <button key={d} type="button" onClick={() => setDate(d)}
                    className={cn("shrink-0 rounded-lg border bg-card px-3 py-2 text-left", date === d ? "border-primary ring-1 ring-primary" : "hover:border-foreground/30")}>
                    <p className="font-mono text-[10px] uppercase text-muted-foreground">{i === 0 ? "Today" : i === 1 ? "Tomorrow" : formatLocalDay(iso).split(",")[0]}</p>
                    <p className="text-sm font-medium">{formatLocalDay(iso).split(", ")[1]}</p>
                  </button>
                );
              })}
            </div>
          </div>
          <Choice label="Preferred arrival" value={part} onChange={(v) => setPart(v as Part)} options={[["morning", "Morning", "8 AM – 12 PM"], ["afternoon", "Afternoon", "12 – 5 PM"], ["anytime", "Any time", "8 AM – 5 PM"]]} />
          <Choice label="How urgent is it?" value={priority} onChange={(v) => setPriority(v as Priority)} options={[["emergency", "Emergency", "No cooling/heat, safety risk"], ["high", "Soon", "Uncomfortable, needs fixing"], ["normal", "Normal", "Within a few days is fine"], ["routine", "Flexible", "Any time that works"]]} />
          <Nav onBack={() => setStep(1)}>
            <Button variant="cta" disabled={!date || busy} onClick={search}>Find times that work</Button>
          </Nav>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4">
          <h2 className="font-medium">
            {date && formatLocalDay(zonedToUtc(date, "12:00"))} · {part === "anytime" ? "any time" : part} · {service?.label}
          </h2>
          {busy && !slots && (
            <div className="space-y-2" aria-live="polite">
              <p className="text-sm text-muted-foreground">Checking technician skills, schedules, travel time and equipment…</p>
              {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg border bg-card" />)}
            </div>
          )}
          {slots && slots.options.length > 0 && (
            <>
              <p className="text-sm text-muted-foreground">These are the only times a qualified technician can genuinely make. Pick one to confirm.</p>
              <ul className="grid gap-2">
                {slots.options.map((o) => (
                  <li key={o.start}>
                    <button type="button" disabled={busy} onClick={() => choose(o)}
                      className="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary disabled:opacity-60">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-lg font-semibold">{formatLocalTime(o.arrivalStart)} – {formatLocalTime(o.arrivalEnd)}</p>
                        <span className="text-sm font-medium text-primary">{busy ? "Confirming…" : "Book this →"}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">Arrival window · about {service?.minutes} min on site · {o.technicianFirstName} is qualified for {service?.label.toLowerCase()}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {slots && slots.options.length === 0 && (
            <EmptyState
              title={slots.pastWindow ? "That window has already passed today" : "No technician fits that window"}
              description={slots.pastWindow
                ? "Try a later part of the day or another date."
                : "Every qualified technician is booked, off, or can't reach you in time then. Try another day or time — or we can call you with the closest options."}
            >
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => { setSlots(null); setStep(2); }}>Change day or time</Button>
                {!slots.pastWindow && <Button variant="cta" disabled={busy} onClick={() => sendInquiry("no_feasible_slot")}>Call me with options</Button>}
              </div>
            </EmptyState>
          )}
          {!busy && !slots && err && <Button variant="outline" onClick={search}>Try again</Button>}
          <Nav onBack={() => { setSlots(null); setStep(2); }} />
        </section>
      )}
    </div>
  );
}

function Field({ id, label, error, onChange, className, ...rest }: { id: string; label: string; error?: string | undefined; value: string; onChange: (v: string) => void; className?: string | undefined } & Omit<React.ComponentProps<"input">, "onChange" | "id">) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} className="mt-1.5" aria-invalid={!!error} onChange={(e) => onChange(e.target.value)} {...rest} />
      {error && <p className="mt-1 text-xs text-status-urgent">{error}</p>}
    </div>
  );
}

function Choice({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string, string][] }) {
  return (
    <div>
      <h2 className="mb-3 font-medium">{label}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {options.map(([v, l, h]) => (
          <button key={v} type="button" onClick={() => onChange(v)}
            className={cn("rounded-lg border bg-card p-3 text-left", value === v ? "border-primary ring-1 ring-primary" : "hover:border-foreground/30")}>
            <p className="text-sm font-medium">{l}</p>
            <p className="text-xs text-muted-foreground">{h}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function Nav({ onBack, children }: { onBack: () => void; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t pt-4">
      <Button variant="ghost" onClick={onBack}>← Back</Button>
      {children}
    </div>
  );
}
