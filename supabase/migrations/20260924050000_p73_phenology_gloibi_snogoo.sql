-- P73 (2026-09-24): Ennustus missed FI Glossy Ibis + Snow Goose. Applied live via MCP first.
update public.species_phenology
set source_regions_autumn = array['FI','SE','LV','LT','PL','BY','RU-KGD'],
    source_arc_autumn_from = 300,
    source_arc_autumn_to = 240,
    autumn_window = daterange('2000-07-15','2000-11-01','[)'),
    refs = refs || jsonb_build_object('p73_note','2026-09-24 autumn += FI,SE; arc 300->240; window to 31 Oct (FI 2025-07-26..11-01, Sorve 2025-09-10/11)'),
    updated_at = now()
where ebird_code = 'gloibi';
update public.species_phenology
set ebird_watch = true,
    refs = refs || jsonb_build_object('p73_note','2026-09-24 ebird_watch on: Pori 2026-09-22 absent from FI /recent/notable'),
    updated_at = now()
where ebird_code = 'snogoo';
