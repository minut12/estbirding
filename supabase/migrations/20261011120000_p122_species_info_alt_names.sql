-- P122: Estonian alternative names (EOU checklist parentheses, e.g. "lapi tsiitsitaja (keltsalind)")
-- shown as "ehk ..." in the Linnuliigid species info modal. "harilik X" long forms are skipped.
alter table public.species_info add column if not exists alt_names_et text;
update public.species_info s set alt_names_et = v.alt
from (values
  ('borowl','laanekakk'),
  ('ettwoo1','kolmvarvas-rähn'),
  ('ferduc','ruskevart'),
  ('hoopoe','toonetutt'),
  ('laplon','keltsalind'),
  ('litsti','väikerisla'),
  ('marwar3','putke-roolind'),
  ('retpip','punakurk-kiur'),
  ('tersan','kibutilder'),
  ('pecsan','kiripugu-risla')
) as v(code, alt)
where s.ebird_code = v.code;
