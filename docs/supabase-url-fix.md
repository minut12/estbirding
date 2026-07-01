# Supabase URL fix

Kui Supabase URL on vale, Edge Function p�ringud eba�nnestuvad (nt `Failed to fetch`).

## �ige Project URL
1. Ava Supabase Dashboard.
2. Mine **Project Settings -> API**.
3. Kopeeri **Project URL**.

## M��ra Lovable env muutujad
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Ajutine parandamine seadmes
Kui env on vale, ava rakenduses **Seaded -> Arendaja -> Supabase (arendaja)** ja m��ra:
- `Supabase URL override`
- `Supabase anon key override` (valikuline)

Muudatus kehtib ainult selles seadmes (localStorage).
