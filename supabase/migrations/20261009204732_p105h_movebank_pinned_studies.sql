-- P105h: pinned Movebank studies (always refreshed, regardless of discovery filters).
alter table public.movebank_studies add column if not exists pinned boolean not null default false;

-- Kristian's list (9 Oct 2026). Placeholder name until movebank-refresh fills study metadata.
insert into public.movebank_studies (study_id, name, status, pinned)
select id, 'Movebank study ' || id, 'candidate', true
from (values (1481243::bigint),(7962056553),(2201086728),(487888187),(3413045568),(2747912295),(2296102400),
             (6256603498),(10847586),(5097343480),(5620521529),(10531951),(92261778),(3087279879),
             (99570338),(968980842),(4695499906),(4696126964)) v(id)
on conflict (study_id) do update set pinned = true;
