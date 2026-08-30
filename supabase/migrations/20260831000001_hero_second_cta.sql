-- ---------------------------------------------------------------------------
-- A SECOND BUTTON ON A LANDING-PAGE SLIDE
-- ---------------------------------------------------------------------------
-- `site_images` has carried one call to action per row since the dashboard was
-- built (`cta_label` / `cta_href`, §8). The hero renders TWO buttons, so the
-- second one was written in code — a hard-coded "Winter collection" link that
-- no admin could change, on the most prominent block of the shop.
--
-- These two columns finish the pair. Both remain optional, and the storefront
-- keeps its own fallback for a slide that sets neither, so this migration
-- changes nothing about a shop whose admin never fills them in.
--
-- `cta2_*` rather than `secondary_cta_*`: it reads as the second of an
-- obviously numbered pair next to the existing columns, which is what it is.
-- ---------------------------------------------------------------------------

alter table public.site_images
  add column if not exists cta2_label text,
  add column if not exists cta2_href text;

comment on column public.site_images.cta2_label is
  'Text of the slide''s SECOND button. Shown only when cta2_href is set too.';

comment on column public.site_images.cta2_href is
  'Where the second button links: an in-app path (/products?category=shirts) or a full URL.';
