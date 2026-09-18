# P40 — sidebar-state contract: body.sidebar-open is the signal

`body.sidebar-open` inside each map iframe is the **single** signal MapTab consumes to know the mobile species list covers the map. `public/maps/shared/map-hamburger-control.js` (loaded by all three maps) observes the body class and posts `{type:'SIDEBAR_STATE', open}` to the parent — only at ≤900px, only on change, and not when the map runs standalone; MapTab hides the floating map selector while `open` is true and resets on map switch.

In linnuliigid the class is kept truthful by the P37c `paint()` observer on `#sidebar` (P40 Step 1, runs in both new and classic branches), because two mobile paths remove `#sidebar.open` directly without `closeSidebar()`: the row Ennustus button (~L10685) and the row click (~L15560). Europe and rariliin only toggle it in their `openSidebar`/`closeSidebar` functions.

**Invariant:** any new code path that opens or closes a map's drawer must keep `body.sidebar-open` in step with `#sidebar.open` (call the open/close functions, or rely on an observer that syncs it). Otherwise SIDEBAR_STATE stays `open:true` and the floating selector stays hidden on mobile after the list closes.
