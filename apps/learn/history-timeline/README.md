# History Timeline — HT-1a

An offline-first Learn app: open `history-timeline.html` (classic scripts; no CDN, tiles or network requests). The index redirects in one hop. The Learn CSV and generated Hub catalog/index expose it in a normal Hub window. LearnHubBar mirrors the Settings action; standalone pages retain a Learn back link. Auto (System / Hub) is the default theme.

## Core release

150 curated event records, from early Homo sapiens to Chandrayaan-3. Parallel World and India lanes, era bands, title search (accent-insensitive), full results with pagination, fact cards, drag/pinch/wheel navigation, keyboard arrow panning and +/− zoom, full-range and decade buttons. The deep-time scale is a signed logarithmic transform around 2000 CE; its unequal spacing is explicitly labelled. Linear mode uses equal year spacing. Timeline drawing is demand-driven and DPR-aware. Crowded markers are sampled, but the list exposes every record, including to keyboard users.

Dates are historical years (negative BCE; positive CE; no zero). Approximate dates are labelled `c.`. An astronomical-year conversion makes the BCE/CE interval consistent internally. Era divisions are approximate teaching conventions, not universal boundaries. India-specific bands can overlap: Mughal and colonial government coexisted. The India lane includes the wider subcontinent and events abroad that directly concern its history; it does not project modern borders into the past.

## Fact audit

Every card was reviewed for year/title/fact consistency. A date attached to an invention refers to the named publication, patent or demonstration, not a claim that one person invented an entire field. Representative places are locations related to the event, not territorial assertions. The Earth pin for the collaborative black-hole image is a deliberately generic location.

Ancient anchor cross-checks:
- Smithsonian Human Origins: https://humanorigins.si.edu/research/whats-hot-human-origins/our-species-arose-least-300000-years-ago
- Metropolitan Museum: https://www.metmuseum.org/toah/ht/02/ssa (Mature Harappan cities c. 2600–1900 BCE)

Other dates use established historical chronology and should be treated as a curated overview, not exhaustive reference scholarship. No live-current event is inferred from the current year; the axis extends to the device's current year. Exact Buddha/Mahavira birth/death years were deliberately excluded: cards describe their teaching periods approximately. An exact Aryan arrival date, a single cause of Indus decline, exact founding dates for early farming/writing, and a date for the invention of zero were excluded. Bologna's traditional 1088 founding and the traditional 776 BCE Olympics are explicitly qualified. Historical eras are not used as quiz answers.

## Local testing

```
node --test apps/learn/history-timeline/tests/core.cjs
python3 -m http.server 8833 --bind 127.0.0.1
HT_PUPPETEER=/path/to/puppeteer-core node apps/learn/history-timeline/tests/browser.cjs
```

The browser test uses installed Google Chrome and port 8833 only; the driver is a development dependency outside the app. No build bump or changes to shared/, hub_apps.js or hub_sw.js.
