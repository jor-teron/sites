# Speed Test

Basic speed test that measures against files hosted in this app (`data/`), so it shows the speed between you and the site's server — no outside services, no upload.

Files: `index.html`, `speedtest.css`, `speedtest_core.js` (ping/download timing), `speedtest_ui.js` (gauge, unit, history), `data/ping.txt`, `data/st_1mb.bin`, `data/st_5mb.bin` (random bytes, incompressible).

## Releases
- **ST1** — Ping (5 tries: avg, best/worst, jitter), download with live needle gauge, MB/s ↔ Mbps toggle (saved), Quick (1 MB) / Full (5 MB ×2), data used, browser connection estimate (`navigator.connection`), history of last 10 results (localStorage). Requests use `?t=` cache-busting and `cache:'no-store'`.
- **ST2** — Download is timed (5/10/15 s, default 5, saved in `speedtest.dur`; replaces Quick/Full): 4 parallel streams loop-fetch `data/st_5mb.bin` (cache-busted, no-store) until time is up, then in-flight fetches are aborted (AbortController). First 1 s is warm-up and ignored; result = steady speed (bytes after warm-up ÷ time after warm-up). Needle turns orange while running and returns to normal when finished (only completion cue). Data used still shown.
