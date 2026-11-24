/**
 * Lab & Scan Report - Imaging & Radiology Reference Database (scans-data.js)
 * Covers CT Hounsfield Units, radiology terminology, body region anatomy,
 * and plain-language report decoding for patients.
 */
(function (global) {
  'use strict';

  var MODALITIES = [
    {
      id: 'ct',
      name: 'CT Scan (Computed Tomography)',
      badge: 'X-Ray Slices',
      desc: 'Takes hundreds of fast cross-sectional X-ray pictures synthesized by computer into high-detail 3D slices. Ideal for bones, lungs, chest, acute bleeding, and abdominal organs.',
      radiation: 'Uses ionizing radiation (carefully dosed).',
      contrastInfo: 'Often uses IV iodine contrast or oral contrast drink to make blood vessels and digestive tract stand out.'
    },
    {
      id: 'mri',
      name: 'MRI (Magnetic Resonance Imaging)',
      badge: 'Magnetic Fields',
      desc: 'Uses powerful magnetic fields and radio waves (no radiation) to create exceptional contrast between soft tissues like the brain, spinal cord, ligaments, tendons, and discs.',
      radiation: 'No radiation.',
      contrastInfo: 'May use gadolinium-based contrast dye if evaluating inflammation, tumors, or blood vessels.'
    },
    {
      id: 'usg',
      name: 'Ultrasound (Sonography)',
      badge: 'Sound Waves',
      desc: 'Bounces high-frequency sound waves off organs to create live moving pictures. Perfect for pregnancy, gallbladder stones, kidneys, thyroid, and blood flow (Doppler).',
      radiation: 'Completely zero radiation.',
      contrastInfo: 'Rarely uses contrast; requires ultrasound gel for acoustic contact.'
    },
    {
      id: 'xray',
      name: 'X-Ray (Radiography)',
      badge: 'Plain Film',
      desc: 'Quick 2D snapshot where dense tissues (bones) block X-rays and show up white, while air (lungs) shows up black. Excellent initial check for fractures and chest infections.',
      radiation: 'Very low radiation dose.',
      contrastInfo: 'Usually no contrast, except barium swallow/enema studies.'
    }
  ];

  var HOUNSFIELD_UNITS = [
    { min: -1050, max: -900, name: 'Air', hu: -1000, color: '#111827', textColor: '#f9fafb', desc: 'Trachea, lung airways, sinuses, and outside air. Appears pure jet black.' },
    { min: -850, max: -450, name: 'Lung Parenchyma', hu: -600, color: '#374151', textColor: '#f9fafb', desc: 'Spongy, air-filled healthy lung tissue. Appears dark mottled charcoal gray.' },
    { min: -140, max: -30, name: 'Fat', hu: -80, color: '#4b5563', textColor: '#f9fafb', desc: 'Subcutaneous fat under the skin and around abdominal organs. Appears darker gray.' },
    { min: -10, max: +15, name: 'Pure Water / Fluid', hu: 0, color: '#6b7280', textColor: '#f9fafb', desc: 'Water calibration baseline (0 HU). Simple clear cysts, urine, spinal fluid.' },
    { min: +16, max: +30, name: 'Proteinaceous Fluid', hu: 20, color: '#9ca3af', textColor: '#111827', desc: 'Thicker fluids, mucus, exudates, and simple bile.' },
    { min: +31, max: +55, name: 'Soft Tissue & Muscle', hu: 40, color: '#d1d5db', textColor: '#111827', desc: 'Liver, spleen, pancreas, kidneys, and skeletal muscle. Medium soft gray.' },
    { min: +56, max: +85, name: 'Acute Clotted Blood', hu: 70, color: '#f3f4f6', textColor: '#111827', desc: 'Fresh clotted hematoma or acute bleeding. Appears distinctly bright white/gray.' },
    { min: +86, max: +250, name: 'Contrast Enhancement', hu: 150, color: '#ffffff', textColor: '#111827', desc: 'Blood vessels filled with intravenous iodinated dye.' },
    { min: +300, max: +1000, name: 'Cancellous & Cortical Bone', hu: 700, color: '#ffffff', textColor: '#111827', desc: 'Dense mineralized bone, dental enamel, calcified plaques. Vivid solid white.' }
  ];

  var SCAN_TERMS = [
    {
      term: 'Unremarkable',
      aliases: ['unremarkable', 'within normal limits', 'no abnormality'],
      modality: 'All Scans',
      category: 'Normal Findings',
      plainEnglish: 'Normal and healthy; nothing of concern was seen.',
      meaning: 'Doctors use "unremarkable" to mean that the structure looks completely standard and without any signs of disease, injury, or abnormality. It is the best possible finding on a report!',
      isReassuring: true
    },
    {
      term: 'Hypoattenuating / Hypodense',
      aliases: ['hypoattenuating', 'hypoattenuation', 'hypodense', 'hypodensity'],
      modality: 'CT Scan',
      category: 'Density & Appearance',
      plainEnglish: 'Appears darker than the surrounding normal organ tissue.',
      meaning: 'Because X-rays pass through it more easily, it has lower density. Very common causes include harmless fluid cysts, fatty deposits (like hepatic steatosis / fatty liver), edema, or an older healed area.',
      isReassuring: false
    },
    {
      term: 'Hyperattenuating / Hyperdense',
      aliases: ['hyperattenuating', 'hyperattenuation', 'hyperdense', 'hyperdensity'],
      modality: 'CT Scan',
      category: 'Density & Appearance',
      plainEnglish: 'Appears brighter or denser than the surrounding tissue.',
      meaning: 'Blocks more X-rays than normal tissue. Very common with bone, calcium deposits, kidney stones, fresh blood, or intravenous contrast dye.',
      isReassuring: false
    },
    {
      term: 'Ground-Glass Opacity (GGO)',
      aliases: ['ground-glass opacity', 'ground glass opacity', 'ground-glass', 'ground glass', 'ggo'],
      modality: 'Chest CT',
      category: 'Lungs & Thorax',
      plainEnglish: 'Hazy, cloudy gray patch in the lung where vessels are still visible beneath.',
      meaning: 'Like looking through frosted bathroom glass. Air in the lung alveoli is partially replaced by fluid or inflammation. Common in viral infections (pneumonia, Covid, flu), bronchitis, or resolving fluid.',
      isReassuring: false
    },
    {
      term: 'Consolidation',
      aliases: ['consolidation', 'consolidative'],
      modality: 'Chest CT / X-Ray',
      category: 'Lungs & Thorax',
      plainEnglish: 'Area of lung that has filled completely with liquid or inflammatory exudate instead of air.',
      meaning: 'The lung tissue appears dense and solid white. Classic sign of acute pneumonia, infection, or localized fluid pooling.',
      isReassuring: false
    },
    {
      term: 'Atelectasis',
      aliases: ['atelectasis', 'atelectatic', 'subsegmental atelectasis'],
      modality: 'Chest CT / X-Ray',
      category: 'Lungs & Thorax',
      plainEnglish: 'Temporary partial collapse or under-inflation of small lung air sacs.',
      meaning: 'Extremely common and often minor. Frequently happens after lying down during a scan, shallow breathing, mild mucus plugging, or after general anesthesia. Deep breathing exercises usually reopen them.',
      isReassuring: true
    },
    {
      term: 'Pleural Effusion',
      aliases: ['pleural effusion', 'effusion'],
      modality: 'Chest CT / X-Ray / USG',
      category: 'Lungs & Thorax',
      plainEnglish: 'Excess fluid collection in the space between the lung lining and the chest wall.',
      meaning: 'A pool of fluid surrounding the lung. Can be caused by viral or bacterial lung infections, heart strain, kidney fluid overload, or inflammation.',
      isReassuring: false
    },
    {
      term: 'Calcification / Granuloma',
      aliases: ['calcification', 'calcified', 'calcified granuloma', 'granuloma'],
      modality: 'All Scans',
      category: 'Bones & Deposits',
      plainEnglish: 'Hardened calcium deposit; often an internal healed "scar".',
      meaning: 'A calcified granuloma in the lung or liver is almost always a healed "fossil" from an old minor infection years ago. In blood vessels (coronary calcium), it reflects atherosclerosis plaques.',
      isReassuring: true
    },
    {
      term: 'Contrast Enhancement',
      aliases: ['contrast enhancement', 'hyperenhancing', 'enhancing lesion', 'post-contrast enhancement'],
      modality: 'CT & MRI',
      category: 'Contrast & Blood Flow',
      plainEnglish: 'Tissue absorbs injected dye and lights up brightly on the scan.',
      meaning: 'Shows areas with rich active blood flow or leaky capillaries, which helps radiologists distinguish solid tissue from fluid-filled cysts, or locate active inflammation.',
      isReassuring: false
    },
    {
      term: 'Nodule vs Mass',
      aliases: ['nodule', 'pulmonary nodule', 'lung nodule', 'mass'],
      modality: 'All Scans',
      category: 'Lesions & Sizes',
      plainEnglish: 'A small round spot (nodule under 3 cm) vs a larger lump (mass over 3 cm).',
      meaning: 'A nodule is a round tissue spot smaller than 3 cm (about the size of a coin). Most small lung or thyroid nodules are benign scars, cysts, or lymph nodes, though doctors monitor their size over time.',
      isReassuring: false
    },
    {
      term: 'Simple Cyst',
      aliases: ['simple cyst', 'cortical cyst', 'renal cyst', 'hepatic cyst'],
      modality: 'Ultrasound / CT / MRI',
      category: 'Lesions & Sizes',
      plainEnglish: 'Harmless, smooth fluid-filled balloon or bubble.',
      meaning: 'Simple cysts are extraordinarily common in healthy kidneys and liver as people age. They have paper-thin walls, contain clear water, and are overwhelmingly benign.',
      isReassuring: true
    },
    {
      term: 'Anechoic',
      aliases: ['anechoic', 'anechoic lesion'],
      modality: 'Ultrasound',
      category: 'Ultrasound Terms',
      plainEnglish: 'Appears completely jet black on ultrasound with no sound echoes.',
      meaning: 'Sound waves pass right through without bouncing back. Indicates pure clear liquid, such as urine in the bladder, bile in the gallbladder, or a simple cyst.',
      isReassuring: true
    },
    {
      term: 'Hyperechoic with Acoustic Shadowing',
      aliases: ['acoustic shadowing', 'hyperechoic with shadowing', 'hyperechoic focus'],
      modality: 'Ultrasound',
      category: 'Ultrasound Terms',
      plainEnglish: 'Bright white surface followed by a dark shadow trail beneath.',
      meaning: 'Dense material blocks ultrasound waves completely, casting a shadow like a tree in sunlight. The hallmark signature of gallstones or kidney stones.',
      isReassuring: false
    },
    {
      term: 'T1 & T2 Hyperintensity',
      aliases: ['t1 hyperintense', 't2 hyperintense', 't2 hyperintensity', 't1 hyperintensity'],
      modality: 'MRI',
      category: 'MRI Signals',
      plainEnglish: 'Bright white signal on specific MRI magnetic timing sequences.',
      meaning: 'On T2-weighted MRI, fluid, edema, and cysts glow bright white. On T1-weighted MRI, fat, subacute blood breakdown, and high-protein fluids appear bright.',
      isReassuring: false
    },
    {
      term: 'Degenerative Disc Disease & Osteophytes',
      aliases: ['degenerative disc', 'osteophyte', 'osteophytes', 'disc bulge', 'spondylosis'],
      modality: 'Spine X-Ray / CT / MRI',
      category: 'Spine & Joints',
      plainEnglish: 'Normal age-related wear on spinal cushions and small bone spurs.',
      meaning: 'Spinal discs lose water content over decades, and small smooth bone spurs (osteophytes) form to stabilize joints. Present in almost all adults over 40 and often causes no pain.',
      isReassuring: true
    }
  ];

  /**
   * Finds HU level and tissue interpretation.
   */
  function evaluateHU(value) {
    var hu = parseInt(value, 10);
    if (isNaN(hu)) hu = 0;

    var matched = HOUNSFIELD_UNITS.find(function (item) {
      return hu >= item.min && hu <= item.max;
    });

    if (!matched) {
      if (hu < -1000) matched = HOUNSFIELD_UNITS[0];
      else matched = HOUNSFIELD_UNITS[HOUNSFIELD_UNITS.length - 1];
    }

    return {
      hu: hu,
      matched: matched
    };
  }

  /**
   * Search terms by keyword.
   */
  function searchTerms(query) {
    if (!query) return SCAN_TERMS;
    var q = query.toLowerCase().trim();
    return SCAN_TERMS.filter(function (item) {
      return item.term.toLowerCase().indexOf(q) !== -1 ||
             item.plainEnglish.toLowerCase().indexOf(q) !== -1 ||
             item.meaning.toLowerCase().indexOf(q) !== -1 ||
             item.category.toLowerCase().indexOf(q) !== -1;
    });
  }

  global.SCANS_DATA = {
    modalities: MODALITIES,
    hounsfieldUnits: HOUNSFIELD_UNITS,
    terms: SCAN_TERMS,
    evaluateHU: evaluateHU,
    searchTerms: searchTerms
  };

})(typeof window !== 'undefined' ? window : this);
