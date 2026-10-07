# avatar-candidates: commercial licences only + locked-down image proxy

Date: 2026-10-07 (P97c2, P97c2b)

The `avatar-candidates` Edge Function only offers images under CC0, CC BY or
CC BY-SA. Anything else (public domain marks, NC, ND, GFDL-only, unknown) is
skipped, because EstBirds avatars must be usable commercially with attribution
(author + licence URL are stored in `bird_avatar_map.credit`).

The `fetch` action is a byte proxy, so it is an SSRF surface. Invariants:
https only; hostname must be exactly one of inaturalist-open-data.s3.amazonaws.com,
static.inaturalist.org, upload.wikimedia.org, thumb.wikimedia.org; redirects are followed manually and
every hop is re-checked against that allowlist (max 3 hops); upstream
content-type must be image/jpeg, image/png or image/webp; max 8 MB (413);
8 s timeout covering the body read. Do not loosen any of these without a new note.

Auth: everything except OPTIONS and `GET ?probe=1` (upstream status codes only,
no data) requires the event-from-url pattern - `auth.getUser()` -> 401, then
`rpc('events_admin_assert_admin')` -> 403.

2026-10-07 P97c2c: added thumb.wikimedia.org (Commons serves imageinfo thumburl from it; operated by Wikimedia, the same organisation as upload.wikimedia.org, so the allowlist was extended to another Wikimedia host, not opened up); Commons files whose mime is not image/* are skipped.
