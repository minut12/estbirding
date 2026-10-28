-- P170c: which HK report an hk_species origin text comes from (older Hirundo reports fill
-- species that the newest report does not cover; counts stay with report_source_id).
alter table public.hk_species add column origin_source_id text references public.hk_reports (id);
update public.hk_species set origin_source_id = report_source_id where origin_text_et is not null and origin_source_id is null;
