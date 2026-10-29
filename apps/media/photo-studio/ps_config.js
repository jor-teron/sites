/*
 * Hub Photo Studio (HPS2) — ps_config.js. Loaded right AFTER ../photo-editor-v2/pe_config.js:
 * Photo Studio starts from Photo Editor v2's settings (limits, preview, crop, adjust, resize, keys)
 * and only overrides what makes it its own app. Change shared tunables in pe_config.js; change
 * Studio-only ones here.
 */
(function (PE) {
  'use strict';
  const C = PE.config;
  C.app = 'Hub Photo Studio';
  C.appId = 'photo-studio';          // Hub link 'ready' id (used by pe_send.js)
  C.version = '1.0';
  C.release = 'HPS2';                // HPS1: Photo Editor v2 feature set, own name / settings / About · HPS2: layers + .hps / .ora

  // HPS2: about 12 MP for the working copy on every device (layers stay smooth on a 4 GB Celeron).
  // Bigger photos are reduced once on open (with a message); Resize and image layers keep to the same cap.
  C.limits = Object.assign({}, C.limits, { maxPixelsTouch: 12000000, maxPixelsDesktop: 12000000 });

  // User settings from Photo Studio's own save key (ps_save.js), never Photo Editor v2's.
  const P = window.PSSave ? PSSave.settings() : null;
  if (P) { C.save.defaultFormat = P.format; C.save.jpegQuality = P.quality; }

  C.studio = {
    stageLight: '#dfe1e5',            // photo background in the light theme (dark keeps colors.stage)
    stageDark: C.colors.stage,
    keys: { settings: ',' },
    layers: {                         // HPS2 (ps_layers.js)
      maxLayers: 10,                  // including the background photo
      maxPixels: 12000000,            // an image layer is decoded at most this big (and at most the canvas size)
      handle: 22,                     // touch radius of a layer handle (CSS px)
      rotGap: 34,                     // rotate handle distance above the box (CSS px)
      minSize: 6                      // smallest layer side, photo px
    }
  };

  // Feature slot stub: feature files loaded before ps_app.js can already register; ps_app.js takes these over.
  PE.studio = {
    _queue: [], _tools: [],
    feature(def) { this._queue.push(def); },
    addTool(def) { this._tools.push(def); }
  };
})(window.PE);
