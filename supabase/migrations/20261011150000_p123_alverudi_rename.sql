-- P123: the Linnuliigid map stored Elurikkus records of Calidris acuminata under the misspelt
-- key "Alverüdi"; the EOU name (used by species-meta, rarity levels and ennustus) is "Älverüdi".
update public.elurikkus_observations set species_name = 'Älverüdi' where species_name = 'Alverüdi';
