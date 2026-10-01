import { describe, expect, it } from "vitest";
import type {
  Appointment,
  Assignment,
  AvailabilityBlock,
  AvailabilityBlockKind,
  Resource,
  Service,
  Technician,
  TechnicianSkill,
  WorkingHours,
} from "@/domain/types";
import { evaluateCandidate, findFeasibleSlots, type SchedulingContext } from "./engine";
import { REQUIRED_CONSTRAINTS, isFeasible, type CandidateSlot } from "./constraints";

// Test fixtures only. Mon 2026-10-05 is CDT (UTC-5); Mon 2026-11-02 is CST (UTC-6).
const BIZ = "biz-coolflow";
const NOW = "2026-09-01T00:00:00Z";
const tech = (id: string, fullName: string, status: Technician["status"] = "active"): Technician => ({
  id,
  businessId: BIZ,
  fullName,
  status,
  isOwner: id === "t1-mike",
  createdAt: NOW,
});
const TECHS = [
  tech("t1-mike", "Mike"),
  tech("t2-daniel", "Daniel"),
  tech("t3-sarah", "Sarah"),
  tech("t4-james", "James"),
];
const SKILLS: TechnicianSkill[] = [
  { technicianId: "t1-mike", skillId: "sk-ac", level: "primary" },
  { technicianId: "t1-mike", skillId: "sk-heatpump", level: "primary" },
  { technicianId: "t2-daniel", skillId: "sk-ac", level: "capable" },
  { technicianId: "t2-daniel", skillId: "sk-elec", level: "primary" },
  { technicianId: "t3-sarah", skillId: "sk-ac", level: "primary" },
  { technicianId: "t4-james", skillId: "sk-duct", level: "primary" },
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
  requiredSkillIds: ["sk-ac"],
  resourceRequirements: [],
  estimatedMinutes: 90,
  bufferMinutes: 30,
};

/** Local Austin time on Mon 2026-10-05 (CDT). */
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
    priority: "normal",
    ...over,
  };
}
const res = (slot: CandidateSlot, code: string) => slot.results.find((r) => r.code === code)!;
const ok = (c: SchedulingContext, t: string, s: string) => isFeasible(evaluateCandidate(c, t, s));
const block = (kind: AvailabilityBlockKind, techId = "t3-sarah", from = "09:00", to = "12:00"): AvailabilityBlock => ({
  id: `b-${kind}`,
  technicianId: techId,
  kind,
  startsAt: at(from),
  endsAt: at(to),
});
function booked(techId: string, wStart: string, wEnd = wStart, minutes = 90, serviceId = "svc-ac") {
  const appointments: Appointment[] = [
    {
      id: "ap-1",
      businessId: BIZ,
      customerId: "c1",
      serviceId,
      priority: "normal",
      status: "confirmed",
      requiredSkillIds: ["sk-ac"],
      address: { addressLine: "1 Test St", city: "Austin", postalCode: "78701" },
      windowStart: wStart,
      windowEnd: wEnd,
      estimatedMinutes: minutes,
      createdAt: NOW,
    },
  ];
  const assignments: Assignment[] = [
    {
      id: "as-1",
      appointmentId: "ap-1",
      technicianId: techId,
      status: "active",
      blockedStart: wStart,
      blockedEnd: wEnd,
      assignedBy: "u-mike",
      assignedAt: NOW,
    },
  ];
  return { appointments, assignments };
}

describe("Smart Slot Match — candidate generation & window", () => {
  it("allows an off-grid requested start (08:10–09:50, 90 min)", () => {
    const c = ctx({ windowStart: at("08:10"), windowEnd: at("09:50"), bufferMinutes: 0 });
    const f = findFeasibleSlots(c).feasible;
    expect(f.length).toBeGreaterThan(0);
    expect(f[0]!.start).toBe(at("08:10"));
  });
  it("accepts a job ending exactly at window end, rejects one minute over", () => {
    const c = ctx({ windowStart: at("09:00"), windowEnd: at("10:30") });
    expect(ok(c, "t3-sarah", at("09:00"))).toBe(true);
    const c2 = ctx({ windowStart: at("09:00"), windowEnd: at("10:29") });
    expect(res(evaluateCandidate(c2, "t3-sarah", at("09:00")), "window_respected").passed).toBe(false);
  });
  it("rejects a candidate outside the requested window", () => {
    const c = ctx({ windowStart: at("13:00"), windowEnd: at("17:00") });
    expect(res(evaluateCandidate(c, "t3-sarah", at("09:00")), "window_respected").passed).toBe(false);
    expect(findFeasibleSlots(c).feasible.every((f) => f.start >= at("13:00"))).toBe(true);
  });
});

describe("working hours, buffers and duration", () => {
  it("exact working-hours boundary: start 08:00 ok, 07:59 not", () => {
    expect(ok(ctx(), "t3-sarah", at("08:00"))).toBe(true);
    expect(res(evaluateCandidate(ctx(), "t3-sarah", at("07:59")), "working_hours").passed).toBe(false);
  });
  it("post-shift buffer: job ending 17:00 with 30 min buffer fails; ending 16:30 passes", () => {
    const s = evaluateCandidate(ctx(), "t3-sarah", at("15:30"));
    expect(res(s, "duration_fits").passed).toBe(false);
    expect(ok(ctx(), "t3-sarah", at("15:00"))).toBe(true);
  });
  it("pre-shift travel gap: with 20 min travel, 08:00 fails and 08:20 passes", () => {
    const c = ctx({ travelMinutes: 20 });
    expect(res(evaluateCandidate(c, "t3-sarah", at("08:00")), "working_hours").passed).toBe(false);
    expect(ok(c, "t3-sarah", at("08:20"))).toBe(true);
  });
  it("duration_fits is not just duration > 0", () => {
    const s = evaluateCandidate(ctx({ durationMinutes: 600 }), "t3-sarah", at("08:00"));
    expect(res(s, "duration_fits").passed).toBe(false);
    expect(res(evaluateCandidate(ctx({ durationMinutes: 0 }), "t3-sarah", at("08:00")), "duration_fits").passed).toBe(false);
  });
});

describe("existing work", () => {
  it("blocks the whole promised appointment window, not just windowStart + duration", () => {
    // Promise 10:00–12:00 arrival, 90 min ⇒ committed 10:00–13:30
    const c = ctx(booked("t3-sarah", at("10:00"), at("12:00")));
    expect(res(evaluateCandidate(c, "t3-sarah", at("12:00")), "no_conflict").passed).toBe(false);
  });
  it("uses the appointment's estimated duration", () => {
    const c = ctx(booked("t3-sarah", at("09:00"), at("09:00"), 180)); // 09:00–12:00
    expect(res(evaluateCandidate(c, "t3-sarah", at("11:00")), "no_conflict").passed).toBe(false);
  });
  it("rejects overlap with an active assignment", () => {
    const s = evaluateCandidate(ctx(booked("t3-sarah", at("10:00"))), "t3-sarah", at("11:00"));
    expect(res(s, "no_conflict").passed).toBe(false);
  });
  it("touching endpoint without buffer is not a conflict but fails the buffer", () => {
    const c = ctx(booked("t3-sarah", at("10:00"))); // busy 10:00–11:30
    const s = evaluateCandidate(c, "t3-sarah", at("11:30"));
    expect(res(s, "no_conflict").passed).toBe(true);
    expect(res(s, "travel_buffer").passed).toBe(false);
    // The existing job keeps its own service buffer (same rule as the DB blocked interval),
    // so zeroing only the candidate's buffer does not let it start right at 11:30.
    expect(ok(ctx({ ...booked("t3-sarah", at("10:00")), bufferMinutes: 0 }), "t3-sarah", at("11:30"))).toBe(false);
    expect(ok(ctx({ ...booked("t3-sarah", at("10:00")), bufferMinutes: 0 }), "t3-sarah", at("12:00"))).toBe(true);
  });
  it("buffer exactly sufficient passes; one minute short fails", () => {
    const c = ctx({ ...booked("t3-sarah", at("10:00")), travelMinutes: 15 }); // gap 45 ⇒ 12:15
    expect(ok(c, "t3-sarah", at("12:15"))).toBe(true);
    expect(res(evaluateCandidate(c, "t3-sarah", at("12:14")), "travel_buffer").passed).toBe(false);
  });
  it("cancelled appointments release their time", () => {
    const b = booked("t3-sarah", at("10:00"));
    b.appointments[0]!.status = "cancelled";
    expect(ok(ctx(b), "t3-sarah", at("10:00"))).toBe(true);
  });
});

describe("skills and technicians", () => {
  it("rejects a technician missing a required skill", () => {
    expect(res(evaluateCandidate(ctx(), "t4-james", at("09:00")), "skill_match").passed).toBe(false);
  });
  it("requires ALL of multiple skills", () => {
    const c = ctx({ requiredSkillIds: ["sk-ac", "sk-elec"] });
    const techs = new Set(findFeasibleSlots(c).feasible.map((f) => f.technicianId));
    expect([...techs]).toEqual(["t2-daniel"]);
  });
  it("empty required skills falls back to the service definition", () => {
    const c = ctx({ requiredSkillIds: [] });
    expect(res(evaluateCandidate(c, "t4-james", at("09:00")), "skill_match").passed).toBe(false);
    expect(ok(c, "t3-sarah", at("09:00"))).toBe(true);
  });
  it("service with no skills never means 'anyone qualifies'", () => {
    const c = ctx({ service: { ...AC, requiredSkillIds: [] } });
    expect(findFeasibleSlots(c).feasible).toEqual([]);
  });
  it("inactive technician fails technician_eligible", () => {
    const c = ctx({ technicians: TECHS.map((t) => (t.id === "t3-sarah" ? { ...t, status: "inactive" as const } : t)) });
    const s = evaluateCandidate(c, "t3-sarah", at("09:00"));
    expect(res(s, "technician_eligible").passed).toBe(false);
    expect(res(s, "skill_match").passed).toBe(true);
  });
  it("unknown technician fails technician_eligible with accurate detail", () => {
    const s = evaluateCandidate(ctx(), "ghost", at("09:00"));
    expect(res(s, "technician_eligible").detail).toMatch(/Unknown/);
    expect(isFeasible(s)).toBe(false);
  });
  it("returns empty when no technician qualifies", () => {
    const r = findFeasibleSlots(ctx({ requiredSkillIds: ["sk-ac", "sk-duct"] }));
    expect(r.evaluated.length).toBeGreaterThan(0);
    expect(r.feasible).toEqual([]);
  });
});

describe("availability blocks", () => {
  it.each(["sick", "leave", "unavailable", "training"] as const)("rejects overlap with a %s block", (kind) => {
    const c = ctx({ availabilityBlocks: [block(kind)] });
    expect(res(evaluateCandidate(c, "t3-sarah", at("10:00")), "availability_block").passed).toBe(false);
    expect(ok(c, "t3-sarah", at("13:00"))).toBe(true);
  });
  it("exact block boundaries: ending at block start needs its buffer", () => {
    const c = ctx({ availabilityBlocks: [block("training", "t3-sarah", "12:00", "13:00")] });
    expect(ok(c, "t3-sarah", at("10:30"))).toBe(false); // ends 12:00, buffer runs into block
    expect(ok(c, "t3-sarah", at("10:00"))).toBe(true); // ends 11:30 + 30 = 12:00
    expect(ok(c, "t3-sarah", at("13:00"))).toBe(true); // starts at block end
  });
});

describe("resources", () => {
  const LIFT: Resource = { id: "r-recovery", businessId: BIZ, code: "recovery", label: "Recovery machine", quantity: 1 };
  const REC: Service = { ...AC, id: "svc-rec", resourceRequirements: [{ resourceId: "r-recovery", quantity: 1 }] };
  it("rejects when the only unit is in use, passes when free", () => {
    const b = booked("t1-mike", at("09:00"), at("09:00"), 90, "svc-rec");
    const c = ctx({ ...b, service: REC, services: [REC], resources: [LIFT] });
    expect(res(evaluateCandidate(c, "t3-sarah", at("09:30")), "resource_available").passed).toBe(false);
    expect(res(evaluateCandidate(c, "t3-sarah", at("13:00")), "resource_available").passed).toBe(true);
  });
});

describe("ordering", () => {
  it("normal priority never hides an earlier feasible technician behind skill preference", () => {
    const c = ctx({ ...booked("t1-mike", at("08:00")), availabilityBlocks: [block("sick")] });
    expect(findFeasibleSlots(c).feasible[0]).toMatchObject({ technicianId: "t2-daniel", start: at("08:00") });
  });
  it("normal priority breaks same-time ties by primary skill", () => {
    const f = findFeasibleSlots(ctx()).feasible;
    expect(f[0]!.start).toBe(at("08:00"));
    expect(["t1-mike", "t3-sarah"]).toContain(f[0]!.technicianId);
  });
  it("emergency is strictly earliest and never overrides constraints", () => {
    const c = ctx({ priority: "emergency", ...booked("t1-mike", at("08:00")), availabilityBlocks: [block("sick")] });
    const { feasible } = findFeasibleSlots(c);
    expect(feasible[0]).toMatchObject({ technicianId: "t2-daniel", start: at("08:00") });
    for (let i = 1; i < feasible.length; i++) expect(feasible[i]!.start >= feasible[i - 1]!.start).toBe(true);
    expect(feasible.every(isFeasible)).toBe(true);
  });
  it("is deterministic", () => {
    expect(findFeasibleSlots(ctx())).toEqual(findFeasibleSlots(ctx()));
  });
});

describe("timezone", () => {
  it("uses Austin local time across the DST change (CST on Mon 2026-11-02)", () => {
    const c = ctx({ windowStart: "2026-11-02T13:00:00Z", windowEnd: "2026-11-02T23:00:00Z" });
    expect(ok(c, "t3-sarah", "2026-11-02T13:00:00Z")).toBe(false); // 07:00 CST
    expect(ok(c, "t3-sarah", "2026-11-02T14:00:00Z")).toBe(true); // 08:00 CST
  });
});

describe("constraint contract", () => {
  it("every candidate contains every constraint", () => {
    const { evaluated } = findFeasibleSlots(ctx());
    expect(evaluated.length).toBe(4 * 16);
    for (const s of evaluated) expect(s.results.map((r) => r.code).sort()).toEqual([...REQUIRED_CONSTRAINTS].sort());
  });
  it("isFeasible is false when any constraint fails, or when empty", () => {
    const base: CandidateSlot = {
      technicianId: "t",
      start: at("09:00"),
      end: at("10:30"),
      results: REQUIRED_CONSTRAINTS.map((code) => ({ code, passed: true, detail: "" })),
    };
    expect(isFeasible(base)).toBe(true);
    for (let i = 0; i < base.results.length; i++)
      expect(isFeasible({ ...base, results: base.results.map((x, j) => (j === i ? { ...x, passed: false } : x)) })).toBe(false);
    expect(isFeasible({ ...base, results: [] })).toBe(false);
  });
});
