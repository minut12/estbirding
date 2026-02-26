# Supabase URL fix

Kui Supabase URL on vale, Edge Function päringud ebaõnnestuvad (nt `Failed to fetch`).

## Õige Project URL
1. Ava Supabase Dashboard.
2. Mine **Project Settings -> API**.
3. Kopeeri **Project URL**.

## Määra Lovable env muutujad
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Ajutine parandamine seadmes
Kui env on vale, ava rakenduses **Seaded -> Arendaja -> Supabase (arendaja)** ja määra:
- `Supabase URL override`
- `Supabase anon key override` (valikuline)

Muudatus kehtib ainult selles seadmes (localStorage).
