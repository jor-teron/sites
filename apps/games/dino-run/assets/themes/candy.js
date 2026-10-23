/** Candy — pastel pink and mint, frosting ground with sprinkles, gummy clouds, lollipop cacti. */
DR.registerTheme(DR.makeTheme({
  id: 'candy',
  name: 'Candy',
  pal: {
    skyTop: '#ffc6e6', skyBottom: '#d3f6e7', cloud: 'rgba(255,255,255,0.85)', groundLine: '#ff7fc0', ground: '#ffbfdc',
    groundTick: '#ff9ccb', dino: '#8b6cf0', eye: '#2e1757', cactus: '#6b9b5a', bird: '#fb7185', birdWing: '#f9a8d4',
    shieldRGB: '236,72,153', barBg: 'rgba(0,0,0,0.12)', barReady: '#ec4899', barCharging: '#e4b3d1',
    far: '#bdeed6', mid: '#ffb0d6', gA: '#fff1f8',
  },
  sunStyle: 'candy', sunX: 0.78, sunY: 0.3, sceneryStyle: 'hills', cloudStyle: 'gummy', groundStyle: 'candy', fxStyle: 'sprinkles',
  obstacles: { ground: ['lollipop'], air: ['bird'] },
  ui: {
    bg: '#fff0f8', text: '#5b1d4a', muted: '#a1578a', accent: '#ec4899', card: '#ffffff', cardBorder: '#f5a6cf',
    scrim: 'rgba(255,225,243,0.6)', hudShadow: '0 1px 2px rgba(255,255,255,0.9)',
  },
}));
