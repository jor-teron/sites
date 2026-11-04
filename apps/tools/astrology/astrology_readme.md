# Astrology (AS1)

Offline Western sun-sign app. No libraries, no network.

- Files: `astrology.html`, `astrology.css`, `astrology.js` (RELEASE = 'AS1', `?v=AS1`), `index.html` redirect, `astrology_icon.svg`.
- Storage: localStorage `astrology-v1` = `{profiles:[{id,name,dob}], current, theme:'auto'|'light'|'dark', tab}`.
- Theme Auto follows the Hub (`sites-hub.theme`, else device setting) and live-updates on the storage event.
- Tabs: Sign (symbol, element, quality, ruler, traditional meaning), Today (lucky number from the sign's two
  traditional numbers plus an FNV hash of the date, lucky colour and day from fixed tables), Match (element pairs:
  same 85, Fire-Air / Earth-Water 80, Fire-Earth / Air-Water 55, Air-Earth 50, Fire-Water 45; same quality -5,
  same sign 80), Settings (theme, profiles add/edit/delete with in-app confirm).
- Sign dates are the usual tropical ranges (cusp days can differ by a day in some years).
- Planned: AS2 full Western chart, AS3 Vedic.
