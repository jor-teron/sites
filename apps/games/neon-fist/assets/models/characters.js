// Kai & Nova: proportions, body profiles, colours and outfit description.
// Units: 100 = head height. Profiles are [u, frontHalfWidth, backHalfWidth] along a bone.
(function () {
  const kai = {
    id: 'kai', name: 'KAI', title: 'Street Martial Artist',
    desc: 'Disciplined and fast. Kai mixes tight boxing hands with long, snapping kicks. Special: Rising Flame Kick.',
    stats: { Speed: 4, Power: 4, Reach: 3, Defense: 3 },
    accent: '#ff3346', rim: '#ff4fd8',
    bones: { low: 86, up: 116, neckBase: 22, neck: 70, shDrop: 20, shBack: 6, shSpread: 12, hipSpread: 6, uarm: 145, farm: 124, thigh: 190, shin: 178, foot: 1 },
    headScale: 1,
    skin: '#c98a62', skinDeep: '#8a5236', lips: '#9a5a48', iris: '#3a2416', brow: '#1a1210', hair: '#16110f',
    torsoFront: [[-0.14, 32], [0, 42], [0.12, 42], [0.28, 37], [0.42, 38], [0.55, 45], [0.68, 55], [0.8, 59], [0.9, 50], [1, 29]],
    torsoBack: [[-0.14, 37], [-0.02, 51], [0.12, 47], [0.28, 36], [0.45, 39], [0.62, 50], [0.76, 56], [0.88, 48], [1, 26]],
    neck: [[0, 27, 25], [0.5, 22, 22], [1, 20, 20]],
    uarm: [[0, 34, 33], [0.12, 37, 34], [0.27, 31, 31], [0.38, 27, 30.5], [0.55, 29.5, 27], [0.72, 25.5, 23], [0.9, 20, 19.5], [1, 18, 18]],   // deltoid, biceps (front), triceps (back)
    farm: [[0, 19, 19], [0.12, 24, 21], [0.3, 24.5, 20], [0.55, 19, 16.5], [0.8, 14.5, 13.5], [1, 12.5, 12.5]],
    thigh: [[0, 44, 42], [0.15, 47, 44], [0.4, 45, 40], [0.65, 38, 34], [0.85, 31, 29], [1, 28, 27]],   // gi pants
    shin: [[0, 25, 24], [0.1, 24, 27], [0.3, 24, 34], [0.48, 21, 30], [0.72, 17, 19], [1, 15, 15]],                   // bare skin
    pantsShin: [[0, 29, 28], [0.12, 28, 31], [0.35, 30, 37], [0.62, 29, 32], [0.86, 29, 29]],
    face: { nose: 1, jaw: 1, lips: 0.9, lashes: false },
    gi: '#1b1820', giTrim: '#c3182a', pants: '#b5182a', belt: '#0b0a0d', band: '#f1efe8', wrap: '#e9e3d4'
  };
  const nova = {
    id: 'nova', name: 'NOVA', title: 'Electric Striker',
    desc: 'Agile and precise. Nova keeps opponents at range with charged palm strikes and quick footwork. Special: Storm Orb.',
    stats: { Speed: 5, Power: 3, Reach: 4, Defense: 2 },
    accent: '#2ee6ff', rim: '#9a6bff',
    bones: { low: 82, up: 101, neckBase: 15, neck: 59, shDrop: 17, shBack: 5, shSpread: 9, hipSpread: 5, uarm: 132, farm: 113, thigh: 185, shin: 172, foot: 0.9 },
    headScale: 0.96,
    skin: '#e2b08c', skinDeep: '#a8704f', lips: '#b86a66', iris: '#2b5f6a', brow: '#3b2340', hair: '#7a3dd8',
    torsoFront: [[-0.14, 29], [0, 39], [0.13, 38], [0.3, 27.5], [0.45, 27], [0.58, 32], [0.7, 40], [0.8, 41], [0.9, 33], [1, 19]],
    torsoBack: [[-0.14, 37], [-0.02, 48], [0.12, 42], [0.3, 26], [0.46, 26], [0.62, 31], [0.78, 37], [0.9, 32], [1, 18]],
    neck: [[0, 23, 21], [0.5, 19, 19], [1, 19, 19]],
    uarm: [[0, 25, 24], [0.12, 26.5, 24], [0.3, 22, 21.5], [0.5, 20.5, 20], [0.75, 17, 16.5], [1, 13.5, 13.5]],
    farm: [[0, 14.5, 14.5], [0.15, 17.5, 16], [0.35, 17, 15], [0.65, 13, 12], [1, 10, 10]],
    thigh: [[0, 36, 43], [0.12, 38.5, 42], [0.35, 37, 35], [0.6, 31, 28], [0.85, 23.5, 22.5], [1, 21, 20.5]],   // quads (front), glutes/hamstrings (back)
    shin: [[0, 21, 21], [0.3, 20, 27], [0.7, 15, 17], [1, 12, 12]],
    boot: [[0.04, 26, 26], [0.3, 25, 31], [0.7, 20, 22], [1, 17, 17]],
    face: { nose: 0.82, jaw: 0.86, lips: 1.1, lashes: true },
    suit: '#13a5b5', armour: '#1d2233', armourHi: '#3a4466', glow: '#58e8ff', bootCol: '#1a1c2a', hairTip: '#efe8ff'
  };
  NF.characters = { kai, nova, list: [kai, nova] };
})();
