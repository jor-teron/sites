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
| `learn.driving-school.settings` | transmission + traffic side + open-road route number; manual + left + route 1 |
| `learn.driving-school.theme` | absent = Auto (System / Hub); light or dark override |
| `learn.driving-school.best` | lesson id → best 0–100 score |
| `learn.driving-school.last` | last selected lesson |

`core/` is DOM-free UMD and unit-testable with Node. `ui/` owns canvas, input and
storage. No dependencies/build step. Art and 128 px icon are original code/PIL.

Tests: `node --test apps/learn/driving-school/tests/{basics,roads,exam,cockpit,scene3d,ui-stub,openroad}.cjs`.
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

## DS-2a: driver's-seat view (three.js)
You now sit INSIDE the car. The top of the screen is the windscreen: a real 3D scene
(three.js r170, shared Learn copy at `../common/vendor/three/`, loaded as an ES module
with a relative path, no CDN). The bottom is the dashboard, drawn in HTML/SVG on top:

- Steering wheel in front of you; it turns with the steering. Drag the wheel ROUND
  (touch or mouse); let go and it straightens. Tap the middle for the horn.
- Speedometer (0-100 km/h) and rev counter (0-7000 rpm, red from 5500) as analogue
  dials; the big letter in the rev counter is the gear (N, 1-5, R; D in Automatic).
- Gear lever: tap a slot (H pattern 1-5, N, R; Automatic shows R, N, D). Handbrake
  lever button, Start engine, Check mirrors. RHD (India): these sit LEFT of the wheel;
  with right-hand traffic (LHD) they move to the right of it.
- Indicator arrows above the wheel blink green when on (tap them to signal).
- Clutch, Brake and Accelerator pedals: big hold buttons, each shows how far it is
  pressed (clutch shows real clutch travel, so you can see the bite point). Automatic
  hides the clutch.
- Rear-view mirror (top centre) and door mirrors (when the screen is at least 520 px
  wide) are extra cameras looking back, flipped like real mirrors.
- One "Next: ..." line from the instructor sits above the dashboard. A small map in
  the corner shows the area from above.

Manual is the default (Automatic in Settings). India / left-hand traffic is the
default, so the driver's eye is right of the car's centre line.

Lessons 1-6 (practice lot) and lessons 7-13 + the mock test (town) are all drawn in
3D: lot lines and cones, roads, centre dashes, zebra, stop lines, the traffic signal,
STOP / 30 / give-way signs, buildings, parking bays, AI cars and pedestrians. Lesson
rings are blue arches to drive through (next one glows; passed ones turn green), with
a dashed guide line and blue stop / parking boxes. Core logic (physics, lessons,
rules, scoring, exam) is unchanged; DS-2a only replaces the presentation.

Performance: pixel ratio capped at 1.5 (1 on canvases wider than 1500 px), no
shadows, Lambert/basic materials, instanced cones/dashes/trees, under 400 meshes,
antialias off on devices with 4 GB or less. The small map redraws every third frame.

Fallback: browsers refuse ES module imports over `file://`, and some devices lack
WebGL. Then the module never registers and the app keeps the old top-down map
(`ui/render.js`, `ui/town-render.js`) full size with the same dashboard, and says so
once. `?view=map` forces the map view. If WebGL fails mid-drive it also falls back.
Inside a Hub window the head row moves to the title bar with Signs quiz, How to drive,
Sound and Settings buttons (LearnHubBar buttons list, like Hindi Letters).

Files: `core/cockpit.js` (DOM-free maths: wheel angle and drag, dial needles, gear
lever slots, driver / mirror camera poses, horizon framing, mirror viewports, lot,
town and marker layouts), `ui/scene3d.js` (three.js scene, no DOM), `ui/view3d.js`
(renderer, cameras, mirrors), `ui/dash.js` (dashboard SVG and wheel drag).
Tests: `tests/cockpit.cjs` (maths), `tests/scene3d.cjs` (builds and updates every
lesson's scene in Node, no WebGL), `tests/ui-stub.cjs` (runs the classic UI scripts
in a stub DOM). `tests/browser.cjs` was updated for the new controls but not run.

Left for DS-2b/2c: home screen and first-time guide, Signs quiz as its own page,
plainer lesson wording (lesson cards still mention keys), Learn look/title bar,
P for park in Automatic, a 3D bonnet/interior, mirror-check scoring.

## DS-3 · Open road (procedural roads)
A new **Open road** group in the lesson menu has two modes. Both take a **route number**
(default 1, the Route box in the toolbar); the same number always gives the same road.

- **Endless drive**: new road is generated about 420 m ahead and points more than 160 m
  behind are dropped, so memory stays bounded however far you go (no finish; the
  status line shows km driven and the score).
- **Practice loop**: a closed loop of about 1.2–2 km that joins back to the start;
  one full lap completes it and saves a best score.

`core/roadgen.js` (DOM-free) is a seeded generator. The idea is the OutRun-style chain
of sections (enter, hold, leave, curve, hill), adapted here, not imported from Games.
Endless roads are built from stretches of sections with eased curves and hills; the
heading is pulled back towards east, so the road never doubles back over itself. Loops
are star-shaped (a polar radius made of a few seeded waves), so they can never cross
themselves either. Road types, each with its own speed limit:

| Type | Width | Limit | Look |
| --- | --- | --- | --- |
| City road | 7.4 m, 1 lane each way | 40 km/h | pavement, lamp posts, buildings |
| Highway | 14 m, 2 lanes each way | 80 km/h | long gentle curves, trees |
| Ghat road | 7 m | 30 km/h | climbing hairpin switchbacks (endless), winding hills (loop), dense trees |
| Village road | 5.2 m | 25 km/h | short bends, trees, huts |

Road events are placed by rules: only on city or village straights, never in the
first 120–150 m, at least 100 m apart, with a warning sign 40 m before:
**roundabout** (one car always circulating), **T-junction** (a car waits in the side
road), **speed breaker** and **zebra crossing** (a person starts to cross when you
are 45 m away). Speed-limit signs mark each change of road type.

Rules (`core/roadrules.js`, the same fault list and scoring as the town: minor −5,
serious −25): off road onto the verge (minor; the verge also slows the car), keep
left (minor, after 1.5 s on the wrong half), the limit for the road type (a lower
limit starts 60 m after the change), too fast over a speed breaker (over 20 km/h,
minor), not stopping for a person on the zebra (serious), give way to the car on the
roundabout (serious), wrong way round (serious), signal left when leaving (minor),
collisions (serious). Right-hand traffic mirrors the lanes and the roundabout.

3D (`ui/road3d.js`): the road is built in 100 m chunks, one behind and three ahead
of the car, 3 meshes per chunk (tarmac, verge, paint with vertex colours). Trees,
poles, houses and signs are InstancedMeshes refilled as chunks change. The open road
adds about 45–50 meshes; the whole scene stays near 115 with every area built (cap
600). The existing pixel-ratio cap is unchanged. Hills lift the camera with the road.
The file:// map fallback draws the generated road as a polyline (`ui/road-render.js`).

Also in DS-3: inside a Hub window the in-page top row is hidden (its buttons are in
the Hub title bar), as in Hindi Letters. Manual stays the default.

Limits: not open world; you drive on the generated road (leaving it is a fault and
there is nothing beyond the verge). No oncoming traffic on the open road. The
roundabout is a straight-through crossing of a single road (no other exits). Ghat
hairpins appear on endless routes only. Lesson text still names keyboard keys.
No browser or real-device check of DS-3 yet.
