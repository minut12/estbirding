# P38b — brand header + help modal (released ef51f3f)

Shipped (new UI only, `html:not(.sb-classic)`): Linnuliigid sidebar title bar becomes icon · "EstBirds" · `?`, with the 7p/peidetud counters as a plain subline under it; `?` opens a lazily built `#sbHelp` modal (tabs Juhend / Miks EstBirds / Kontakt; contact = estbirds@gmail.com + Instagram @estbirds, no Facebook). Desktop is a centred dialog; ≤900px it is a sheet between `--appHeader` and `--appBottomNav`. Esc / backdrop / × close; a live flip to classic closes it and `__sbHelpOpen()` is a no-op in classic.

Invariant: `#sbHelp.open` z-index must stay **above** the list scroller's inline `z-index:9999` (`.panel-content-scroll`, also `.fetch-controls`, `#ennBg`, mobile `#windPanel`) and **below** the toast (99999) and `#springEditModal` (100000) — currently 10000. The plan's 4200 ("above the pill 4100") was wrong: row icons and the list scrollbar painted over the dialog. Second trap: flex children of the scrolling `.sbh-body` need `flex:0 0 auto`, because `.sbh-acc` has `overflow:hidden` (min-height resolves to 0) and would otherwise be squashed instead of the panel scrolling.

Verification (static server on `public/`): desktop 1280 — z 10000, `elementFromPoint` inside the modal, guide panel scrolls with nothing clipped, 2 mailto + 2 Instagram links, 0 placeholders, Esc closes; mobile 360×740 (simulated 56/64px app bars) — sheet top/bottom match the vars, pill covered, grids single-column, no horizontal overflow; classic via live storage-event flip — button/titlebar hidden, modal guarded and closed, 446 rows with row `outerHTML` 0/446 different from 378e4e1. 0 console errors.

Files: `public/maps/linnuliigid/index.html`, `public/icons/estbirds-96.png` (96×96, downscaled from `public/icon.png`).
