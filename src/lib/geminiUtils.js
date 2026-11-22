import { API_BASE_URL, fetchWithTimeout } from './api';
import { getStoredLang, translateKey } from '../locales/translations';

const CANDIDATE_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-latest',
];

const AI_QUOTA_PREFIX = 'enzoponik_ai_quota_';
const AI_PROVIDER_KEY = 'enzoponik_ai_provider';

export function getAiProvider() {
  try {
    const val = localStorage.getItem(AI_PROVIDER_KEY);
    if (val === 'gemini' || val === 'cloudflare' || val === 'auto') {
      return val;
    }
  } catch {}
  return 'auto';
}

export function setAiProvider(provider) {
  const valid = provider === 'gemini' || provider === 'cloudflare' ? provider : 'auto';
  try {
    localStorage.setItem(AI_PROVIDER_KEY, valid);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('enzoponik-ai-provider-updated', { detail: valid }));
    }
  } catch {}
  return valid;
}

function getTodayDateKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getCurrentUserForQuota(customUser = null) {
  if (customUser && (customUser.uid || customUser.email)) {
    return customUser;
  }
  try {
    const raw = localStorage.getItem('enzoponik_user');
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}
  return null;
}

function getQuotaStorageKey(userObj) {
  const id = userObj?.uid || userObj?.email || 'default';
  return `${AI_QUOTA_PREFIX}${String(id).trim().toLowerCase()}`;
}

export function getAiQuotaState(customUser = null) {
  const userObj = getCurrentUserForQuota(customUser);
  const isPro = userObj?.subscriptionTier === 'pro';
  const max = isPro ? 50 : 20;
  const today = getTodayDateKey();
  const storageKey = getQuotaStorageKey(userObj);

  let used = 0;
  let lastUsedAt = null;
  let lastFeature = null;

  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.date === today && typeof parsed.used === 'number') {
        used = Math.max(0, parsed.used);
        lastUsedAt = parsed.lastUsedAt || null;
        lastFeature = parsed.lastFeature || null;
      } else {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ date: today, used: 0, lastUsedAt: null, lastFeature: null })
        );
      }
    }
  } catch {}

  const remaining = Math.max(0, max - used);
  return {
    date: today,
    used,
    max,
    remaining,
    isPro,
    lastUsedAt,
    lastFeature,
    exhausted: used >= max,
  };
}

function consumeAiQuota(featureName = 'Analisis AI', customUser = null) {
  const userObj = getCurrentUserForQuota(customUser);
  const current = getAiQuotaState(userObj);
  const storageKey = getQuotaStorageKey(userObj);
  const nextUsed = current.used + 1;
  const nowIso = new Date().toISOString();

  const payload = {
    date: current.date,
    used: nextUsed,
    lastUsedAt: nowIso,
    lastFeature: featureName,
  };

  try {
    localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {}

  const nextState = {
    ...current,
    used: nextUsed,
    remaining: Math.max(0, current.max - nextUsed),
    lastUsedAt: nowIso,
    lastFeature: featureName,
    exhausted: nextUsed >= current.max,
  };

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('enzoponik-ai-quota-updated', { detail: nextState }));
  }

  return nextState;
}

export function syncAiQuotaFromCloud(cloudQuota, customUser = null) {
  if (!cloudQuota || typeof cloudQuota.used !== 'number') return getAiQuotaState(customUser);
  const today = getTodayDateKey();
  if (cloudQuota.date !== today) return getAiQuotaState(customUser);

  const userObj = getCurrentUserForQuota(customUser);
  const local = getAiQuotaState(userObj);
  if (cloudQuota.used > local.used) {
    const storageKey = getQuotaStorageKey(userObj);
    const merged = {
      date: today,
      used: cloudQuota.used,
      lastUsedAt: cloudQuota.lastUsedAt || local.lastUsedAt || new Date().toISOString(),
      lastFeature: cloudQuota.lastFeature || local.lastFeature || 'Cloud Sync',
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(merged));
    } catch {}
    const updated = getAiQuotaState(userObj);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('enzoponik-ai-quota-updated', { detail: { ...updated, _fromCloud: true } })
      );
    }
    return updated;
  }
  return local;
}

export function parseGeminiError(err, t, lang = 'en') {
  const msg = err?.message || '';
  if (err?.code === 'DAILY_QUOTA_EXCEEDED' || msg.includes('DAILY_QUOTA_EXCEEDED')) {
    return msg.replace('429 DAILY_QUOTA_EXCEEDED: ', '');
  }
  if (msg.includes('429') || msg.includes('quota') || msg.includes('QUOTA')) {
    return t?.('quota_exceeded') || translateKey(lang, 'quota_exceeded');
  }
  if (msg.includes('403') || msg.includes('API key') || msg.includes('API_KEY_INVALID') || msg.includes('leaked')) {
    return t?.('api_key_invalid') || translateKey(lang, 'api_key_invalid');
  }
  if (msg.includes('500') || msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
    return t?.('ai_service_busy') || translateKey(lang, 'ai_service_busy');
  }
  const failPrefix = t?.('analysis_failed') || translateKey(lang, 'analysis_failed');
  return `${failPrefix} ${msg}`.trim();
}

const SENSOR_TEMPLATE_COPY = {
  en: {
    defaultCrop: 'Hydroponic Crop',
    windUnit: 'km/h',
    inline: ({ crop, day, total, health, soil, temp, hum, uv, wind, weather }) =>
      `${crop} is on day ${day}/${total} with a health score of ${health}. Recorded substrate moisture is ${soil}, temperature ${temp}, air humidity ${hum}, UV ${uv}, wind ${wind}, and weather ${weather}.`,
    bullets: ({ crop, day, total, health, soil, temp, hum, uv, wind, weather }) => [
      `- **Crop:** ${crop} (Day ${day} of ${total} days)`,
      `- **Substrate Moisture:** ${soil} | **Health Score:** ${health}`,
      `- **Temp & Humidity:** ${temp} | **Air Humidity:** ${hum}`,
      `- **Environment:** UV ${uv} | Wind ${wind} | Weather ${weather}`,
    ].join('\n'),
  },
  id: {
    defaultCrop: 'Tanaman Hidroponik',
    windUnit: 'km/jam',
    inline: ({ crop, day, total, health, soil, temp, hum, uv, wind, weather }) =>
      `Komoditas ${crop} berada pada hari ke-${day}/${total} dengan skor kesehatan ${health}. Tercatat kelembapan media ${soil}, suhu ${temp}, kelembapan udara ${hum}, UV ${uv}, angin ${wind}, dan cuaca ${weather}.`,
    bullets: ({ crop, day, total, health, soil, temp, hum, uv, wind, weather }) => [
      `- **Komoditas:** ${crop} (Hari ke-${day} dari ${total} hari)`,
      `- **Kelembapan Media:** ${soil} | **Skor Kesehatan:** ${health}`,
      `- **Suhu & Udara:** ${temp} | **Kelembapan Udara:** ${hum}`,
      `- **Kondisi Lingkungan:** UV ${uv} | Angin ${wind} | Cuaca ${weather}`,
    ].join('\n'),
  },
  zh: {
    defaultCrop: '水培作物',
    windUnit: 'km/h',
    inline: ({ crop, day, total, health, soil, temp, hum, uv, wind, weather }) =>
      `${crop} 当前处于第 ${day}/${total} 天，健康评分为 ${health}。记录显示基质湿度 ${soil}、温度 ${temp}、空气湿度 ${hum}、紫外线 ${uv}、风速 ${wind}、天气 ${weather}。`,
    bullets: ({ crop, day, total, health, soil, temp, hum, uv, wind, weather }) => [
      `- **作物：** ${crop}（第 ${day} / ${total} 天）`,
      `- **基质湿度：** ${soil} | **健康评分：** ${health}`,
      `- **温度与湿度：** ${temp} | **空气湿度：** ${hum}`,
      `- **环境状况：** UV ${uv} | 风速 ${wind} | 天气 ${weather}`,
    ].join('\n'),
  },
  jv: {
    defaultCrop: 'Tanduran Hidroponik',
    windUnit: 'km/jam',
    inline: ({ crop, day, total, health, soil, temp, hum, uv, wind, weather }) =>
      `${crop} ana ing dina kaping-${day}/${total} kanthi skor kesehatan ${health}. Kacatet kelembapan media ${soil}, suhu ${temp}, kelembapan hawa ${hum}, UV ${uv}, angin ${wind}, lan cuaca ${weather}.`,
    bullets: ({ crop, day, total, health, soil, temp, hum, uv, wind, weather }) => [
      `- **Tanduran:** ${crop} (Dina kaping-${day} saka ${total} dina)`,
      `- **Kelembapan Media:** ${soil} | **Skor Kesehatan:** ${health}`,
      `- **Suhu & Hawa:** ${temp} | **Kelembapan Hawa:** ${hum}`,
      `- **Kahanan Lingkungan:** UV ${uv} | Angin ${wind} | Cuaca ${weather}`,
    ].join('\n'),
  },
  ban: {
    defaultCrop: 'Tanduran Hidroponik',
    windUnit: 'km/jam',
    inline: ({ crop, day, total, health, soil, temp, hum, uv, wind, weather }) =>
      `${crop} magenah ring rahina kaping-${day}/${total} antuk skor kasehatan ${health}. Kacatet kelembaban media ${soil}, suhu ${temp}, kelembaban udara ${hum}, UV ${uv}, angin ${wind}, lan cuaca ${weather}.`,
    bullets: ({ crop, day, total, health, soil, temp, hum, uv, wind, weather }) => [
      `- **Tanduran:** ${crop} (Rahina kaping-${day} saking ${total} rahina)`,
      `- **Kelembaban Media:** ${soil} | **Skor Kasehatan:** ${health}`,
      `- **Suhu & Udara:** ${temp} | **Kelembaban Udara:** ${hum}`,
      `- **Kondisi Lingkungan:** UV ${uv} | Angin ${wind} | Cuaca ${weather}`,
    ].join('\n'),
  },
};

/**
 * ponytail: Factual sensor template fallback when AI API fails (ceiling: static telemetry readout; upgrade path: add live Gemini key in Worker)
 */
export function buildSensorTemplateText({
  sensorData,
  temperature,
  humidity,
  healthScore,
  realWeather,
  cropProfile,
  harvestInfo,
  lang = 'en',
  inline = false,
} = {}) {
  const copy = SENSOR_TEMPLATE_COPY[lang] || SENSOR_TEMPLATE_COPY.en;
  const payload = {
    crop: cropProfile?.cropName || copy.defaultCrop,
    day: harvestInfo?.currentDay || 1,
    total: harvestInfo?.totalCycleDays || 35,
    soil: sensorData?.soilMoisture != null ? `${Number(sensorData.soilMoisture).toFixed(0)}%` : '-',
    temp: temperature != null ? `${Number(temperature).toFixed(1)}°C` : '-',
    hum: humidity != null ? `${Number(humidity).toFixed(0)}%` : '-',
    uv: sensorData?.uvIndex != null ? `${Number(sensorData.uvIndex).toFixed(1)}` : '-',
    wind: sensorData?.windSpeed != null ? `${Number(sensorData.windSpeed).toFixed(0)} ${copy.windUnit}` : '-',
    health: healthScore != null ? `${Math.round(healthScore)}/100` : '-',
    weather: realWeather?.description
      ? `${realWeather.description}${realWeather.city ? ` (${realWeather.city})` : ''}`
      : '-',
  };

  return inline ? copy.inline(payload) : copy.bullets(payload);
}

function normalizeModelName(model) {
  if (!model || model.includes('1.5') || model.includes('2.0') || model.includes('2.5')) {
    return 'gemini-3.5-flash';
  }
  return model;
}

async function callGeminiRest({ apiKey, model = 'gemini-3.5-flash', contents, systemInstruction }) {
  const normalizedModel = normalizeModelName(model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${normalizedModel}:generateContent?key=${apiKey}`;

  const body = {
    contents,
    generationConfig: { maxOutputTokens: 2048 },
  };
  if (systemInstruction) {
    body.system_instruction = {
      parts: [{ text: typeof systemInstruction === 'string' ? systemInstruction : JSON.stringify(systemInstruction) }],
    };
  }

  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    8000
  );

  const data = await res.json();
  if (!res.ok) {
    const errorMsg = data.error?.message || `Gemini API error (${res.status})`;
    const errorObj = new Error(errorMsg);
    errorObj.status = res.status;
    errorObj.code = data.error?.code || res.status;
    throw errorObj;
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}

async function callWorkerEdgeAiProxy({ prompt, systemInstruction, model = 'gemini-3.5-flash', provider = 'auto' }) {
  const res = await fetchWithTimeout(
    `${API_BASE_URL}/api/ai/analyze`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: typeof prompt === 'string' ? prompt : JSON.stringify(prompt),
        systemInstruction,
        model: normalizeModelName(model),
        provider,
      }),
    },
    25000
  );

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Edge AI proxy returned ${res.status}`);
  }

  const data = await res.json();
  if (!data.text) {
    throw new Error('Empty response from Edge AI proxy');
  }
  return data.text;
}

export async function executeWithGeminiFallback(modelConfig = {}, executeFn) {
  const activeLang = modelConfig.lang || getStoredLang();

  const quota = getAiQuotaState();
  if (quota.exhausted) {
    const msgText = translateKey(
      activeLang,
      quota.isPro ? 'daily_quota_exceeded_pro' : 'daily_quota_exceeded_free',
      { used: quota.used, max: quota.max }
    );
    const quotaErr = new Error(`429 DAILY_QUOTA_EXCEEDED: ${msgText}`);
    quotaErr.code = 'DAILY_QUOTA_EXCEEDED';
    quotaErr.status = 429;
    throw quotaErr;
  }

  const featureLabel = modelConfig.feature || translateKey(activeLang, 'ai_analyst_title');
  const provider = getAiProvider();
  const keysStr = import.meta.env.VITE_GEMINI_API_KEY || '';
  const keys = keysStr.split(',').map(k => k.trim()).filter(Boolean);

  const requestedModel = normalizeModelName(modelConfig.model);
  const modelsToTry = [
    requestedModel,
    ...CANDIDATE_MODELS.filter(m => m !== requestedModel)
  ];

  let lastErr;

  if (provider !== 'cloudflare' && keys.length > 0) {
    for (const modelName of modelsToTry) {
      for (let k = 0; k < keys.length; k++) {
        const apiKey = keys[k];
        try {
          const modelProxy = {
            generateContent: async (prompt) => {
              let contents;
              if (typeof prompt === 'string') {
                contents = [{ parts: [{ text: prompt }] }];
              } else if (Array.isArray(prompt)) {
                contents = prompt;
              } else if (prompt?.contents) {
                contents = prompt.contents;
              } else {
                contents = [{ parts: [{ text: String(prompt) }] }];
              }

              const textResult = await callGeminiRest({
                apiKey,
                model: modelName,
                contents,
                systemInstruction: modelConfig.systemInstruction,
              });

              return {
                response: {
                  text: () => textResult,
                },
              };
            },
            startChat: ({ history = [] } = {}) => ({
              sendMessage: async (text) => {
                const contents = [
                  ...history,
                  { role: 'user', parts: [{ text }] },
                ];
                const textResult = await callGeminiRest({
                  apiKey,
                  model: modelName,
                  contents,
                  systemInstruction: modelConfig.systemInstruction,
                });
                return {
                  response: {
                    text: () => textResult,
                  },
                };
              },
            }),
          };

          const result = await executeFn(modelProxy);
          consumeAiQuota(featureLabel);
          return result;
        } catch (err) {
          lastErr = err;
          const msg = (err?.message || '').toLowerCase();
          const status = err?.status || 0;

          const isTransient =
            status === 503 ||
            status === 500 ||
            status === 429 ||
            status === 404 ||
            msg.includes('503') ||
            msg.includes('429') ||
            msg.includes('quota') ||
            msg.includes('unavailable') ||
            msg.includes('high demand') ||
            msg.includes('not found') ||
            msg.includes('api key not valid');

          if (isTransient) {
            console.warn(`[ENZOPONIK AI] Model ${modelName} (key #${k + 1}) failed (${msg}). Trying fallback...`);
            continue;
          }
          break;
        }
      }
    }
  }

  try {
    const edgeProxy = {
      generateContent: async (prompt) => {
        let textPrompt = prompt;
        if (Array.isArray(prompt) && prompt[0]?.parts?.[0]?.text) {
          textPrompt = prompt[0].parts[0].text;
        } else if (prompt?.contents) {
          textPrompt = JSON.stringify(prompt.contents);
        }
        const textResult = await callWorkerEdgeAiProxy({
          prompt: textPrompt,
          systemInstruction: modelConfig.systemInstruction,
          model: 'gemini-3.8-flash',
          provider,
        });
        return {
          response: {
            text: () => textResult,
          },
        };
      },
      startChat: ({ history = [] } = {}) => ({
        sendMessage: async (text) => {
          const fullPrompt = history.length > 0
            ? `${history.map(h => `${h.role === 'model' ? 'Assistant' : 'User'}: ${h.parts?.[0]?.text || ''}`).join('\n')}\nUser: ${text}`
            : text;
          const textResult = await callWorkerEdgeAiProxy({
            prompt: fullPrompt,
            systemInstruction: modelConfig.systemInstruction,
            model: 'gemini-3.8-flash',
            provider,
          });
          return {
            response: {
              text: () => textResult,
            },
          };
        },
      }),
    };

    const edgeResult = await executeFn(edgeProxy);
    consumeAiQuota(featureLabel);
    return edgeResult;
  } catch (proxyErr) {
    if (modelConfig.fallbackText) {
      consumeAiQuota(featureLabel);
      return { response: { text: () => modelConfig.fallbackText } };
    }
    console.error('[ENZOPONIK AI] Edge AI proxy also failed:', proxyErr);
    throw lastErr || proxyErr;
  }
}
