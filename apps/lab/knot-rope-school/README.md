# Knot & Rope School

A minimalist, mobile-first learning app with seven beginner knot lessons.

## Included
- Figure-eight stopper, bowline, clove hitch, sheet bend, taut-line hitch, round turn & two half hitches, and timber hitch lessons
- Step-by-step instructions, practice guidance, common mistakes and short quizzes
- Lesson completion tracking and a local field journal
- Responsive layout and a basic offline-capable PWA service worker

## Project structure
- `index.html` — lightweight redirect to the actual app document
- `knot-rope-school.html` — main app shell and ordered CSS/JavaScript loading
- `ui/tokens.css` — design tokens, typography and global defaults
- `ui/layout.css` — header, navigation and page layout
- `ui/components.css` — cards, lessons, tutorials, practice and controls
- `ui/responsive.css` — mobile, desktop and compact-screen refinements
- `core/lessons.js` — lesson registry
- `core/diagrams.js` — reusable knot SVG illustrations
- `core/tutorials.js` — interactive visual tutorial sequences
- `core/app.js` — application state, rendering, navigation and interactions
- `lessons/lesson-01.js` through `lesson-07.js` — one self-contained lesson module per knot
- `service-worker.js` — offline caching

Stylesheets are split by responsibility and loaded in cascade order. Each lesson registers itself with the shared lesson registry. Add a new lesson by creating a numbered file and including it in `knot-rope-school.html` and the service-worker cache list. No build tools or framework are required.

## Run locally
From this directory, start any static HTTP server, for example:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

The app uses no build step or third-party runtime dependencies. Progress and notes are stored in the browser on the device.

## Safety
This is general knot education only. Do not use these lessons as instructions for climbing, rescue, lifting people, or other life-safety applications. Knot diagrams are learning illustrations, not certification or engineering validation.
