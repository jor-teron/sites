/* Cooking Timer — ct_presets.js: quick kitchen timer presets. CT1 */
(function (root) {
  var CT = root.CT = root.CT || {};
  CT.PRESETS = [
    { name: 'Soft-Boiled Egg', minutes: 6, seconds: 0 },
    { name: 'Hard-Boiled Egg', minutes: 10, seconds: 0 },
    { name: 'Pasta al dente', minutes: 9, seconds: 0 },
    { name: 'Steamed Broccoli', minutes: 4, seconds: 0 },
    { name: 'Espresso Shot', minutes: 0, seconds: 30 },
    { name: 'Green Tea', minutes: 3, seconds: 0 }
  ];
})(typeof window !== 'undefined' ? window : global);
