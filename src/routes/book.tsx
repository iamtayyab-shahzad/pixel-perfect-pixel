import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/book")({
  head: () => ({
    meta: [
      { title: "Request a visit — CoolFlow HVAC" },
      { name: "description", content: "Request a residential HVAC visit from CoolFlow in Austin, TX." },
      { property: "og:title", content: "Request a visit — CoolFlow HVAC" },
      { property: "og:description", content: "Book heating and cooling service in Austin, TX." },
    ],
  }),
  component: Book,
});

const flow = ["Describe the problem", "Your address & contact", "Pick a feasible window", "Confirm"];

function Book() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <PageHeader
        eyebrow="Booking"
        title="Request a visit"
        description="Four short steps. We'll only show times a qualified technician can actually make."
      />
      <ol className="my-8 grid gap-2 sm:grid-cols-4">
        {flow.map((f, i) => (
          <li key={f} className="rounded-lg border bg-card p-3">
            <p className="font-mono text-[11px] text-muted-foreground">Step {i + 1}</p>
            <p className="mt-1 text-sm font-medium">{f}</p>
          </li>
        ))}
      </ol>
      <EmptyState
        title="Online booking isn't open yet"
        description="We're finishing the booking form and scheduling rules. Nothing you enter here would be saved, so there's no form to fill in yet."
      >
        <Button asChild variant="outline">
          <Link to="/">Back to home</Link>
        </Button>
      </EmptyState>
    </div>
  );
}
