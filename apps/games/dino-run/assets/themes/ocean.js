/** Ocean — deep blue water with light shafts and bubbles, sandy seabed, kelp; coral and urchins, jellyfish drifting by. */
DR.registerTheme(DR.makeTheme({
  id: 'ocean',
  name: 'Ocean',
  pal: {
    skyTop: '#0c5a8c', skyBottom: '#04274a', cloud: 'rgba(190,240,255,0.10)', groundLine: '#ecd699', ground: '#bf9f5a',
    groundTick: 'rgba(90,60,20,0.3)', dino: '#e6f0f4', eye: '#0a1a24', cactus: '#6b9b5a', bird: '#9aa0a6', birdWing: '#7a8088',
    shieldRGB: '94,234,212', barBg: 'rgba(255,255,255,0.14)', barReady: '#5eead4', barCharging: '#0e4a5e',
    coral: '#f472b6', far: '#0a3a66', mid: '#1c8a5c', near: '#0f6a46',
  },
  sceneryStyle: 'kelp', cloudStyle: 'rays', groundStyle: 'seabed', fxStyle: 'bubbles',
  obstacles: { ground: ['coral', 'urchin'], air: ['jellyfish'] },
  ui: { bg: '#031a30', text: '#e0f7ff', muted: '#8fc3dc', accent: '#5eead4', card: '#08304f', cardBorder: '#14608f' },
}));
