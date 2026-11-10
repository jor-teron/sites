/* Image Converter — ic_presets.js: built-in and user presets. CI2 */
(function (root) {
  'use strict';

  var BUILTIN = [
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      format: 'jpeg',
      resize: 'longest',
      longest: 1600,
      keepAspect: true,
      noEnlarge: true,
      quality: 80,
      useTarget: false,
      cropRatio: 'none',
      bg: '#ffffff'
    },
    {
      id: 'instagram',
      name: 'Instagram',
      format: 'jpeg',
      resize: 'longest',
      longest: 1080,
      keepAspect: true,
      noEnlarge: true,
      quality: 85,
      useTarget: false,
      cropRatio: '1:1',
      bg: '#ffffff'
    },
    {
      id: 'email',
      name: 'Email',
      format: 'jpeg',
      resize: 'longest',
      longest: 1280,
      keepAspect: true,
      noEnlarge: true,
      quality: 70,
      useTarget: true,
      targetKb: 200,
      cropRatio: 'none',
      bg: '#ffffff'
    },
    {
      id: 'passport',
      name: 'Passport photo',
      format: 'jpeg',
      resize: 'exact',
      width: 413,
      height: 531,
      keepAspect: true,
      noEnlarge: false,
      quality: 80,
      useTarget: true,
      targetKb: 40,
      cropRatio: 'passport',
      bg: '#ffffff'
    },
    {
      id: 'signature',
      name: 'Signature',
      format: 'jpeg',
      resize: 'exact',
      width: 300,
      height: 80,
      keepAspect: true,
      noEnlarge: false,
      quality: 80,
      useTarget: true,
      targetKb: 30,
      cropRatio: 'none',
      bg: '#ffffff'
    }
  ];

  var SETTING_KEYS = [
    'format', 'resize', 'longest', 'percent', 'width', 'height',
    'keepAspect', 'noEnlarge', 'quality', 'useTarget', 'targetKb',
    'pattern', 'cropRatio', 'bg',
    'wmText', 'wmPosition', 'wmOpacity', 'wmColor', 'wmScale'
  ];

  function builtinList() {
    return BUILTIN.map(function (p) { return Object.assign({ builtin: true }, p); });
  }

  function findBuiltin(id) {
    for (var i = 0; i < BUILTIN.length; i++) {
      if (BUILTIN[i].id === id) return Object.assign({ builtin: true }, BUILTIN[i]);
    }
    return null;
  }

  function sanitizeCustom(list) {
    var out = [];
    var seen = Object.create(null);
    if (!Array.isArray(list)) return out;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || typeof p !== 'object') continue;
      var name = String(p.name || '').trim();
      if (!name) continue;
      var id = String(p.id || '').trim();
      if (!id || seen[id] || findBuiltin(id)) {
        id = 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (!id || id === 'custom-') id = 'custom-' + (i + 1);
        var base = id;
        var n = 2;
        while (seen[id] || findBuiltin(id)) { id = base + '-' + n; n += 1; }
      }
      seen[id] = 1;
      var row = { id: id, name: name.slice(0, 40), builtin: false };
      for (var k = 0; k < SETTING_KEYS.length; k++) {
        var key = SETTING_KEYS[k];
        if (p[key] !== undefined) row[key] = p[key];
      }
      out.push(row);
    }
    return out;
  }

  function snapshotSettings(settings, name, id) {
    var row = {
      id: id || ('custom-' + Date.now().toString(36)),
      name: String(name || 'My preset').trim().slice(0, 40) || 'My preset',
      builtin: false
    };
    settings = settings || {};
    for (var i = 0; i < SETTING_KEYS.length; i++) {
      var key = SETTING_KEYS[i];
      if (settings[key] !== undefined) row[key] = settings[key];
    }
    return row;
  }

  function applyTo(preset, settings) {
    var out = Object.assign({}, settings || {});
    if (!preset) return out;
    for (var i = 0; i < SETTING_KEYS.length; i++) {
      var key = SETTING_KEYS[i];
      if (preset[key] !== undefined) out[key] = preset[key];
    }
    return out;
  }

  var api = {
    BUILTIN: BUILTIN,
    SETTING_KEYS: SETTING_KEYS,
    builtinList: builtinList,
    findBuiltin: findBuiltin,
    sanitizeCustom: sanitizeCustom,
    snapshotSettings: snapshotSettings,
    applyTo: applyTo
  };

  root.ICPresets = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
