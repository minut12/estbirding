-- Seed the Estbirding autumn trip to Kihnu (16.-18. October 2026).
-- Idempotent: fixed id + on conflict do nothing so re-running the migration is safe.
insert into public.events_manual (
  id,
  title,
  starts_at,
  ends_at,
  type,
  location_name,
  lat,
  lon,
  url,
  description,
  status
)
values (
  'a1f5c3e2-0b6d-4e7a-9c21-9f3b7d2e6a10',
  'Estbirdingu sügisretk Kihnus',
  '2026-10-16 12:00:00+03',
  '2026-10-18 12:00:00+03',
  'estbirding',
  'Risti kodumajutus, Kihnu',
  58.1297,
  24.0040,
  'https://forms.gle/ZDnc6zRZhWBEpPsK7',
  $desc$Estbirdingu sügisretk toimub 16.-18. oktoobril Kihnus.

Ettekanded ja koosolek toimuvad Risti kodumajutuses (https://www.kihnuristimajutus.ee/). Samas kohas on ka õhtusöök ja saun. Sügisretke programmi saadame sügise alguses.

Osalejad broneerivad ise endale majutuse. Risti kodumajutuses on kuni 30 kohta, saadaval on kahe- kuni neljakohalised toad. NB! Allpool on Risti kodumajutuse hinnakiri (meile on tehtud veidi soodsam hind võrreldes kodulehel pakutavaga). Broneerides anna teada, et oled tulemas Estbirdingu sügisretkele.

Risti kodumajutuses on võimalik tellida hommikusööki hinnaga 12 eurot/inimene ja seda pakutakse kokkuleppeliselt kell 6.30. Estbirding kogub hommikusööjate arvu ja edastab selle info majutusele, kuid selle eest tuleb ise maksta otse majutusele! Kes ei soovi hommikusööki tellida, siis on võimalik toimetada ka väliköögis (sh keeta vett).

Praamipiletid Kihnu ja tagasi: https://www.veeteed.com/#/et/. Praamipiletid tasub aegsasti ära osta.

Osalustasu on 20 eurot liikmele ja 30 eurot mitteliikmele. Osalustasu sisaldab õhtusööki ja ruumide renti. Registreeru siin: https://forms.gle/ZDnc6zRZhWBEpPsK7 Osaleja loetakse registreerunuks pärast osalustasu maksmist, mille tähtaeg on 5. oktoober (k.a).

Kellel on ettepanekuid ettekannete osas või soovib ise teha ettekande, anna teada!

Tervitades
Tiiu Tali

----

Risti kodumajutuse hinnakiri:

Saunamaja
4-ne tuba (2 eraldi voodit ja 1 suur voodi, tuba on koos WC ja konditsioneeriga) 125 eur/öö
2-ne tuba (suur voodi, tuba on koos WC ja konditsioneeriga) 85 eur/öö
3-ne tuba (3 eraldi voodit) 85 eur/öö
Ühiskasutuses on maja vahetus läheduses asuv veega ja kätepesemisvõimalusega WC ning duširuum saunamajas.

Peamaja
2-ne tuba (suur voodi) 85 eur/öö
2-ne tuba (suur voodi) 85 eur/öö
3-ne (3 eraldi voodit) 95 eur/öö
3-ne (suur voodi ja 1 eraldi voodi) 95 eur/öö
4-ne (4 eraldi voodit) 125 eur/öö
Peamaja kõik toad on privaatse duši ja WC-ga.

Suvemaja
2-ne tuba (suur voodi) 85 eur/öö
2-ne tuba (2 eraldi voodit) 85 eur/öö
5-ne tuba (suur voodi ja 3 eraldi voodit) 140 eur/öö
Suvemaja kõik toad on privaatse duši ja WC-ga ning konditsioneeriga.

Majutuse broneerimine: https://www.kihnuristimajutus.ee/kontakt/$desc$,
  'active'
)
on conflict (id) do nothing;
