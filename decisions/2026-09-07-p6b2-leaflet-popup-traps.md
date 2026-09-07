# P6b.2 — three Leaflet popup/tooltip traps

Found while building the Ennustus layer's compact popup and origin marker
(P6b.2, shipped in `770157a`). Each one cost a round of "the fixture passes but
the screen doesn't", so they are recorded as traps, not as documentation.

## 1. Leaflet tooltip shrink-to-fit

`white-space: normal` on an absolutely-positioned element inside a Leaflet pane
collapses the element to `min-content` — a one-word-per-line column. The pane
has no width of its own, so there is nothing for the text to fill. `max-width`
never binds, because the used width is already below it.

**Fix:** delete the constraint. Let Leaflet's own `white-space: nowrap` stand
and bound the text at the source instead.

Related: **`L.Tooltip` has no `maxWidth` option** — only `L.Popup` does.
Passing one is silently inert, which reads as "the CSS is wrong" when the
option was never wired up at all.

## 2. Measure the wrapper, not the inner div

A popup size gate must read `.leaflet-popup-content-wrapper`. Leaflet applies
~44px of horizontal margin to `.leaflet-popup-content` (`13px 24px 13px 20px`),
so styling the inner element to 220px and measuring *it* passes a gate the user
never sees — the visible box was 267px.

Scope any margin override to a popup `className`, so the map's other 238 popups
are untouched.

## 3. `arrival_window_et` is a prose label, not a date range

The values are EF band labels — `"Lähipäevil (järgmise ~5 päeva jooksul)"`,
`"Selle nädala jooksul"`, `"Hooaja jooksul võimalik"` — emitted by the
timing-band block in the orchestrator. A fixture that invents a short date
range understates popup height by a full wrapped line.

**Rule:** layout fixtures use live raport values, never invented ones.

## Known, not fixed: stacked popups share one route

With `autoClose: false`, two popups can be open at once, but the closure keeps a
single `activeTrack` / `activeOrigin` / halo. Opening B then closing A wipes B's
route. Pre-existing from P6b; P6b.2 made it more visible. Not fixed.
