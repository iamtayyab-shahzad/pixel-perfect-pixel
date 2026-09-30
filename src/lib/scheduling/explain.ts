/** Plain-language explanations of Smart Slot Match results — safe to show customers. */
import type { CandidateSlot, ConstraintCode } from "./constraints";

const CUSTOMER_REASON: Record<ConstraintCode, string> = {
  technician_eligible: "isn't taking jobs right now",
  skill_match: "doesn't handle this type of repair",
  availability_block: "is out or unavailable then",
  working_hours: "isn't working at that time",
  duration_fits: "doesn't have enough time left in the day for the full job",
  no_conflict: "is already booked",
  travel_buffer: "needs travel time between jobs",
  window_respected: "can't make it inside your requested window",
  resource_available: "needs equipment that's in use elsewhere",
};

export function firstFailure(slot: CandidateSlot): ConstraintCode | undefined {
  return slot.results.find((r) => !r.passed)?.code;
}

/** Summarise, per technician, the most common reason their candidates failed. */
export function technicianSummary(
  evaluated: CandidateSlot[],
  names: Map<string, string>,
): { technicianId: string; name: string; fits: boolean; reason: string }[] {
  const by = new Map<string, CandidateSlot[]>();
  for (const s of evaluated) by.set(s.technicianId, [...(by.get(s.technicianId) ?? []), s]);
  return [...by.entries()].map(([id, slots]) => {
    const name = (names.get(id) ?? "A technician").split(" ")[0]!;
    if (slots.some((s) => s.results.every((r) => r.passed)))
      return { technicianId: id, name, fits: true, reason: "has a time that works" };
    const counts = new Map<ConstraintCode, number>();
    for (const s of slots) {
      const f = firstFailure(s);
      if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return { technicianId: id, name, fits: false, reason: top ? CUSTOMER_REASON[top] : "isn't available" };
  });
}

export function whyThisSlot(techName: string, serviceLabel: string, travel: number): string[] {
  const first = techName.split(" ")[0];
  return [
    `${first} is qualified for ${serviceLabel.toLowerCase()}.`,
    `${first} is on shift and has no other job or time off overlapping your visit.`,
    `The full job fits, with ${travel} min travel and wrap-up time around other visits.`,
    "It's inside the window you asked for.",
  ];
}
