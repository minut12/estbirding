-- P105i: keep only actively transmitting studies pinned (Kristian, 10 Oct 2026).
-- Unpinned: dormant (last fix 2002-2022) or no location data in Movebank. Rows are kept.
update public.movebank_studies set pinned = false, updated_at = now()
where study_id in (10531951, 1481243, 10847586, 92261778, 99570338, 487888187,
                   968980842, 2296102400, 2747912295, 4695499906, 4696126964);
