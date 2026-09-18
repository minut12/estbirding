# P37b — classic sidebar rows stay byte-identical

Invariant: in `html.sb-classic`, `rowHTML` must emit markup byte-identical to e79cd1b except the bell's extra `sb-ib` class. The new UI is a separate return branch in `rowHTML`, and a live flag flip calls `render()` from the storage listener only (not at boot, where `DATA` may be uninitialised). Verified by live-flipping via a same-origin iframe `storage` event, then diffing all 446 row `outerHTML`s against e79cd1b with the port normalised.
