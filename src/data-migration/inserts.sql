-- =========================================================================
-- Sipario Reel — SEED DATA for public.metatable
-- Run AFTER schema.sql. Idempotent (ON CONFLICT (title) DO UPDATE).
-- Produces 120 rows: 12 categories x 10 episodes, each with real playable
-- royalty-free video URLs, posters, actors and durations.
-- =========================================================================

WITH catalog(series, category, actors, video_url, base_seconds) AS (
  VALUES
    ('The Midnight Heiress',      'Romance',            ARRAY['Ava Sinclair','Damien Cross','Nora Blake'],       'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', 154),
    ('The CEO''s Secret Bride',   'Billionaire Romance',ARRAY['Elena Vaughn','Marcus Reed','Sophie Lang'],        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', 168),
    ('Alpha''s Forbidden Mate',   'Fantasy',            ARRAY['Kai Thornwood','Isla Moon','Ryder Vale'],          'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4', 191),
    ('Revenge in Heels',          'Revenge Drama',      ARRAY['Camille Duarte','Victor Hale','Rina Osei'],        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4', 176),
    ('The Hidden Princess',       'Historical',         ARRAY['Mira Castellan','Prince Aldric','Yuna Park'],      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', 143),
    ('The Billion Dollar Nanny',  'Rom-Com',            ARRAY['Poppy Sinclair','Grant Whitmore','Lila Chen'],     'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', 137),
    ('The Amnesia Bride',         'Mystery',            ARRAY['Sera Lindqvist','Julian Ward','Dr. Ines Mora'],    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4', 149),
    ('My Vampire Tutor',          'Supernatural',       ARRAY['Nadia Petrova','Lucien Draven','Theo Ellis'],      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4', 158),
    ('The Bodyguard''s Vow',      'Action',             ARRAY['Jonah Reyes','Clara Whitfield','Sgt. Amara Diop'], 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4', 183),
    ('Rebound Marriage',          'Contract Romance',   ARRAY['Hana Yamato','Elliot Sharpe','Bea Montrose'],      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4', 165),
    ('Neon City Nights',          'Thriller',           ARRAY['Rex Kowalski','Ivy Nakamura','Silas Bram'],        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4', 172),
    ('Campus Crush Diaries',      'Teen Drama',         ARRAY['Zoe Alvarez','Ben Okafor','Mimi Laurent'],         'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4', 129)
),
nums AS (SELECT generate_series(1, 10) AS n)
INSERT INTO public.metatable (title, video_url, poster_uri, category, actors, duration_seconds, views)
SELECT
  c.series || ' — Episode ' || n.n,
  c.video_url,
  'https://picsum.photos/seed/' || lower(regexp_replace(c.series, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || n.n || '/600/900',
  c.category,
  c.actors,
  c.base_seconds + (n.n * 7),
  (12000 + abs(hashtext(c.series || n.n::text)) % 900000)::bigint
FROM catalog c
CROSS JOIN nums n
ON CONFLICT (title) DO UPDATE SET
  video_url        = EXCLUDED.video_url,
  poster_uri       = EXCLUDED.poster_uri,
  category         = EXCLUDED.category,
  actors           = EXCLUDED.actors,
  duration_seconds = EXCLUDED.duration_seconds;

-- -------------------------------------------------------------------------
-- Verify
-- -------------------------------------------------------------------------
-- SELECT count(*) FROM public.metatable;                  -- expect 120
-- SELECT DISTINCT category FROM public.metatable;         -- expect 12
-- SELECT * FROM public.metatable WHERE search_text LIKE '%ava sinclair%';
