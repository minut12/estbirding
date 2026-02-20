
-- Events sources table
CREATE TABLE public.events_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  type text NOT NULL DEFAULT 'manual',
  homepage_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.events_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read event sources"
ON public.events_sources FOR SELECT USING (true);

-- Events table
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.events_sources(id),
  source_slug text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  content_html text,
  location_name text,
  location_lat numeric,
  location_lon numeric,
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  all_day boolean NOT NULL DEFAULT false,
  url text,
  image_url text,
  registration_url text,
  tags text[],
  language text NOT NULL DEFAULT 'et',
  guid text NOT NULL UNIQUE,
  is_cancelled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read events"
ON public.events FOR SELECT USING (true);

-- Indexes
CREATE INDEX idx_events_start_at ON public.events (start_at ASC);
CREATE INDEX idx_events_category_start ON public.events (category, start_at ASC);

-- Triggers for updated_at
CREATE TRIGGER update_events_sources_updated_at
BEFORE UPDATE ON public.events_sources
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_events_updated_at
BEFORE UPDATE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default sources
INSERT INTO public.events_sources (name, slug, type, homepage_url) VALUES
  ('EstBirding', 'estbirding', 'manual', 'https://www.estbirding.ee'),
  ('EOÜ', 'eoy', 'webhook', 'https://www.eoy.ee'),
  ('Muu', 'other', 'manual', null);
