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

## DS-1b
Town lessons 7–13: lane keeping, indicated turns, signals, roundabout, STOP/yield,
parallel parking and reversing into a bay. AI vehicles use lanes and stop for
signals/nearby obstacles; pedestrians periodically use the zebra crossing.
Rules give brief reasons and minor/serious faults. Follow rings in order; signal
and stop lessons also require a real wait/stop. Parking requires alignment inside
the bay, a full stop, neutral and handbrake. Select N/D/R explicitly in Automatic;
it changes forward gears for you, not the direction. Switching traffic side or
transmission restarts the current lesson. The miniature mirror reports nearby
rear vehicles but cannot replace looking around or a real car's mirrors.

The road network is a deliberately compact practice map, not a replica of any
city. AI follows procedural routes; there is no realistic crash damage. Fault
cooldowns avoid dozens of duplicate reports from one ongoing mistake.

## DS-1c
Mock route combines STOP, indicated turns, lane discipline, zebra crossing,
traffic signals, roundabout and a return to parallel parking. Complete all rings
and finish parked, or use End test for an incomplete report. A practice pass needs
no serious faults and at most ten minor faults; this is NOT an official licence
assessment. Report lists every minor/serious fault. Parking also requires at least
3 m of actual reversing. The last test report is saved locally.

The 20-question signs quiz deliberately reuses Road Safety's existing procedural
Indian sign artwork (`../road-safety/core/signs.js`) rather than duplicate it.
Engine, indicator and horn (B) use Web Audio synthesis; Sound on / Muted is saved.
Sound starts only after a user gesture. Pause/help/quiz stop the simulation and
engine audio; keyboard state is cleared on blur, visibility changes and modals.
Landscape 844×390 fits the wheel, pedals and >=44 px gear/switch buttons; portrait
has a wider-view hint and can scroll. Canvas uses device pixel ratio up to 3.
How to drive explains the controls, practical sequence and simulator limitations.

| Additional key | Meaning |
| --- | --- |
| `learn.driving-school.quiz-best` | highest signs quiz score out of 20 |
| `learn.driving-school.test-last` | last mock report with completion and faults |

Pure unit tests (no server/browser):
`node --test apps/learn/driving-school/tests/basics.cjs apps/learn/driving-school/tests/roads.cjs apps/learn/driving-school/tests/exam.cjs`

The AI and physics are deliberately simplified. Real vehicle behavior, sightlines,
clutch bite, hazard perception and local regulations need supervised real-world
instruction. No real phone or actual driving test has been used for validation.
