-- P73b (2026-09-24): gloibi autumn gate 0.35->0.6 and bearing to FI/SE sources. Applied live via MCP first.
update public.species_phenology
set arrival_modes = case when 'autumn_drift' = any(arrival_modes) then arrival_modes else array_append(arrival_modes, 'autumn_drift') end,
    arrival_bearing_autumn = 330,
    refs = refs || jsonb_build_object('p73b_note','2026-09-24 +autumn_drift (gate 0.35->0.6); autumn bearing 190->330 (FI/SE sources ~337)'),
    updated_at = now()
where ebird_code = 'gloibi';
