# CoolFlow HVAC — Final demo build

Goal: stable, secure, demonstrable flow from inquiry to booking to dispatch to technician to exception handling. No rewrite, no new features beyond the story.

## 1. Boot and dependencies
- Confirm `@supabase/supabase-js`, `pdf-lib` and `vitest` are installed (reinstall if missing), then confirm `/`, `/book`, `/booking/$token`, `/owner` and `/tech` all load.

## 2. Customer booking (verify and fix)
- Problem, then one follow-up question when unclear. "Something else / not sure" creates a callback request and offers no slots.
- Validate name, phone, email and address, and save an address copy on the appointment.
- Austin morning/afternoon/anytime windows, Smart Slot Match only, plain wording ("Thu · 10:30–12:00", "About 90 min", "Mike is qualified").
- Recheck the slot, then book atomically. The confirmation page survives a refresh.

## 3. Database conflict rule matches the scheduler
- One shared definition of a blocked interval: travel before, window start, window end + duration + buffer + travel after. The database booking function and the exclusion constraint both use it, and the reassignment/reschedule approval path uses it too.

## 4. Security
- Remove the "first signup becomes owner" fallback. Staff are linked only by a pre-registered email on a technician row, with the owner email set explicitly.
- Tighten RLS. Customers have no table access and reach their booking only through token-based server functions. Technicians read only their own assignments and the matching appointment/customer contact details. Owners see everything in their own business.
- Every staff server function checks its role on the server. Test direct URL and RPC access while signed out and as a technician.

## 5. Owner dispatch (`/owner`, signed in)
- Needs Attention: incomplete inquiries, no-slot inquiries, emergencies, sick/unavailable technicians with affected jobs, delayed jobs with downstream risk, pending change requests, pending notifications.
- Today's Board: a lane per technician showing customer, service, window, duration, priority, status and warnings.
- Job drawer: history (before/after/reason/actor/time), notifications, notes and a PDF button.

## 6. Technician (`/tech`, signed in)
- Today's jobs in order. Actions: En route, In progress, Completed, Delayed (minutes + reason). A delay logs an event and flags the next job as at risk. The promised window is never edited.

## 7–9. Exceptions, audit and notifications
- Mark a technician Off/Sick/Leave/Unavailable. New bookings exclude them, and their existing jobs appear in Needs Attention without moving.
- Customer reschedule request runs Smart Slot Match again. The owner approves, and the original stays in history.
- Owner proposes a replacement technician/time. The scheduler re-validates every rule, invalid proposals are blocked, and approval writes an event with before/after plus a pending notification ("Queued — no SMS/email provider connected").

## 10. PDF
- Export with company, customer, address copy, service/problem, window, technician, status, notes and history.

## 11. Mobile
- Fix the header at 375/390/430: a compact one-line brand, a CTA that never clips, 44px tap targets and no horizontal overflow. Check 1440 as well.

## 12–14. Demo data and cleanup
- Austin scenario: Mike, Daniel, Sarah and James with distinct skills and hours. One technician sick today, several of today's jobs, one emergency, one incomplete inquiry and one pending change request.
- Remove "Test Customer" (Oct 1, 8:30 AM) and any other test rows.

## 15–16. Quality gate and visual check
- Run `npm test`, `npm run lint` and `npm run build`, then browser-test the customer, owner and technician demos at all four widths.
- Report what was completed, partially completed and blocked. Pushing to GitHub happens automatically through Lovable's sync when GitHub is connected; I cannot push manually.

## Technical notes
- New migration: replace `claim_staff_access` (no owner fallback), add a `blocked_interval` SQL function used by `confirm_booking` and a new `apply_change_request` RPC, rewrite the RLS policies by role/business/assignment, and revoke execute on definer functions from anon.
- Seed/cleanup data goes through data SQL, not page code.
- Staff routes live under `_authenticated/`, with an `/auth` email sign-in page.
