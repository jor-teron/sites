/** Neon — black void, glowing cyan and pink outline art, wire mountains and a synthwave grid floor. */
DR.registerTheme(DR.makeTheme({
  id: 'neon',
  name: 'Neon',
  pal: {
    skyTop: '#04000c', skyBottom: '#1a0338', cloud: '#8b5cf6', groundLine: '#ff3df2', ground: '#05010f',
    groundTick: '#22e6ff', dino: '#22e6ff', eye: '#ff3df2', cactus: '#39ff88', bird: '#ff3df2', birdWing: '#22e6ff',
    shieldRGB: '255,61,242', barBg: 'rgba(255,255,255,0.12)', barReady: '#22e6ff', barCharging: '#4a1d6a',
    gA: '#22e6ff', gB: '#ff3df2',
  },
  neon: true, eyeGlow: '#ff7af5',
  starStyle: 'sparkle', sunStyle: 'synth', sunX: 0.74, sunY: 0.34, sceneryStyle: 'wire', cloudStyle: 'outline', groundStyle: 'grid',
  obstacles: { ground: ['cactus', 'saguaro'], air: ['bird'] },
  ui: { bg: '#04000c', text: '#f0e6ff', muted: '#b79de0', accent: '#22e6ff', card: '#10062a', cardBorder: '#ff3df2' },
}));
