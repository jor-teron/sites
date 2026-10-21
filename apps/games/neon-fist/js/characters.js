// Kai & Nova: proportions, body profiles, colours and outfit description.
// Units: 100 = head height. Profiles are [u, frontHalfWidth, backHalfWidth] along a bone.
(function () {
  const kai = {
    id: 'kai', name: 'KAI', title: 'Street Martial Artist',
    desc: 'Disciplined and fast. Kai mixes tight boxing hands with long, snapping kicks. Special: Rising Flame Kick.',
    stats: { Speed: 4, Power: 4, Reach: 3, Defense: 3 },
    accent: '#ff3346', rim: '#ff4fd8',
    bones: { low: 86, up: 116, neckBase: 22, neck: 70, shDrop: 20, shBack: 6, uarm: 145, farm: 124, thigh: 190, shin: 178, foot: 1 },
    headScale: 1,
    skin: '#c98a62', skinDeep: '#8a5236', lips: '#9a5a48', iris: '#3a2416', brow: '#1a1210', hair: '#16110f',
    torsoFront: [[-0.14, 30], [0, 40], [0.12, 40], [0.28, 36], [0.42, 37], [0.55, 42], [0.68, 52], [0.8, 54], [0.92, 40], [1, 26]],
    torsoBack: [[-0.14, 34], [-0.02, 48], [0.12, 45], [0.28, 34], [0.45, 36], [0.62, 45], [0.78, 51], [0.9, 44], [1, 24]],
    neck: [[0, 27, 25], [0.5, 22, 22], [1, 20, 20]],
    uarm: [[0, 32, 30], [0.15, 34, 29], [0.42, 27, 27], [0.72, 22, 23], [1, 18, 18]],
    farm: [[0, 19, 19], [0.22, 23, 21], [0.6, 17, 16], [1, 13, 13]],
    thigh: [[0, 42, 40], [0.25, 45, 40], [0.6, 38, 33], [0.9, 30, 29], [1, 28, 28]],   // gi pants
    shin: [[0, 26, 26], [0.3, 25, 33], [0.7, 19, 21], [1, 15, 15]],                   // bare skin
    pantsShin: [[0, 28, 28], [0.35, 31, 36], [0.7, 29, 30], [0.86, 28, 28]],
    face: { nose: 1, jaw: 1, lips: 0.9, lashes: false },
    gi: '#1b1820', giTrim: '#c3182a', pants: '#b5182a', belt: '#0b0a0d', band: '#f1efe8', wrap: '#e9e3d4'
  };
  const nova = {
    id: 'nova', name: 'NOVA', title: 'Electric Striker',
    desc: 'Agile and precise. Nova keeps opponents at range with charged palm strikes and quick footwork. Special: Storm Orb.',
    stats: { Speed: 5, Power: 3, Reach: 4, Defense: 2 },
    accent: '#2ee6ff', rim: '#9a6bff',
    bones: { low: 84, up: 104, neckBase: 16, neck: 60, shDrop: 18, shBack: 5, uarm: 134, farm: 116, thigh: 184, shin: 172, foot: 0.92 },
    headScale: 0.94,
    skin: '#e2b08c', skinDeep: '#a8704f', lips: '#b86a66', iris: '#2b5f6a', brow: '#3b2340', hair: '#7a3dd8',
    torsoFront: [[-0.14, 30], [0, 42], [0.13, 41], [0.3, 31], [0.45, 30], [0.58, 34], [0.7, 41], [0.8, 42], [0.92, 32], [1, 21]],
    torsoBack: [[-0.14, 38], [-0.02, 50], [0.12, 44], [0.3, 28], [0.46, 28], [0.62, 34], [0.78, 40], [0.9, 35], [1, 20]],
    neck: [[0, 23, 21], [0.5, 19, 19], [1, 19, 19]],
    uarm: [[0, 25, 23], [0.15, 25, 22], [0.45, 20, 20], [0.75, 17, 17], [1, 14, 14]],
    farm: [[0, 15, 15], [0.22, 17, 16], [0.6, 13, 13], [1, 10.5, 10.5]],
    thigh: [[0, 37, 42], [0.25, 37, 37], [0.6, 30, 27], [0.9, 23, 22], [1, 21, 21]],
    shin: [[0, 21, 21], [0.3, 20, 27], [0.7, 15, 17], [1, 12, 12]],
    boot: [[0.04, 26, 26], [0.3, 25, 31], [0.7, 20, 22], [1, 17, 17]],
    face: { nose: 0.82, jaw: 0.86, lips: 1.1, lashes: true },
    suit: '#13a5b5', armour: '#1d2233', armourHi: '#3a4466', glow: '#58e8ff', bootCol: '#1a1c2a', hairTip: '#efe8ff'
  };
  NF.characters = { kai, nova, list: [kai, nova] };
})();
