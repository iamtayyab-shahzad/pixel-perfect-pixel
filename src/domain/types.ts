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

export interface Service {
  id: ID;
  businessId: ID;
  code: string;
  label: string;
  requiredSkillId: ID;
  estimatedMinutes: number;
  /** Travel/setup buffer added around the job, in minutes. */
  bufferMinutes: number;
}

export type Priority = "routine" | "soon" | "emergency";

export type InquiryStatus = "new" | "qualified" | "scheduled" | "no_feasible_slot" | "declined";

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
  | "change_pending"
  | "in_progress"
  | "delayed"
  | "completed"
  | "cancelled";

export interface Appointment {
  id: ID;
  businessId: ID;
  inquiryId?: ID;
  customerId: ID;
  serviceId: ID;
  priority: Priority;
  status: AppointmentStatus;
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
  assignedBy: ID; // User id
  assignedAt: ISODateTime;
}

/**
 * Immutable activity history. Every change to a confirmed appointment
 * MUST produce an event with before/after snapshots and a reason.
 */
export type JobEventType =
  | "inquiry_received"
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
