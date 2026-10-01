-- 1) Staff linking: email match only. No "first signup becomes owner".
CREATE OR REPLACE FUNCTION public.claim_staff_access()
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE uid uuid := auth.uid(); em text := lower(coalesce(auth.jwt() ->> 'email','')); t public.technicians;
BEGIN
  IF uid IS NULL THEN RETURN 'anonymous'; END IF;
  SELECT * INTO t FROM public.technicians WHERE user_id = uid;
  IF NOT FOUND THEN
    IF em = '' THEN RETURN 'none'; END IF;
    SELECT * INTO t FROM public.technicians WHERE user_id IS NULL AND lower(email) = em LIMIT 1;
    IF NOT FOUND THEN RETURN 'none'; END IF;
    UPDATE public.technicians SET user_id = uid WHERE id = t.id;
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

-- 2) One blocked-interval definition: [window_start, window_end + estimated + buffer + travel)
CREATE OR REPLACE FUNCTION public.confirm_booking(_business_id uuid, _inquiry_id uuid, _customer_id uuid, _service_id uuid, _technician_id uuid, _priority priority, _window_start timestamp with time zone, _window_end timestamp with time zone, _estimated_minutes integer, _buffer_minutes integer, _required_skill_ids uuid[], _address_line text, _city text, _postal_code text, _problem_summary text, _actor_label text, _explanation jsonb)
 RETURNS TABLE(appointment_id uuid, access_token text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE a public.appointments; travel int; bstart timestamptz := _window_start; bend timestamptz;
BEGIN
  SELECT travel_minutes INTO travel FROM public.businesses WHERE id = _business_id;
  bend := _window_end + make_interval(mins => _estimated_minutes + _buffer_minutes + coalesce(travel,0));
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
REVOKE ALL ON FUNCTION public.confirm_booking(uuid,uuid,uuid,uuid,uuid,priority,timestamptz,timestamptz,integer,integer,uuid[],text,text,text,text,text,jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_booking(uuid,uuid,uuid,uuid,uuid,priority,timestamptz,timestamptz,integer,integer,uuid[],text,text,text,text,text,jsonb) TO service_role;

-- 3) Least-privilege RLS: technicians only see jobs assigned to them.
CREATE OR REPLACE FUNCTION public.is_assigned(_user_id uuid, _appointment_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.assignments s JOIN public.technicians t ON t.id = s.technician_id
  WHERE s.appointment_id = _appointment_id AND s.status <> 'replaced' AND t.user_id = _user_id) $$;
REVOKE ALL ON FUNCTION public.is_assigned(uuid,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_assigned(uuid,uuid) TO authenticated, service_role;

DROP POLICY "Staff can view" ON public.appointments;
CREATE POLICY "Technician sees assigned jobs" ON public.appointments FOR SELECT TO authenticated USING (public.is_assigned(auth.uid(), id));
DROP POLICY "Staff can view" ON public.assignments;
CREATE POLICY "Technician sees own assignments" ON public.assignments FOR SELECT TO authenticated
  USING (technician_id IN (SELECT id FROM public.technicians WHERE user_id = auth.uid()));
DROP POLICY "Staff can view" ON public.customers;
CREATE POLICY "Technician sees assigned customers" ON public.customers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.appointments a WHERE a.customer_id = customers.id AND public.is_assigned(auth.uid(), a.id)));
DROP POLICY "Staff can view" ON public.inquiries;
DROP POLICY "Staff can view" ON public.change_requests;
CREATE POLICY "Technician sees changes on own jobs" ON public.change_requests FOR SELECT TO authenticated USING (public.is_assigned(auth.uid(), appointment_id));
DROP POLICY "Staff can view" ON public.job_events;
CREATE POLICY "Owner sees events" ON public.job_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Technician sees own job events" ON public.job_events FOR SELECT TO authenticated USING (appointment_id IS NOT NULL AND public.is_assigned(auth.uid(), appointment_id));
DROP POLICY "Staff can view" ON public.job_notes;
CREATE POLICY "Technician sees own job notes" ON public.job_notes FOR SELECT TO authenticated USING (public.is_assigned(auth.uid(), appointment_id));
DROP POLICY "Staff can view" ON public.notifications;
DROP POLICY "Staff can view" ON public.job_documents;
CREATE POLICY "Technician sees own job documents" ON public.job_documents FOR SELECT TO authenticated USING (public.is_assigned(auth.uid(), appointment_id));
DROP POLICY "Staff can view" ON public.availability_blocks;
CREATE POLICY "Technician sees own blocks" ON public.availability_blocks FOR SELECT TO authenticated
  USING (technician_id IN (SELECT id FROM public.technicians WHERE user_id = auth.uid()));