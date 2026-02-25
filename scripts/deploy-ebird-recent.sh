#!/usr/bin/env sh
set -eu

PROJECT_REF="${1:-eenwcyuyugyrjgpivxrq}"

echo "Linking Supabase project: ${PROJECT_REF}"
supabase link --project-ref "${PROJECT_REF}"

echo "Setting EBIRD_API_TOKEN secret (replace value before running):"
echo "supabase secrets set EBIRD_API_TOKEN=\"PASTE_TOKEN_HERE\" --project-ref ${PROJECT_REF}"

echo "Deploying function ebird_recent..."
supabase functions deploy ebird_recent --project-ref "${PROJECT_REF}"

echo "Done. Verify deploy with:"
echo "supabase functions list --project-ref ${PROJECT_REF}"
