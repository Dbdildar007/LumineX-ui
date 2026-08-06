-- =========================================================================
-- Sipario Reel — SCHEMA
-- Single source of truth for the app: public.metatable
-- Run this first, then inserts.sql. Both are idempotent.
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- -------------------------------------------------------------------------
-- 1. Table
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.metatable (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text        NOT NULL,
  video_url        text        NOT NULL,
  poster_uri       text        NOT NULL,
  category         text        NOT NULL,
  actors           text[]      NOT NULL DEFAULT '{}',
  duration_seconds integer     NOT NULL DEFAULT 0,
  views            bigint      NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Natural key so seeding stays idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS metatable_title_key ON public.metatable (title);

-- One denormalised, indexed column powers YouTube-style keyword search across
-- title + category + actor names in a single ILIKE, no client filtering.
ALTER TABLE public.metatable
  ADD COLUMN IF NOT EXISTS search_text text
  GENERATED ALWAYS AS (
    lower(title || ' ' || category || ' ' || array_to_string(actors, ' '))
  ) STORED;

CREATE INDEX IF NOT EXISTS metatable_search_text_trgm_idx
  ON public.metatable USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS metatable_category_idx ON public.metatable (category);
CREATE INDEX IF NOT EXISTS metatable_views_idx    ON public.metatable (views DESC);

-- -------------------------------------------------------------------------
-- 2. Grants (PostgREST needs these — RLS alone is not enough)
-- -------------------------------------------------------------------------
GRANT SELECT ON public.metatable TO anon;
GRANT SELECT ON public.metatable TO authenticated;
GRANT ALL    ON public.metatable TO service_role;

-- -------------------------------------------------------------------------
-- 3. RLS — catalogue is public read-only; writes only via the RPC below.
-- -------------------------------------------------------------------------
ALTER TABLE public.metatable ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "metatable public read" ON public.metatable;
CREATE POLICY "metatable public read"
  ON public.metatable FOR SELECT
  TO anon, authenticated
  USING (true);

-- -------------------------------------------------------------------------
-- 4. View counter RPC — atomic, returns the fresh count for live UI updates.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_views(_id uuid)
RETURNS bigint
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.metatable
     SET views = views + 1
   WHERE id = _id
  RETURNING views;
$$;

GRANT EXECUTE ON FUNCTION public.increment_views(uuid) TO anon, authenticated, service_role;

-- -------------------------------------------------------------------------
-- 5. Distinct categories helper (cheap, cached by the client)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_categories()
RETURNS TABLE (category text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT m.category FROM public.metatable m ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION public.list_categories() TO anon, authenticated, service_role;
