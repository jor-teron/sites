# Compass (CP1, CP2)

A phone compass with a GPS speedometer and altimeter (Speed tab). Lab → Tools. Works offline; no network calls.

## CP1 — first release

- **Dial**: SVG rose (5° ticks, 30° numbers, N/E/S/W, red north needle) turns with the phone under a fixed top index. Big readout, e.g. `72° ENE` (16-point names).
- **Sensor**: `deviceorientationabsolute` when present (Android Chrome, heading = 360 − alpha); else `deviceorientation` with `webkitCompassHeading` (iOS); else `alpha` when `absolute === true`. `screen.orientation.angle` (or `window.orientation`) is added so landscape reads right.
- **iOS permission**: the **Start compass** button calls `DeviceOrientationEvent.requestPermission()` on tap. Other browsers start on load (button hidden).
- **Smoothing**: circular low-pass on sin/cos (k = 0.15) so 359°→0° doesn't jump; the rose animates along the shortest path each frame.
- **Calibration hint**: "Move phone in a figure-8 to calibrate" when `webkitCompassAccuracy` is < 0 or > 25°, or when the last 30 readings are unsteady (mean resultant length < 0.9).
- **True / Magnetic**: True needs the location once (Get location, or tapping True), cached in settings. The declination is computed offline from the embedded **WMM2025** model (NOAA/BGS, full degree 12, 90 coefficient sets ≈ 1.7 KB, `compass_wmm.js`), checked against the reference implementation to 0.001°. The value used is shown under the controls. No location → shows magnetic and says so.
- **Lock bearing**: Lock button or tap the dial; an orange marker sits on the rose and the readout says `12° left / right` (which way to turn). Tap again to unlock. Saved, and converted when switching True/Magnetic.
- **No sensor**: if no valid reading comes within 3 s, "No compass sensor on this device" with an explanation; you can then drag the dial to try it.
- **Keep screen on**: Wake Lock API toggle (re-acquired when the tab comes back); disabled where unsupported.
- **Theme**: Auto (follows the Hub `sites-hub.theme`, then the device) / Light / Dark.
- Settings `compass-settings-v1`: `{theme, north, lock, awake, loc}`.
- Files: `compass.html/.css`, `compass_app.js` (UI + sensors), `compass_wmm.js` (WMM2025), `compass_icon.png`, `index.html` (redirect).

## Limits

- iPhone/iPad need the Start tap to grant motion access; if denied, re-enable in Safari settings.
- Some Android browsers give only relative or rough readings; keep away from metal and magnets, calibrate with a figure-8.
- Sensors need a secure context: use the Hub (https). From file:// or plain http some browsers send no orientation events or block geolocation.
- WMM2025 is valid 2025.0–2030.0; after 2030 the app warns that declination may be off (replace the coefficients with WMM2030).
- Desktops/laptops usually have no magnetometer.

## CP2 — Speed tab (GPS speedometer + altitude)

- **Tabs** Compass | Speed at the top; last tab saved (`tab` in `compass-settings-v1`), `#speed` / `#compass` opens one directly. **Keep screen on** moved to the top bar and works on both tabs.
- **Dial**: SVG, 270° sweep, needle + filled arc, big digital speed. Scale **Auto** (0–60 up to ~55, 0–160 up to ~150, else 0–240, picked from the trip's top speed) or fixed 60 / 160 / 240. Units **km/h · m** or **mph · ft** (saved in `compass-speed-v1`).
- **GPS**: `watchPosition` with `enableHighAccuracy`, `maximumAge 0`. Speed = `coords.speed` when present, else haversine distance / time between fixes. Under 1 km/h shows 0. Fixes with accuracy > 30 m don't count for distance or top speed; jumps implying > 360 km/h are ignored. Shows GPS ±accuracy, "Waiting for GPS…", and clear messages for permission denied / unavailable / timeout / not https.
- **Battery**: the watch runs only while the Speed tab is shown and the page is visible; it stops when you switch tab or hide the page.
- **Trip**: Start / Pause / Resume and Reset (with confirm). Top speed, average moving speed (distance / moving time), distance, trip time, altitude low/high. Saved in `compass-trip-v1` and survives a reload. Distance only counts while the Speed tab is open; a running trip's clock keeps going while the page is closed.
- **Altitude**: GPS altitude ± `altitudeAccuracy`, in m or ft; "Altitude not available" when the browser gives null (common on desktop and some Android).
- File: `compass_speed.js`.

### CP2 limits
- Needs location permission and a secure context (the Hub over https). Best outdoors with open sky; indoors, speed and distance are unreliable.
- Browsers have no barometer API, so altitude is GPS only, typically ±10–30 m and jumpy; low/high includes that noise.
- Speed from GPS lags a second or two and is rough at walking pace; tunnels and towns cause gaps.
