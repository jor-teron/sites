# Astrology (AS3)

Offline Western astrology app. No libraries, no network. (AS1 = sun signs only; AS2 adds the full chart.)

- Files: `astrology.html`, `astrology.css`, `astrology.js` (RELEASE = 'AS3', `?v=AS3`), `astro_calc.js` (astronomy),
  `cities.js` (190 built-in cities: name, country, lat, lon, IANA tz), `index.html` redirect, `astrology_icon.svg`.
- Storage: localStorage `astrology-v1` = `{profiles:[{id,name,dob,time?,place?}], current, theme, tab, houses:'whole'|'equal'}`.
  `time` = 'HH:MM' local or '' (unknown); `place` = city `{name,country,lat,lon,tz}` or manual `{name:'Custom',lat,lon,off}` (UTC hours).
  AS1 profiles (no time/place) keep working.
- Local time -> UTC via the browser's own Intl time-zone data (handles historical DST/offsets offline).
- astro_calc.js: Paul Schlyter "How to compute planetary positions" — Sun, Moon (12 main perturbation terms), Mercury–Neptune
  from elements of date + Kepler, Jupiter/Saturn/Uranus perturbations, Pluto series (~1885–2099). Tropical geocentric
  ecliptic longitude of date. Retrograde = longitude decreasing over the next day. Asc/MC from GMST + obliquity.
  Check 2000-01-01 12:00 UTC: Sun 280.38, Moon 223.35, Mercury 271.91, Venus 241.58, Mars 327.98, Jupiter 25.27,
  Saturn 40.38 R, Uranus 314.82, Neptune 303.19, Pluto 251.46 (reference ephemeris within ~0.05°).
- Tabs: Sign (sun sign + Sun/Moon/Rising summary), Chart (SVG wheel + planet table; Whole Sign default, Equal option),
  Today, Match, Settings. Without time+place: Asc/MC/houses hidden, Moon computed for local noon (may be off a few °).
- AS3 Vedic tab (`vedic_calc.js`, pure maths, node-testable): sidereal = tropical - ayanamsa (Lahiri 23.853° @J2000 default,
  Raman 22.37°, KP 23.76°, +50.29"/yr; setting `ayanamsa`). Rashi, Lagna (hidden without time), sidereal Sun, Moon nakshatra/pada/lord,
  graha table with Rahu (mean node) / Ketu, North Indian (default) or South Indian SVG chart (`vstyle`), whole-sign from Lagna or
  Chandra lagna. Vimshottari Maha + Antar dasha (365.25-day years). Panchang now (tithi+paksha, nakshatra, yoga, karana, vara) at
  `panPlace` (default first profile's place, else Delhi); computed at this moment, not sunrise.
  Check 2000-01-01 12:00 UTC Lahiri: ayanamsa 23.853, Sun 256.53 (Dhanu), Moon 199.50 (Tula, Swati 4, lord Rahu).
