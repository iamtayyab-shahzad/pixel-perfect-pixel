DO $$
DECLARE cid uuid := '70c62e23-0378-4279-ba76-52107261201c';
BEGIN
  ALTER TABLE public.job_events DISABLE TRIGGER job_events_immutable;
  DELETE FROM public.job_events WHERE appointment_id IN (SELECT id FROM public.appointments WHERE customer_id = cid)
     OR inquiry_id IN (SELECT id FROM public.inquiries WHERE customer_id = cid);
  ALTER TABLE public.job_events ENABLE TRIGGER job_events_immutable;
  DELETE FROM public.notifications WHERE customer_id = cid;
  DELETE FROM public.change_requests WHERE appointment_id IN (SELECT id FROM public.appointments WHERE customer_id = cid);
  DELETE FROM public.assignments WHERE appointment_id IN (SELECT id FROM public.appointments WHERE customer_id = cid);
  DELETE FROM public.appointments WHERE customer_id = cid;
  DELETE FROM public.inquiries WHERE customer_id = cid;
  DELETE FROM public.customers WHERE id = cid;
END $$;