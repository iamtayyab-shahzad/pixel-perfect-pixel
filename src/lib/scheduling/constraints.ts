/**
 * Smart Slot Match — constraint contract.
 * A slot is feasible only when every constraint passes; each result carries
 * a human-readable detail so the owner can see *why* a slot was accepted or rejected.
 */
import type { ID, ISODateTime } from "@/domain/types";

export type ConstraintCode =
  | "skill_match"
  | "working_hours"
  | "availability_block"
  | "no_conflict"
  | "duration_fits"
  | "travel_buffer"
  | "window_respected"
  | "priority_respected"
  | "resource_available";

/** Constraints the evaluator always produces for every candidate. */
export const REQUIRED_CONSTRAINTS: readonly ConstraintCode[] = [
  "skill_match",
  "availability_block",
  "working_hours",
  "no_conflict",
  "duration_fits",
  "travel_buffer",
  "window_respected",
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
