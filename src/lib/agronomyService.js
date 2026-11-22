import { executeWithGeminiFallback, parseGeminiError, buildSensorTemplateText } from './geminiUtils';
import { clampCocopeatMoisture, findCropPreset, getCropThresholds, getLocalizedCropText } from './cropUtils';
import { getAiLanguageName, translateKey } from '../locales/translations';

const INCOMPATIBLE_CROP_TERMS = [
  'wortel', 'carrot', 'kentang', 'potato', 'singkong', 'cassava', 'ubi', 'sweet potato',
  'talas', 'taro', 'lobak', 'radish', 'bengkuang', 'bawang merah', 'kelapa', 'mangga',
  'durian', 'alpukat', 'jambu', 'jeruk', 'pisang', 'jagung', 'padi', 'tebu', 'semangka',
  'melon', 'labu', 'pumpkin', 'watermelon', 'bamboo', 'bambu', 'kaktus',
  '胡萝卜', '土豆', '马铃薯', '木薯', '红薯', '芋头', '萝卜', '洋葱', '椰子', '芒果',
  '榴莲', '牛油果', '香蕉', '玉米', '水稻', '甘蔗', '西瓜', '甜瓜', '南瓜', '竹子', '仙人掌',
  'telo', 'tela', 'kesela', 'gedang', 'biu', 'nyuh', 'pari', 'waluh',
];

const AGRONOMY_COPY = {
  en: {
    presetCompat: (climate) => `Suitable for cultivation in a vertical cocopeat hydroponic tower (${climate}).`,
    defaultCtx: 'Standard tropical vertical cocopeat tower setup',
    defaultAlts: ['Water Spinach', 'Bok Choy', 'Spinach'],
    customCrop: 'Custom Crop',
    defaultCompat: 'Shallow-to-moderate roots and compact canopy make it safe for vertical cocopeat towers.',
    defaultIncompat: 'This crop is unsuitable for standard narrow vertical cocopeat tower slots.',
    defaultClimate: 'Tropical / Moderate',
    defaultSubstrate: 'Rinsed cocopeat + perlite/rice husk charcoal (70:30)',
    defaultPlacement: 'Middle slots with even light exposure',
    defaultNote: 'Monitor cocopeat moisture regularly to prevent root hypoxia.',
    blockedReason: (name) => `${name} develops deep/large roots, tubers, or a heavy canopy unsuitable for narrow vertical cocopeat tower slots.`,
    fallbackCompat: (name) => `Standard agronomic estimate for cultivating ${name} in a vertical cocopeat substrate tower.`,
    fallbackPlacement: 'Middle slots with steady airflow and adequate sunlight',
    fallbackNote: 'Keep safe hysteresis bounds (58-73%) to prevent root saturation; relocate if peak temperatures exceed 30°C.',
    defaultCrop: 'Water Spinach',
    statusTags: '[HEALTHY]/[WARNING]/[CRITICAL]',
    featureCropRule: 'AI Crop Rules',
    featureDashboard: 'Dashboard Analysis',
    featureInsight: 'Analytics Insight',
  },
  id: {
    presetCompat: (climate) => `Cocok dibudidayakan pada menara hidroponik vertikal berbasis cocopeat (${climate}).`,
    defaultCtx: 'Kondisi menara vertikal cocopeat standar tropis',
    defaultAlts: ['Kangkung', 'Pakcoy', 'Bayam'],
    customCrop: 'Tanaman Kustom',
    defaultCompat: 'Berakar dangkal–sedang dan tajuk ringkas sehingga aman untuk menara vertikal cocopeat.',
    defaultIncompat: 'Tanaman ini kurang sesuai untuk slot menara vertikal cocopeat standar.',
    defaultClimate: 'Tropis / Sedang',
    defaultSubstrate: 'Cocopeat terbilas + perlite/sekam bakar (70:30)',
    defaultPlacement: 'Slot tengah dengan cahaya merata',
    defaultNote: 'Pantau kelembapan cocopeat berkala agar akar tidak kekurangan oksigen.',
    blockedReason: (name) => `${name} memiliki perakaran besar/dalam, umbi, atau bobot tajuk berat sehingga tidak sesuai untuk slot sempit menara vertikal cocopeat.`,
    fallbackCompat: (name) => `Estimasi agronomis standar untuk budidaya ${name} pada substrat cocopeat menara vertikal.`,
    fallbackPlacement: 'Slot tengah dengan sirkulasi udara baik dan cahaya cukup',
    fallbackNote: 'Gunakan aturan histeresis aman (58-73%) untuk mencegah akar jenuh air; sesuaikan posisi bila suhu puncak melewati 30°C.',
    defaultCrop: 'Kangkung',
    statusTags: '[SEHAT]/[PERINGATAN]/[KRITIS]',
    featureCropRule: 'Aturan Tanaman AI',
    featureDashboard: 'Analisis Beranda',
    featureInsight: 'Wawasan Analitik',
  },
  zh: {
    presetCompat: (climate) => `适合在垂直椰糠水培塔中种植（${climate}）。`,
    defaultCtx: '标准热带垂直椰糠种植塔环境',
    defaultAlts: ['空心菜', '小白菜（油菜）', '苋菜 / 菠菜'],
    customCrop: '自定义作物',
    defaultCompat: '根系浅至中等且冠层紧凑，适合垂直椰糠种植塔。',
    defaultIncompat: '该作物不适合标准的窄槽位垂直椰糠种植塔。',
    defaultClimate: '热带 / 温和',
    defaultSubstrate: '水洗椰糠 + 珍珠岩/稻壳炭 (70:30)',
    defaultPlacement: '光照均匀的中层槽位',
    defaultNote: '定期监测椰糠湿度，避免根系缺氧。',
    blockedReason: (name) => `${name} 根系粗深、具有块根或冠层过重，不适合垂直椰糠塔的窄槽位。`,
    fallbackCompat: (name) => `在垂直椰糠基质种植塔中培育 ${name} 的标准农艺估算配置。`,
    fallbackPlacement: '通风良好且光照充足的中层槽位',
    fallbackNote: '保持安全滞回范围（58-73%）以防根系积水缺氧；峰值温度超过 30°C 时请调整位置。',
    defaultCrop: '空心菜',
    statusTags: '[健康]/[警告]/[危急]',
    featureCropRule: 'AI 作物规则',
    featureDashboard: '首页分析',
    featureInsight: '分析洞察',
  },
  jv: {
    presetCompat: (climate) => `Cocog ditandur ing menara hidroponik vertikal nganggo media cocopeat (${climate}).`,
    defaultCtx: 'Kahanan menara vertikal cocopeat standar tropis',
    defaultAlts: ['Kangkung', 'Pakcoy', 'Bayem'],
    customCrop: 'Tanduran Kustom',
    defaultCompat: 'Oyode cethek nganti sedhengan lan godhonge ringkes saengga aman kanggo menara vertikal cocopeat.',
    defaultIncompat: 'Tanduran iki kurang cocog kanggo slot menara vertikal cocopeat standar.',
    defaultClimate: 'Tropis / Sedhengan',
    defaultSubstrate: 'Cocopeat resik + perlite/sekam obong (70:30)',
    defaultPlacement: 'Slot tengah kanthi cahya sing rata',
    defaultNote: 'Pantau kelembapan cocopeat kanthi rutin supaya oyod ora kekurangan oksigen.',
    blockedReason: (name) => `${name} nduweni oyod gedhe/jero, umbi, utawa bobot tajuk abot saengga ora cocog kanggo slot ciyut menara vertikal cocopeat.`,
    fallbackCompat: (name) => `Perkiraan agronomis standar kanggo budidaya ${name} ing media cocopeat menara vertikal.`,
    fallbackPlacement: 'Slot tengah kanthi sirkulasi hawa apik lan cahya cukup',
    fallbackNote: 'Jaga wates histeresis aman (58-73%) supaya oyod ora kebacut teles; pindah panggonan yen suhu puncak ngluwihi 30°C.',
    defaultCrop: 'Kangkung',
    statusTags: '[SEHAT]/[PERINGATAN]/[KRITIS]',
    featureCropRule: 'Aturan Tanduran AI',
    featureDashboard: 'Analisis Beranda',
    featureInsight: 'Wawasan Analitik',
  },
  ban: {
    presetCompat: (climate) => `Patut katandur ring menara hidroponik vertikal madasar cocopeat (${climate}).`,
    defaultCtx: 'Kondisi menara vertikal cocopeat standar tropis',
    defaultAlts: ['Kangkung', 'Pakcoy', 'Bayem'],
    customCrop: 'Tanduran Kustom',
    defaultCompat: 'Akah dangkal–sedeng lan tajuk ringkes mawinan aman antuk menara vertikal cocopeat.',
    defaultIncompat: 'Tanduran puniki kirang patut antuk slot menara vertikal cocopeat standar.',
    defaultClimate: 'Tropis / Sedeng',
    defaultSubstrate: 'Cocopeat kedas + perlite/sekam puwun (70:30)',
    defaultPlacement: 'Slot tengah antuk sunar sane rata',
    defaultNote: 'Pantau kelembaban cocopeat berkala mangda akah nenten kirangan oksigen.',
    blockedReason: (name) => `${name} madue akah ageng/dalem, umbi, utawi tajuk baat mawinan nenten patut antuk slot sempit menara vertikal cocopeat.`,
    fallbackCompat: (name) => `Estimasi agronomis standar antuk budidaya ${name} ring media cocopeat menara vertikal.`,
    fallbackPlacement: 'Slot tengah antuk sirkulasi angin becik lan sunar cukup',
    fallbackNote: 'Anggen wates histeresis aman (58-73%) mangda akah nenten jenuh toya; geser genah yan suhu puncak ngalintangin 30°C.',
    defaultCrop: 'Kangkung',
    statusTags: '[SEHAT]/[PILINGET]/[KRITIS]',
    featureCropRule: 'Aturan Tanduran AI',
    featureDashboard: 'Analisis Beranda',
    featureInsight: 'Wawasan Analitik',
  },
};

function getCopy(lang) {
  return AGRONOMY_COPY[lang] || AGRONOMY_COPY.en;
}

const BENCHMARK_PROMPT_SECTION = `1. Kangkung / Water Spinach (Ipomoea aquatica) | Climate: Tropical / Lowland | Harvest: 21-30 Days | Moisture: 65-80% | Temp: 25-30°C | Note: Highly heat-tolerant and thrives in moist cocopeat; ideal as the fastest default crop profile.
2. Pakcoy / Bok Choy (Brassica rapa subsp. chinensis) | Climate: Tropical / Moderate | Harvest: 25-35 Days | Moisture: 60-75% | Temp: 19-27°C (max 30°C) | Note: Evapotranspiration surges close to harvest; keep moisture steady during weeks 3 and 4.
3. Bayam / Spinach (Amaranthus tricolor) | Climate: Tropical / Moderate | Harvest: 20-30 Days | Moisture: 55-70% | Temp: 20-28°C | Note: Pure cocopeat is too dense for spinach roots; use a 70:30 cocopeat and rice husk charcoal/perlite mix.
4. Kemangi / Sweet Basil (Ocimum basilicum) | Climate: Tropical / Warm | Harvest: 28-35 Days (continuous) | Moisture: 50-65% | Temp: 23-30°C | Note: Prone to root rot if overly saturated; requires longer dry-back intervals between watering cycles.
5. Selada / Lettuce (Lactuca sativa) | Climate: Cool / Indoor | Harvest: 29-35 Days | Moisture: 55-70% | Temp: 18-25°C (max 28°C) | Note: Temperatures above 28°C trigger bitter leaves and early bolting; place on the cooler, shaded side.
6. Mint (Mentha spp.) | Climate: Cool / Moderate | Harvest: 30-40 Days (continuous) | Moisture: 60-75% | Temp: 18-26°C | Note: Aggressive root growth; best grown in isolated slots so it does not choke adjacent plants.
7. Seledri / Celery (Apium graveolens) | Climate: Cool / Indoor | Harvest: 50-60 Days | Moisture: 60-75% | Temp: 16-24°C | Note: Very shallow roots wilt quickly if cocopeat dries out; growth slows down above 28°C.
8. Stroberi / Strawberry (Fragaria x ananassa) | Climate: Cool / Controlled | Harvest: 65-75 Days (continuous) | Moisture: 55-70% | Temp: 18-24°C | Note: Highly productive in vertical cocopeat towers, though flower and fruit quality drops sharply above 26-28°C.`;

function buildRuleFromPreset(preset, lang = 'en') {
  const copy = getCopy(lang);
  const loc = getLocalizedCropText(preset, lang);
  return {
    plant_name: loc.name,
    scientific_name: preset.scientificName,
    is_compatible: true,
    compatibility_reason: copy.presetCompat(loc.climate),
    alternative_plants: [],
    climate_adaptation: loc.climate,
    harvest: {
      min_hst: preset.minHst,
      max_hst: preset.maxHst,
      harvest_type: preset.harvestType,
    },
    moisture_substrate_pct: {
      ideal_min: preset.minSoil,
      ideal_max: preset.maxSoil,
      pump_on_threshold: preset.minSoil,
      pump_off_threshold: preset.maxSoil,
      critical_dry_alert: preset.criticalDry,
      overwater_alert: preset.overwaterAlert,
    },
    temp_ideal_c: {
      ideal_min: preset.minTemp,
      ideal_max: preset.maxTemp,
      max_tolerance: preset.maxTolerance,
    },
    vertical_cocopeat_guide: {
      substrate_mix: loc.substrateMix,
      tower_placement: loc.towerPlacement,
      technical_note: loc.technicalNote,
    },
  };
}

function buildRulePrompt(cropName, environmentContext, lang = 'en') {
  const copy = getCopy(lang);
  const ctxText = (environmentContext || '').trim() || copy.defaultCtx;
  const langName = getAiLanguageName(lang);

  return `# ROLE & OBJECTIVE
You are an AI Agronomist and Vertical Cocopeat Hydroponic Systems Architect for the Enzoponik platform. Generate a new crop rule configuration that is agronomically accurate, safe for automated irrigation, and calibrated against Enzoponik's reference benchmark.

# REFERENCE BENCHMARK (CALIBRATION)
Use these 8 reference crop profiles to calibrate value ranges, technical note style, and cocopeat substrate safety limits:

${BENCHMARK_PROMPT_SECTION}

# STRICT RULES & GUARDRAILS
1. Vertical Feasibility Gate:
   - Evaluate whether the requested crop is suitable for a vertical cocopeat tower (shallow/moderate roots, compact canopy, lightweight).
   - If NOT SUITABLE (e.g., large root tubers such as carrots/potatoes/cassava, trees, or heavy unsupported vines), set "is_compatible": false, explain why in "compatibility_reason", and provide 2-3 suitable similar alternatives in "alternative_plants". Do not force irrigation rules for incompatible crops.
2. Cocopeat Physics & Pump Hysteresis:
   - Ideal moisture range MUST stay strictly between 50% and 80%. NEVER set a continuous moisture target above 80% (causes root hypoxia and rot).
   - pump_on_threshold = lower bound of ideal moisture (pump starts).
   - pump_off_threshold = upper bound of ideal moisture (pump stops).
   - critical_dry_alert = at least 10-15% below pump_on_threshold (typically 35-45%).
3. Agronomic Accuracy & Language:
   - Use standard common varieties suited for vertical hydroponics.
   - Write ALL descriptive text strictly in ${langName} — concise, concrete, and actionable.
   - Avoid extreme invented numbers; align values with biological traits and the benchmarks above.

# OUTPUT FORMAT
Return ONLY a valid JSON object with no intro text or markdown fences outside JSON:

{
  "plant_name": "string (Common name in ${langName})",
  "scientific_name": "string (Latin binomial)",
  "is_compatible": true,
  "compatibility_reason": "string (Brief reason for vertical cocopeat feasibility)",
  "alternative_plants": ["string (populate ONLY when is_compatible is false, otherwise empty array)"],
  "climate_adaptation": "string (e.g. Tropical / Lowland, Cool / Indoor)",
  "harvest": {
    "min_hst": 0,
    "max_hst": 0,
    "harvest_type": "sekali_panen | panen_berkala"
  },
  "moisture_substrate_pct": {
    "ideal_min": 0,
    "ideal_max": 0,
    "pump_on_threshold": 0,
    "pump_off_threshold": 0,
    "critical_dry_alert": 0,
    "overwater_alert": 85
  },
  "temp_ideal_c": {
    "ideal_min": 0,
    "ideal_max": 0,
    "max_tolerance": 0
  },
  "vertical_cocopeat_guide": {
    "substrate_mix": "string (e.g. Pure rinsed cocopeat or Cocopeat + perlite/rice husk charcoal 70:30)",
    "tower_placement": "string (Recommended tower slots: upper/middle/lower or shaded/bright side)",
    "technical_note": "string (1-2 dense sentences about root risk, temperature, or critical stages matching the benchmark table style)"
  }
}

# USER INPUT
Create an Enzoponik configuration rule for:
- Crop Name: ${cropName}
- Environment Context (optional): ${ctxText}`;
}

function normalizeAiCropRule(rawJson, fallbackName, lang = 'en') {
  const copy = getCopy(lang);
  const isCompatible = rawJson?.is_compatible !== false;
  const minHst = Math.max(10, Math.min(180, Math.round(Number(rawJson?.harvest?.min_hst) || 28)));
  const maxHst = Math.max(minHst, Math.min(180, Math.round(Number(rawJson?.harvest?.max_hst) || Math.max(minHst + 7, 35))));
  const harvestType = rawJson?.harvest?.harvest_type === 'panen_berkala' ? 'panen_berkala' : 'sekali_panen';

  const mRaw = rawJson?.moisture_substrate_pct || {};
  const clampedMoisture = clampCocopeatMoisture(
    mRaw.pump_on_threshold ?? mRaw.ideal_min ?? 55,
    mRaw.pump_off_threshold ?? mRaw.ideal_max ?? 75,
    mRaw.critical_dry_alert
  );

  const tRaw = rawJson?.temp_ideal_c || {};
  const tMin = Math.max(12, Math.min(32, Math.round(Number(tRaw.ideal_min) || 20)));
  const tMax = Math.max(tMin + 2, Math.min(35, Math.round(Number(tRaw.ideal_max) || 28)));
  const tTol = Math.max(tMax, Math.min(38, Math.round(Number(tRaw.max_tolerance) || tMax + 2)));

  return {
    plant_name: String(rawJson?.plant_name || fallbackName || copy.customCrop).trim(),
    scientific_name: String(rawJson?.scientific_name || '').trim(),
    is_compatible: isCompatible,
    compatibility_reason: String(
      rawJson?.compatibility_reason ||
      (isCompatible ? copy.defaultCompat : copy.defaultIncompat)
    ).trim(),
    alternative_plants: isCompatible
      ? []
      : (Array.isArray(rawJson?.alternative_plants) && rawJson.alternative_plants.length > 0
          ? rawJson.alternative_plants.slice(0, 3).map((x) => String(x))
          : copy.defaultAlts),
    climate_adaptation: String(rawJson?.climate_adaptation || copy.defaultClimate).trim(),
    harvest: {
      min_hst: minHst,
      max_hst: maxHst,
      harvest_type: harvestType,
    },
    moisture_substrate_pct: isCompatible
      ? {
          ideal_min: clampedMoisture.idealMin,
          ideal_max: clampedMoisture.idealMax,
          pump_on_threshold: clampedMoisture.pumpOnThreshold,
          pump_off_threshold: clampedMoisture.pumpOffThreshold,
          critical_dry_alert: clampedMoisture.criticalDryAlert,
          overwater_alert: clampedMoisture.overwaterAlert,
        }
      : {
          ideal_min: 0,
          ideal_max: 0,
          pump_on_threshold: 0,
          pump_off_threshold: 0,
          critical_dry_alert: 0,
          overwater_alert: 85,
        },
    temp_ideal_c: isCompatible
      ? { ideal_min: tMin, ideal_max: tMax, max_tolerance: tTol }
      : { ideal_min: 0, ideal_max: 0, max_tolerance: 0 },
    vertical_cocopeat_guide: {
      substrate_mix: String(rawJson?.vertical_cocopeat_guide?.substrate_mix || copy.defaultSubstrate).trim(),
      tower_placement: String(rawJson?.vertical_cocopeat_guide?.tower_placement || copy.defaultPlacement).trim(),
      technical_note: String(rawJson?.vertical_cocopeat_guide?.technical_note || copy.defaultNote).trim(),
    },
  };
}

function buildFallbackCustomRule(cropName, environmentContext, lang = 'en') {
  const matchedPreset = findCropPreset(cropName);
  if (matchedPreset) return buildRuleFromPreset(matchedPreset, lang);

  const copy = getCopy(lang);
  const lower = String(cropName || '').toLowerCase();
  const isBlocked = INCOMPATIBLE_CROP_TERMS.some((term) => lower.includes(term));
  if (isBlocked) {
    return normalizeAiCropRule(
      {
        plant_name: cropName,
        scientific_name: '',
        is_compatible: false,
        compatibility_reason: copy.blockedReason(cropName),
        alternative_plants: copy.defaultAlts,
        climate_adaptation: environmentContext || copy.defaultClimate,
      },
      cropName,
      lang
    );
  }

  return normalizeAiCropRule(
    {
      plant_name: cropName,
      scientific_name: '',
      is_compatible: true,
      compatibility_reason: copy.fallbackCompat(cropName),
      climate_adaptation: environmentContext || copy.defaultClimate,
      harvest: { min_hst: 28, max_hst: 40, harvest_type: 'sekali_panen' },
      moisture_substrate_pct: {
        ideal_min: 58,
        ideal_max: 73,
        pump_on_threshold: 58,
        pump_off_threshold: 73,
        critical_dry_alert: 43,
        overwater_alert: 85,
      },
      temp_ideal_c: { ideal_min: 20, ideal_max: 28, max_tolerance: 30 },
      vertical_cocopeat_guide: {
        substrate_mix: copy.defaultSubstrate,
        tower_placement: copy.fallbackPlacement,
        technical_note: copy.fallbackNote,
      },
    },
    cropName,
    lang
  );
}

export async function generateCustomCropRule({ cropName, environmentContext = '', lang = 'en' }) {
  const cleanName = String(cropName || '').trim();
  const copy = getCopy(lang);
  if (!cleanName) {
    throw new Error(translateKey(lang, 'enter_crop_first'));
  }

  const matchedPreset = findCropPreset(cleanName);
  if (matchedPreset && !environmentContext.trim()) {
    return { success: true, rule: buildRuleFromPreset(matchedPreset, lang), source: 'benchmark' };
  }

  const fallbackRule = buildFallbackCustomRule(cleanName, environmentContext, lang);
  const prompt = buildRulePrompt(cleanName, environmentContext, lang);

  try {
    const result = await executeWithGeminiFallback(
      {
        model: 'gemini-3.5-flash',
        feature: copy.featureCropRule,
        lang,
        fallbackText: JSON.stringify(fallbackRule),
      },
      async (model) => await model.generateContent(prompt)
    );

    const rawText = String(result.response.text() || '').trim();
    const stripped = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
    const jsonMatch = stripped.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : stripped);
    const validated = normalizeAiCropRule(parsed, cleanName, lang);

    return { success: true, rule: validated, source: 'ai' };
  } catch {
    return { success: true, rule: fallbackRule, source: 'fallback' };
  }
}

function buildAgronomyContext({
  sensorData,
  temperature,
  humidity,
  healthScore,
  realWeather,
  cropProfile,
  harvestInfo,
  lang = 'id',
}) {
  const copy = getCopy(lang);
  const cropName = cropProfile?.cropName || copy.defaultCrop;
  const scientific = cropProfile?.scientificName ? ` (${cropProfile.scientificName})` : '';
  const thresholds = getCropThresholds(cropProfile);

  const weatherStr = realWeather?.description
    ? `Weather: ${realWeather.description}${realWeather.city ? ` in ${realWeather.city}` : ''}`
    : 'Live weather telemetry unavailable';

  return `
### CROP PROFILE & COCOPEAT HYSTERESIS RULES
- Crop: ${cropName}${scientific} | Climate: ${cropProfile?.climateAdaptation || copy.defaultClimate}
- Cycle: Day ${harvestInfo?.currentDay || 1}/${harvestInfo?.totalCycleDays || 30} (${harvestInfo?.daysToHarvest ?? 29} days left, ${cropProfile?.harvestType || 'sekali_panen'})
- Substrate Moisture Target (Cocopeat): ${thresholds.minSoil}%–${thresholds.maxSoil}% (Pump ON ≤ ${thresholds.pumpOn}%, Pump OFF ≥ ${thresholds.pumpOff}%, Critical Dry ≤ ${thresholds.criticalDry}%, Overwater Alert ≥ ${thresholds.overwaterAlert}%)
- Temperature Target: ${thresholds.minTemp}°C–${thresholds.maxTemp}°C (Max tolerance: ${thresholds.maxTolerance}°C)
- Guide: ${cropProfile?.substrateMix || 'Cocopeat + perlite'} | ${cropProfile?.towerPlacement || 'Slot vertikal standar'}

### LIVE TELEMETRY
- Substrate Moisture: ${sensorData?.soilMoisture != null ? Number(sensorData.soilMoisture).toFixed(1) : 'N/A'}%
- Temperature: ${temperature != null ? Number(temperature).toFixed(1) : 'N/A'}°C
- Relative Humidity: ${humidity != null ? Number(humidity).toFixed(0) : 'N/A'}%
- UV Index: ${sensorData?.uvIndex != null ? Number(sensorData.uvIndex).toFixed(1) : 'N/A'}
- Wind Speed: ${sensorData?.windSpeed != null ? Number(sensorData.windSpeed).toFixed(0) : 'N/A'} km/h
- Overall Health Score: ${healthScore != null ? Number(healthScore).toFixed(0) : 'N/A'}/100
- Atmosphere: ${weatherStr}
`.trim();
}

export async function runDashboardAnalysis({
  sensorData,
  temperature,
  humidity,
  healthScore,
  realWeather,
  cropProfile,
  harvestInfo,
  alerts = [],
  lang = 'id',
  t,
}) {
  try {
    const context = buildAgronomyContext({
      sensorData,
      temperature,
      humidity,
      healthScore,
      realWeather,
      cropProfile,
      harvestInfo,
      lang,
    });

    const activeAlerts = alerts.filter((a) => !a.read).map((a) => a.title).join(', ') || 'None';
    const copy = getCopy(lang);
    const langInstructions = getAiLanguageName(lang);

    const prompt = `You are ENZOPONIK AI agronomist for a vertical cocopeat hydroponic system. Analyze:
${context}
- Active Alerts: ${activeAlerts}

Give 3–5 bullet points using ${copy.statusTags}.
Respect cocopeat limits (never recommend keeping substrate >80% wet). End with 1 concrete action recommendation. Be concise.
IMPORTANT: Respond strictly in ${langInstructions}.${lang !== 'en' ? ' Do not use English prefixes or mixed English prose.' : ''}`;

    const result = await executeWithGeminiFallback(
      {
        model: 'gemini-3.5-flash',
        feature: copy.featureDashboard,
        lang,
        fallbackText: buildSensorTemplateText({
          sensorData,
          temperature,
          humidity,
          healthScore,
          realWeather,
          cropProfile,
          harvestInfo,
          lang,
        }),
      },
      async (model) => await model.generateContent(prompt)
    );

    return { success: true, text: result.response.text() };
  } catch (err) {
    return { success: false, error: parseGeminiError(err, t, lang) };
  }
}

export async function runTopicInsight({
  topic,
  sensorData,
  temperature,
  humidity,
  healthScore,
  realWeather,
  cropProfile,
  harvestInfo,
  lang = 'en',
  t,
}) {
  try {
    const context = buildAgronomyContext({
      sensorData,
      temperature,
      humidity,
      healthScore,
      realWeather,
      cropProfile,
      harvestInfo,
      lang,
    });

    const copy = getCopy(lang);
    const langInstructions = getAiLanguageName(lang);

    const prompt = `You are ENZOPONIK AI agronomist for vertical cocopeat towers. Write a concise 2-sentence insight about "${topic}" based on this data:
${context}

Respond with ONLY the 2-sentence insight, no extra headers or markdown formatting.
IMPORTANT: Respond strictly in ${langInstructions}.${lang !== 'en' ? ' Do not use English prefixes or mixed English prose.' : ''}`;

    const result = await executeWithGeminiFallback(
      {
        model: 'gemini-3.5-flash',
        feature: copy.featureInsight,
        lang,
        fallbackText: buildSensorTemplateText({
          sensorData,
          temperature,
          humidity,
          healthScore,
          realWeather,
          cropProfile,
          harvestInfo,
          lang,
          inline: true,
        }),
      },
      async (model) => await model.generateContent(prompt)
    );

    return { success: true, text: result.response.text() };
  } catch (err) {
    return { success: false, error: parseGeminiError(err, t, lang) };
  }
}
