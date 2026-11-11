/**
 * MANIK - Multi-Tier Gemini AI REST Client with Dual-Engine Fallback
 * Layer 1: Direct Google Generative Language REST (Candidate models: gemini-3.5-flash -> gemini-3.8-flash -> gemini-flash-latest)
 * Layer 2: Cloudflare Edge Worker Proxy (/api/ai/analyze)
 */

const CANDIDATE_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.8-flash',
  'gemini-flash-latest',
];

export function parseGeminiError(err, t) {
  const msg = err?.message || '';
  if (msg.includes('429') || msg.includes('quota') || msg.includes('QUOTA')) {
    return t('quota_exceeded', 'Kuota AI tercapai. Silakan coba sesaat lagi.');
  }
  if (msg.includes('403') || msg.includes('API key') || msg.includes('API_KEY_INVALID') || msg.includes('leaked')) {
    return t('api_key_invalid', 'API key tidak valid.');
  }
  if (msg.includes('500') || msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
    return t('analysis_failed', 'Layanan AI sedang sibuk. Silakan coba kembali dalam beberapa detik.');
  }
  return `${t('analysis_failed', 'Analisis gagal.')} ${msg}`;
}

export function normalizeModelName(model) {
  if (!model || model.includes('1.5') || model.includes('2.0') || model.includes('2.5')) {
    return 'gemini-3.5-flash';
  }
  return model;
}

/**
 * Native REST call to Google Generative Language API
 */
export async function callGeminiRest({ apiKey, model = 'gemini-3.5-flash', contents, systemInstruction }) {
  const normalizedModel = normalizeModelName(model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${normalizedModel}:generateContent?key=${apiKey}`;

  const body = { contents };
  if (systemInstruction) {
    body.system_instruction = {
      parts: [{ text: typeof systemInstruction === 'string' ? systemInstruction : JSON.stringify(systemInstruction) }],
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

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

/**
 * Call via Cloudflare Worker Edge Proxy (bypasses browser adblockers and CORS limits)
 */
async function callWorkerEdgeAiProxy({ prompt, systemInstruction, model = 'gemini-3.5-flash' }) {
  const workerBase = import.meta.env.VITE_API_BASE_URL || 'https://enzoponik-worker.abibhaskaramulya.workers.dev';
  const res = await fetch(`${workerBase}/api/ai/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: typeof prompt === 'string' ? prompt : JSON.stringify(prompt),
      systemInstruction,
      model: normalizeModelName(model),
    }),
  });

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

/**
 * Wrapper providing cascading multi-key, multi-model, and Cloudflare Worker proxy fallback
 */
export async function executeWithGeminiFallback(modelConfig = {}, executeFn) {
  const keysStr = import.meta.env.VITE_GEMINI_API_KEY || '';
  const keys = keysStr.split(',').map(k => k.trim()).filter(Boolean);

  const requestedModel = normalizeModelName(modelConfig.model);
  const modelsToTry = [
    requestedModel,
    ...CANDIDATE_MODELS.filter(m => m !== requestedModel)
  ];

  let lastErr;

  // Layer 1: Coba direct call ke Google Generative Language
  if (keys.length > 0) {
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

          return await executeFn(modelProxy);
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
            console.warn(`[MANIK AI] Model ${modelName} (key #${k + 1}) failed (${msg}). Trying fallback...`);
            continue;
          }
          break;
        }
      }
    }
  }

  // Layer 2: Cloudflare Edge Worker Proxy Fallback
  console.info('[MANIK AI] Activating Cloudflare Edge Worker AI proxy fallback...');
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
          model: 'gemini-3.5-flash',
        });
        return {
          response: {
            text: () => textResult,
          },
        };
      },
      startChat: () => ({
        sendMessage: async (text) => {
          const textResult = await callWorkerEdgeAiProxy({
            prompt: text,
            systemInstruction: modelConfig.systemInstruction,
            model: 'gemini-3.5-flash',
          });
          return {
            response: {
              text: () => textResult,
            },
          };
        },
      }),
    };

    return await executeFn(edgeProxy);
  } catch (proxyErr) {
    console.error('[MANIK AI] Edge AI proxy also failed:', proxyErr);
    throw lastErr || proxyErr;
  }
}
