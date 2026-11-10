/**
 * MANIK - Agronomy AI Service Layer
 * Centralizes prompt engineering, context aggregation, and AI execution for MANIK.
 */
import { executeWithGeminiFallback, parseGeminiError } from './geminiUtils';

/**
 * Build consistent telemetric and crop context string
 */
export function buildAgronomyContext({
  sensorData,
  temperature,
  humidity,
  healthScore,
  realWeather,
  cropProfile,
  harvestInfo,
  lang = 'id',
}) {
  const cropName = cropProfile?.cropName || (lang === 'id' ? 'Sawi / Selada' : lang === 'ban' ? 'Jukut' : 'General Hydroponic Crop');
  const variety = cropProfile?.variety || 'Standard';
  const stage = cropProfile?.growthStage || 'Vegetative';

  const weatherStr = realWeather?.description
    ? `Weather: ${realWeather.description}${realWeather.city ? ` in ${realWeather.city}` : ''}`
    : 'Simulated weather active';

  return `
### CROP PROFILE
- Crop: ${cropName} (Variety: ${variety})
- Growth Stage: ${stage}
- Cycle: Day ${harvestInfo?.currentDay || 1}/${harvestInfo?.totalCycleDays || 35} (${harvestInfo?.daysToHarvest ?? 30} days left to harvest)

### LIVE TELEMETRY
- Soil / Substrate Moisture: ${sensorData?.soilMoisture != null ? sensorData.soilMoisture.toFixed(1) : 'N/A'}%
- Temperature: ${temperature != null ? Number(temperature).toFixed(1) : 'N/A'}°C
- Relative Humidity: ${humidity != null ? Number(humidity).toFixed(0) : 'N/A'}%
- UV Index: ${sensorData?.uvIndex != null ? Number(sensorData.uvIndex).toFixed(1) : 'N/A'}
- Wind Speed: ${sensorData?.windSpeed != null ? Number(sensorData.windSpeed).toFixed(0) : 'N/A'} km/h
- Overall Health Score: ${healthScore != null ? Number(healthScore).toFixed(0) : 'N/A'}/100
- Atmosphere: ${weatherStr}
`.trim();
}

/**
 * Generate full dashboard agronomist analysis
 */
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

    const activeAlerts = alerts.filter(a => !a.read).map(a => a.title).join(', ') || 'None';
    const langInstructions = lang === 'id'
      ? 'Indonesian (Bahasa Indonesia)'
      : lang === 'ban'
        ? 'Basa Bali (Balinese)'
        : 'English';

    const prompt = `You are MANIK AI agronomist. Analyze this hydroponic system:
${context}
- Active Alerts: ${activeAlerts}

Give 3–5 bullet points using [SEHAT]/[PERINGATAN]/[KRITIS] (or [HEALTHY]/[WARNING]/[CRITICAL] for English).
End with 1 concrete action recommendation for the grower. Be concise.
IMPORTANT: Respond strictly in ${langInstructions}.`;

    const result = await executeWithGeminiFallback(
      { model: 'gemini-1.5-flash' },
      async (model) => await model.generateContent(prompt)
    );

    return { success: true, text: result.response.text() };
  } catch (err) {
    return { success: false, error: parseGeminiError(err, t) };
  }
}

/**
 * Generate quick two-sentence topic insight (Canopy, Moisture, Harvest)
 */
export async function runTopicInsight({
  topic,
  sensorData,
  temperature,
  humidity,
  healthScore,
  realWeather,
  cropProfile,
  harvestInfo,
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

    const langInstructions = lang === 'id'
      ? 'Indonesian (Bahasa Indonesia)'
      : lang === 'ban'
        ? 'Basa Bali (Balinese)'
        : 'English';

    const prompt = `You are MANIK AI agronomist. Write a concise 2-sentence insight about "${topic}" based on this data:
${context}

Respond with ONLY the 2-sentence insight, no extra headers or markdown formatting.
IMPORTANT: Respond strictly in ${langInstructions}.`;

    const result = await executeWithGeminiFallback(
      { model: 'gemini-1.5-flash' },
      async (model) => await model.generateContent(prompt)
    );

    return { success: true, text: result.response.text() };
  } catch (err) {
    return { success: false, error: parseGeminiError(err, t) };
  }
}

