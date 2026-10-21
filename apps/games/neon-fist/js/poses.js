// Pose data per character. See skeleton.js for angle conventions.
(function () {
  const kai = {
    idle:    { torso: 8, spine: 5, neck: -6, head: -5, shF: 38, elF: 126, wrF: 6, shB: 18, elB: 140, wrB: 4,
               hpF: 24, knF: -30, ftF: 6, hpB: -16, knB: -14, ftB: 14, hx: 0 },
    punch:   { torso: 16, spine: 6, neck: -12, head: -8, shF: 88, elF: 4, wrF: 0, shB: 22, elB: 138, wrB: 4,
               hpF: 30, knF: -34, ftF: 4, hpB: -26, knB: -6, ftB: 12, hx: 22 },
    kick:    { torso: -24, spine: -4, neck: 14, head: 8, shF: 30, elF: 100, wrF: 0, shB: -30, elB: 70, wrB: 0,
               hpF: 96, knF: -4, ftF: -8, hpB: -6, knB: -8, ftB: 6, hx: -10 },
    block:   { torso: 14, spine: 10, neck: -10, head: -10, shF: 22, elF: 150, wrF: -8, shB: 12, elB: 154, wrB: -6,
               hpF: 26, knF: -40, ftF: 10, hpB: -20, knB: -24, ftB: 9, hx: -8 },
    special: { torso: -8, spine: -2, neck: 6, head: 2, shF: -40, elF: 50, wrF: 0, shB: -55, elB: 40, wrB: 0,
               hpF: 92, knF: 0, ftF: -6, hpB: 30, knB: -120, ftB: 20, hx: 30, air: 150, streak: 1 }
  };
  const nova = {
    idle:    { torso: 4, spine: 3, neck: -3, head: -3, shF: 34, elF: 116, wrF: 10, shB: 22, elB: 128, wrB: 8,
               hpF: 20, knF: -24, ftF: 4, hpB: -15, knB: -18, ftB: 12, hx: 0, handF: 'open', handB: 'fist' },
    punch:   { torso: 14, spine: 4, neck: -10, head: -6, shF: 86, elF: 2, wrF: -60, shB: 26, elB: 126, wrB: 6,
               hpF: 30, knF: -32, ftF: 4, hpB: -26, knB: -6, ftB: 12, hx: 24, handF: 'palm', handB: 'fist' },
    kick:    { torso: -30, spine: -6, neck: 18, head: 10, shF: 36, elF: 96, wrF: 0, shB: -40, elB: 60, wrB: 0,
               hpF: 118, knF: -6, ftF: 40, hpB: -4, knB: -6, ftB: 6, hx: -14, handF: 'fist', handB: 'open' },
    block:   { torso: 10, spine: 10, neck: -8, head: -10, shF: 26, elF: 148, wrF: -10, shB: 14, elB: 152, wrB: -8,
               hpF: 22, knF: -36, ftF: 8, hpB: -18, knB: -26, ftB: 8, hx: -8, handF: 'open', handB: 'open' },
    special: { torso: 18, spine: 4, neck: -12, head: -6, shF: 84, elF: 4, wrF: -70, shB: 74, elB: 18, wrB: -70,
               hpF: 34, knF: -42, ftF: 8, hpB: -32, knB: -4, ftB: 12, hx: 26, orb: 1, handF: 'palm', handB: 'palm' }
  };
  NF.poses = { kai, nova, names: ['idle', 'punch', 'kick', 'block', 'special'] };
})();
