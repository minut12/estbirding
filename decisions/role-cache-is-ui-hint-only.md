# Offline role cache is a UI hint only (P183b, 2026-11-14)

`AuthContext.tsx` keeps the last role/permissions in localStorage (`estbirding.roleCache.v1`) so the
map picker and menus survive offline. It only decides what the UI shows; every data read and write is
still enforced by RLS, so a stale or tampered cache can never grant access. The cache is cleared on
`SIGNED_OUT` and before `supabase.auth.signOut()`, and is only applied to the same user id, except
offline with no session, where the last role is kept until the network is back.

Same rule for the per-map pin cache in `gbifPins.ts` (P183d, `estbirding.gbifPins.v1.<scope>`): it is
keyed per map, not per user (known shortcut), so never put anything there that RLS would hide from
another account on the same device.
