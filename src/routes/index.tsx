import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CoolFlow HVAC — Residential heating & cooling in Austin, TX" },
      {
        name: "description",
        content:
          "Request an HVAC visit in Austin. CoolFlow matches your job to a qualified technician and a window that actually works.",
      },
      { property: "og:title", content: "CoolFlow HVAC — Austin, TX" },
      {
        property: "og:description",
        content: "From “Can you come?” to “You're booked.” Residential HVAC service in Austin.",
      },
    ],
  }),
  component: Home,
});

const steps = [
  { n: "01", t: "Tell us what's wrong", d: "A few questions so we send someone with the right skills." },
  { n: "02", t: "Get a window that fits", d: "We only offer times a qualified technician can really make." },
  { n: "03", t: "You're booked", d: "Confirmation now, and a heads-up if anything changes." },
];

function Home() {
  return (
    <div className="mx-auto max-w-6xl px-5">
      <section className="py-16 sm:py-24">
        <p className="eyebrow mb-5">Residential HVAC · Austin, Texas</p>
        <h1 className="max-w-[18ch] text-4xl font-semibold leading-[1.05] sm:text-6xl">
          “Can you come?” <span className="text-muted-foreground">becomes</span> “You're booked.”
        </h1>
        <p className="mt-6 max-w-[52ch] text-lg text-muted-foreground">
          Tell us what your system is doing. We match the job to a technician with the right
          skills and a time they can actually reach you.
        </p>
        <div className="mt-8">
          <Button asChild variant="cta" size="lg">
            <Link to="/book">Request a visit</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
        {steps.map((s) => (
          <div key={s.n} className="bg-card p-6">
            <p className="font-mono text-xs text-muted-foreground">{s.n}</p>
            <p className="mt-3 font-medium">{s.t}</p>
            <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
          </div>
        ))}
      </section>

      <p className="py-12 text-sm text-muted-foreground">
        Our promise: a confirmed appointment is never changed without telling you first — you'll
        see the old time, the new time, and the reason.
      </p>
    </div>
  );
}
