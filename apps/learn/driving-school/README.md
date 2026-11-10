# Driving School

Beginner conceptual car-control practice in Learn. Not a real-world driving course,
licence test, vehicle dynamics reference or substitute for a qualified instructor.
Default: India / left-hand traffic / right-hand-drive. Speeds in km/h.

## DS-1a
Six guided practice-ground lessons with a gentle bicycle steering model, manual
five-speed/reverse, clutch/RPM/stalls, automatic option, handbrake and indicators.
The blue rings/boxes show the route. Complete a lesson by driving, not by clicking
through instruction cards. Best score and last lesson are saved locally.

Keyboard: W/up throttle; S/down/Space brake; A/D or left/right steer; C clutch;
Q/E shift; H handbrake; Z/X indicators; Enter engine; M mirror. Touch: drag the
wheel sideways; hold pedals; use gear/switch buttons. Clutch down before shifting.
Start with clutch down, first gear, release handbrake, add throttle and gently
release clutch. Brake then clutch down near stopping. Stop fully before reverse.

## Settings and local data
Learn conventions: no Games settings/HEX dependency. Settings are inside this app.
Auto (System / Hub) theme follows the Hub; with no Hub selection it follows the OS.
Loads shared/theme/hub_theme.js without modifying it. Header uses LearnHubBar.

| Key | Meaning / default |
| --- | --- |
| `learn.driving-school.settings` | transmission + traffic side; manual + left |
| `learn.driving-school.theme` | absent = Auto (System / Hub); light or dark override |
| `learn.driving-school.best` | lesson id → best 0–100 score |
| `learn.driving-school.last` | last selected lesson |

`core/` is DOM-free UMD and unit-testable with Node. `ui/` owns canvas, input and
storage. No dependencies/build step. Art and 128 px icon are original code/PIL.

Tests: `node --test apps/learn/driving-school/tests/*.cjs`.
Browser harness: `node apps/learn/driving-school/tests/browser.cjs` after starting
`python3 -m http.server 8829` at the repository root. Requires puppeteer externally.
Only `?test` exposes the deterministic test interface. No lesson is auto-completed.

Related: [Road Safety](../road-safety/) covers road rules and safe pedestrian
crossing; Driving School is specifically hands-on vehicle-control practice.
