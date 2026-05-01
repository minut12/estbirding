import sys, json

rows = json.load(sys.stdin)
for r in rows:
    estonia_entries = r.get("estonia_entries") or []
    europe_entries  = r.get("europe_entries")  or []
    gm = r.get("generation_meta") or {}
    intro = r.get("intro_et") or ""
    nar   = r.get("estonia_narrative_et") or ""
    item = {
        "generated_at": r.get("generated_at"),
        "period": "{} — {}".format(r.get("period_start"), r.get("period_end")),
        "estonia_count": len(estonia_entries),
        "europe_count": len(europe_entries),
        "estonia_rarities": sum(1 for e in estonia_entries if e.get("is_rarity") is True),
        "europe_rarities":  sum(1 for e in europe_entries  if e.get("is_rarity") is True),
        "intro_head": intro[:200],
        "estonia_first": estonia_entries[0] if estonia_entries else None,
        "europe_first":  europe_entries[0]  if europe_entries  else None,
        "estonia_narrative_head": nar[:400],
        "model": r.get("model"),
        "tokens": {"input": gm.get("input_tokens"), "output": gm.get("output_tokens")},
        "obs_counts": gm.get("obs_counts"),
        "trigger_source": gm.get("trigger_source"),
    }
    print(json.dumps(item, ensure_ascii=False, indent=2))
    print()
