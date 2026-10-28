-- P169: Estonian Rarities Committee (HK) data from EOÜ and Hirundo.
-- Sources: EOÜ species checklist, EOÜ list of HK-reviewed taxa, EOÜ list of all
-- accepted HK records, and the yearly HK report in Hirundo. Read-only for clients.
-- Location is kept at kihelkond / county level only (no coordinates).

create table public.hk_reports (
  id text primary key,
  kind text not null check (kind in ('hirundo_report', 'accepted_list', 'checklist', 'hk_species_list')),
  title text not null,
  url text not null,
  as_of date,
  report_no int,
  row_count int,
  parsed_at timestamptz not null default now()
);

create table public.hk_species (
  taxon_sci text primary key,
  species_sci text not null,
  is_subspecies boolean not null default false,
  et_name text,
  et_alt_name text,
  en_name text,
  code6 text,
  checklist_no int,
  category text check (category in ('A', 'B', 'C', 'D', 'E')),
  hk_status text check (hk_status in ('current', 'historical')),
  hk_scope_et text,
  hk_removed_from_year int,
  origin_text_et text,
  nth_record_et text,
  counts_text text,
  records_before int,
  inds_before int,
  records_year int,
  inds_year int,
  counts_year int,
  report_source_id text references public.hk_reports (id),
  updated_at timestamptz not null default now()
);

create table public.hk_records (
  id bigint generated always as identity primary key,
  source_id text not null references public.hk_reports (id) on delete cascade,
  seq int not null,
  taxon_sci text not null,
  heading_et text not null,
  category text not null check (category in ('A-C', 'D', 'E')),
  status text not null check (status in ('accepted', 'rejected')),
  date_text text not null,
  date_from date,
  date_to date,
  date_precision text not null check (date_precision in ('day', 'month', 'season', 'year', 'unknown')),
  year int,
  place text,
  kihelkond text,
  county text,
  county_2021 text,
  individuals_text text,
  count_min int,
  evidence text[] not null default '{}',
  observers text[] not null default '{}',
  breeding boolean not null default false,
  location_inherited boolean not null default false,
  rejection_reason_et text,
  page int,
  raw_text text not null,
  unique (source_id, seq)
);

create index hk_records_taxon_idx on public.hk_records (taxon_sci);
create index hk_records_year_idx on public.hk_records (year);

alter table public.hk_reports enable row level security;
alter table public.hk_species enable row level security;
alter table public.hk_records enable row level security;

create policy hk_reports_read on public.hk_reports for select to anon, authenticated using (true);
create policy hk_species_read on public.hk_species for select to anon, authenticated using (true);
create policy hk_records_read on public.hk_records for select to anon, authenticated using (true);
