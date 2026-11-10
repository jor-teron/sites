/* NP-1b: rough daily targets from ICMR-NIN style guidance. Approximate mid-points
   (not sex-specific). Energy rises with activity. Sugar is a keep-below cap (~10% of energy). */
(function (root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.NPTargets = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const ages = [
    { id: 'child', label: 'Child (4–8 years)', kcal: [1400, 1600, 1800], prot: 20, fibre: 15, fe: 11, ca: 600, vc: 40 },
    { id: 'preteen', label: 'Child (9–12 years)', kcal: [1800, 2100, 2400], prot: 32, fibre: 25, fe: 16, ca: 800, vc: 50 },
    { id: 'teen', label: 'Teen (13–17 years)', kcal: [2200, 2600, 3000], prot: 50, fibre: 30, fe: 21, ca: 1000, vc: 65 },
    { id: 'adult', label: 'Adult (18–59 years)', kcal: [1900, 2300, 2800], prot: 50, fibre: 35, fe: 21, ca: 1000, vc: 80 },
    { id: 'older', label: 'Older adult (60+ years)', kcal: [1700, 2000, 2300], prot: 50, fibre: 30, fe: 19, ca: 1200, vc: 80 }
  ];
  const activities = [
    { id: 'sedentary', label: 'Sedentary' },
    { id: 'moderate', label: 'Moderate' },
    { id: 'active', label: 'Active' }
  ];
  const diets = [
    { id: 'all', label: 'All foods' },
    { id: 'veg', label: 'Vegetarian' },
    { id: 'egg', label: 'Egg' },
    { id: 'nonveg', label: 'Non-veg' }
  ];
  function targets(ageId, activityId) {
    const age = ages.find(a => a.id === ageId) || ages[3];
    const act = Math.max(0, activities.findIndex(a => a.id === activityId));
    const kcal = age.kcal[act] || age.kcal[1];
    return {
      age: age.id, activity: activities[act].id, kcal,
      prot: age.prot,
      fat: Math.round(0.25 * kcal / 9),
      carb: Math.round(0.60 * kcal / 4),
      fibre: age.fibre,
      sugar: Math.round(0.10 * kcal / 4),
      fe: age.fe, ca: age.ca, vc: age.vc
    };
  }
  return { ages, activities, diets, targets };
});
