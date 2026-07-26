
CREATE TABLE public.cloud_vehicles (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL,
  data jsonb NOT NULL,
  updated_at bigint NOT NULL,
  deleted boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cloud_vehicles TO authenticated;
GRANT ALL ON public.cloud_vehicles TO service_role;
ALTER TABLE public.cloud_vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own vehicles" ON public.cloud_vehicles FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.cloud_sessions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL,
  data jsonb NOT NULL,
  updated_at bigint NOT NULL,
  deleted boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cloud_sessions TO authenticated;
GRANT ALL ON public.cloud_sessions TO service_role;
ALTER TABLE public.cloud_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sessions" ON public.cloud_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.cloud_segments (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL,
  data jsonb NOT NULL,
  updated_at bigint NOT NULL,
  deleted boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cloud_segments TO authenticated;
GRANT ALL ON public.cloud_segments TO service_role;
ALTER TABLE public.cloud_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own segments" ON public.cloud_segments FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.cloud_meta (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_vehicle_id text,
  updated_at bigint NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cloud_meta TO authenticated;
GRANT ALL ON public.cloud_meta TO service_role;
ALTER TABLE public.cloud_meta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own meta" ON public.cloud_meta FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
