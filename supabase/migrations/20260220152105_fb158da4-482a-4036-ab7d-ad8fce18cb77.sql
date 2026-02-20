
-- News sources table
CREATE TABLE public.news_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  type text NOT NULL DEFAULT 'scrape' CHECK (type IN ('scrape', 'rss', 'webhook')),
  homepage_url text,
  fetch_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- News items table
CREATE TABLE public.news_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES public.news_sources(id) ON DELETE CASCADE,
  source_slug text NOT NULL,
  title text NOT NULL,
  summary text,
  content_html text,
  url text NOT NULL,
  image_url text,
  published_at timestamptz NOT NULL DEFAULT now(),
  language text NOT NULL DEFAULT 'et',
  guid text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_news_items_published_at ON public.news_items (published_at DESC);
CREATE INDEX idx_news_items_source_published ON public.news_items (source_slug, published_at DESC);

-- RLS
ALTER TABLE public.news_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_items ENABLE ROW LEVEL SECURITY;

-- Public read for both tables
CREATE POLICY "Anyone can read news sources" ON public.news_sources FOR SELECT USING (true);
CREATE POLICY "Anyone can read news items" ON public.news_items FOR SELECT USING (true);

-- No public write policies — writes happen via service role in edge functions only

-- Seed EOÜ source
INSERT INTO public.news_sources (name, slug, type, homepage_url, fetch_url)
VALUES ('EOÜ', 'eoy', 'scrape', 'https://www.eoy.ee', 'https://www.eoy.ee/ET/uudised/');

-- Updated_at triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_news_sources_updated_at
  BEFORE UPDATE ON public.news_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_news_items_updated_at
  BEFORE UPDATE ON public.news_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
