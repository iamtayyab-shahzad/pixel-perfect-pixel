import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState, Section } from "@/components/app/primitives";

export const Route = createFileRoute("/tech")({
  head: () => ({
    meta: [
      { title: "My jobs — CoolFlow HVAC" },
      { name: "description", content: "Technician day view for CoolFlow HVAC." },
      { property: "og:title", content: "My jobs — CoolFlow HVAC" },
      { property: "og:description", content: "Assigned jobs, delays and swap requests for technicians." },
    ],
  }),
  component: Tech,
});

function Tech() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <PageHeader
        eyebrow="Technician"
        title="My jobs"
        description="Your assigned jobs for the day, in order, with the arrival window promised to each customer."
      />
      <Section title="Today">
        <EmptyState
          title="No jobs assigned"
          description="Once sign-in and scheduling are live, jobs assigned to you will appear here. You'll be able to report delays and request swaps."
        />
      </Section>
    </div>
  );
}
