// Pose data per character. See skeleton.js for angle conventions.
// twist: chest/hip turn toward the opponent (-1..1); angry / pain: facial expression weights.
(function () {
  const kai = {
    idle:    { torso: 8, spine: 5, neck: -6, head: -5, shF: 36, elF: 124, wrF: 4, shB: 16, elB: 138, wrB: 2,
               hpF: 24, knF: -30, ftF: 6, hpB: -16, knB: -14, ftB: 14, hx: 0, twist: 0.15 },
    punch:   { torso: 16, spine: 6, neck: -12, head: -8, shF: 86, elF: 4, wrF: 0, shB: 14, elB: 150, wrB: 4,
               hpF: 30, knF: -34, ftF: 4, hpB: -26, knB: -6, ftB: 12, hx: 22, twist: 1, angry: 1 },
    kick:    { torso: -22, spine: -4, neck: 14, head: 8, shF: 4, elF: 150, wrF: 6, shB: -22, elB: 150, wrB: 4,
               hpF: 96, knF: -4, ftF: -8, hpB: -8, knB: -14, ftB: 10, hx: -10, twist: -0.55, angry: 1 },
    block:   { torso: 14, spine: 10, neck: -10, head: -10, shF: 22, elF: 150, wrF: -8, shB: 12, elB: 154, wrB: -6,
               hpF: 26, knF: -40, ftF: 10, hpB: -20, knB: -24, ftB: 9, hx: -8, twist: 0.05, pain: 0.6 },
    special: { torso: -6, spine: -2, neck: 6, head: 2, shF: -8, elF: 140, wrF: 4, shB: -78, elB: 26, wrB: 0,
               hpF: 92, knF: 0, ftF: -6, hpB: 58, knB: -138, ftB: 26, hx: 30, air: 150, streak: 1, twist: -0.4, angry: 1 }
  };
  const nova = {
    idle:    { torso: 4, spine: 3, neck: -3, head: -3, shF: 34, elF: 108, wrF: -34, shB: 20, elB: 128, wrB: 6,
               hpF: 20, knF: -24, ftF: 4, hpB: -15, knB: -18, ftB: 12, hx: 0, handF: 'open', handB: 'fist', twist: 0.2 },
    punch:   { torso: 14, spine: 4, neck: -10, head: -6, shF: 86, elF: 2, wrF: -60, shB: 22, elB: 136, wrB: 6,
               hpF: 30, knF: -32, ftF: 4, hpB: -26, knB: -6, ftB: 12, hx: 24, handF: 'palm', handB: 'fist', twist: 1, angry: 1 },
    kick:    { torso: -28, spine: -6, neck: 18, head: 10, shF: 10, elF: 146, wrF: 0, shB: -36, elB: 120, wrB: -20,
               hpF: 118, knF: -6, ftF: 40, hpB: -4, knB: -10, ftB: 6, hx: -14, handF: 'fist', handB: 'open', twist: -0.6, angry: 1 },
    block:   { torso: 10, spine: 10, neck: -8, head: -10, shF: 26, elF: 148, wrF: -10, shB: 14, elB: 152, wrB: -8,
               hpF: 22, knF: -36, ftF: 8, hpB: -18, knB: -26, ftB: 8, hx: -8, handF: 'fist', handB: 'fist', twist: 0.05, pain: 0.6 },
    special: { torso: 18, spine: 4, neck: -12, head: -6, shF: 84, elF: 4, wrF: -70, shB: 74, elB: 18, wrB: -70,
               hpF: 34, knF: -42, ftF: 8, hpB: -32, knB: -4, ftB: 12, hx: 26, orb: 1, handF: 'palm', handB: 'palm', twist: 0.8, angry: 1 }
  };
  NF.poses = { kai, nova, names: ['idle', 'punch', 'kick', 'block', 'special'] };
})();
