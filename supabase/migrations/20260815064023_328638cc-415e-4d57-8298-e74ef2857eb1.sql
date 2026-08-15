CREATE TABLE public.events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  ort text,
  datum_start date,
  datum_ende date,
  quelle_typ text CHECK (quelle_typ IN ('sportity_link', 'pdf_upload')),
  quelle_referenz text,
  status text NOT NULL DEFAULT 'geplant' CHECK (status IN ('geplant', 'laufend', 'abgeschlossen')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own events" ON public.events FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.event_schedule (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  uhrzeit timestamptz NOT NULL,
  programmpunkt text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_schedule TO authenticated;
GRANT ALL ON public.event_schedule TO service_role;
ALTER TABLE public.event_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own event_schedule" ON public.event_schedule FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX event_schedule_event_id_idx ON public.event_schedule (event_id, uhrzeit);

CREATE TABLE public.event_stages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wp_nummer text,
  name text NOT NULL,
  laenge_km numeric,
  start_uhrzeit timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_stages TO authenticated;
GRANT ALL ON public.event_stages TO service_role;
ALTER TABLE public.event_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own event_stages" ON public.event_stages FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX event_stages_event_id_idx ON public.event_stages (event_id, start_uhrzeit);
