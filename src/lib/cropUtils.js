


export const SMART_CROPS = [
  { key: 'pakcoy', name: 'Pakcoy', nameEn: 'Bok Choy', cycle: 35, soil: '70-90%', temp: '20-28°C', desc: 'Cocok untuk hidroponik NFT & DFT' },
  { key: 'lettuce', name: 'Selada', nameEn: 'Lettuce', cycle: 35, soil: '65-85%', temp: '18-26°C', desc: 'Renyah dan menyukai suhu sejuk' },
  { key: 'spinach', name: 'Bayam', nameEn: 'Spinach', cycle: 28, soil: '60-80%', temp: '16-24°C', desc: 'Siklus panen sangat cepat' },
  { key: 'water_spinach', name: 'Kangkung', nameEn: 'Water Spinach', cycle: 30, soil: '75-95%', temp: '24-32°C', desc: 'Tahan panas dan butuh kelembapan tinggi' },
  { key: 'tomato', name: 'Tomat', nameEn: 'Tomato', cycle: 80, soil: '55-75%', temp: '21-29°C', desc: 'Tanaman buah dengan nutrisi bertahap' },
  { key: 'custom', name: 'Kustom', nameEn: 'Custom', cycle: 45, soil: '60-80%', temp: '20-30°C', desc: 'Atur varietas dan siklus Anda sendiri' },
];

export const CROP_DEFAULTS = {
  lettuce:      { minSoil: 65, maxSoil: 85, minTemp: 18, maxTemp: 26, minHum: 60, maxHum: 80 },
  pakcoy:       { minSoil: 70, maxSoil: 90, minTemp: 20, maxTemp: 28, minHum: 65, maxHum: 85 },
  spinach:      { minSoil: 60, maxSoil: 80, minTemp: 16, maxTemp: 24, minHum: 55, maxHum: 75 },
  water_spinach:{ minSoil: 75, maxSoil: 95, minTemp: 24, maxTemp: 32, minHum: 70, maxHum: 90 },
  tomato:       { minSoil: 55, maxSoil: 75, minTemp: 21, maxTemp: 29, minHum: 60, maxHum: 80 },
  custom:       { minSoil: 60, maxSoil: 80, minTemp: 24, maxTemp: 32, minHum: 70, maxHum: 90 },
};


export function getCropThresholds(cropProfile) {
  if (cropProfile?.useCustomThresholds) {
    const { optimalMoisture, optimalTemp, optimalHumidity } = cropProfile;
    return {
      minSoil: Math.max(0,   (optimalMoisture ?? 70) - 10),
      maxSoil: Math.min(100, (optimalMoisture ?? 70) + 10),
      minTemp: Math.max(0,   (optimalTemp     ?? 28) - 4),
      maxTemp: Math.min(50,  (optimalTemp     ?? 28) + 4),
      minHum:  Math.max(0,   (optimalHumidity ?? 80) - 10),
      maxHum:  Math.min(100, (optimalHumidity ?? 80) + 10),
    };
  }

  const name = (cropProfile?.cropName || '').toLowerCase();
  if (name.includes('selada')  || name.includes('lettuce'))      return CROP_DEFAULTS.lettuce;
  if (name.includes('pakcoy')  || name.includes('bok choy'))     return CROP_DEFAULTS.pakcoy;
  if (name.includes('bayam')   || name.includes('spinach'))      return CROP_DEFAULTS.spinach;
  if (name.includes('kangkung')|| name.includes('water spinach'))return CROP_DEFAULTS.water_spinach;
  if (name.includes('tomat')   || name.includes('tomato'))       return CROP_DEFAULTS.tomato;
  return CROP_DEFAULTS.custom;
}




export function computeHealthScore({ soilMoisture, humidity, temperature, lightLevel, thresholds }) {
  const { minSoil = 60, maxSoil = 80, minTemp = 24, maxTemp = 32, minHum = 70, maxHum = 90 } =
    thresholds || {};

  const rangeScore = (val, lo, hi, warnLow, warnHigh) => {
    if (val == null) return null;
    if (val >= lo && val <= hi) return 100;
    if (val < lo) return Math.max(0, 100 - ((lo - val)  / (lo - warnLow))  * 100);
    return            Math.max(0, 100 - ((val - hi)      / (warnHigh - hi)) * 100);
  };

  const scores = [
    { s: rangeScore(soilMoisture, minSoil, maxSoil, Math.max(0, minSoil - 30), Math.min(100, maxSoil + 20)), w: 0.35 },
    { s: rangeScore(humidity,     minHum,  maxHum,  Math.max(0, minHum  - 30), Math.min(100, maxHum  + 10)), w: 0.25 },
    { s: rangeScore(temperature,  minTemp, maxTemp, Math.max(0, minTemp - 14), Math.min(100, maxTemp + 13)), w: 0.25 },
    { s: rangeScore(lightLevel,   40, 80, 0, 100),                                                           w: 0.15 },
  ];

  let totalScore = 0, totalWeight = 0;
  for (const { s, w } of scores) {
    if (s != null) { totalScore += s * w; totalWeight += w; }
  }

  return totalWeight === 0 ? null : parseFloat((totalScore / totalWeight).toFixed(0));
}




export function getWmoInfo(code) {
  if (code === 0)    return { desc: 'Clear Sky',     emoji: '' };
  if (code <= 2)     return { desc: 'Partly Cloudy', emoji: '' };
  if (code === 3)    return { desc: 'Cloudy',         emoji: '' };
  if (code <= 48)    return { desc: 'Foggy',          emoji: '' };
  if (code <= 57)    return { desc: 'Drizzle',        emoji: '' };
  if (code <= 67)    return { desc: 'Rain',           emoji: '' };
  if (code <= 77)    return { desc: 'Snow',           emoji: '' };
  if (code <= 82)    return { desc: 'Rain Showers',   emoji: '' };
  if (code <= 86)    return { desc: 'Snow Showers',   emoji: '' };
  return                    { desc: 'Thunderstorm',   emoji: '' };
}


export function mapWmoToTheme(code, isDay) {
  if (code >= 51) return 'rainy';
  if (!isDay)     return 'night';
  return 'sunny';
}


export function convertOwmToWmo(code) {
  if (code >= 200 && code < 300) return 95;
  if (code >= 300 && code < 400) return 51;
  if (code >= 500 && code < 600) return 61;
  if (code >= 600 && code < 700) return 71;
  if (code >= 700 && code < 800) return 45;
  if (code === 800)               return 0;
  if (code === 801 || code === 802) return 1;
  if (code === 803 || code === 804) return 3;
  return 0;
}




export function formatRelativeTime(timestamp, lang) {
  if (!timestamp) return '';
  const mins = Math.floor((Date.now() - timestamp) / 60_000);
  if (mins < 1)  return lang === 'id' ? 'Baru saja'  : lang === 'ban' ? 'Wawu mangkin'        : 'Just now';
  if (mins < 60) return `${mins} ${lang === 'id' ? 'menit lalu' : lang === 'ban' ? 'menit sane lintang' : 'm ago'}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} ${lang === 'id' ? 'jam lalu'   : lang === 'ban' ? 'jam sane lintang'   : 'h ago'}`;
  const days = Math.floor(hrs / 24);
  return `${days} ${lang === 'id' ? 'hari lalu' : lang === 'ban' ? 'rahina sane lintang' : 'd ago'}`;
}
