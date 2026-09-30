# CoolFlow HVAC — full operational loop

Goal: Inquiry → Qualification → Smart Slot Match → Offer → Confirmation → Assignment → Dispatch → Exceptions → Auditable change. Built in the order below; each phase is checked before the next starts.

## Phase 1 — Repair Smart Slot Match
- Generate candidates from the customer's actual window start (08:10 stays 08:10), not a fixed 30-minute grid.
- Existing jobs block their whole promised arrival window plus duration, not just start + duration.
- If no skills are given, use the service's skills. Technicians need every required skill. An empty list never means "anyone qualifies".
- Buffer applies at shift start, shift end, next to other jobs and next to blocks. A job ending at 17:00 with a 30-minute buffer fails a 17:00 shift end.
- New `technician_eligible` check for unknown or inactive technicians, separate from skill mismatch.
- `duration_fits` checks the whole duration plus buffer against the shift and the window.
- `resource_available` is a real check: services list the equipment they need (such as a lift or recovery machine), and the business has resources with counts.
- Ordering: feasibility first, then earliest time, then skill fit, then technician ID. Emergencies go earliest first. Priority never overrides a rule.
- Install Vitest so `npm test` works, and add every case in the brief, including a DST test around Nov 1, 2026.

## Phase 2 — Update the domain model
- Inquiry: new, needs_info, qualified, offered, booked, closed_lost.
- Appointment: proposed, confirmed, en_route, in_progress, delayed, completed, cancelled. Changes go through a separate reschedule/change request with its own statuses.
- Priority: emergency, high, normal, routine.
- Technician availability shown as available, busy, off_today, on_leave, sick or unavailable. "Busy" is always worked out from assignments, never stored.
- Services and appointments can need several skills. Appointments keep a copy of the address as it was when booked.
- Assignments store technician, start and end, so the database can refuse overlapping bookings.
- Add Resource and ServiceResource tables, plus a ChangeRequest table for swaps and reschedules.

## Phase 3 — Database (Lovable Cloud)
- Enable Cloud and create a table for every entity. Each row carries `business_id`.
- Overlapping active assignments for the same technician are blocked in the database itself.
- A `confirm_booking` function locks, rechecks and inserts in one transaction, so two customers can't take the same slot. Cancelling frees the assignment.
- The demo data is created by the migration.

## Phase 4 — Logins and access
- Owner and technicians sign in with email and password. Roles live in their own table, checked with `has_role`.
- Customers don't create accounts. Each booking gets a private link with a secret code, which only shows that booking.
- Owner and technician data is protected by access rules and server checks.
- The public header shows only the brand and "Request a visit", with no overflow at 375 and 390 px. The 404 page shows its recovery button without scrolling.

## Phase 5 — Customer booking (`/book`)
Steps: problem and service type, follow-up questions if details are missing, address and contact, preferred window, time options with plain-language reasons, confirm, then a confirmation page (`/booking/$token`) with reschedule and cancel. If nothing fits, the customer gets an honest message and a "request a callback" option that files the request as needing attention. No times are invented.

## Phase 6 — Owner dispatch (`/owner`)
- **Needs Attention**: requests missing information, requests with no open slot, emergencies, sick or unavailable technicians with jobs, delayed jobs, changes awaiting approval, and customers waiting for a reply.
- **Today's Board**: one lane per technician, jobs in time order, each showing status and priority tags and warnings. Clicking a job opens its details: timeline, notes, reassign, cancel, PDF.

## Phase 7 — Technician day (`/tech`)
Today's jobs in order, each with arrival window, address, service and duration. Buttons set the job to En route, In progress, Delayed (with minutes and a reason) or Completed. A delay records an event and marks the later jobs it affects.

## Phase 8 — Real-world exceptions
- The owner can mark a technician off today, on leave, sick or unavailable. This creates an availability block, and their confirmed jobs appear in Needs Attention instead of being moved automatically.
- Delays: the system checks whether later jobs still fit and offers the owner a reassign option.
- Reschedule: Smart Slot Match runs again and creates a change request. The old booking stays until the customer approves the new time.
- Swap/reassign: current and proposed are shown side by side, the new pairing is checked with Smart Slot Match, then the owner approves. Approval records an event and creates a pending customer notification.

## Phase 9–10 — History and notifications
- Every action listed in the brief is logged with who, when, what it was before, what it is after, and why. The history appears on the job and in the owner's view.
- Notifications move through pending, sent and failed. No SMS or email service is connected, so notifications show as "Queued — no provider connected" and are never marked as delivered.

## Phase 11 — PDF job record
Built with `pdf-lib` on the server: branding, customer, address copy, service, window, technician, status, notes and history.

## Phase 12 — Demo data
- Technicians: Mike (owner, AC and heat pump), Daniel (AC and electrical), Sarah (heat pump and ductwork), James (ductwork and install, off sick one day).
- Austin customers and services, several jobs today, one emergency, one request missing information, and one delayed job.
- Demo dates are relative to "today", so the board is never empty.

## Phase 13–14 — Polish and final check
- Keep the warm off-white, steel blue and burnt orange style. No charts.
- Check pages at 375, 390, 430 and 1440 px, and walk through the customer, owner, technician and trust stories in the browser.
- Run `npm test`, lint and build, then write the final report.

## Technical notes
- Pure engine in `src/lib/scheduling/`. Database access lives in `src/services/*.functions.ts` (server functions); pages never query the database directly.
- Overlap protection: `btree_gist` plus `EXCLUDE USING gist (technician_id WITH =, tstzrange(blocked_start, blocked_end) WITH &&) WHERE status in ('active','swap_requested')`.
- Customer access: `bookings.access_token` (random), read through a server function that checks the token. Customers get no direct table access.
- GitHub sync happens automatically if connected under Connectors. I can't push from here.
- Phases 2–12 are a very large job, so it will take several rounds. The first round covers Phases 1–4.
