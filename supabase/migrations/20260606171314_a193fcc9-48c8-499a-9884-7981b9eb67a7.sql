create table if not exists public.corridor_species_tags (
  scientific_name text primary key,
  ebird_code      text,
  corridors       text[] not null default '{}',
  note            text,
  updated_at      timestamptz not null default now()
);
grant all on public.corridor_species_tags to service_role;
alter table public.corridor_species_tags enable row level security;

insert into public.corridor_species_tags (scientific_name, ebird_code, corridors) values
  ('Aegypius monachus','cinvul1','{black_sea_pannonian}'),
  ('Aquila heliaca','impeag1','{black_sea_pannonian}'),
  ('Circaetus gallicus',null,'{black_sea_pannonian}'),
  ('Ardeola ralloides',null,'{black_sea_pannonian}'),
  ('Egretta garzetta',null,'{black_sea_pannonian}'),
  ('Himantopus himantopus',null,'{black_sea_pannonian}'),
  ('Merops apiaster',null,'{black_sea_pannonian}'),
  ('Ichthyaetus melanocephalus','medgul1','{black_sea_pannonian}'),
  ('Cecropis rufula',null,'{black_sea_pannonian}'),
  ('Plegadis falcinellus','gloibi','{black_sea_pannonian}'),
  ('Ichthyaetus ichthyaetus',null,'{caspian_central_asia}'),
  ('Circus macrourus',null,'{caspian_central_asia}'),
  ('Aquila nipalensis',null,'{caspian_central_asia}'),
  ('Pastor roseus',null,'{caspian_central_asia}'),
  ('Tetrax tetrax',null,'{caspian_central_asia}'),
  ('Iduna caligata',null,'{caspian_central_asia}')
on conflict (scientific_name) do update
  set corridors  = excluded.corridors,
      ebird_code = coalesce(excluded.ebird_code, public.corridor_species_tags.ebird_code),
      updated_at = now();