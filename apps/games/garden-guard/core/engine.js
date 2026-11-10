/* Pure fixed-step simulation. No DOM, clock or storage dependency; JSON snapshots. */
(function (root) {
  'use strict';
  const G = root.GardenGuard || require('./data.js');
  if (!G.LEVELS && typeof require !== 'undefined') require('./levels.js');
  class Engine {
    constructor(level = 0) {
      this.level = Math.max(0, Math.min(4, level | 0)); this.time = 0; this.sun = 50;
      this.status = 'playing'; this.next = 0; this.skyAt = 5; this.serial = 0; this.rng = 721 + this.level;
      this.plants = []; this.enemies = []; this.shots = []; this.suns = []; this.effects = [];
      this.cooldowns = Object.fromEntries(Object.keys(G.PLANTS).map(k => [k, 0]));
      this.mowers = Array.from({length:G.ROWS}, () => ({ used: false, active: false, x: -.12 }));
    }
    random() { this.rng = (1664525 * this.rng + 1013904223) >>> 0; return this.rng / 4294967296; }
    at(row, col) { return this.plants.find(p => p.row === row && p.col === col && p.hp > 0); }
    canPlant(kind, row, col) {
      const d = G.PLANTS[kind];
      return this.status === 'playing' && !!d && Number.isInteger(row) && Number.isInteger(col) &&
        row >= 0 && row < G.ROWS && col >= 0 && col < G.COLS && !this.at(row,col) &&
        this.sun >= d.cost && this.cooldowns[kind] <= 0;
    }
    plant(kind, row, col) {
      if (!this.canPlant(kind,row,col)) return false;
      const d = G.PLANTS[kind]; this.sun -= d.cost; this.cooldowns[kind] = d.cooldown;
      this.plants.push({ id: ++this.serial, kind, row, col, hp:d.hp, timer:kind === 'sun' ? 8 : (d.fuse || .2) });
      return true;
    }
    addSun(x, y, falling = false) {
      this.suns.push({ id: ++this.serial, x, y: falling ? -.3 : y, target:y, life:19, value:25 });
    }
    collect(id) {
      if (this.status !== 'playing') return false;
      const i = this.suns.findIndex(s => s.id === id);
      if (i < 0) return false;
      this.sun += this.suns[i].value; this.suns.splice(i,1); return true;
    }
    spawn(kind, row) {
      const d = G.INVADERS[kind];
      this.enemies.push({ id: ++this.serial, kind, row, x:9.15, hp:d.hp, slow:0 });
    }
    tick(dt = G.STEP) {
      if (this.status !== 'playing') return;
      // Public callers must use bounded steps: prevent tunnelling / a background-tab jump.
      dt = Math.min(G.STEP, Math.max(0, dt)); this.time += dt;
      for (const k of Object.keys(this.cooldowns)) this.cooldowns[k] = Math.max(0,this.cooldowns[k]-dt);
      const level = G.LEVELS[this.level];
      while (this.next < level.events.length && level.events[this.next].at <= this.time) {
        const e = level.events[this.next++]; this.spawn(e.kind,e.row);
      }
      if (this.time >= this.skyAt) { this.skyAt += 7; this.addSun(.3+this.random()*8.3,.5+this.random()*3.8,true); }
      for (const s of this.suns) { s.y = Math.min(s.target,s.y + dt*1.4); s.life -= dt; }
      this.suns = this.suns.filter(s => s.life > 0);
      for (const p of this.plants) {
        const d = G.PLANTS[p.kind]; p.timer -= dt;
        if (p.kind === 'bomb' && p.timer <= 0) {
          // Neighbouring rows and columns: a true 3x3 tile area centred on the berry.
          for (const e of this.enemies) if (Math.abs(e.row-p.row) <= 1 && e.x >= p.col-1 && e.x < p.col+2) e.hp -= d.damage;
          this.effects.push({x:p.col+.5,y:p.row+.5,life:.45}); p.hp = 0;
        } else if (d.sunEvery && p.timer <= 0) {
          this.addSun(p.col+.5,p.row+.3); p.timer = d.sunEvery;
        } else if (d.period && p.timer <= 0 && this.enemies.some(e => e.hp > 0 && e.row === p.row && e.x > p.col+.3)) {
          this.shots.push({x:p.col+.8,row:p.row,damage:d.damage,slow:d.slow || 0}); p.timer = d.period;
        }
      }
      for (const b of this.shots) {
        const before = b.x; b.x += dt*5.5;
        const hit = this.enemies.filter(e => e.hp > 0 && e.row === b.row && e.x+.28 >= before && e.x-.28 <= b.x)
          .sort((a,c) => a.x-c.x)[0];
        if (hit) { hit.hp -= b.damage; hit.slow = Math.max(hit.slow,b.slow); b.x = 99; }
      }
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        const d = G.INVADERS[e.kind]; e.slow = Math.max(0,e.slow-dt);
        const victim = this.plants.filter(p => p.hp > 0 && p.row === e.row && e.x >= p.col+.18 && e.x <= p.col+1.05)
          .sort((a,b) => b.col-a.col)[0];
        const factor = e.slow > 0 ? .5 : 1;
        if (victim) victim.hp -= d.bite*factor*dt;
        else e.x -= d.speed*factor*dt;
        const m = this.mowers[e.row];
        if (e.x <= 0 && !m.used) { m.used = true; m.active = true; m.x = -.45; }
        if (e.x < -.5 && !m.active) this.status = 'lost';
      }
      this.mowers.forEach((m,row) => {
        if (!m.active) return;
        m.x += dt*6;
        for (const e of this.enemies) if (e.row === row && e.x <= m.x+.5) e.hp = 0;
        if (m.x > 9.7) m.active = false;
      });
      this.plants = this.plants.filter(p => p.hp > 0);
      this.enemies = this.enemies.filter(e => e.hp > 0);
      this.shots = this.shots.filter(b => b.x < 9.8);
      for (const f of this.effects) f.life -= dt;
      this.effects = this.effects.filter(f => f.life > 0);
      if (this.status === 'playing' && this.next === level.events.length && !this.enemies.length) this.status = 'won';
    }
    snapshot() { return JSON.parse(JSON.stringify(this)); }
    static restore(raw) {
      // Reject damaged / old saves rather than let NaNs or unknown table keys crash play.
      if (!raw || !Number.isInteger(raw.level) || raw.level < 0 || raw.level >= G.LEVELS.length) return null;
      const clean = new Engine(raw.level), fields = Object.keys(clean);
      if (fields.some(k => !(k in raw))) return null;
      if (!['playing','won','lost'].includes(raw.status)) return null;
      const nums = ['time','sun','next','skyAt','serial','rng'];
      if (nums.some(k => !Number.isFinite(raw[k]) || raw[k] < 0) || raw.next > G.LEVELS[raw.level].events.length) return null;
      if (raw.time > 100000 || raw.sun > 100000 || !Number.isInteger(raw.next)) return null;
      const finite = (o,keys) => o && keys.every(k => Number.isFinite(o[k]));
      const row = o => Number.isInteger(o.row) && o.row >= 0 && o.row < 5;
      const rules = {
        plants:p => finite(p,['id','row','col','hp','timer']) && row(p) && Number.isInteger(p.col) && p.col >= 0 && p.col < 9 && !!G.PLANTS[p.kind] && p.hp > 0,
        enemies:e => finite(e,['id','row','x','hp','slow']) && row(e) && !!G.INVADERS[e.kind] && e.hp > 0,
        shots:b => finite(b,['x','row','damage','slow']) && row(b),
        suns:s => finite(s,['id','x','y','target','life','value']) && s.value === 25,
        effects:f => finite(f,['x','y','life']),
        mowers:m => finite(m,['x']) && typeof m.used === 'boolean' && typeof m.active === 'boolean'
      };
      for (const [key,valid] of Object.entries(rules)) if (!Array.isArray(raw[key]) || raw[key].length > 1000 || !raw[key].every(valid)) return null;
      if (raw.mowers.length !== 5 || !raw.cooldowns || Object.keys(G.PLANTS).some(k => !Number.isFinite(raw.cooldowns[k]) || raw.cooldowns[k] < 0)) return null;
      for (const k of fields) clean[k] = JSON.parse(JSON.stringify(raw[k]));
      return clean;
    }
  }
  G.Engine = Engine;
  if (typeof module !== 'undefined') module.exports = Engine;
})(typeof window === 'undefined' ? globalThis : window);
