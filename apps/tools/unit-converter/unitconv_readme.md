# Unit Converter

## 1. What it is
A basic offline unit converter in the same style as Stopwatch: two swipe screens, **Converter** (default) and **Settings**. No currency. Version 1.0.

## 2. Files
- `unitconv.html` / `unitconv.css`: page, layout, light / dark, safe-area
- `unitconv_units.js`: all categories and unit factors (`window.UNITS`)
- `unitconv_logic.js`: conversion, formatting, gestures, keys, saving
- `unit-converter_icon.png`: hub icon
- `index.html`: opens `unitconv.html`

## 3. Releases (all included)
- **U1:** category chips; big From / To fields, typing in either updates the other live; swap button (right side); Length, Weight, Temperature (affine, via Kelvin).
- **U2:** Area, Volume (US + UK gallon), Speed, Time, Data (decimal KB/MB/GB/TB = 1000ⁿ and binary KiB/MiB/GiB/TiB = 1024ⁿ, labelled).
- **U3:** Number (thousand, lakh, crore, arab, kharab, million, billion, trillion); Indian land units in Area: acre, hectare, guntha, cent, bigha and katha (state variants).
- **U4:** remembers last category and From/To units per category, last value; precision 2 / 4 / 6 decimals (default 4), trailing zeros trimmed; values ≥ 1e15 or smaller than the precision show in exponent form (e.g. `1.2346e-7`).

## 4. Behaviour rules
- **Screens:** Converter → Settings. Horizontal swipe ≥ 75 px: left = next, right = previous, wrapping. Dots at the top can be clicked; ←/→ keys switch (not while typing in a field).
- A swipe never starts on an input, a unit picker or the chip row (the chip row scrolls sideways itself). Tapping does nothing special.
- **S** key: swap (when not typing).
- **Theme:** Dark (default), Light, System (Hub pref `sites-hub.theme`, else device).
- Saved in localStorage `unitconv-settings-v1` (theme, prec) and `unitconv-state-v1` (screen, category, units per category, value, side typed).
- Input accepts commas/spaces (`1,00,000`) and exponents (`1e6`).

## 5. Indian land units (vary by state — check local land records)
| Unit | Value used | Notes |
|---|---|---|
| Guntha | 1,089 ft² (101.17 m²) | 40 guntha = 1 acre (Maharashtra, Karnataka, Gujarat) |
| Cent | 435.6 ft² (40.47 m²) | 1/100 acre (Kerala, Tamil Nadu, AP) |
| Bigha – Assam | 14,400 ft² (1,337.8 m²) | 5 katha; 1 katha = 20 lessa |
| Katha – Assam | 2,880 ft² | Lessa = 144 ft² |
| Bigha – West Bengal | 14,400 ft² | 20 katha × 720 ft² |
| Katha – West Bengal | 720 ft² | |
| Bigha – Bihar | 27,220 ft² (2,529 m²) | varies by district |
| Bigha – Uttar Pradesh | 27,000 ft² (2,508 m²) | pucca bigha; varies by district |
| Bigha – Rajasthan (pucca) | 27,225 ft² (2,529 m²) | kachha bigha is smaller |
| Bigha – Gujarat | 17,424 ft² (1,618.7 m²) | |

Sources: Wikipedia "Bigha" (https://en.wikipedia.org/wiki/Bigha), Wikipedia "Guntha" (https://en.wikipedia.org/wiki/Guntha), Wikipedia "Katha (unit)" (https://en.wikipedia.org/wiki/Katha_(unit)), and common Indian land-measurement tables (e.g. Magicbricks / 99acres land-unit guides). Values differ between sources and districts; treat as approximate.

Exact factors: 1 ft = 0.3048 m, 1 lb = 0.45359237 kg, 1 US gal = 3.785411784 L, 1 acre = 4046.8564224 m².
