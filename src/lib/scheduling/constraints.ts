/**
 * Smart Slot Match — contract only. The algorithm is intentionally NOT
 * implemented yet. A slot is feasible only when every constraint passes;
 * each failure is reported so the owner can see *why* a slot was rejected.
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
