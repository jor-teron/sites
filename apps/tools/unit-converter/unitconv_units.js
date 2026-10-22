/* Unit Converter data. Each unit: [id, label, factor-to-base] (base listed per category).
   Temperature is affine: [id, label, scale, offset] meaning base(K) = (v + offset) * scale.
   Indian land units vary by state; values documented in unitconv_readme.md. */
window.UNITS = (function () {
  const SQFT = 0.09290304, FT = 0.3048, IN = 0.0254, LB = 0.45359237, GAL = 3.785411784e-3, UKGAL = 4.54609e-3;
  return [
    { id: 'length', name: 'Length', base: 'm', def: ['km', 'mi'], u: [
      ['mm', 'Millimetre (mm)', 1e-3], ['cm', 'Centimetre (cm)', 1e-2], ['m', 'Metre (m)', 1], ['km', 'Kilometre (km)', 1e3],
      ['in', 'Inch (in)', IN], ['ft', 'Foot (ft)', FT], ['yd', 'Yard (yd)', 0.9144], ['mi', 'Mile (mi)', 1609.344],
      ['nmi', 'Nautical mile (nmi)', 1852], ['um', 'Micrometre (µm)', 1e-6], ['nm', 'Nanometre (nm)', 1e-9]] },
    { id: 'weight', name: 'Weight', base: 'kg', def: ['kg', 'lb'], u: [
      ['mg', 'Milligram (mg)', 1e-6], ['g', 'Gram (g)', 1e-3], ['kg', 'Kilogram (kg)', 1], ['t', 'Tonne (t)', 1e3],
      ['oz', 'Ounce (oz)', LB / 16], ['lb', 'Pound (lb)', LB], ['st', 'Stone (st)', LB * 14],
      ['quintal', 'Quintal (q)', 100], ['ct', 'Carat (ct)', 2e-4], ['tola', 'Tola (11.664 g)', 0.011664]] },
    { id: 'temp', name: 'Temperature', base: 'K', affine: true, def: ['C', 'F'], u: [
      ['C', 'Celsius (°C)', 1, 273.15], ['F', 'Fahrenheit (°F)', 5 / 9, 459.67], ['K', 'Kelvin (K)', 1, 0]] },
    { id: 'area', name: 'Area', base: 'm²', def: ['acre', 'm2'], u: [
      ['cm2', 'Square cm (cm²)', 1e-4], ['m2', 'Square metre (m²)', 1], ['km2', 'Square km (km²)', 1e6],
      ['in2', 'Square inch (in²)', IN * IN], ['ft2', 'Square foot (ft²)', SQFT], ['yd2', 'Square yard (yd²)', 0.83612736],
      ['acre', 'Acre', 4046.8564224], ['ha', 'Hectare (ha)', 1e4], ['mi2', 'Square mile (mi²)', 2589988.110336],
      ['guntha', 'Guntha (1089 ft²)', 1089 * SQFT], ['cent', 'Cent (435.6 ft²)', 435.6 * SQFT],
      ['bigha_as', 'Bigha – Assam (14,400 ft²)', 14400 * SQFT], ['katha_as', 'Katha – Assam (2,880 ft²)', 2880 * SQFT],
      ['lessa_as', 'Lessa – Assam (144 ft²)', 144 * SQFT],
      ['bigha_wb', 'Bigha – West Bengal (14,400 ft²)', 14400 * SQFT], ['katha_wb', 'Katha – West Bengal (720 ft²)', 720 * SQFT],
      ['bigha_br', 'Bigha – Bihar (27,220 ft²)', 27220 * SQFT],
      ['bigha_up', 'Bigha – Uttar Pradesh (27,000 ft²)', 27000 * SQFT],
      ['bigha_rj', 'Bigha – Rajasthan pucca (27,225 ft²)', 27225 * SQFT],
      ['bigha_gj', 'Bigha – Gujarat (17,424 ft²)', 17424 * SQFT]] },
    { id: 'volume', name: 'Volume', base: 'L', def: ['L', 'gal'], u: [
      ['ml', 'Millilitre (mL)', 1e-3], ['L', 'Litre (L)', 1], ['m3', 'Cubic metre (m³)', 1e3], ['cm3', 'Cubic cm (cm³)', 1e-3],
      ['tsp', 'Teaspoon (US)', GAL * 1000 / 768], ['tbsp', 'Tablespoon (US)', GAL * 1000 / 256], ['cup', 'Cup (US)', GAL * 1000 / 16],
      ['floz', 'Fluid ounce (US)', GAL * 1000 / 128], ['pt', 'Pint (US)', GAL * 1000 / 8], ['qt', 'Quart (US)', GAL * 1000 / 4],
      ['gal', 'Gallon (US)', GAL * 1000], ['ukgal', 'Gallon (UK)', UKGAL * 1000], ['ft3', 'Cubic foot (ft³)', FT * FT * FT * 1000]] },
    { id: 'speed', name: 'Speed', base: 'm/s', def: ['kmh', 'mph'], u: [
      ['ms', 'Metre/second (m/s)', 1], ['kmh', 'Km/hour (km/h)', 1 / 3.6], ['mph', 'Miles/hour (mph)', 0.44704],
      ['fts', 'Feet/second (ft/s)', FT], ['kn', 'Knot (kn)', 1852 / 3600], ['mach', 'Mach (sea level, 343 m/s)', 343]] },
    { id: 'time', name: 'Time', base: 's', def: ['h', 'min'], u: [
      ['ms', 'Millisecond (ms)', 1e-3], ['s', 'Second (s)', 1], ['min', 'Minute (min)', 60], ['h', 'Hour (h)', 3600],
      ['d', 'Day', 86400], ['wk', 'Week', 604800], ['mo', 'Month (30.44 d)', 2629746], ['yr', 'Year (365.25 d)', 31557600]] },
    { id: 'data', name: 'Data', base: 'B', def: ['GiB', 'MiB'], u: [
      ['bit', 'Bit (b)', 1 / 8], ['B', 'Byte (B)', 1],
      ['KB', 'Kilobyte KB (1000)', 1e3], ['MB', 'Megabyte MB (1000²)', 1e6], ['GB', 'Gigabyte GB (1000³)', 1e9], ['TB', 'Terabyte TB (1000⁴)', 1e12],
      ['KiB', 'Kibibyte KiB (1024)', 1024], ['MiB', 'Mebibyte MiB (1024²)', 1048576], ['GiB', 'Gibibyte GiB (1024³)', 1073741824], ['TiB', 'Tebibyte TiB (1024⁴)', 1099511627776],
      ['Mbit', 'Megabit Mb (10⁶ bits)', 125000]] },
    { id: 'number', name: 'Number', base: '1', def: ['crore', 'lakh'], u: [
      ['one', 'One', 1], ['hundred', 'Hundred', 100], ['thousand', 'Thousand', 1e3], ['lakh', 'Lakh (1,00,000)', 1e5],
      ['million', 'Million', 1e6], ['crore', 'Crore (1,00,00,000)', 1e7], ['billion', 'Billion', 1e9],
      ['arab', 'Arab (100 crore)', 1e9], ['trillion', 'Trillion', 1e12], ['kharab', 'Kharab (100 arab)', 1e11]] }
  ];
})();
