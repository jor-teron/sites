# Radio

MV2: moved from apps/lab to apps/media (Audio section); old path redirects.

<!-- (before MV2) Lab app at `apps/lab/radio-app/`. There was no readme. -->

The page is `index.html` (styles in `style.css`, logic in `script.js`).
Stations are hardcoded in `script.js`. Nothing is saved: no localStorage key
and no IndexedDB database. No service worker and no manifest. Scripts and
styles are in this folder, so the move did not change a relative path.
