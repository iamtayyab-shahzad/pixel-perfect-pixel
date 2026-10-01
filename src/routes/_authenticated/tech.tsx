import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTechDay } from "@/services/staff.functions";
import { EmptyState, PageHeader, Section, StatusBadge } from "@/components/app/primitives";
import { JobDrawer, JobStatus, Priority, errMsg, win } from "@/components/app/jobs";
import { SignOut } from "@/components/app/SignOut";
import { Button } from "@/components/ui/button";
import { localDate, formatLocalDay } from "@/lib/scheduling/time";

export const Route = createFileRoute("/_authenticated/tech")({
  head: () => ({
    meta: [
      { title: "My jobs — CoolFlow HVAC" },
      { name: "description", content: "Technician day view for CoolFlow HVAC." },
      { property: "og:title", content: "My jobs — CoolFlow HVAC" },
      { property: "og:description", content: "Assigned jobs, delays and status updates for technicians." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Tech,
});

function Tech() {
  const date = localDate(Date.now());
  const [techId, setTechId] = useState<string | undefined>();
  const [job, setJob] = useState<string | null>(null);
  const fn = useServerFn(getTechDay);
  const q = useQuery({ queryKey: ["tech", date, techId], queryFn: () => fn({ data: { date, technicianId: techId } }), refetchInterval: 30_000 });

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <PageHeader
        eyebrow="Technician"
        title={q.data?.technician ? `${q.data.technician.name.split(" ")[0]}'s jobs` : "My jobs"}
        description={`${formatLocalDay(`${date}T17:00:00Z`)} · in order, with the arrival window promised to each customer`}
        actions={<SignOut />}
      />
      {q.data?.me.isOwner && q.data.technicians.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="View as technician">
          {q.data.technicians.map((x) => (
            <Button key={x.id} size="sm" variant={q.data!.technician?.id === x.id ? "default" : "outline"} onClick={() => setTechId(x.id)}>
              {x.name.split(" ")[0]}
            </Button>
          ))}
        </div>
      )}
      {q.isLoading ? (
        <div className="mt-8 grid gap-3">{[0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : q.isError ? (
        <EmptyState className="mt-8" title="Couldn't load your jobs" description={errMsg(q.error)}>
          <Button variant="outline" onClick={() => q.refetch()}>Try again</Button>
        </EmptyState>
      ) : q.data ? (
        <Section title="Today">
          {q.data.block && (
            <div className="mb-4 rounded-xl border bg-status-warn-soft/50 p-4 text-sm">
              You're marked <strong>{q.data.block.kind}</strong> today{q.data.block.note ? ` — ${q.data.block.note}` : ""}. The owner is reassigning your jobs.
            </div>
          )}
          {q.data.jobs.length ? (
            <ol className="grid gap-3">
              {q.data.jobs.map((j, i) => (
                <li key={j.id}>
                  <button onClick={() => setJob(j.id)} className="w-full rounded-xl border bg-card p-4 text-left hover:border-primary">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary font-mono text-xs text-primary-foreground">{i + 1}</span>
                        <div>
                          <p className="font-mono text-sm">{win(j.windowStart, j.windowEnd)}</p>
                          <p className="text-xs text-muted-foreground">About {j.estimatedMinutes} min</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-1.5"><JobStatus status={j.status} /><Priority p={j.priority} /></div>
                    </div>
                    <p className="mt-3 font-medium">{j.customer}</p>
                    <p className="text-sm text-muted-foreground">{j.service} · {j.problem}</p>
                    <p className="mt-1 text-sm">{j.address}</p>
                    {j.warnings.map((w) => <p key={w} className="mt-2"><StatusBadge tone="warn">{w}</StatusBadge></p>)}
                  </button>
                </li>
              ))}
            </ol>
          ) : <EmptyState title="No jobs assigned today" description="New jobs assigned to you will appear here automatically." />}
        </Section>
      ) : null}
      <JobDrawer id={job} mode={q.data?.me.isOwner ? "owner" : "tech"} onClose={() => setJob(null)} />
    </div>
  );
}
