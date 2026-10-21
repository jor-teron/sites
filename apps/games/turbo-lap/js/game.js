/* Turbo Lap — game state (checkpoint 1: free drive). */
window.TL = window.TL || {};
(() => {
  const road = TL.road;
  const G = TL.game = { t: 0 };
  G.init = () => { road.build(TL.TRACKS[0]); G.player = TL.cars.createPlayer(0); };
  G.update = dt => {
    G.t += dt;
    const before = G.player.p;
    TL.cars.updatePlayer(G.player, TL.input.read(), dt, true);
    TL.render.scroll(road.findSegment(G.player.p).curve, G.player.p - before);
  };
  G.draw = (ctx, W, H) => TL.render.frame(ctx, W, H, { player: G.player, racers: [], t: G.t });
})();
