# admin-user-status: who can be blocked, how the ban is applied, how long it lags

Date: 2026-10-08 (P97e1, P97e2)

Admins cannot be blocked: the `admin-user-status` Edge Function returns 409
`cannot block an admin`; demote the user first. Nobody can block themselves
(400 `cannot change own status`). Both rules keep an admin from locking the
project out of its own admin area.

The ban goes through the Supabase Auth admin API (`ban_duration` '876000h' to
block, 'none' to unblock) inside the Edge Function - never SQL on `auth.*`
tables, which bypasses GoTrue and its session handling. Before changing anything
the EF snapshots `banned_until` via `getUserById`; if the following
`profiles.status` update fails, it restores exactly that earlier ban state, so
Auth and `profiles.status` never disagree.

A ban only stops new sign-ins and token refreshes. Access tokens issued before
the ban stay valid until JWT expiry (up to 1 h), hence the UI wording "hiljemalt
tunni jooksul". To shorten that window in practice the app reads
`profiles.status` on load (AuthContext, once per sign-in) and signs a disabled
user out; this check fails open if the profile read fails, so a flaky read never
locks out an active user.
