/**
 * CoolFlow domain model.
 * Shapes mirror the future Postgres tables 1:1 (snake_case in DB, camelCase here).
 * IDs are UUID strings; timestamps are ISO 8601 strings in UTC.
 * Business timezone: America/Chicago (Austin, TX).
 */

export type ID = string;
export type ISODateTime = string;
/** "HH:mm" in the business timezone */
export type LocalTime = string;

export interface Business {
  id: ID;
  name: string;
  timezone: string;
  serviceAreaDescription: string;
  createdAt: ISODateTime;
}

export type UserRole = "owner" | "technician";

export interface User {
  id: ID;
  businessId: ID;
  role: UserRole;
  fullName: string;
  email: string;
  phone?: string;
  createdAt: ISODateTime;
}

export interface Skill {
  id: ID;
  businessId: ID;
  code: string; // e.g. "ac_repair", "heat_pump", "ductwork"
  label: string;
}

export type TechnicianStatus = "active" | "inactive";

export interface Technician {
  id: ID;
  businessId: ID;
  userId?: ID;
  fullName: string;
  status: TechnicianStatus;
  /** Owner is also a field technician in this business. */
  isOwner: boolean;
  createdAt: ISODateTime;
}

export type SkillLevel = "primary" | "capable";

export interface TechnicianSkill {
  technicianId: ID;
  skillId: ID;
  level: SkillLevel;
}

/** 0 = Sunday … 6 = Saturday */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface WorkingHours {
  id: ID;
  technicianId: ID;
  weekday: Weekday;
  start: LocalTime;
  end: LocalTime;
}

export type AvailabilityBlockKind = "leave" | "sick" | "unavailable" | "training";

export interface AvailabilityBlock {
  id: ID;
  technicianId: ID;
  kind: AvailabilityBlockKind;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
  note?: string;
}

export interface Customer {
  id: ID;
  businessId: ID;
  fullName: string;
  phone: string;
  email?: string;
  addressLine: string;
  city: string;
  postalCode: string;
  createdAt: ISODateTime;
}

/** Shared equipment (e.g. refrigerant recovery machine) with a finite quantity. */
export interface Resource {
  id: ID;
  businessId: ID;
  code: string;
  label: string;
  quantity: number;
}

export interface ResourceRequirement {
  resourceId: ID;
  quantity: number;
}

export interface Service {
  id: ID;
  businessId: ID;
  code: string;
  label: string;
  /** Every skill a technician must hold. Never empty for a bookable service. */
  requiredSkillIds: ID[];
  /** Empty array = this service explicitly needs no shared equipment. */
  resourceRequirements: ResourceRequirement[];
  estimatedMinutes: number;
  /** Post-job wrap-up / travel-prep buffer, in minutes. */
  bufferMinutes: number;
}

export type Priority = "emergency" | "high" | "normal" | "routine";

export type InquiryStatus = "new" | "needs_info" | "qualified" | "offered" | "booked" | "closed_lost";

export interface Inquiry {
  id: ID;
  businessId: ID;
  customerId?: ID;
  serviceId?: ID;
  priority: Priority;
  description: string;
  preferredWindowStart?: ISODateTime;
  preferredWindowEnd?: ISODateTime;
  status: InquiryStatus;
  createdAt: ISODateTime;
}

export type AppointmentStatus =
  | "proposed"
  | "confirmed"
  | "en_route"
  | "in_progress"
  | "delayed"
  | "completed"
  | "cancelled";

/** Display-only availability; "busy" is always derived from assignments, never stored. */
export type TechnicianAvailability =
  | "available"
  | "busy"
  | "off_today"
  | "on_leave"
  | "sick"
  | "unavailable";

export interface AddressSnapshot {
  addressLine: string;
  city: string;
  postalCode: string;
}

export interface Appointment {
  id: ID;
  businessId: ID;
  inquiryId?: ID;
  customerId: ID;
  serviceId: ID;
  priority: Priority;
  status: AppointmentStatus;
  /** Skills required for this job (copied from the service, may be extended). */
  requiredSkillIds: ID[];
  /** Address at booking time — later customer edits never rewrite history. */
  address: AddressSnapshot;
  /** Customer-facing arrival window. */
  windowStart: ISODateTime;
  windowEnd: ISODateTime;
  estimatedMinutes: number;
  createdAt: ISODateTime;
}

export type AssignmentStatus = "active" | "swap_requested" | "replaced";

export interface Assignment {
  id: ID;
  appointmentId: ID;
  technicianId: ID;
  status: AssignmentStatus;
  /** Time the technician is committed: windowStart → windowEnd + estimated minutes. */
  blockedStart: ISODateTime;
  blockedEnd: ISODateTime;
  assignedBy: ID; // User id
  assignedAt: ISODateTime;
}

/**
 * Immutable activity history. Every change to a confirmed appointment
 * MUST produce an event with before/after snapshots and a reason.
 */
export type JobEventType =
  | "inquiry_received"
  | "info_requested"
  | "inquiry_qualified"
  | "slot_offered"
  | "technician_unavailable"
  | "swap_approved"
  | "appointment_changed"
  | "status_changed"
  | "appointment_proposed"
  | "appointment_confirmed"
  | "technician_assigned"
  | "swap_requested"
  | "reassigned"
  | "delay_reported"
  | "reschedule_proposed"
  | "reschedule_approved"
  | "cancelled"
  | "job_started"
  | "job_completed"
  | "note_added"
  | "customer_notified";

export interface JobEvent {
  id: ID;
  appointmentId: ID;
  type: JobEventType;
  actorUserId?: ID;
  reason?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt: ISODateTime;
}

export type NotificationChannel = "sms" | "email";
export type NotificationStatus = "pending" | "sent" | "failed";

export interface Notification {
  id: ID;
  appointmentId: ID;
  customerId: ID;
  channel: NotificationChannel;
  status: NotificationStatus;
  subject: string;
  body: string;
  createdAt: ISODateTime;
  sentAt?: ISODateTime;
}

export type ChangeRequestKind = "reschedule" | "reassign";
export type ChangeRequestStatus = "pending" | "approved" | "rejected" | "withdrawn";

/** A proposed change to a confirmed appointment. The appointment is untouched until approval. */
export interface ChangeRequest {
  id: ID;
  appointmentId: ID;
  kind: ChangeRequestKind;
  status: ChangeRequestStatus;
  requestedBy?: ID;
  reason: string;
  proposedTechnicianId?: ID;
  proposedWindowStart?: ISODateTime;
  proposedWindowEnd?: ISODateTime;
  createdAt: ISODateTime;
  decidedAt?: ISODateTime;
}

export interface JobNote {
  id: ID;
  appointmentId: ID;
  authorUserId: ID;
  body: string;
  createdAt: ISODateTime;
}

export type JobDocumentKind = "job_record_pdf" | "photo" | "other";

export interface JobDocument {
  id: ID;
  appointmentId: ID;
  kind: JobDocumentKind;
  storagePath: string;
  createdAt: ISODateTime;
}
