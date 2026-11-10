/* NP-1c: rough daily targets from ICMR-NIN style guidance. Sex-specific
   where the tables differ (especially iron and energy). "Prefer not to say"
   uses the mid-point of the female and male figures. Approximate, not a prescription. */
(function (root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.NPTargets = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const ages = [
    { id: 'child', label: 'Child (4–8 years)', kcal: { male: [1450, 1650, 1850], female: [1350, 1550, 1750] },
      prot: { male: 20, female: 20 }, fibre: 15, fe: { male: 11, female: 11 }, ca: 600, vc: 40 },
    { id: 'preteen', label: 'Child (9–12 years)', kcal: { male: [1900, 2200, 2500], female: [1700, 2000, 2300] },
      prot: { male: 33, female: 31 }, fibre: 25, fe: { male: 16, female: 28 }, ca: 800, vc: 50 },
    { id: 'teen', label: 'Teen (13–17 years)', kcal: { male: [2500, 2900, 3300], female: [1900, 2300, 2700] },
      prot: { male: 54, female: 46 }, fibre: 30, fe: { male: 22, female: 30 }, ca: 1000, vc: 65 },
    { id: 'adult', label: 'Adult (18–59 years)', kcal: { male: [2100, 2500, 3100], female: [1700, 2100, 2500] },
      prot: { male: 54, female: 46 }, fibre: 35, fe: { male: 19, female: 29 }, ca: 1000, vc: 80 },
    { id: 'older', label: 'Older adult (60+ years)', kcal: { male: [1800, 2100, 2400], female: [1600, 1900, 2200] },
      prot: { male: 54, female: 46 }, fibre: 30, fe: { male: 19, female: 19 }, ca: 1200, vc: 80 }
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
  const sexes = [
    { id: 'female', label: 'Female' },
    { id: 'male', label: 'Male' },
    { id: 'unspecified', label: 'Prefer not to say' }
  ];
  function mid(a, b) { return Math.round((a + b) / 2); }
  function pick(pair, sex) {
    if (sex === 'female') return pair.female;
    if (sex === 'male') return pair.male;
    return mid(pair.female, pair.male);
  }
  function targets(ageId, activityId, sexId) {
    const age = ages.find(a => a.id === ageId) || ages[3];
    const act = Math.max(0, activities.findIndex(a => a.id === activityId));
    const sex = sexes.some(s => s.id === sexId) ? sexId : 'unspecified';
    const band = age.kcal;
    const kcal = sex === 'unspecified' ? mid(band.female[act], band.male[act]) : (band[sex][act] || band[sex][1]);
    return {
      age: age.id, activity: activities[act].id, sex, kcal,
      prot: pick(age.prot, sex),
      fat: Math.round(0.25 * kcal / 9),
      carb: Math.round(0.60 * kcal / 4),
      fibre: age.fibre,
      sugar: Math.round(0.10 * kcal / 4),
      fe: pick(age.fe, sex), ca: age.ca, vc: age.vc
    };
  }
  return { ages, activities, diets, sexes, targets };
});
