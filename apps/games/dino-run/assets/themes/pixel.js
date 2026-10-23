/**
 * Pixel 8-bit — the whole scene is drawn at 1/3 size, snapped to a 4-shade Game Boy green palette and scaled up
 * without smoothing, so every shape is chunky and crisp. Palette luminances are picked so each element lands on
 * the shade it should (sky L3/L2, far hills L1, ground L1, ink L0).
 */
DR.registerTheme(DR.makeTheme({
  id: 'pixel',
  name: 'Pixel 8-bit',
  pal: {
    skyTop: '#d0d0d0', skyBottom: '#a4a4a4', cloud: 'rgba(80,80,80,0.32)', groundLine: '#202020', ground: '#707070',
    groundTick: '#383838', dino: '#202020', eye: '#d8d8d8', cactus: '#202020', bird: '#202020', birdWing: '#606060',
    shieldRGB: '32,32,32', barBg: 'rgba(0,0,0,0.25)', barReady: '#202020', barCharging: '#707070',
    far: '#787878', mid: '#303030', sun: '#585858', rock: '#303030', coral: '#303030', ice: '#303030',
  },
  pixel: 3,
  sunStyle: 'sun', sunX: 0.8, sunY: 0.3, sceneryStyle: 'mountains', cloudStyle: 'puff', groundStyle: 'tiles',
  obstacles: { ground: ['cactus', 'saguaro'], air: ['bird'] },
  ui: { bg: '#0f380f', text: '#9bbc0f', muted: '#8bac0f', accent: '#9bbc0f', card: '#306230', cardBorder: '#8bac0f', scrim: 'rgba(15,56,15,0.6)' },
}));
