# Validation

DS-1a: Node 8/8 passing (manual launch, stall/restart, clutch/gear/reverse guards,
braking-distance scaling, handbrake, bicycle steering, L1 manual-input autodrive,
score limits and six lesson definitions). Chrome: 1280×800, 844×390 and 390×844;
DPR=2 canvas; touch controls >=44 px; keyboard engine/gear/launch; L1 autodrive;
pause; dark/light/auto; traffic-side persistence; no console/page errors.
No real device or real-world driving validation.

DS-1b: Node 20/20 passing, including both traffic sides' lane lesson autodrive;
scripted throttle/steering/physics inputs trigger all eight rule faults (missing
indicator, speeding, red, STOP, pedestrian yield, lane line, collision, give way).
Also checks legal indication, full STOP dwell, AI red-light stop, pedestrian phases,
severity/cooldown. Chrome repeats basics and adds town lesson autodrive with no
faults and 13-lesson selector + town art at all three viewports. No console errors.

DS-1c: Node 27/27 passing. Adds explicit automatic N/D/R behavior, high-gear stall,
real reverse launch, parking guards, mock definitions for both sides, pass/fail
thresholds and complete fault reports, 20 unique reused sign drawings and answer
sets. Browser passes at 1280×800, 844×390 and 390×844 with no console/page errors:
14 lessons; actual L1 session completed and best persisted; town lane autodrive;
landscape touch controls fit vertically and are >=44 px; genuine Chrome touch
pedal hold/release + wheel drag/recenter; complete 20-question quiz; incomplete
mock report; help; mute and horn; pause; theme/side/score persistence on reload.
The successful full mock route was not autodriven; its route/parking/pass logic is
covered by unit checks. No real phone or real-world handling validation claimed.

DS-2a: Node 42/42 passing (`basics`, `roads`, `exam`, `cockpit`, `scene3d`, `ui-stub`).
New: wheel angle/drag maths (incl. past 180 degrees), dial needles, gear labels and lever
slots, RHD/LHD driver eye, rear and door mirror poses (look back, flipped), horizon
framing, mirror viewport maths, pixel-ratio cap, marker layouts for all 14 lessons;
three.js r170 loads in Node and the scene builds/updates for every lesson on both
traffic sides (double-sided materials, under 400 meshes); classic UI scripts run in a
stub DOM: manual default, gear lever, handbrake, wheel rotation, indicator, 3D hand-over,
3D failure falls back to the map, automatic R/N/D, wheel drag and pedals, town + mock.
No browser run (browser.cjs updated for the new controls but not executed). No real
phone, WebGL rendering or visual check yet.
