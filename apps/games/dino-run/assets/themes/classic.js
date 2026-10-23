/** Classic Desert — the original dark look (default). Same colours, clouds, plain ground and cacti/birds as before. */
DR.registerTheme(DR.makeTheme({
  id: 'classic',
  name: 'Classic Desert',
  pal: {
    skyTop: '#1a1e26', skyBottom: '#0c1016', cloud: 'rgba(255,255,255,0.08)', groundLine: '#5a6070',
    ground: '#161a22', groundTick: 'rgba(255,255,255,0.08)', dino: '#9aa0a6', eye: '#121418', cactus: '#6b9b5a',
    bird: '#9aa0a6', birdWing: '#7a8088', shieldRGB: '110,168,254', barBg: 'rgba(255,255,255,0.1)',
    barReady: '#6ea8fe', barCharging: '#3a4050',
  },
  cloudStyle: 'puff', groundStyle: 'ticks',
  obstacles: { ground: ['cactus'], air: ['bird'] },
}));
