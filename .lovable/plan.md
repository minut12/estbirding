

# EstBirding — Progressive Web App (PWA)

A mobile-first, installable web app for Estonian birders. Light, nature-inspired design with green accents on a clean white background. All UI labels in Estonian.

---

## 🏗️ Foundation & PWA Setup
- Configure as an installable PWA (service worker, manifest, offline support)
- App icon and splash screen with EstBirding branding
- Bottom navigation bar with 4 tabs: **Kaart**, **Uudised**, **Üritused**, **Seaded**
- Light & natural design theme (whites, subtle shadows, nature green accents)
- Modular code structure: separate feature folders for map, news, events, settings, and shared/core utilities

---

## 📍 Tab A: Kaart (Map) — Default Tab
- Native header with a **map selector dropdown** above the map area
  - Active option: "Linnuliigid (EE)"
  - Disabled placeholder: "Teised kaardid (varsti)" for future maps
- Map loaded via **iframe** from a local HTML asset file you'll upload
- Extensible map config system (name, region, type: asset/remote, source) so new maps can be added by simply updating a config list
- Map works offline since it's a bundled asset

---

## 📰 Tab B: Uudised (Bird News)
- **Empty state** when no source URL is configured, with a friendly message and button linking to Settings
- When URL is set: fetches posts (auto-detects RSS or JSON feed)
- News list showing: title, date, source name, short excerpt
- Tap a news item → detail screen with:
  - Translated Estonian title & summary (using translation service)
  - Collapsible section showing original text
- **Translation service abstraction**: pluggable interface, starting with a mock/passthrough provider; future support for DeepL or Google via Settings
- Local caching of fetched news so the list loads instantly and works offline

---

## 🗓️ Tab C: Üritused (Events)
- Same empty-state pattern as News when no source URL is configured
- Fetches events from a configurable JSON feed URL
- Event list showing: date, title, location
- Tap → detail screen: full description, location, time, and link to original
- **"Lisa kalendrisse"** button generates and downloads an `.ics` file for the event
- Isolated feed parser so the data format can be adapted later
- Local caching for offline access

---

## ⚙️ Tab D: Seaded (Settings)
- **Uudiste allikas URL** (News source URL) — text input
- **Ürituste allikas URL** (Events source URL) — text input
- **Tõlketeenuse pakkuja** (Translation provider) — dropdown: Mock / DeepL (tulekul) / Google (tulekul)
- **Tõlke API võti** (Translation API key) — optional text input
- All settings persisted in browser localStorage
- Clear TODO markers in code for plugging in real URLs and API keys

---

## 🔧 Technical Approach
- Modular folder structure: `src/features/map`, `src/features/news`, `src/features/events`, `src/features/settings`, `src/lib/translation`, `src/lib/feed-parser`
- Feed fetching with TanStack Query (already installed) for caching, refetching, and error handling
- Offline-first: service worker caches the app shell and map asset; news/events cached in localStorage
- Clean TODO comments throughout for future integration points (real URLs, real translation keys, additional maps)

