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
