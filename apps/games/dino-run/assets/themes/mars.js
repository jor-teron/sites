/** Mars — rust-red ground, dusty orange sky with two moons, drifting dust; rocks and antennas. */
DR.registerTheme(DR.makeTheme({
  id: 'mars',
  name: 'Mars',
  pal: {
    skyTop: '#6e301b', skyBottom: '#e49a62', cloud: 'rgba(255,220,180,0.4)', groundLine: '#b04a2c', ground: '#8f3a22',
    groundTick: '#6d2b1a', dino: '#ebe3da', eye: '#1a1a1a', cactus: '#6b9b5a', bird: '#3b2a24', birdWing: '#5d4237',
    shieldRGB: '255,214,160', barBg: 'rgba(0,0,0,0.2)', barReady: '#ffd7a8', barCharging: '#6d2b1a',
    rock: '#6a3320', far: '#a65e3b', mid: '#85452a', gA: '#b8573a',
  },
  sunStyle: 'moons2', sunX: 0.75, sunY: 0.28, sceneryStyle: 'mesas', cloudStyle: 'dust', groundStyle: 'mars', fxStyle: 'dust',
  obstacles: { ground: ['rock', 'antenna'], air: ['bird'] },
  ui: { bg: '#2b110a', text: '#ffe9d9', muted: '#dcae90', accent: '#fdba74', card: '#3d1a10', cardBorder: '#7a3b1f' },
}));
