/**
 * MANIK - Native Gemini AI REST Client
 * Replaces the heavy @google/generative-ai SDK with lightweight native fetch calls.
 */

export function parseGeminiError(err, t) {
  const msg = err?.message || '';
  if (msg.includes('429') || msg.includes('quota') || msg.includes('QUOTA')) {
    return t('quota_exceeded', 'Quota exceeded. Try again later.');
  }
  if (msg.includes('403') || msg.includes('API key') || msg.includes('API_KEY_INVALID') || msg.includes('leaked')) {
    return t('api_key_invalid', 'Invalid API key.');
  }
  if (msg.includes('500') || msg.includes('503')) {
    return t('analysis_failed', 'Service unavailable. Try again later.');
  }
  return `${t('analysis_failed', 'Analysis failed.')} ${msg}`;
}

/**
 * Native REST call to Google Generative Language API
 */
export async function callGeminiRest({ apiKey, model = 'gemini-1.5-flash', contents, systemInstruction }) {
  // Normalize model name (e.g., fallback 2.5 to 1.5/2.0)
  const normalizedModel = model.includes('2.5') ? 'gemini-1.5-flash' : model;
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
    throw new Error(errorMsg);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}

/**
 * Wrapper providing backward compatibility with existing executeFn(model) call sites
 */
export async function executeWithGeminiFallback(modelConfig = {}, executeFn) {
  const keysStr = import.meta.env.VITE_GEMINI_API_KEY || '';
  const keys = keysStr.split(',').map(k => k.trim()).filter(Boolean);

  if (keys.length === 0) {
    throw new Error('API key missing. Check VITE_GEMINI_API_KEY in .env');
  }

  const modelName = modelConfig.model || 'gemini-1.5-flash';
  let lastErr;

  for (let i = 0; i < keys.length; i++) {
    try {
      const apiKey = keys[i];
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
      const msg = err?.message || '';
      if (
        msg.includes('429') ||
        msg.includes('quota') ||
        msg.includes('QUOTA') ||
        msg.includes('API_KEY_INVALID') ||
        msg.includes('API key not valid')
      ) {
        console.warn(`[MANIK AI] Gemini API key index ${i} failed. Trying next key if available...`);
        continue;
      }
      throw err;
    }
  }

  throw lastErr;
}
