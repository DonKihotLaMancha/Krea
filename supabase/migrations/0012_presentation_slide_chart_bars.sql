-- Optional chart data per slide (from presentation generator), persisted with library saves.
alter table public.presentation_slides
  add column if not exists chart_bars jsonb;
