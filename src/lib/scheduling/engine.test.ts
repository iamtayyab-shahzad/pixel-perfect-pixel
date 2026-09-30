import { describe, expect, it } from "vitest";
import type {
  Appointment,
  Assignment,
  AvailabilityBlock,
  AvailabilityBlockKind,
  Service,
  Technician,
  TechnicianSkill,
  WorkingHours,
} from "@/domain/types";
import { evaluateCandidate, findFeasibleSlots, type SchedulingContext } from "./engine";
import { REQUIRED_CONSTRAINTS, isFeasible, type CandidateSlot } from "./constraints";

// Test fixtures only — CoolFlow HVAC, Austin TX. Mon 2026-10-05 is CDT (UTC-5).
const BIZ = "biz-coolflow";
const NOW = "2026-09-01T00:00:00Z";
const tech = (id: string, fullName: string, isOwner = false): Technician => ({
  id,
  businessId: BIZ,
  fullName,
  status: "active",
  isOwner,
  createdAt: NOW,
});
const TECHS = [
  tech("t1-mike", "Mike Alvarez", true),
  tech("t2-dana", "Dana Brooks"),
  tech("t3-luis", "Luis Ortega"),
  tech("t4-sam", "Sam Patel"),
];
const SKILLS: TechnicianSkill[] = [
  { technicianId: "t1-mike", skillId: "sk-ac", level: "primary" },
  { technicianId: "t1-mike", skillId: "sk-heatpump", level: "primary" },
  { technicianId: "t2-dana", skillId: "sk-ac", level: "capable" },
  { technicianId: "t3-luis", skillId: "sk-ac", level: "primary" },
  { technicianId: "t4-sam", skillId: "sk-duct", level: "primary" },
];
const HOURS: WorkingHours[] = TECHS.flatMap((t) =>
  ([1, 2, 3, 4, 5] as const).map((d) => ({
    id: `wh-${t.id}-${d}`,
    technicianId: t.id,
    weekday: d,
    start: "08:00",
    end: "17:00",
  })),
);
const AC: Service = {
  id: "svc-ac",
  businessId: BIZ,
  code: "ac_repair",
  label: "AC repair",
  requiredSkillId: "sk-ac",
  estimatedMinutes: 90,
  bufferMinutes: 30,
};

// 08:00 CDT = 13:00Z; 17:00 CDT = 22:00Z
const at = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 9, 5, h + 5, m)).toISOString();
};

function ctx(over: Partial<SchedulingContext> = {}): SchedulingContext {
  return {
    technicians: TECHS,
    technicianSkills: SKILLS,
    workingHours: HOURS,
    availabilityBlocks: [],
    appointments: [],
    assignments: [],
    service: AC,
    windowStart: at("08:00"),
    windowEnd: at("17:00"),
    priority: "routine",
    ...over,
  };
}
const res = (slot: CandidateSlot, code: string) => slot.results.find((r) => r.code === code)!;
const block = (kind: AvailabilityBlockKind, techId = "t3-luis"): AvailabilityBlock => ({
  id: `b-${kind}`,
  technicianId: techId,
  kind,
  startsAt: at("09:00"),
  endsAt: at("12:00"),
});
function booked(
  techId: string,
  start: string,
  minutes = 90,
): { appointments: Appointment[]; assignments: Assignment[] } {
  return {
    appointments: [
      {
        id: "ap-1",
        businessId: BIZ,
        customerId: "c1",
        serviceId: "svc-ac",
        priority: "routine",
        status: "confirmed",
        windowStart: start,
        windowEnd: start,
        estimatedMinutes: minutes,
        createdAt: NOW,
      },
    ],
    assignments: [
      {
        id: "as-1",
        appointmentId: "ap-1",
        technicianId: techId,
        status: "active",
        assignedBy: "u-mike",
        assignedAt: NOW,
      },
    ],
  };
}

describe("Smart Slot Match", () => {
  it("1. rejects a technician missing a required skill", () => {
    const s = evaluateCandidate(ctx(), "t4-sam", at("09:00"));
    expect(res(s, "skill_match").passed).toBe(false);
    expect(isFeasible(s)).toBe(false);
    expect(findFeasibleSlots(ctx()).feasible.some((f) => f.technicianId === "t4-sam")).toBe(false);
  });

  it.each(["sick", "leave", "unavailable", "training"] as const)(
    "2–5. rejects overlap with a %s block",
    (kind) => {
      const c = ctx({ availabilityBlocks: [block(kind)] });
      const s = evaluateCandidate(c, "t3-luis", at("10:00"));
      expect(res(s, "availability_block").passed).toBe(false);
      expect(isFeasible(s)).toBe(false);
      expect(isFeasible(evaluateCandidate(c, "t3-luis", at("13:00")))).toBe(true);
    },
  );

  it("6. rejects a job that runs past working hours", () => {
    const s = evaluateCandidate(ctx(), "t3-luis", at("16:00")); // ends 17:30
    expect(res(s, "working_hours").passed).toBe(false);
    expect(isFeasible(evaluateCandidate(ctx(), "t3-luis", at("07:30")))).toBe(false);
    expect(isFeasible(evaluateCandidate(ctx(), "t3-luis", at("15:30")))).toBe(true);
  });

  it("7. rejects overlap with an existing active assignment", () => {
    const s = evaluateCandidate(ctx(booked("t3-luis", at("10:00"))), "t3-luis", at("11:00"));
    expect(res(s, "no_conflict").passed).toBe(false);
    expect(isFeasible(s)).toBe(false);
  });

  it("8. rejects a slot that fits but violates the buffer/travel gap", () => {
    const c = ctx({ ...booked("t3-luis", at("10:00")), travelMinutes: 15 }); // busy 10:00–11:30, gap 45
    const s = evaluateCandidate(c, "t3-luis", at("12:00"));
    expect(res(s, "no_conflict").passed).toBe(true);
    expect(res(s, "travel_buffer").passed).toBe(false);
    expect(isFeasible(evaluateCandidate(c, "t3-luis", at("12:15")))).toBe(true);
  });

  it("9. rejects a candidate outside the requested window", () => {
    const c = ctx({ windowStart: at("13:00"), windowEnd: at("17:00") });
    const s = evaluateCandidate(c, "t3-luis", at("09:00"));
    expect(res(s, "window_respected").passed).toBe(false);
    expect(isFeasible(s)).toBe(false);
    expect(findFeasibleSlots(c).feasible.every((f) => f.start >= at("13:00"))).toBe(true);
  });

  it("10. returns empty when no technician qualifies", () => {
    const r = findFeasibleSlots(ctx({ requiredSkillIds: ["sk-ac", "sk-duct"] }));
    expect(r.evaluated.length).toBeGreaterThan(0);
    expect(r.feasible).toEqual([]);
  });

  it("11. emergency orders earliest feasible first and never overrides constraints", () => {
    const c = ctx({
      priority: "emergency",
      ...booked("t1-mike", at("08:00")),
      availabilityBlocks: [block("sick")],
    });
    const { feasible } = findFeasibleSlots(c);
    expect(feasible[0]).toMatchObject({ technicianId: "t2-dana", start: at("08:00") });
    for (let i = 1; i < feasible.length; i++)
      expect(feasible[i]!.start >= feasible[i - 1]!.start).toBe(true);
    expect(feasible.every(isFeasible)).toBe(true);
  });

  it("12. every evaluated candidate contains all required constraint results", () => {
    const { evaluated } = findFeasibleSlots(ctx());
    expect(evaluated.length).toBe(4 * 16); // 08:00..15:30 step 30
    for (const s of evaluated)
      expect(s.results.map((r) => r.code).sort()).toEqual([...REQUIRED_CONSTRAINTS].sort());
  });

  it("13. isFeasible is false when any constraint fails", () => {
    const base: CandidateSlot = {
      technicianId: "t",
      start: at("09:00"),
      end: at("10:30"),
      results: REQUIRED_CONSTRAINTS.map((code) => ({ code, passed: true, detail: "" })),
    };
    expect(isFeasible(base)).toBe(true);
    for (let i = 0; i < base.results.length; i++) {
      const r = base.results.map((x, j) => (j === i ? { ...x, passed: false } : x));
      expect(isFeasible({ ...base, results: r })).toBe(false);
    }
  });

  it("14. isFeasible is false for an empty result list", () => {
    expect(
      isFeasible({ technicianId: "t", start: at("09:00"), end: at("10:30"), results: [] }),
    ).toBe(false);
  });

  it("is deterministic", () => {
    expect(findFeasibleSlots(ctx())).toEqual(findFeasibleSlots(ctx()));
  });
});
