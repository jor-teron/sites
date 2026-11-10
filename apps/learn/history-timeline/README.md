# History Timeline — HT-1c

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

## HT-1b

350 records in two structured data files; topic chips are OR within selected topics and intersect title/region/bookmark filters. No selected topics means all. At-the-same-time queries use all records within ±25 years of the start date, not only visible/filter matches. The map is a coarse equirectangular sketch with a representative pin, no country borders. Bookmarks use `learn.history-timeline.bookmarks`; corrupt values and unavailable storage are handled without breaking the app.

Expansion audit: retained approximate dates for early writing, the wheel, ancient monuments, traditional dynastic foundations and Kabir/Sangam chronology. Removed the initial exact-year interpretation of Hubble’s public announcement (1924/1925); the card now describes his 1924 observations instead. Did not add disputed Buddha birth dates, precise zero-invention dates, or sole-inventor claims. The late medieval art and learning entries describe periods rather than pretending to know a day of foundation.

## HT-1c

Two quizzes: order five exact-date events (native drag, pointer/touch handle and accessible move buttons), and five century questions. Correct-position / correct-answer scores are out of 100; separate last/best scores survive reload. Approximate and explicitly traditional dates are excluded. The four curated tours auto-pan, support previous/next/pause/resume/end, and advance every eight seconds. Opening a quiz/help, hiding the tab or manually navigating pauses auto-advance. Zoom buttons and tour/era focus use a 300 ms eased transition; wheel/pinch remain direct. Reduced-motion preferences disable animated navigation.

Phone fact cards appear immediately below the timeline, before results, with a return-to-timeline button. User-selected cards scroll into view; auto-tour steps do not repeatedly scroll the page. Marker label intervals are collision-checked rather than overprinted. All events remain available in the list when dense views sample markers.

Final data audit kept exactly 350 entries. Two redundant records (395 Roman succession and 1348 Florence plague, already covered by related entries) were replaced with Aditya-L1's 2024 halo-orbit insertion and SpaDeX's 2025 docking, checked against ISRO:
- https://www.isro.gov.in/ISRO_EN/halo-orbit-insertion-adtya-l1.html
- https://www.isro.gov.in/ISRO_EN/spadex_docking.html
These and the two ancient anchors have reference links in their cards. The other cards were self-checked against established chronology, not independently sourced one by one. No scheduled or speculative future event is included.

Additional activity/browser regression:
```
HT_PUPPETEER=/path/to/puppeteer-core node apps/learn/history-timeline/tests/activities-browser.cjs
```

Storage keys (all local): `learn.history-timeline.view`, `.bookmarks`, `.theme`, `.last-order`, `.best-order`, `.last-century`, `.best-century`. Auto theme removes the per-app override. No telemetry, automatic external network requests, audio, account or cloud sync.
