# Data Migration

All Supabase setup for Sipario Reel lives here. The app reads a single table:
**`public.metatable`**.

## Files

- `schema.sql` — creates `public.metatable` (video link, title, views, poster
  URI, category, actors, duration), grants, RLS, the generated `search_text`
  search column with trigram index, the atomic `increment_views(uuid)` RPC and
  the `list_categories()` helper.
- `inserts.sql` — seeds 120 rows (12 categories x 10 episodes) with playable
  royalty-free video URLs, posters, actors, durations and view counts.
  Idempotent (`ON CONFLICT (title) DO UPDATE`).

## Apply order

Run both files in the Supabase SQL editor of the connected project:

1. `schema.sql`
2. `inserts.sql`

## Verify

```sql
SELECT count(*) FROM public.metatable;          -- 120
SELECT DISTINCT category FROM public.metatable; -- 12
SELECT public.increment_views((SELECT id FROM public.metatable LIMIT 1));
```

## App wiring

The browser talks to Supabase directly through `src/lib/supabase.ts`
(publishable anon key, RLS-safe). Every read/write goes through
`src/lib/media.ts`:

- `fetchVideoPage` — keyword search (`search_text ILIKE` per token), category
  filter, `range()` keyset pagination (50 per page, infinite scroll).
- `fetchRelated` — same series, shared actors, then same category.
- `incrementViews` — calls the `increment_views` RPC after 5 seconds of
  playback and returns the fresh count for a live UI update.

Until `schema.sql` is applied, `media.ts` transparently falls back to the older
`dramas` / `episodes` tables so the UI still works.
