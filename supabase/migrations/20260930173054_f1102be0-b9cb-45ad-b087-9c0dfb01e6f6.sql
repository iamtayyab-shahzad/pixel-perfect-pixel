CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE public.app_role AS ENUM ('owner','technician');
CREATE TYPE public.priority AS ENUM ('emergency','high','normal','routine');
CREATE TYPE public.inquiry_status AS ENUM ('new','needs_info','qualified','offered','booked','closed_lost');
CREATE TYPE public.appointment_status AS ENUM ('proposed','confirmed','en_route','in_progress','delayed','completed','cancelled');
CREATE TYPE public.assignment_status AS ENUM ('active','swap_requested','replaced');
CREATE TYPE public.block_kind AS ENUM ('leave','sick','unavailable','training','off');
CREATE TYPE public.skill_level AS ENUM ('primary','capable');
CREATE TYPE public.change_kind AS ENUM ('reschedule','reassign');
CREATE TYPE public.change_status AS ENUM ('pending','approved','rejected','withdrawn');
CREATE TYPE public.notification_status AS ENUM ('pending','sent','failed');
CREATE TYPE public.notification_channel AS ENUM ('sms','email');

CREATE TABLE public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, timezone text NOT NULL DEFAULT 'America/Chicago',
  service_area_description text NOT NULL DEFAULT '',
  travel_minutes int NOT NULL DEFAULT 15,
  created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  role public.app_role NOT NULL, UNIQUE(user_id, role));

CREATE TABLE public.skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  code text NOT NULL, label text NOT NULL, UNIQUE(business_id, code));

CREATE TABLE public.technicians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text NOT NULL, email text, phone text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  is_owner boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.technician_skills (
  technician_id uuid NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  level public.skill_level NOT NULL DEFAULT 'capable',
  PRIMARY KEY (technician_id, skill_id));

CREATE TABLE public.working_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  weekday int NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time text NOT NULL, end_time text NOT NULL);

CREATE TABLE public.availability_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  technician_id uuid NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  kind public.block_kind NOT NULL,
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  note text, created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at));

CREATE TABLE public.resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  code text NOT NULL, label text NOT NULL, quantity int NOT NULL CHECK (quantity >= 0));

CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  code text NOT NULL, label text NOT NULL, customer_description text NOT NULL DEFAULT '',
  required_skill_ids uuid[] NOT NULL CHECK (cardinality(required_skill_ids) > 0),
  estimated_minutes int NOT NULL CHECK (estimated_minutes > 0),
  buffer_minutes int NOT NULL DEFAULT 30,
  UNIQUE(business_id, code));

CREATE TABLE public.service_resources (
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  quantity int NOT NULL DEFAULT 1,
  PRIMARY KEY (service_id, resource_id));

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  full_name text NOT NULL, phone text NOT NULL, email text,
  address_line text NOT NULL, city text NOT NULL, postal_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  customer_id uuid REFERENCES public.customers(id),
  service_id uuid REFERENCES public.services(id),
  priority public.priority NOT NULL DEFAULT 'normal',
  description text NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  missing_info text,
  preferred_window_start timestamptz, preferred_window_end timestamptz,
  status public.inquiry_status NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  inquiry_id uuid REFERENCES public.inquiries(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  service_id uuid NOT NULL REFERENCES public.services(id),
  priority public.priority NOT NULL DEFAULT 'normal',
  status public.appointment_status NOT NULL DEFAULT 'confirmed',
  required_skill_ids uuid[] NOT NULL,
  address_line text NOT NULL, city text NOT NULL, postal_code text NOT NULL,
  problem_summary text NOT NULL DEFAULT '',
  window_start timestamptz NOT NULL, window_end timestamptz NOT NULL,
  estimated_minutes int NOT NULL CHECK (estimated_minutes > 0),
  delay_minutes int NOT NULL DEFAULT 0,
  access_token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (window_end >= window_start));

CREATE TABLE public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  technician_id uuid NOT NULL REFERENCES public.technicians(id),
  status public.assignment_status NOT NULL DEFAULT 'active',
  blocked_start timestamptz NOT NULL, blocked_end timestamptz NOT NULL,
  assigned_by uuid, assigned_at timestamptz NOT NULL DEFAULT now(),
  CHECK (blocked_end > blocked_start),
  CONSTRAINT no_technician_double_booking EXCLUDE USING gist (
    technician_id WITH =, tstzrange(blocked_start, blocked_end, '[)') WITH &&
  ) WHERE (status IN ('active','swap_requested')));

CREATE TABLE public.change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  kind public.change_kind NOT NULL,
  status public.change_status NOT NULL DEFAULT 'pending',
  requested_by text NOT NULL, reason text NOT NULL,
  proposed_technician_id uuid REFERENCES public.technicians(id),
  proposed_window_start timestamptz, proposed_window_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz, decided_by uuid);

CREATE TABLE public.job_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  inquiry_id uuid REFERENCES public.inquiries(id) ON DELETE CASCADE,
  type text NOT NULL,
  actor_label text NOT NULL, actor_user_id uuid,
  reason text, before jsonb, after jsonb,
  created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  channel public.notification_channel NOT NULL DEFAULT 'sms',
  status public.notification_status NOT NULL DEFAULT 'pending',
  subject text NOT NULL, body text NOT NULL, status_detail text,
  created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz);

CREATE TABLE public.job_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  author_label text NOT NULL, author_user_id uuid, body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.job_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  kind text NOT NULL, storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now());

-- Job events are immutable
CREATE OR REPLACE FUNCTION public.prevent_event_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'job_events are immutable'; END $$;
CREATE TRIGGER job_events_immutable BEFORE UPDATE OR DELETE ON public.job_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_event_mutation();

-- Role helpers
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id) $$;

-- Link the signed-in account to its technician row (by email), bootstrap first owner.
CREATE OR REPLACE FUNCTION public.claim_staff_access()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); em text := lower(coalesce(auth.jwt() ->> 'email','')); t public.technicians;
BEGIN
  IF uid IS NULL THEN RETURN 'anonymous'; END IF;
  SELECT * INTO t FROM public.technicians WHERE user_id = uid;
  IF NOT FOUND THEN
    SELECT * INTO t FROM public.technicians WHERE user_id IS NULL AND lower(email) = em AND em <> '' LIMIT 1;
    IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'owner') THEN
      SELECT * INTO t FROM public.technicians WHERE is_owner AND user_id IS NULL LIMIT 1;
    END IF;
    IF NOT FOUND THEN RETURN 'none'; END IF;
    UPDATE public.technicians SET user_id = uid, email = coalesce(email, em) WHERE id = t.id;
  END IF;
  INSERT INTO public.user_roles(user_id, business_id, role) VALUES (uid, t.business_id, 'technician') ON CONFLICT DO NOTHING;
  IF t.is_owner THEN
    INSERT INTO public.user_roles(user_id, business_id, role) VALUES (uid, t.business_id, 'owner') ON CONFLICT DO NOTHING;
    RETURN 'owner';
  END IF;
  RETURN 'technician';
END $$;
REVOKE ALL ON FUNCTION public.claim_staff_access() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_staff_access() TO authenticated;

-- Grants + RLS
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['businesses','skills','technicians','technician_skills','working_hours','availability_blocks',
    'resources','services','service_resources','customers','inquiries','appointments','assignments','change_requests',
    'job_events','notifications','job_notes','job_documents'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Staff can view" ON public.%I FOR SELECT TO authenticated USING (public.is_staff(auth.uid()))', t);
    IF t <> 'job_events' THEN
      EXECUTE format('CREATE POLICY "Owner can manage" ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''owner'')) WITH CHECK (public.has_role(auth.uid(), ''owner''))', t);
    END IF;
  END LOOP;
END $$;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Atomic booking confirmation (server-only). Advisory lock + exclusion constraint prevent double-booking.
CREATE OR REPLACE FUNCTION public.confirm_booking(
  _business_id uuid, _inquiry_id uuid, _customer_id uuid, _service_id uuid, _technician_id uuid,
  _priority public.priority, _window_start timestamptz, _window_end timestamptz, _estimated_minutes int,
  _buffer_minutes int, _required_skill_ids uuid[], _address_line text, _city text, _postal_code text,
  _problem_summary text, _actor_label text, _explanation jsonb)
RETURNS TABLE (appointment_id uuid, access_token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.appointments; bstart timestamptz := _window_start;
  bend timestamptz := _window_end + make_interval(mins => _estimated_minutes + _buffer_minutes);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(_technician_id::text));
  IF EXISTS (SELECT 1 FROM public.assignments s WHERE s.technician_id = _technician_id
      AND s.status IN ('active','swap_requested') AND tstzrange(s.blocked_start, s.blocked_end) && tstzrange(bstart, bend)) THEN
    RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.availability_blocks b WHERE b.technician_id = _technician_id
      AND tstzrange(b.starts_at, b.ends_at) && tstzrange(bstart, bend)) THEN
    RAISE EXCEPTION 'technician_unavailable' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.appointments(business_id, inquiry_id, customer_id, service_id, priority, status, required_skill_ids,
    address_line, city, postal_code, problem_summary, window_start, window_end, estimated_minutes)
  VALUES (_business_id, _inquiry_id, _customer_id, _service_id, _priority, 'confirmed', _required_skill_ids,
    _address_line, _city, _postal_code, _problem_summary, _window_start, _window_end, _estimated_minutes)
  RETURNING * INTO a;
  INSERT INTO public.assignments(business_id, appointment_id, technician_id, blocked_start, blocked_end)
  VALUES (_business_id, a.id, _technician_id, bstart, bend);
  IF _inquiry_id IS NOT NULL THEN UPDATE public.inquiries SET status = 'booked' WHERE id = _inquiry_id; END IF;
  INSERT INTO public.job_events(business_id, appointment_id, inquiry_id, type, actor_label, reason, after) VALUES
    (_business_id, a.id, _inquiry_id, 'appointment_confirmed', _actor_label, 'Customer selected a Smart Slot Match option',
      jsonb_build_object('window_start', _window_start, 'window_end', _window_end, 'explanation', _explanation)),
    (_business_id, a.id, _inquiry_id, 'technician_assigned', 'Smart Slot Match', 'Earliest feasible qualified technician',
      jsonb_build_object('technician_id', _technician_id));
  INSERT INTO public.notifications(business_id, appointment_id, customer_id, subject, body, status_detail)
  VALUES (_business_id, a.id, _customer_id, 'Booking confirmed',
    'Your CoolFlow HVAC visit is confirmed.', 'Queued — no SMS/email provider connected');
  appointment_id := a.id; access_token := a.access_token; RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.confirm_booking FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_booking TO service_role;

-- ================= DEMO DATA (CoolFlow HVAC, Austin) =================
CREATE FUNCTION pg_temp.lt(d int, hhmm text) RETURNS timestamptz LANGUAGE sql AS $$
  SELECT ((date_trunc('day', now() AT TIME ZONE 'America/Chicago') + make_interval(days => d) + hhmm::time) AT TIME ZONE 'America/Chicago') $$;

INSERT INTO public.businesses(id, name, service_area_description, travel_minutes) VALUES
 ('00000000-0000-4000-a000-000000000001','CoolFlow HVAC','Austin, Round Rock, Pflugerville, Cedar Park', 15);

INSERT INTO public.skills(id, business_id, code, label) VALUES
 ('00000000-0000-4000-b000-000000000001','00000000-0000-4000-a000-000000000001','ac','AC repair'),
 ('00000000-0000-4000-b000-000000000002','00000000-0000-4000-a000-000000000001','heatpump','Heat pumps'),
 ('00000000-0000-4000-b000-000000000003','00000000-0000-4000-a000-000000000001','electrical','HVAC electrical'),
 ('00000000-0000-4000-b000-000000000004','00000000-0000-4000-a000-000000000001','ductwork','Ductwork'),
 ('00000000-0000-4000-b000-000000000005','00000000-0000-4000-a000-000000000001','install','System install');

INSERT INTO public.technicians(id, business_id, full_name, is_owner, phone) VALUES
 ('00000000-0000-4000-c000-000000000001','00000000-0000-4000-a000-000000000001','Mike Alvarez',true,'(512) 555-0100'),
 ('00000000-0000-4000-c000-000000000002','00000000-0000-4000-a000-000000000001','Daniel Reyes',false,'(512) 555-0101'),
 ('00000000-0000-4000-c000-000000000003','00000000-0000-4000-a000-000000000001','Sarah Kim',false,'(512) 555-0102'),
 ('00000000-0000-4000-c000-000000000004','00000000-0000-4000-a000-000000000001','James Whitaker',false,'(512) 555-0103');

INSERT INTO public.technician_skills(technician_id, skill_id, level) VALUES
 ('00000000-0000-4000-c000-000000000001','00000000-0000-4000-b000-000000000001','primary'),
 ('00000000-0000-4000-c000-000000000001','00000000-0000-4000-b000-000000000002','primary'),
 ('00000000-0000-4000-c000-000000000002','00000000-0000-4000-b000-000000000001','primary'),
 ('00000000-0000-4000-c000-000000000002','00000000-0000-4000-b000-000000000003','primary'),
 ('00000000-0000-4000-c000-000000000003','00000000-0000-4000-b000-000000000002','primary'),
 ('00000000-0000-4000-c000-000000000003','00000000-0000-4000-b000-000000000001','capable'),
 ('00000000-0000-4000-c000-000000000003','00000000-0000-4000-b000-000000000004','capable'),
 ('00000000-0000-4000-c000-000000000004','00000000-0000-4000-b000-000000000004','primary'),
 ('00000000-0000-4000-c000-000000000004','00000000-0000-4000-b000-000000000005','primary');

INSERT INTO public.working_hours(technician_id, weekday, start_time, end_time)
SELECT t.id, d, '08:00', '17:00' FROM public.technicians t, generate_series(1,6) d;

INSERT INTO public.resources(id, business_id, code, label, quantity) VALUES
 ('00000000-0000-4000-d000-000000000001','00000000-0000-4000-a000-000000000001','recovery','Refrigerant recovery machine',1);

INSERT INTO public.services(id, business_id, code, label, customer_description, required_skill_ids, estimated_minutes, buffer_minutes) VALUES
 ('00000000-0000-4000-e000-000000000001','00000000-0000-4000-a000-000000000001','ac_repair','AC not cooling','AC runs but blows warm, or won''t turn on',
   ARRAY['00000000-0000-4000-b000-000000000001']::uuid[],90,30),
 ('00000000-0000-4000-e000-000000000002','00000000-0000-4000-a000-000000000001','heat_pump','Heat pump service','Heat pump noise, icing or not heating',
   ARRAY['00000000-0000-4000-b000-000000000002']::uuid[],120,30),
 ('00000000-0000-4000-e000-000000000003','00000000-0000-4000-a000-000000000001','refrigerant','Refrigerant leak / recharge','Ice on lines, hissing, low refrigerant',
   ARRAY['00000000-0000-4000-b000-000000000001']::uuid[],60,30),
 ('00000000-0000-4000-e000-000000000004','00000000-0000-4000-a000-000000000001','electrical','Breaker trips / electrical','Unit trips the breaker or has no power',
   ARRAY['00000000-0000-4000-b000-000000000001','00000000-0000-4000-b000-000000000003']::uuid[],90,30),
 ('00000000-0000-4000-e000-000000000005','00000000-0000-4000-a000-000000000001','ductwork','Duct repair / airflow','Weak airflow, rooms too hot, damaged ducts',
   ARRAY['00000000-0000-4000-b000-000000000004']::uuid[],150,30),
 ('00000000-0000-4000-e000-000000000006','00000000-0000-4000-a000-000000000001','tuneup','Seasonal tune-up','Routine maintenance before summer or winter',
   ARRAY['00000000-0000-4000-b000-000000000001']::uuid[],60,15);
INSERT INTO public.service_resources(service_id, resource_id, quantity) VALUES
 ('00000000-0000-4000-e000-000000000003','00000000-0000-4000-d000-000000000001',1);

INSERT INTO public.customers(id, business_id, full_name, phone, email, address_line, city, postal_code) VALUES
 ('00000000-0000-4000-f000-000000000001','00000000-0000-4000-a000-000000000001','Linda Rivera','(512) 555-0142','linda.rivera@example.com','4108 Avenue H','Austin','78751'),
 ('00000000-0000-4000-f000-000000000002','00000000-0000-4000-a000-000000000001','Marcus Chen','(512) 555-0177',NULL,'1902 Kinney Ave','Austin','78704'),
 ('00000000-0000-4000-f000-000000000003','00000000-0000-4000-a000-000000000001','Priya Nair','(512) 555-0119','priya.n@example.com','3312 Wells Branch Pkwy','Austin','78728'),
 ('00000000-0000-4000-f000-000000000004','00000000-0000-4000-a000-000000000001','Tom & Beth Hollis','(512) 555-0163',NULL,'811 Round Rock Ave','Round Rock','78681'),
 ('00000000-0000-4000-f000-000000000005','00000000-0000-4000-a000-000000000001','Gloria Sanchez','(512) 555-0188',NULL,'6604 Bee Caves Rd','Austin','78746'),
 ('00000000-0000-4000-f000-000000000006','00000000-0000-4000-a000-000000000001','Kevin Doyle','(512) 555-0131','kdoyle@example.com','1500 Pecan St','Pflugerville','78660');

-- James is out sick today
INSERT INTO public.availability_blocks(business_id, technician_id, kind, starts_at, ends_at, note) VALUES
 ('00000000-0000-4000-a000-000000000001','00000000-0000-4000-c000-000000000004','sick', pg_temp.lt(0,'00:00'), pg_temp.lt(1,'00:00'), 'Called in sick at 6:40am');

INSERT INTO public.inquiries(id, business_id, customer_id, service_id, priority, description, status, missing_info, created_at) VALUES
 ('00000000-0000-4000-9000-000000000001','00000000-0000-4000-a000-000000000001','00000000-0000-4000-f000-000000000006',NULL,'normal',
  'Upstairs is always hot and there''s a weird smell when it kicks on.','needs_info','Which unit (upstairs/downstairs)? Burning or musty smell?', now() - interval '50 minutes');

INSERT INTO public.appointments(id, business_id, customer_id, service_id, priority, status, required_skill_ids, address_line, city, postal_code, problem_summary, window_start, window_end, estimated_minutes, delay_minutes) VALUES
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-a000-000000000001','00000000-0000-4000-f000-000000000001','00000000-0000-4000-e000-000000000001','normal','completed',
   ARRAY['00000000-0000-4000-b000-000000000001']::uuid[],'4108 Avenue H','Austin','78751','AC blowing warm since last night', pg_temp.lt(0,'08:00'), pg_temp.lt(0,'09:00'), 90, 0),
 ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-a000-000000000001','00000000-0000-4000-f000-000000000002','00000000-0000-4000-e000-000000000001','emergency','in_progress',
   ARRAY['00000000-0000-4000-b000-000000000001']::uuid[],'1902 Kinney Ave','Austin','78704','No cooling, elderly resident, 96°F inside', pg_temp.lt(0,'09:00'), pg_temp.lt(0,'09:30'), 90, 0),
 ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-a000-000000000001','00000000-0000-4000-f000-000000000003','00000000-0000-4000-e000-000000000002','normal','delayed',
   ARRAY['00000000-0000-4000-b000-000000000002']::uuid[],'3312 Wells Branch Pkwy','Austin','78728','Heat pump iced over', pg_temp.lt(0,'09:00'), pg_temp.lt(0,'10:00'), 120, 45),
 ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-a000-000000000001','00000000-0000-4000-f000-000000000004','00000000-0000-4000-e000-000000000005','normal','confirmed',
   ARRAY['00000000-0000-4000-b000-000000000004']::uuid[],'811 Round Rock Ave','Round Rock','78681','Back bedrooms get no airflow', pg_temp.lt(0,'10:00'), pg_temp.lt(0,'12:00'), 150, 0),
 ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-a000-000000000001','00000000-0000-4000-f000-000000000005','00000000-0000-4000-e000-000000000006','routine','confirmed',
   ARRAY['00000000-0000-4000-b000-000000000001']::uuid[],'6604 Bee Caves Rd','Austin','78746','Fall tune-up', pg_temp.lt(0,'13:00'), pg_temp.lt(0,'14:00'), 60, 0),
 ('00000000-0000-4000-8000-000000000006','00000000-0000-4000-a000-000000000001','00000000-0000-4000-f000-000000000001','00000000-0000-4000-e000-000000000002','normal','confirmed',
   ARRAY['00000000-0000-4000-b000-000000000002']::uuid[],'4108 Avenue H','Austin','78751','Heat pump follow-up check', pg_temp.lt(0,'13:30'), pg_temp.lt(0,'14:00'), 120, 0),
 ('00000000-0000-4000-8000-000000000007','00000000-0000-4000-a000-000000000001','00000000-0000-4000-f000-000000000006','00000000-0000-4000-e000-000000000004','high','confirmed',
   ARRAY['00000000-0000-4000-b000-000000000001','00000000-0000-4000-b000-000000000003']::uuid[],'1500 Pecan St','Pflugerville','78660','Outdoor unit trips breaker', pg_temp.lt(1,'09:00'), pg_temp.lt(1,'10:00'), 90, 0);

INSERT INTO public.assignments(business_id, appointment_id, technician_id, blocked_start, blocked_end) VALUES
 ('00000000-0000-4000-a000-000000000001','00000000-0000-4000-8000-000000000001','00000000-0000-4000-c000-000000000001', pg_temp.lt(0,'08:00'), pg_temp.lt(0,'11:00')),
 ('00000000-0000-4000-a000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-c000-000000000002', pg_temp.lt(0,'09:00'), pg_temp.lt(0,'11:30')),
 ('00000000-0000-4000-a000-000000000001','00000000-0000-4000-8000-000000000003','00000000-0000-4000-c000-000000000003', pg_temp.lt(0,'09:00'), pg_temp.lt(0,'12:30')),
 ('00000000-0000-4000-a000-000000000001','00000000-0000-4000-8000-000000000004','00000000-0000-4000-c000-000000000004', pg_temp.lt(0,'10:00'), pg_temp.lt(0,'15:00')),
 ('00000000-0000-4000-a000-000000000001','00000000-0000-4000-8000-000000000005','00000000-0000-4000-c000-000000000001', pg_temp.lt(0,'13:00'), pg_temp.lt(0,'15:15')),
 ('00000000-0000-4000-a000-000000000001','00000000-0000-4000-8000-000000000006','00000000-0000-4000-c000-000000000003', pg_temp.lt(0,'13:30'), pg_temp.lt(0,'16:30')),
 ('00000000-0000-4000-a000-000000000001','00000000-0000-4000-8000-000000000007','00000000-0000-4000-c000-000000000002', pg_temp.lt(1,'09:00'), pg_temp.lt(1,'12:00'));

INSERT INTO public.job_events(business_id, appointment_id, inquiry_id, type, actor_label, reason, before, after, created_at) VALUES
 ('00000000-0000-4000-a000-000000000001',NULL,'00000000-0000-4000-9000-000000000001','inquiry_received','Kevin Doyle (customer)',NULL,NULL,NULL, now() - interval '50 minutes'),
 ('00000000-0000-4000-a000-000000000001',NULL,'00000000-0000-4000-9000-000000000001','info_requested','CoolFlow system','Service type unclear',NULL,'{"question":"Which unit, and what kind of smell?"}', now() - interval '49 minutes'),
 ('00000000-0000-4000-a000-000000000001','00000000-0000-4000-8000-000000000002',NULL,'appointment_confirmed','Marcus Chen (customer)','Emergency — earliest feasible slot',NULL,NULL, now() - interval '3 hours'),
 ('00000000-0000-4000-a000-000000000001','00000000-0000-4000-8000-000000000002',NULL,'status_changed','Daniel Reyes',NULL,'{"status":"en_route"}','{"status":"in_progress"}', now() - interval '40 minutes'),
 ('00000000-0000-4000-a000-000000000001','00000000-0000-4000-8000-000000000003',NULL,'delay_reported','Sarah Kim','Parts run — defrost board',
   '{"status":"in_progress","delay_minutes":0}','{"status":"delayed","delay_minutes":45}', now() - interval '20 minutes'),
 ('00000000-0000-4000-a000-000000000001','00000000-0000-4000-8000-000000000004',NULL,'technician_unavailable','Mike Alvarez','James called in sick',NULL,'{"technician":"James Whitaker","kind":"sick"}', now() - interval '2 hours'),
 ('00000000-0000-4000-a000-000000000001','00000000-0000-4000-8000-000000000001',NULL,'job_completed','Mike Alvarez','Replaced run capacitor','{"status":"in_progress"}','{"status":"completed"}', now() - interval '30 minutes');

INSERT INTO public.notifications(business_id, appointment_id, customer_id, subject, body, status_detail) VALUES
 ('00000000-0000-4000-a000-000000000001','00000000-0000-4000-8000-000000000003','00000000-0000-4000-f000-000000000003','Running late','Sarah is running about 45 minutes behind.','Queued — no SMS/email provider connected');
