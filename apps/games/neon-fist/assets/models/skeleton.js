// Bones, forward kinematics and pose blending.
// Angles in degrees, fighter facing right, screen y down.
//  - limbs: 0 = straight down, + = toward facing direction
//  - torso / neck / head: 0 = straight up, + = lean forward
(function () {
  const D = Math.PI / 180;
  const FIELDS = ['hx', 'air', 'torso', 'spine', 'neck', 'head',
    'shF', 'elF', 'wrF', 'shB', 'elB', 'wrB',
    'hpF', 'knF', 'ftF', 'hpB', 'knB', 'ftB', 'orb', 'streak',
    'twist', 'angry', 'pain'];   // twist: chest/hip turn (+ = toward the opponent); angry/pain: face

  const down = (p, a, L) => ({ x: p.x + Math.sin(a * D) * L, y: p.y + Math.cos(a * D) * L });
  const up = (p, a, L) => ({ x: p.x + Math.sin(a * D) * L, y: p.y - Math.cos(a * D) * L });

  function blend(a, b, t) {
    const o = {};
    for (const k of FIELDS) { const x = a[k] || 0, y = b[k] || 0; o[k] = x + (y - x) * t; }
    o.handF = t < 0.5 ? (a.handF || 'fist') : (b.handF || 'fist');
    o.handB = t < 0.5 ? (a.handB || 'fist') : (b.handB || 'fist');
    return o;
  }
  // a + b*s for every numeric field (additive layers such as breathing)
  function add(a, b, s) {
    const o = Object.assign({}, a);
    for (const k in b) if (typeof b[k] === 'number') o[k] = (o[k] || 0) + b[k] * s;
    return o;
  }

  // Sole contact points of a foot (ankle A, foot angle fa) in foot-local units.
  function footPts(A, fa, f) {
    const t = { x: Math.sin(fa * D), y: Math.cos(fa * D) };
    const n = { x: -Math.cos(fa * D), y: Math.sin(fa * D) };
    const P = (lx, ly) => ({ x: A.x + t.x * lx * f + n.x * ly * f, y: A.y + t.y * lx * f + n.y * ly * f });
    return [P(-22, 30), P(40, 33), P(86, 28)];
  }

  // Forward kinematics. B = character bones. Returns joints in character units,
  // ground at y = 0, hip x = pose.hx.
  function solve(pose, B) {
    const J = { ang: {} }, A = J.ang;
    const hip = { x: pose.hx || 0, y: 0 };
    A.low = (pose.torso || 0) * 0.45;
    A.up = (pose.torso || 0) + (pose.spine || 0);
    A.neck = A.up + (pose.neck || 0);
    A.head = A.neck + (pose.head || 0);
    J.hip = hip;
    J.waist = up(hip, A.low, B.low);
    J.chest = up(J.waist, A.up, B.up);
    J.neckBase = up(J.chest, A.neck, B.neckBase);
    J.head = up(J.neckBase, A.head, B.neck);
    const ua = A.up * D;
    J.shoulder = { x: J.chest.x - Math.sin(ua) * B.shDrop - Math.cos(ua) * B.shBack,
                   y: J.chest.y + Math.cos(ua) * B.shDrop - Math.sin(ua) * B.shBack };
    // 3/4 turn: the near (F) shoulder sits behind the chest line, the far (B) one ahead of it and
    // slightly higher (foreshortened). Twist rotates the near shoulder forward on punches.
    const tw = pose.twist || 0, fwd = { x: Math.cos(ua), y: Math.sin(ua) }, sp = B.shSpread || 0;
    const shOff = { F: -sp * 0.8 + tw * sp * 1.5, B: sp * 0.55 - tw * sp * 0.8 }, shUp = { F: 0, B: -4 - Math.abs(tw) * 2 };
    const hipOff = { F: -(B.hipSpread || 0) + tw * 5, B: (B.hipSpread || 0) * 0.6 - tw * 4 };
    for (const s of ['F', 'B']) {
      J['shoulder' + s] = { x: J.shoulder.x + fwd.x * shOff[s] + Math.sin(ua) * shUp[s], y: J.shoulder.y + fwd.y * shOff[s] - Math.cos(ua) * shUp[s] };
      J['hip' + s] = { x: hip.x + hipOff[s], y: hip.y };
    }
    for (const s of ['F', 'B']) {
      const a1 = pose['sh' + s] || 0, a2 = a1 + (pose['el' + s] || 0), a3 = a2 + (pose['wr' + s] || 0);
      A['ua' + s] = a1; A['fa' + s] = a2; A['hd' + s] = a3;
      J['elbow' + s] = down(J['shoulder' + s], a1, B.uarm);
      J['wrist' + s] = down(J['elbow' + s], a2, B.farm);
      const t1 = pose['hp' + s] || 0, t2 = t1 + (pose['kn' + s] || 0), t3 = t2 + 90 + (pose['ft' + s] || 0);
      A['th' + s] = t1; A['sh' + s] = t2; A['ft' + s] = t3;
      J['knee' + s] = down(J['hip' + s], t1, B.thigh);
      J['ankle' + s] = down(J['knee' + s], t2, B.shin);
    }
    // ground the lowest sole point, then lift by pose.air
    let maxY = -1e9;
    for (const s of ['F', 'B']) for (const p of footPts(J['ankle' + s], A['ft' + s], B.foot)) maxY = Math.max(maxY, p.y);
    const dy = -maxY - (pose.air || 0);
    for (const k in J) if (k !== 'ang') J[k].y += dy;
    J.footLow = {};
    for (const s of ['F', 'B']) J.footLow[s] = Math.max(...footPts(J['ankle' + s], A['ft' + s], B.foot).map(p => p.y));
    return J;
  }

  NF.skeleton = { FIELDS, blend, add, solve, down, up, footPts, D };
})();
