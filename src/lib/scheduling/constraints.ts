/**
 * Smart Slot Match — constraint contract.
 * A slot is feasible only when every constraint passes; each result carries
 * a human-readable detail so the owner can see *why* a slot was accepted or rejected.
 */
import type { ID, ISODateTime } from "@/domain/types";

export type ConstraintCode =
  | "technician_eligible"
  | "skill_match"
  | "availability_block"
  | "working_hours"
  | "duration_fits"
  | "no_conflict"
  | "travel_buffer"
  | "window_respected"
  | "resource_available";

/** Every constraint is evaluated for every candidate — none are declared but skipped. */
export const REQUIRED_CONSTRAINTS: readonly ConstraintCode[] = [
  "technician_eligible",
  "skill_match",
  "availability_block",
  "working_hours",
  "duration_fits",
  "no_conflict",
  "travel_buffer",
  "window_respected",
  "resource_available",
] as const;

export interface ConstraintResult {
  code: ConstraintCode;
  passed: boolean;
  detail: string;
}

export interface CandidateSlot {
  technicianId: ID;
  start: ISODateTime;
  end: ISODateTime;
  results: ConstraintResult[];
}

export const isFeasible = (slot: CandidateSlot): boolean =>
  slot.results.length > 0 && slot.results.every((r) => r.passed);
