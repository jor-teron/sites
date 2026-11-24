/**
 * Lab & Scan Explainer - Clinical Reference Database (tests-data.js)
 * Covers standard adult/child reference intervals, unit conversions,
 * clinical significance, common benign/lifestyle causes, and doctor discussion points.
 * Note: Educational purposes only.
 */
(function (global) {
  'use strict';

  var CATEGORIES = [
    { id: 'cbc', name: 'Complete Blood Count (CBC)', icon: '🩸' },
    { id: 'diabetes', name: 'Blood Sugar & Diabetes', icon: '🍬' },
    { id: 'kidney', name: 'Kidney Function & Electrolytes (KFT)', icon: '💧' },
    { id: 'liver', name: 'Liver Function Tests (LFT)', icon: '🧪' },
    { id: 'lipid', name: 'Lipid Profile (Cholesterol)', icon: '🫀' },
    { id: 'thyroid_vitamins', name: 'Thyroid & Vital Vitamins', icon: '⚡' },
    { id: 'urine', name: 'Urine Routine Examination', icon: '🔬' }
  ];

  var TESTS = {
    // --- Complete Blood Count ---
    hb: {
      id: 'hb',
      categoryId: 'cbc',
      name: 'Hemoglobin (Hb)',
      shortDesc: 'Oxygen-carrying protein inside red blood cells.',
      units: [
        { id: 'g_dl', label: 'g/dL', factor: 1 },
        { id: 'g_l', label: 'g/L', factor: 0.1 }
      ],
      defaultUnit: 'g_dl',
      ranges: {
        male: { min: 13.8, max: 17.2, lowCrit: 7.0, highCrit: 20.0 },
        female: { min: 12.1, max: 15.1, lowCrit: 7.0, highCrit: 19.0 },
        child: { min: 11.0, max: 14.5, lowCrit: 7.0, highCrit: 18.0 }
      },
      scale: { displayMin: 5.0, displayMax: 22.0 },
      whatIsIt: 'Hemoglobin is an iron-rich protein in red blood cells that picks up oxygen in your lungs and transports it to every cell and organ in your body.',
      lowMeaning: 'Low hemoglobin is called anemia. Common causes include iron deficiency, dietary shortages (low vitamin B12 or folate), heavy menstrual periods, or bleeding. Symptoms often include fatigue, paleness, or feeling short of breath on exertion.',
      highMeaning: 'High hemoglobin (polycythemia) can occur with dehydration, smoking, living at high altitudes, or chronic lung conditions where the body produces extra red cells to compensate.',
      normalMeaning: 'Your red blood cells have a healthy concentration of oxygen-carrying protein.',
      doctorQuestions: [
        'Could iron deficiency, diet, or blood loss explain this level?',
        'Would a serum ferritin or iron profile test be helpful?',
        'Do I need iron or vitamin supplements, or dietary changes?'
      ]
    },

    wbc: {
      id: 'wbc',
      categoryId: 'cbc',
      name: 'White Blood Cell Count (WBC / TLC)',
      shortDesc: 'Defender cells fighting infections and inflammation.',
      units: [
        { id: 'per_mcl', label: '/mcL (cells/µL)', factor: 1 },
        { id: 'x10_3', label: '×10³/µL', factor: 1000 }
      ],
      defaultUnit: 'per_mcl',
      ranges: {
        male: { min: 4500, max: 11000, lowCrit: 2000, highCrit: 30000 },
        female: { min: 4500, max: 11000, lowCrit: 2000, highCrit: 30000 },
        child: { min: 5000, max: 13000, lowCrit: 2500, highCrit: 32000 }
      },
      scale: { displayMin: 1000, displayMax: 25000 },
      whatIsIt: 'White blood cells (leukocytes) are the frontline soldiers of your immune system that defend against bacteria, viruses, fungi, and tissue damage.',
      lowMeaning: 'Leukopenia (low WBC) means fewer infection-fighting cells. It can occur temporarily after viral infections (like flu, dengue, or Covid), autoimmune conditions, or certain medications.',
      highMeaning: 'Leukocytosis (elevated WBC) is very common during active bacterial infections, physical stress, intense exercise, tissue injury, or inflammation. It is often the body’s normal defensive surge.',
      normalMeaning: 'Your immune cell count is within the expected baseline range.',
      doctorQuestions: [
        'Does my differential count (neutrophils vs lymphocytes) show a bacterial or viral pattern?',
        'Could recent stress, an allergy, or a minor infection explain an elevated count?',
        'Should this count be rechecked after a few weeks?'
      ]
    },

    platelets: {
      id: 'platelets',
      categoryId: 'cbc',
      name: 'Platelet Count (Thrombocytes)',
      shortDesc: 'Cell fragments responsible for blood clotting.',
      units: [
        { id: 'k_mcl', label: '×10³/µL (thousands)', factor: 1 },
        { id: 'per_mcl', label: '/µL (cells)', factor: 0.001 },
        { id: 'lakh_mcl', label: 'Lakh/µL (Indian)', factor: 100 }
      ],
      defaultUnit: 'k_mcl',
      ranges: {
        male: { min: 150, max: 450, lowCrit: 50, highCrit: 800 },
        female: { min: 150, max: 450, lowCrit: 50, highCrit: 800 },
        child: { min: 150, max: 450, lowCrit: 50, highCrit: 800 }
      },
      scale: { displayMin: 20, displayMax: 700 },
      whatIsIt: 'Platelets are tiny disc-shaped cell fragments in the bloodstream that clump together to plug cuts and stop bleeding.',
      lowMeaning: 'Thrombocytopenia (low platelets) can happen with viral illnesses (such as dengue or viral fevers), vitamin deficiencies, or immune destruction. Mild drops often recover spontaneously; marked drops increase bruising.',
      highMeaning: 'Thrombocytosis (high platelets) is frequently "reactive" — a temporary surge triggered by body inflammation, recent surgery, iron deficiency, or infection.',
      normalMeaning: 'Your blood has adequate clotting capacity.',
      doctorQuestions: [
        'Is this change reactive to a recent illness or iron level?',
        'Are there any signs of abnormal bruising or bleeding I should monitor?',
        'When should we repeat the count to check for normal rebound?'
      ]
    },

    esr: {
      id: 'esr',
      categoryId: 'cbc',
      name: 'ESR (Erythrocyte Sedimentation Rate)',
      shortDesc: 'General screening marker for inflammation.',
      units: [{ id: 'mm_hr', label: 'mm/hr', factor: 1 }],
      defaultUnit: 'mm_hr',
      ranges: {
        male: { min: 0, max: 15, lowCrit: 0, highCrit: 80 },
        female: { min: 0, max: 20, lowCrit: 0, highCrit: 80 },
        child: { min: 0, max: 10, lowCrit: 0, highCrit: 60 }
      },
      scale: { displayMin: 0, displayMax: 100 },
      whatIsIt: 'ESR measures how quickly red blood cells settle at the bottom of a test tube in one hour. Increased proteins during inflammation cause cells to clump and settle faster.',
      lowMeaning: 'A low ESR is normal and indicates an absence of significant systemic inflammation.',
      highMeaning: 'An elevated ESR indicates inflammation somewhere in the body. It is non-specific: infections, arthritis, tissue injury, or even anemia can raise it.',
      normalMeaning: 'No generalized active inflammatory response is flagged by this test.',
      doctorQuestions: [
        'Should we check a more specific marker like CRP (C-Reactive Protein)?',
        'Could a minor joint ache, dental issue, or cold explain this elevation?'
      ]
    },

    // --- Blood Sugar & Diabetes ---
    fasting_glucose: {
      id: 'fasting_glucose',
      categoryId: 'diabetes',
      name: 'Fasting Blood Glucose (FBS)',
      shortDesc: 'Blood sugar measured after an 8–12 hour fast.',
      units: [
        { id: 'mg_dl', label: 'mg/dL', factor: 1 },
        { id: 'mmol_l', label: 'mmol/L', factor: 18.018 }
      ],
      defaultUnit: 'mg_dl',
      ranges: {
        male: { min: 70, max: 99, lowCrit: 55, highCrit: 250 },
        female: { min: 70, max: 99, lowCrit: 55, highCrit: 250 },
        child: { min: 70, max: 100, lowCrit: 50, highCrit: 220 }
      },
      scale: { displayMin: 40, displayMax: 300 },
      whatIsIt: 'Fasting blood glucose measures the concentration of sugar in your bloodstream after an overnight fast (minimum 8 hours without food or sugary drinks).',
      lowMeaning: 'Hypoglycemia (sugar below 70 mg/dL) can cause shakiness, sweating, palpitations, and dizziness. Common triggers include skipping meals, prolonged fasting, or diabetes medications.',
      highMeaning: '100–125 mg/dL is classified as impaired fasting glucose (prediabetes); 126 mg/dL or higher on two separate tests indicates diabetes mellitus. Lifestyle factors, stress, and illness can also cause temporary spikes.',
      normalMeaning: 'Your fasting blood sugar is within the healthy baseline range (70–99 mg/dL).',
      doctorQuestions: [
        'Was my 8-hour fasting period adequate for an accurate reading?',
        'Should we confirm this with an HbA1c test?',
        'What dietary and exercise adjustments are recommended for my range?'
      ]
    },

    hba1c: {
      id: 'hba1c',
      categoryId: 'diabetes',
      name: 'HbA1c (Glycated Hemoglobin)',
      shortDesc: 'Estimated average blood sugar over the past 2–3 months.',
      units: [
        { id: 'percent', label: '%', factor: 1 }
      ],
      defaultUnit: 'percent',
      ranges: {
        male: { min: 4.0, max: 5.6, lowCrit: 3.5, highCrit: 11.0 },
        female: { min: 4.0, max: 5.6, lowCrit: 3.5, highCrit: 11.0 },
        child: { min: 4.0, max: 5.6, lowCrit: 3.5, highCrit: 10.0 }
      },
      scale: { displayMin: 3.5, displayMax: 14.0 },
      whatIsIt: 'HbA1c shows the percentage of hemoglobin in red blood cells that has sugar attached to it, giving a reliable snapshot of your average blood glucose control over the last 90 days.',
      lowMeaning: 'Values below 4.0% are uncommon but may occasionally happen with severe anemia, rapid red cell turnover, or frequent low blood sugar.',
      highMeaning: '5.7% to 6.4% indicates prediabetes (higher risk of developing type 2 diabetes). 6.5% or higher on two tests is the clinical threshold for diabetes.',
      normalMeaning: 'Your 3-month blood sugar average is healthy and well-regulated (below 5.7%).',
      doctorQuestions: [
        'What is my estimated average glucose (eAG) based on this HbA1c?',
        'If in the prediabetes range, can lifestyle changes reverse it?',
        'How often should this test be repeated?'
      ]
    },

    // --- Kidney Function & Electrolytes ---
    creatinine: {
      id: 'creatinine',
      categoryId: 'kidney',
      name: 'Serum Creatinine',
      shortDesc: 'Waste product from muscle metabolism filtered by kidneys.',
      units: [
        { id: 'mg_dl', label: 'mg/dL', factor: 1 },
        { id: 'umol_l', label: 'µmol/L', factor: 0.0113 }
      ],
      defaultUnit: 'mg_dl',
      ranges: {
        male: { min: 0.7, max: 1.3, lowCrit: 0.3, highCrit: 4.0 },
        female: { min: 0.5, max: 1.1, lowCrit: 0.3, highCrit: 3.5 },
        child: { min: 0.3, max: 0.7, lowCrit: 0.2, highCrit: 2.5 }
      },
      scale: { displayMin: 0.2, displayMax: 5.0 },
      whatIsIt: 'Creatinine is a normal breakdown product of muscle energy metabolism that healthy kidneys continuously filter out into urine. It is the primary marker of kidney filtration.',
      lowMeaning: 'Low creatinine is generally harmless and usually reflects lower muscle mass, aging, or low protein intake.',
      highMeaning: 'Elevated creatinine suggests the kidneys are filtering waste more slowly. Common transient causes include dehydration, heavy exercise, high meat meals, or certain medications (like NSAID pain relievers).',
      normalMeaning: 'Your kidneys are clearing muscle metabolic waste effectively.',
      doctorQuestions: [
        'What is my calculated eGFR (estimated filtration rate) from this number?',
        'Could dehydration or medications (like ibuprofen) have influenced this result?',
        'Should I drink more water and recheck it in a few weeks?'
      ]
    },

    uric_acid: {
      id: 'uric_acid',
      categoryId: 'kidney',
      name: 'Serum Uric Acid',
      shortDesc: 'Byproduct of purine breakdown; linked to gout and stones.',
      units: [{ id: 'mg_dl', label: 'mg/dL', factor: 1 }],
      defaultUnit: 'mg_dl',
      ranges: {
        male: { min: 3.4, max: 7.0, lowCrit: 1.5, highCrit: 12.0 },
        female: { min: 2.4, max: 6.0, lowCrit: 1.5, highCrit: 11.0 },
        child: { min: 2.0, max: 5.5, lowCrit: 1.0, highCrit: 9.0 }
      },
      scale: { displayMin: 1.0, displayMax: 14.0 },
      whatIsIt: 'Uric acid is formed when your body breaks down purines found in your own cells and foods like red meat, seafood, lentils, and beer.',
      lowMeaning: 'Low uric acid is rare and typically of little clinical concern.',
      highMeaning: 'High uric acid (hyperuricemia) can form needle-like crystals in joints (causing gout flare-ups) or kidneys (uric acid stones). However, many people with high levels never experience symptoms.',
      normalMeaning: 'Your purine breakdown and kidney clearance are well balanced.',
      doctorQuestions: [
        'Do I have any joint redness, big toe pain, or kidney stone symptoms?',
        'Which dietary changes (hydration, moderating red meat/sugary drinks) can lower it?'
      ]
    },

    // --- Liver Function Tests ---
    bilirubin_total: {
      id: 'bilirubin_total',
      categoryId: 'liver',
      name: 'Total Bilirubin',
      shortDesc: 'Yellow pigment from broken-down red blood cells.',
      units: [{ id: 'mg_dl', label: 'mg/dL', factor: 1 }],
      defaultUnit: 'mg_dl',
      ranges: {
        male: { min: 0.2, max: 1.2, lowCrit: 0.1, highCrit: 8.0 },
        female: { min: 0.2, max: 1.2, lowCrit: 0.1, highCrit: 8.0 },
        child: { min: 0.2, max: 1.0, lowCrit: 0.1, highCrit: 7.0 }
      },
      scale: { displayMin: 0.1, displayMax: 6.0 },
      whatIsIt: 'Bilirubin is a yellowish compound produced when the liver processes aged red blood cells. The liver conjugates it and excretes it via bile.',
      lowMeaning: 'Low bilirubin levels are completely normal and not a cause for medical concern.',
      highMeaning: 'Elevated bilirubin can cause yellowing of the eyes and skin (jaundice). Common causes include liver inflammation (hepatitis), gallstones blocking the bile duct, or benign Gilbert’s syndrome.',
      normalMeaning: 'Your liver is processing and clearing bile pigments smoothly.',
      doctorQuestions: [
        'Is the elevation predominantly direct (conjugated) or indirect (unconjugated)?',
        'Could Gilbert’s syndrome (a harmless genetic trait causing mild spikes during fasting/stress) be present?'
      ]
    },

    sgpt_alt: {
      id: 'sgpt_alt',
      categoryId: 'liver',
      name: 'SGPT / ALT (Alanine Aminotransferase)',
      shortDesc: 'Liver enzyme indicating liver cell irritation or injury.',
      units: [{ id: 'u_l', label: 'U/L (IU/L)', factor: 1 }],
      defaultUnit: 'u_l',
      ranges: {
        male: { min: 7, max: 55, lowCrit: 0, highCrit: 300 },
        female: { min: 7, max: 35, lowCrit: 0, highCrit: 250 },
        child: { min: 5, max: 40, lowCrit: 0, highCrit: 200 }
      },
      scale: { displayMin: 0, displayMax: 200 },
      whatIsIt: 'ALT (SGPT) is an enzyme found mostly inside liver cells. When liver cells are irritated or stressed, ALT leaks into the bloodstream.',
      lowMeaning: 'A low ALT is completely normal and healthy.',
      highMeaning: 'Elevated ALT suggests liver stress. Very common causes include fatty liver (steatosis), alcohol consumption, viral infections, or common prescription/OTC medicines (like paracetamol or statins).',
      normalMeaning: 'Liver cellular integrity appears healthy.',
      doctorQuestions: [
        'Could fatty liver, alcohol, or recent medications be causing liver enzyme irritation?',
        'Would an ultrasound of the abdomen or viral hepatitis screening be advised?'
      ]
    },

    // --- Lipid Profile ---
    total_cholesterol: {
      id: 'total_cholesterol',
      categoryId: 'lipid',
      name: 'Total Cholesterol',
      shortDesc: 'Total amount of circulating blood fats (sterols).',
      units: [
        { id: 'mg_dl', label: 'mg/dL', factor: 1 },
        { id: 'mmol_l', label: 'mmol/L', factor: 38.67 }
      ],
      defaultUnit: 'mg_dl',
      ranges: {
        male: { min: 125, max: 200, lowCrit: 90, highCrit: 350 },
        female: { min: 125, max: 200, lowCrit: 90, highCrit: 350 },
        child: { min: 120, max: 170, lowCrit: 80, highCrit: 260 }
      },
      scale: { displayMin: 80, displayMax: 400 },
      whatIsIt: 'Total cholesterol combines all forms of cholesterol in your blood, including LDL, HDL, and VLDL.',
      lowMeaning: 'Very low total cholesterol is rare and can occur with malnutrition, hyperthyroidism, or severe liver disease.',
      highMeaning: 'Levels above 200 mg/dL (borderline) or 240 mg/dL (high) can contribute to plaque buildup inside arteries over years, increasing cardiovascular risks.',
      normalMeaning: 'Your overall circulating cholesterol is within desirable guidelines (< 200 mg/dL).',
      doctorQuestions: [
        'What is my ratio between HDL ("good") and LDL ("bad") cholesterol?',
        'What is my overall 10-year cardiovascular risk score based on age and blood pressure?'
      ]
    },

    ldl_cholesterol: {
      id: 'ldl_cholesterol',
      categoryId: 'lipid',
      name: 'LDL Cholesterol ("Bad" Cholesterol)',
      shortDesc: 'Plaque-forming cholesterol carrying fats to artery walls.',
      units: [
        { id: 'mg_dl', label: 'mg/dL', factor: 1 },
        { id: 'mmol_l', label: 'mmol/L', factor: 38.67 }
      ],
      defaultUnit: 'mg_dl',
      ranges: {
        male: { min: 50, max: 100, lowCrit: 30, highCrit: 250 },
        female: { min: 50, max: 100, lowCrit: 30, highCrit: 250 },
        child: { min: 50, max: 110, lowCrit: 30, highCrit: 200 }
      },
      scale: { displayMin: 30, displayMax: 300 },
      whatIsIt: 'Low-Density Lipoprotein (LDL) delivers cholesterol to peripheral tissues. Excess LDL can oxidize and deposit inside artery walls, forming plaques.',
      lowMeaning: 'Lower LDL is generally protective for your arteries, although extreme lows under 30 mg/dL should be evaluated.',
      highMeaning: 'Elevated LDL (> 100 mg/dL optimal, > 130 borderline, > 160 high) increases long-term heart disease risks. Influenced by genetics, saturated fat intake, and lack of exercise.',
      normalMeaning: 'Your LDL level is in the optimal target zone for cardiovascular prevention.',
      doctorQuestions: [
        'Based on my personal history, what is my specific LDL target (e.g. < 70 vs < 100)?',
        'Can dietary modifications (more soluble fiber, less trans fats) get me to target?'
      ]
    },

    hdl_cholesterol: {
      id: 'hdl_cholesterol',
      categoryId: 'lipid',
      name: 'HDL Cholesterol ("Good" Cholesterol)',
      shortDesc: 'Protective scavenger cholesterol returning fats to the liver.',
      units: [
        { id: 'mg_dl', label: 'mg/dL', factor: 1 },
        { id: 'mmol_l', label: 'mmol/L', factor: 38.67 }
      ],
      defaultUnit: 'mg_dl',
      ranges: {
        male: { min: 40, max: 80, lowCrit: 20, highCrit: 120 },
        female: { min: 50, max: 90, lowCrit: 25, highCrit: 130 },
        child: { min: 45, max: 85, lowCrit: 25, highCrit: 120 }
      },
      scale: { displayMin: 15, displayMax: 110 },
      whatIsIt: 'High-Density Lipoprotein (HDL) acts as a microscopic vacuum cleaner, absorbing excess cholesterol from blood vessels and carrying it back to the liver to be cleared.',
      lowMeaning: 'Low HDL (< 40 mg/dL in men, < 50 mg/dL in women) is an independent risk factor for heart disease. Sedentary lifestyle, smoking, and insulin resistance frequently lower it.',
      highMeaning: 'Higher HDL (> 60 mg/dL) is protective for heart and blood vessels.',
      normalMeaning: 'Your scavenger cholesterol level is healthy and protective.',
      doctorQuestions: [
        'How can I boost my HDL through physical activity and healthy fats (nuts, olive oil)?'
      ]
    },

    triglycerides: {
      id: 'triglycerides',
      categoryId: 'lipid',
      name: 'Serum Triglycerides',
      shortDesc: 'Stored fat energy circulating in the blood.',
      units: [
        { id: 'mg_dl', label: 'mg/dL', factor: 1 },
        { id: 'mmol_l', label: 'mmol/L', factor: 88.57 }
      ],
      defaultUnit: 'mg_dl',
      ranges: {
        male: { min: 40, max: 150, lowCrit: 20, highCrit: 600 },
        female: { min: 40, max: 150, lowCrit: 20, highCrit: 600 },
        child: { min: 35, max: 130, lowCrit: 20, highCrit: 400 }
      },
      scale: { displayMin: 20, displayMax: 600 },
      whatIsIt: 'Triglycerides are the most common type of fat in your body, derived from calories you eat that your body doesn’t immediately need for energy.',
      lowMeaning: 'Very low triglycerides are generally benign, often reflecting an active lifestyle or very low fat diet.',
      highMeaning: 'Elevated triglycerides (> 150 borderline, > 200 high, > 500 very high) are strongly linked to refined sugars, alcohol, carbs, and metabolic syndrome. Very high levels (> 500) risk pancreas inflammation.',
      normalMeaning: 'Your circulating fat levels are within standard desirable limits (< 150 mg/dL).',
      doctorQuestions: [
        'Did I fast 10–12 hours before this test (food strongly spikes triglycerides)?',
        'How much will cutting refined carbohydrates, alcohol, and sugary drinks help?'
      ]
    },

    // --- Thyroid & Vital Vitamins ---
    tsh: {
      id: 'tsh',
      categoryId: 'thyroid_vitamins',
      name: 'TSH (Thyroid Stimulating Hormone)',
      shortDesc: 'Pituitary signal regulating thyroid gland activity.',
      units: [{ id: 'miu_l', label: 'µIU/mL (mIU/L)', factor: 1 }],
      defaultUnit: 'miu_l',
      ranges: {
        male: { min: 0.4, max: 4.5, lowCrit: 0.05, highCrit: 25.0 },
        female: { min: 0.4, max: 4.5, lowCrit: 0.05, highCrit: 25.0 },
        child: { min: 0.7, max: 5.5, lowCrit: 0.1, highCrit: 20.0 }
      },
      scale: { displayMin: 0.05, displayMax: 15.0 },
      whatIsIt: 'TSH is released by your pituitary gland to tell your thyroid how much hormone (T3 and T4) to manufacture. It works like a thermostat: when thyroid hormone is low, TSH rises.',
      lowMeaning: 'Low TSH suggests an overactive thyroid (hyperthyroidism). Excess thyroid hormone can cause weight loss, rapid heartbeat, heat intolerance, or anxiety.',
      highMeaning: 'High TSH indicates an underactive thyroid (hypothyroidism). The pituitary is shouting at a sluggish thyroid gland. Symptoms can include fatigue, weight gain, constipation, and feeling cold.',
      normalMeaning: 'Your thyroid metabolic regulatory axis is working in harmony.',
      doctorQuestions: [
        'Should we check Free T3, Free T4, and thyroid antibodies (anti-TPO)?',
        'Could mild high TSH be subclinical hypothyroidism that just requires monitoring?'
      ]
    },

    vitamin_d: {
      id: 'vitamin_d',
      categoryId: 'thyroid_vitamins',
      name: 'Vitamin D (25-OH Vitamin D)',
      shortDesc: 'Sunshine vitamin vital for bone strength and immunity.',
      units: [
        { id: 'ng_ml', label: 'ng/mL', factor: 1 },
        { id: 'nmol_l', label: 'nmol/L', factor: 0.4 }
      ],
      defaultUnit: 'ng_ml',
      ranges: {
        male: { min: 30, max: 100, lowCrit: 10, highCrit: 150 },
        female: { min: 30, max: 100, lowCrit: 10, highCrit: 150 },
        child: { min: 30, max: 100, lowCrit: 10, highCrit: 150 }
      },
      scale: { displayMin: 5, displayMax: 140 },
      whatIsIt: 'Vitamin D is synthesized in your skin upon sunlight exposure and helps your gut absorb calcium for strong bones, teeth, and optimal immune function.',
      lowMeaning: 'Deficiency (< 20 ng/mL) or insufficiency (20–29 ng/mL) is extremely common worldwide due to indoor work and sunscreen. It can cause bone aches, muscle weakness, and fatigue.',
      highMeaning: 'Levels above 100 ng/mL are usually due to excessive over-the-counter high-dose supplementation rather than sunlight.',
      normalMeaning: 'Your Vitamin D stores are sufficient (30–100 ng/mL).',
      doctorQuestions: [
        'Do I need a weekly or daily Vitamin D3 supplement regimen?',
        'Should I take calcium or magnesium alongside Vitamin D?'
      ]
    },

    vitamin_b12: {
      id: 'vitamin_b12',
      categoryId: 'thyroid_vitamins',
      name: 'Vitamin B12 (Cobalamin)',
      shortDesc: 'Essential nerve nutrient and red blood cell builder.',
      units: [
        { id: 'pg_ml', label: 'pg/mL', factor: 1 },
        { id: 'pmol_l', label: 'pmol/L', factor: 1.355 }
      ],
      defaultUnit: 'pg_ml',
      ranges: {
        male: { min: 200, max: 900, lowCrit: 100, highCrit: 2000 },
        female: { min: 200, max: 900, lowCrit: 100, highCrit: 2000 },
        child: { min: 200, max: 900, lowCrit: 100, highCrit: 1800 }
      },
      scale: { displayMin: 80, displayMax: 1400 },
      whatIsIt: 'Vitamin B12 is essential for brain function, nerve insulation (myelin), and red blood cell production. It is naturally present mainly in animal products and fortified foods.',
      lowMeaning: 'Low B12 (< 200 pg/mL) can cause tingling or numbness in hands/feet, memory fog, balance issues, and fatigue. Very common in vegetarians and vegans, or people taking antacids long-term.',
      highMeaning: 'High B12 is usually benign from vitamins, but very high unexplained levels can warrant checking liver or kidney markers.',
      normalMeaning: 'Your neurological and hematologic B12 stores are adequate.',
      doctorQuestions: [
        'Would a sublingual B12 supplement or injection be best for me?',
        'Could my stomach absorption (acid levels, metformin) be affecting B12 intake?'
      ]
    }
  };

  /**
   * Evaluates a test value against standard clinical ranges.
   * Returns classification, percentage on scale (0-100), status label, and color tone.
   */
  function evaluateTestValue(testId, rawValue, unitId, demographic) {
    var test = TESTS[testId];
    if (!test) return null;

    demographic = demographic || 'male';
    var range = test.ranges[demographic] || test.ranges.male;
    var scale = test.scale || { displayMin: 0, displayMax: 100 };

    // Unit conversion to base unit
    var unitObj = test.units.find(function (u) { return u.id === unitId; }) || test.units[0];
    var baseValue = rawValue * (unitObj.factor || 1);

    var status = 'normal';
    var label = 'Normal Range';
    var tone = 'normal'; // low, high, critical-low, critical-high, normal

    if (range.lowCrit && baseValue <= range.lowCrit) {
      status = 'low_critical';
      label = 'Significantly Low';
      tone = 'critical';
    } else if (baseValue < range.min) {
      status = 'low';
      label = 'Below Normal (Low)';
      tone = 'warning';
    } else if (range.highCrit && baseValue >= range.highCrit) {
      status = 'high_critical';
      label = 'Significantly Elevated';
      tone = 'critical';
    } else if (baseValue > range.max) {
      status = 'high';
      label = 'Above Normal (High)';
      tone = 'warning';
    } else {
      status = 'normal';
      label = 'Within Healthy Range';
      tone = 'normal';
    }

    // Calculate percentage on display scale
    var dMin = scale.displayMin;
    var dMax = scale.displayMax;
    var clamped = Math.max(dMin, Math.min(dMax, baseValue));
    var percent = Math.round(((clamped - dMin) / (dMax - dMin)) * 100);

    // Range marker percentages
    var minPercent = Math.round(((range.min - dMin) / (dMax - dMin)) * 100);
    var maxPercent = Math.round(((range.max - dMin) / (dMax - dMin)) * 100);

    var explanation = '';
    if (status === 'low' || status === 'low_critical') {
      explanation = test.lowMeaning;
    } else if (status === 'high' || status === 'high_critical') {
      explanation = test.highMeaning;
    } else {
      explanation = test.normalMeaning;
    }

    return {
      test: test,
      baseValue: baseValue,
      rawValue: rawValue,
      unit: unitObj,
      demographic: demographic,
      range: range,
      status: status,
      label: label,
      tone: tone,
      percent: percent,
      minPercent: minPercent,
      maxPercent: maxPercent,
      explanation: explanation
    };
  }

  global.LAB_DATA = {
    categories: CATEGORIES,
    tests: TESTS,
    evaluate: evaluateTestValue
  };

})(typeof window !== 'undefined' ? window : this);
