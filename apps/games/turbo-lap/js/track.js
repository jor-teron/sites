/* Turbo Lap — track data. Each track is a list of road sections plus roadside scenery rules.
   section: [enter, hold, leave, curve, hill]
     enter/hold/leave = segments easing in, holding, easing out
     curve  = bend strength (negative = left, positive = right)
     hill   = height change over the section, in segments (negative = downhill)
   The road builder appends a final section that brings the height back to the start level,
   so every track closes into a loop. Add more tracks by pushing to TL.TRACKS. */
window.TL = window.TL || {};
(() => {
  const L = { S: 25, M: 50, L: 100 };          // lengths
  const C = { E: 2, M: 4, H: 6 };              // curves
  const H = { L: 20, M: 40, H: 60 };           // hills

  TL.TRACKS = [{
    id: 'coast',
    name: 'Coastline Loop',
    sections: [
      [L.S, L.M, L.S, 0, 0],               // start straight
      [L.M, L.M, L.M, C.M, 0],             // first right
      [L.M, L.M, L.M, 0, H.M],             // climb
      [L.M, L.M, L.M, -C.E, -H.L],         // gentle left over the crest
      [L.S, L.S, L.S, C.H, 0],             // S-bend: hard right
      [L.S, L.S, L.S, -C.H, 0],            //          hard left
      [L.M, L.L, L.M, 0, -H.M],            // long drop
      [L.M, L.L, L.M, -C.M, H.L],          // sweeping left uphill
      [L.S, L.S, L.S, 0, H.L],             // bumps
      [L.S, L.S, L.S, 0, -H.L],
      [L.S, L.S, L.S, 0, H.L],
      [L.M, L.M, L.M, C.E, -H.M],          // fast right downhill
      [L.S, L.M, L.S, C.H, 0],             // hairpin right
      [L.M, L.M, L.M, -C.M, H.M],          // left over the hill
      [L.M, L.M, L.M, 0, 0],               // back straight
      [L.M, L.M, L.M, C.M, -H.L],          // final right
      [L.S, L.M, L.S, 0, 0]                // run to the line
    ],
    // Scenery rules: segments [from, to) as fractions of the lap, every N segments.
    scenery: [
      { type: 'tree',  from: 0.05, to: 0.35, every: 7,  offset: [1.4, 2.6], side: 'both' },
      { type: 'lamp',  from: 0.0,  to: 0.12, every: 12, offset: [1.15, 1.15], side: 'both' },
      { type: 'tree',  from: 0.40, to: 0.70, every: 5,  offset: [1.3, 3.0], side: 'both' },
      { type: 'bush',  from: 0.30, to: 0.95, every: 9,  offset: [1.25, 2.2], side: 'both' },
      { type: 'lamp',  from: 0.72, to: 0.85, every: 10, offset: [1.15, 1.15], side: 'both' },
      { type: 'tree',  from: 0.85, to: 1.0,  every: 6,  offset: [1.5, 2.8], side: 'both' }
    ]
  }];
})();
