# translate-missing-news-et

Manual call examples:

## Ping

curl "https://<project-ref>.supabase.co/functions/v1/translate-missing-news-et?ping=1"

## Backfill missing Estonian translations

curl -X POST "https://<project-ref>.supabase.co/functions/v1/translate-missing-news-et" \
  -H "Content-Type: application/json" \
  -d "{\"limit\":20}"

## Backfill by source_key

curl -X POST "https://<project-ref>.supabase.co/functions/v1/translate-missing-news-et" \
  -H "Content-Type: application/json" \
  -d "{\"limit\":20,\"source_key\":\"birding_poland\"}"
