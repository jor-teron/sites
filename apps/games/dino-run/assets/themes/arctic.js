/** Arctic — pale ice-blue sky, snow drifts, falling flakes, ice spikes and snowmen. */
DR.registerTheme(DR.makeTheme({
  id: 'arctic',
  name: 'Arctic',
  pal: {
    skyTop: '#8cc4ec', skyBottom: '#e3f3ff', cloud: 'rgba(255,255,255,0.75)', groundLine: '#f6fbff', ground: '#bcd9ee',
    groundTick: '#8fbbd8', dino: '#566679', eye: '#0b1220', cactus: '#6b9b5a', bird: '#4a5a70', birdWing: '#6d7f96',
    shieldRGB: '47,127,209', barBg: 'rgba(0,30,60,0.15)', barReady: '#2f7fd1', barCharging: '#9db9d2',
    ice: '#a5e4ff', far: '#b5d4ea', mid: '#d3e8f6', gA: '#ffffff',
  },
  sunStyle: 'pale', sunX: 0.8, sunY: 0.3, sceneryStyle: 'icepeaks', cloudStyle: 'soft', groundStyle: 'snow', fxStyle: 'flakes',
  obstacles: { ground: ['ice_spike', 'snowman'], air: ['bird'] },
  ui: {
    bg: '#dff0fc', text: '#0f2a44', muted: '#456985', accent: '#2f7fd1', card: '#f4faff', cardBorder: '#b3d3ea',
    scrim: 'rgba(210,235,252,0.6)', hudShadow: '0 1px 2px rgba(255,255,255,0.9)',
  },
}));
