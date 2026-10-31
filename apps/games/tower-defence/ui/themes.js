/*
  File: ui/themes.js
  Project: tower-defence
  Purpose: 10 colour themes for the board (colours only, no extra objects).
           The theme is the player's choice and is independent of the map:
           any of the 100 maps can be played in any theme. The choice is
           saved in localStorage (default Meadow) and can be set by ?theme=<id>.

  Theme fields:
    id      - short lowercase key used in ?theme=<id> and localStorage
    grass   - board background fill
    grid    - faint grid lines over the grass
    road    - road fill (wide stroke along the path)
    edge    - optional road edge/glow colour (null = no edge, as on Meadow)
    glow    - blur radius for the edge (0 = hard edge)
    dash    - centre dashes on the road (the small accent)
    preview - road colour in the small map previews (brighter than road)
  Dark/mid grass everywhere (even Snow is a soft grey-white) keeps
  towers, enemies and effects readable.
*/

export const THEMES = [
  { id: 'meadow', name: 'Meadow',  grass: '#0f1a12', grid: 'rgba(60, 100, 70, 0.25)',  road: '#3a2a1a', edge: null,      glow: 0,  dash: 'rgba(255, 220, 150, 0.35)', preview: '#8a6a3a' },
  { id: 'desert', name: 'Desert',  grass: '#5e4a2a', grid: 'rgba(230, 200, 140, 0.18)', road: '#a89878', edge: '#c8b898', glow: 0,  dash: 'rgba(90, 70, 40, 0.45)',    preview: '#d8c8a0' },
  { id: 'snow', name: 'Snow',    grass: '#8a96a2', grid: 'rgba(255, 255, 255, 0.30)', road: '#4c5866', edge: '#b8d8ee', glow: 4,  dash: 'rgba(220, 240, 255, 0.50)', preview: '#3a4654' },
  { id: 'autumn', name: 'Autumn',  grass: '#4a2c14', grid: 'rgba(230, 140, 60, 0.20)',  road: '#3a2a1c', edge: '#6a4422', glow: 0,  dash: 'rgba(240, 170, 80, 0.40)',  preview: '#9a6a3a' },
  { id: 'volcano', name: 'Volcano', grass: '#1a1514', grid: 'rgba(120, 60, 40, 0.25)',   road: '#2a2220', edge: '#ff5a1a', glow: 10, dash: 'rgba(255, 140, 60, 0.45)',  preview: '#ff6a2a' },
  { id: 'swamp', name: 'Swamp',   grass: '#1c2614', grid: 'rgba(110, 130, 60, 0.22)',  road: '#3a2e1c', edge: '#22302a', glow: 0,  dash: 'rgba(140, 170, 110, 0.35)', preview: '#6a5a34' },
  { id: 'night', name: 'Night',   grass: '#0a1028', grid: 'rgba(80, 110, 200, 0.22)',  road: '#2a3048', edge: '#f0d890', glow: 12, dash: 'rgba(255, 230, 150, 0.55)', preview: '#c8b870' },
  { id: 'canyon', name: 'Canyon',  grass: '#5a2414', grid: 'rgba(220, 110, 70, 0.20)',  road: '#a8743e', edge: '#c89460', glow: 0,  dash: 'rgba(80, 30, 10, 0.40)',    preview: '#d8a060' },
  { id: 'tundra', name: 'Tundra',  grass: '#2c3a30', grid: 'rgba(160, 180, 160, 0.20)', road: '#5a5a56', edge: '#7a7a74', glow: 0,  dash: 'rgba(220, 220, 210, 0.35)', preview: '#9a9a92' },
  { id: 'neon', name: 'Neon',    grass: '#06060e', grid: 'rgba(200, 60, 255, 0.30)',  road: '#062830', edge: '#00f0ff', glow: 14, dash: 'rgba(0, 255, 255, 0.70)',   preview: '#00e0f0' }
];

/* localStorage key for the selected theme id. */
const THEME_KEY = 'td_theme';

/* Index of the selected theme (0 = Meadow until init/selection). */
let current = 0;

/* Index of theme id, or -1 if unknown. */
function indexOfId(id) {
  const k = String(id || '').toLowerCase();
  return THEMES.findIndex(t => t.id === k);
}

/*
  Pick the starting theme once at load: ?theme=<id> wins, then the saved
  choice, else Meadow. A theme from the link is also saved.
*/
export function initTheme() {
  let i = -1;
  try { i = indexOfId(new URLSearchParams(location.search).get('theme')); } catch (e) { /* ignore */ }
  if (i < 0) {
    try { i = indexOfId(localStorage.getItem(THEME_KEY)); } catch (e) { /* private mode */ }
  }
  setThemeIndex(i < 0 ? 0 : i);
}

/* Select theme i (wraps), save it and keep ?theme= in the address bar. */
export function setThemeIndex(i) {
  current = ((i % THEMES.length) + THEMES.length) % THEMES.length;
  try { localStorage.setItem(THEME_KEY, THEMES[current].id); } catch (e) { /* ignore */ }
  try {
    const url = new URL(location.href);
    url.searchParams.set('theme', THEMES[current].id);
    history.replaceState(null, '', url);
  } catch (e) { /* file:// may refuse; harmless */ }
}

/* Index of the selected theme. */
export function themeIndex() {
  return current;
}

/* The selected theme object (used by the board and all previews). */
export function currentTheme() {
  return THEMES[current];
}
