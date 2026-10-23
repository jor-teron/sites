/** Jungle — deep green layers, hanging vines, fireflies; logs and ferns underfoot, parrots overhead. */
DR.registerTheme(DR.makeTheme({
  id: 'jungle',
  name: 'Jungle',
  pal: {
    skyTop: '#0b3a2c', skyBottom: '#2a7a4a', cloud: 'rgba(220,255,225,0.10)', groundLine: '#3fae5c', ground: '#16301b',
    groundTick: 'rgba(190,240,130,0.14)', dino: '#d3e6c2', eye: '#0b1a10', cactus: '#4f8a1e', bird: '#facc15', birdWing: '#ef4444',
    shieldRGB: '163,230,53', barBg: 'rgba(255,255,255,0.12)', barReady: '#a3e635', barCharging: '#2c4a30',
    far: '#0f4a33', mid: '#176b3f', near: '#1c3a22', vine: '#3f9d4d', sun: '#fde68a', gA: '#a3e635',
  },
  sunStyle: 'sun', sunX: 0.72, sunY: 0.3, sceneryStyle: 'jungle', cloudStyle: 'soft', groundStyle: 'jungle', fxStyle: 'fireflies',
  obstacles: { ground: ['log', 'fern'], air: ['parrot'] },
  ui: { bg: '#071f17', text: '#e6f7e6', muted: '#9fcfa8', accent: '#a3e635', card: '#0f2f20', cardBorder: '#256b43' },
}));
