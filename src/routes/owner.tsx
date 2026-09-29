import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState, Section, StatusBadge } from "@/components/app/primitives";

export const Route = createFileRoute("/owner")({
  head: () => ({
    meta: [
      { title: "Dispatch — CoolFlow HVAC" },
      { name: "description", content: "Owner dispatch board for CoolFlow HVAC." },
      { property: "og:title", content: "Dispatch — CoolFlow HVAC" },
      { property: "og:description", content: "Inquiries, today's schedule and technicians in one place." },
    ],
  }),
  component: Owner,
});

function Owner() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <PageHeader
        eyebrow="Owner"
        title="Dispatch"
        description="Incoming requests, today's board and your team. Data appears here once the scheduling backend is connected."
      />
      <Section title="Needs attention">
        <EmptyState
          title="No inquiries"
          description="New customer requests will land here for review before they're booked."
        />
      </Section>
      <Section title="Today's board">
        <EmptyState
          title="No appointments scheduled"
          description="Each technician will get a lane on a time rail showing jobs, travel buffers and delays."
        />
      </Section>
      <Section title="Status legend">
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone="info">Confirmed</StatusBadge>
          <StatusBadge tone="ok">On site</StatusBadge>
          <StatusBadge tone="warn">Delayed</StatusBadge>
          <StatusBadge tone="urgent">Emergency</StatusBadge>
          <StatusBadge tone="idle">Unavailable</StatusBadge>
        </div>
      </Section>
    </div>
  );
}
