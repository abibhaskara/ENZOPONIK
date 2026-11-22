const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-ID, X-Device-Key',
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) {
      fields[k] = { nullValue: null };
    } else if (typeof v === 'boolean') {
      fields[k] = { booleanValue: v };
    } else if (typeof v === 'number') {
      if (Number.isInteger(v)) {
        fields[k] = { integerValue: String(v) };
      } else {
        fields[k] = { doubleValue: v };
      }
    } else if (typeof v === 'string') {

      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) {
        fields[k] = { timestampValue: v };
      } else {
        fields[k] = { stringValue: v };
      }
    } else if (v instanceof Date) {
      fields[k] = { timestampValue: v.toISOString() };
    } else if (typeof v === 'object') {
      fields[k] = { mapValue: { fields: toFirestoreFields(v) } };
    }
  }
  return fields;
}

function fromFirestoreFields(fields) {
  if (!fields) return {};
  const out = {};
  for (const [k, valObj] of Object.entries(fields)) {
    if ('stringValue' in valObj) out[k] = valObj.stringValue;
    else if ('integerValue' in valObj) out[k] = parseInt(valObj.integerValue, 10);
    else if ('doubleValue' in valObj) out[k] = parseFloat(valObj.doubleValue);
    else if ('booleanValue' in valObj) out[k] = valObj.booleanValue;
    else if ('timestampValue' in valObj) out[k] = valObj.timestampValue;
    else if ('nullValue' in valObj) out[k] = null;
    else if ('mapValue' in valObj) out[k] = fromFirestoreFields(valObj.mapValue.fields);
    else out[k] = valObj;
  }
  return out;
}

async function getFirestoreDoc(env, docPath) {
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${docPath}?key=${env.FIREBASE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Firestore GET ${docPath} failed: ${res.status}`);
  }
  const data = await res.json();
  return fromFirestoreFields(data.fields);
}

async function patchFirestoreDoc(env, docPath, dataObj) {
  const maskParams = Object.keys(dataObj)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join('&');
  const query = maskParams ? `?${maskParams}&key=${env.FIREBASE_API_KEY}` : `?key=${env.FIREBASE_API_KEY}`;
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${docPath}${query}`;
  const body = { fields: toFirestoreFields(dataObj) };
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firestore PATCH ${docPath} failed (${res.status}): ${err}`);
  }
  return res.json();
}

async function appendFirestoreDoc(env, collectionPath, dataObj) {
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collectionPath}?key=${env.FIREBASE_API_KEY}`;
  const body = { fields: toFirestoreFields(dataObj) };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firestore POST ${collectionPath} failed (${res.status}): ${err}`);
  }
  return res.json();
}

async function readDeviceControl(env, deviceId) {
  const devDoc = await getFirestoreDoc(env, `devices/${deviceId}`).catch(() => null);
  const devCtrl = devDoc?.control || {};
  if ('updatedAt' in devCtrl) {
    return { devDoc, ctrl: devCtrl, source: 'device' };
  }
  const legacyCtrl = await getFirestoreDoc(env, `device_controls/${deviceId}`).catch(() => null);
  return {
    devDoc,
    ctrl: legacyCtrl ? { ...legacyCtrl, ...devCtrl } : devCtrl,
    source: legacyCtrl ? 'legacy_control' : 'device',
  };
}

function buildLegacyControlPayload(deviceId, ctrl) {
  return {
    deviceId,
    pumpActive: Boolean(ctrl.pumpActive),
    flushActive: Boolean(ctrl.flushActive),
    autoMode: ctrl.autoMode !== false,
    manualTrigger: Boolean(ctrl.manualTrigger),
    pumpDurationSec: Number(ctrl.pumpDurationSec || 0),
    updatedAt: ctrl.updatedAt || new Date().toISOString(),
  };
}

async function writeDeviceControl(env, deviceId, nextCtrl, extraDevicePatch = null) {
  const devicePayload = extraDevicePatch
    ? { ...extraDevicePatch, control: nextCtrl }
    : { control: nextCtrl };

  try {
    await patchFirestoreDoc(env, `devices/${deviceId}`, devicePayload);
    return 'device';
  } catch (err) {
    if (extraDevicePatch) {
      await patchFirestoreDoc(env, `devices/${deviceId}`, extraDevicePatch).catch(() => null);
    }
    try {
      await patchFirestoreDoc(env, `device_controls/${deviceId}`, buildLegacyControlPayload(deviceId, nextCtrl));
      return 'legacy_control';
    } catch {
      if (!extraDevicePatch) throw err;
      return 'failed';
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {

      if (path === '/' || path === '/health') {
        return json({
          status: 'online',
          service: 'ENZOPONIK Cloudflare Edge Gateway',
          version: '0.1.0',
          environment: 'production',
          firebaseProject: env.FIREBASE_PROJECT_ID || 'enzoponik',
          timestamp: new Date().toISOString(),
          endpoints: [
            'POST /api/telemetry (ESP32 Ingestion)',
            'GET  /api/observation/latest (Web Client)',
            'GET  /api/control (Pump Control State)',
            'POST /api/control (Trigger Pump Manual/Auto)',
            'GET  /api/weather (Edge Cached Weather)',
            'POST /api/ai/analyze (Gemini Agronomy Proxy)',
          ],
        });
      }

      if (path === '/api/telemetry' && method === 'POST') {
        const payload = await request.json();
        const deviceId = (payload.deviceId || env.DEFAULT_DEVICE_ID || 'ENZOPONIK-01').toUpperCase();
        const rawMoisture = payload.soilMoisture != null ? Number(payload.soilMoisture) : null;

        if (rawMoisture === null || isNaN(rawMoisture)) {
          return json({ error: 'Missing or invalid "soilMoisture" in JSON payload' }, 400);
        }

        const nowIso = new Date().toISOString();

        const { ctrl } = await readDeviceControl(env, deviceId);
        const manualTrigger = Boolean(ctrl.pumpActive || ctrl.flushActive || ctrl.manualTrigger);
        const autoMode = ctrl.autoMode !== false;

        const rawOff = Number(ctrl.pumpOffThreshold);
        const pumpOff = Number.isFinite(rawOff) ? Math.min(80, Math.max(55, rawOff)) : 80;
        const rawOn = Number(ctrl.pumpOnThreshold);
        const pumpOn = Number.isFinite(rawOn) ? Math.max(50, Math.min(pumpOff - 5, rawOn)) : 65;
        const rawCrit = Number(ctrl.criticalDryAlert);
        const criticalDryAlert = Number.isFinite(rawCrit)
          ? Math.max(35, Math.min(45, pumpOn - 10, rawCrit))
          : Math.max(35, Math.min(45, pumpOn - 15));

        const ctrlUpdatedMs = ctrl.updatedAt ? new Date(ctrl.updatedAt).getTime() : 0;
        const requestedManualDur = Number(ctrl.pumpDurationSec || 0);
        const remainingManualSec =
          !manualTrigger && payload.pumpActive && requestedManualDur > 0 && ctrlUpdatedMs > 0
            ? Math.ceil((requestedManualDur * 1000 - (Date.now() - ctrlUpdatedMs)) / 1000)
            : 0;
        const activeManualWindow = remainingManualSec > 0;

        let pumpActive = Boolean(payload.pumpActive);
        let pumpDurationSec = Number(payload.pumpDurationSec || 0);

        if (manualTrigger) {
          pumpActive = true;
          pumpDurationSec = requestedManualDur > 0 ? requestedManualDur : 15;
        } else if (activeManualWindow) {
          pumpActive = true;
          pumpDurationSec = remainingManualSec;
        } else if (!autoMode) {
          pumpActive = false;
          pumpDurationSec = 0;
        } else if (rawMoisture <= pumpOn) {
          pumpActive = true;
          pumpDurationSec = 15;
        } else if (rawMoisture >= pumpOff) {
          pumpActive = false;
          pumpDurationSec = 0;
        }

        const liveData = {
          deviceId,
          soilMoisture: Math.round(rawMoisture),
          pumpActive,
          pumpDurationSec,
          temperature: payload.temperature != null ? Number(payload.temperature) : null,
          humidity: payload.humidity != null ? Number(payload.humidity) : null,
          rawAdc: payload.rawAdc != null ? Number(payload.rawAdc) : null,
          uptime: Number(payload.uptimeSec ?? payload.uptime ?? 0),
          lastHeartbeatAt: nowIso,
          timestamp: nowIso,
          updatedAt: nowIso,
        };

        const appendHistoryPromise = appendFirestoreDoc(env, 'telemetry_history', {
          deviceId,
          soilMoisture: liveData.soilMoisture,
          pumpActive,
          timestamp: nowIso,
        });

        const devicePatch = {
          lastSeen: nowIso,
          status: 'online',
          liveTelemetry: liveData,
        };
        const updateDevicePromise = manualTrigger
          ? writeDeviceControl(
              env,
              deviceId,
              {
                ...ctrl,
                pumpActive: false,
                flushActive: false,
                manualTrigger: false,
                pumpDurationSec,
                updatedAt: nowIso,
              },
              devicePatch
            ).catch(() => null)
          : patchFirestoreDoc(env, `devices/${deviceId}`, devicePatch).catch(() => null);

        const rawOver = Number(ctrl.overwaterAlert);
        const overwaterAlert = Number.isFinite(rawOver) ? Math.min(95, Math.max(80, rawOver)) : 85;
        let alertPromise = Promise.resolve();
        if (rawMoisture <= criticalDryAlert || rawMoisture >= overwaterAlert) {
          const isOverwater = rawMoisture >= overwaterAlert;
          const throttleReq = new Request(
            `https://alert-throttle.enzoponik.local/${encodeURIComponent(deviceId)}/${isOverwater ? 'wet' : 'dry'}`
          );
          const alreadyAlerted = typeof caches !== 'undefined' ? await caches.default.match(throttleReq) : null;
          if (!alreadyAlerted) {
            if (typeof caches !== 'undefined') {
              ctx?.waitUntil?.(
                caches.default.put(
                  throttleReq,
                  new Response('1', { headers: { 'Cache-Control': 'max-age=1800' } })
                )
              );
            }
            alertPromise = appendFirestoreDoc(env, 'alerts', {
              deviceId,
              title: isOverwater ? 'Kelembaban Cocopeat Terlalu Jenuh!' : 'Kelembaban Tanah Kritis!',
              desc: isOverwater
                ? `Kelembaban cocopeat mencapai ${Math.round(rawMoisture)}% (batas aman >= ${overwaterAlert}%), berisiko hipoksia/busuk akar.`
                : `Sensor mendeteksi kelembaban cocopeat turun ke ${Math.round(rawMoisture)}% (ambang kritis <= ${criticalDryAlert}%).`,
              type: 'warning',
              read: false,
              timestamp: nowIso,
            }).catch(() => null);
          }
        }

        await Promise.all([appendHistoryPromise, updateDevicePromise, alertPromise]);

        return json({
          success: true,
          deviceId,
          soilMoisture: liveData.soilMoisture,
          control: {
            pumpActive,
            pumpDurationSec,
            autoMode,
            manual: Boolean(manualTrigger || activeManualWindow),
            command: pumpActive ? 'RUN_PUMP' : 'STOP_PUMP',
          },
          serverTime: nowIso,
        });
      }

      if (path === '/api/observation/latest' && method === 'GET') {
        const requestedDeviceId = (url.searchParams.get('deviceId') || env.DEFAULT_DEVICE_ID || 'ENZOPONIK-01').trim().toUpperCase();
        const devDoc = await getFirestoreDoc(env, `devices/${requestedDeviceId}`).catch(() => null);
        const liveDoc = devDoc?.liveTelemetry || null;

        if (!liveDoc) {
          return json([]);
        }

        const nowMs = Date.now();
        const lastHeartbeatIso = liveDoc.lastHeartbeatAt || liveDoc.timestamp || null;
        const lastSeenMs = lastHeartbeatIso ? new Date(lastHeartbeatIso).getTime() : 0;
        const ageSeconds = lastSeenMs > 0 ? Math.max(0, Math.round((nowMs - lastSeenMs) / 1000)) : 999999;

        const isOnline = ageSeconds <= 40;

        return json([
          {
            node_id: liveDoc.deviceId || requestedDeviceId,
            soilMoisture: liveDoc.soilMoisture ?? null,
            temperature: liveDoc.temperature ?? null,
            humidity: liveDoc.humidity ?? null,
            rawAdc: liveDoc.rawAdc ?? null,
            uptime: liveDoc.uptime ?? null,
            pumpActive: Boolean(liveDoc.pumpActive),
            pumpDurationSec: liveDoc.pumpDurationSec ?? 0,
            timestamp: lastHeartbeatIso,
            lastSeen: lastHeartbeatIso,
            ageSeconds,
            online: isOnline,
            serverTime: new Date(nowMs).toISOString(),
          },
        ]);
      }

      if (path === '/api/control') {
        if (method === 'GET') {
          const targetDeviceId = (url.searchParams.get('deviceId') || env.DEFAULT_DEVICE_ID || 'ENZOPONIK-01').trim().toUpperCase();
          const { ctrl } = await readDeviceControl(env, targetDeviceId);
          return json({
            success: true,
            deviceId: targetDeviceId,
            control: {
              pumpActive: Boolean(ctrl.pumpActive),
              flushActive: Boolean(ctrl.flushActive),
              autoMode: ctrl.autoMode !== false,
              pumpDurationSec: ctrl.pumpDurationSec || 0,
              updatedAt: ctrl.updatedAt || null,
            },
          });
        }

        if (method === 'POST') {
          const body = await request.json();
          const targetDeviceId = (body.deviceId || url.searchParams.get('deviceId') || env.DEFAULT_DEVICE_ID || 'ENZOPONIK-01').trim().toUpperCase();
          const nowIso = new Date().toISOString();
          const { ctrl: existingCtrl } = await readDeviceControl(env, targetDeviceId);

          const nextAutoMode = body.autoMode !== undefined ? Boolean(body.autoMode) : (existingCtrl.autoMode !== false);
          const turningPumpOn = Boolean(body.pumpActive || body.flushActive || body.manualTrigger);
          const stoppingPump = body.pumpActive === false || (body.autoMode === false && !turningPumpOn);

          const controlUpdate = {
            ...existingCtrl,
            autoMode: nextAutoMode,
            updatedAt: nowIso,
          };

          if (body.cropName !== undefined) controlUpdate.cropName = String(body.cropName);
          if (body.pumpOnThreshold !== undefined) controlUpdate.pumpOnThreshold = Number(body.pumpOnThreshold);
          if (body.pumpOffThreshold !== undefined) controlUpdate.pumpOffThreshold = Number(body.pumpOffThreshold);
          if (body.criticalDryAlert !== undefined) controlUpdate.criticalDryAlert = Number(body.criticalDryAlert);
          if (body.overwaterAlert !== undefined) controlUpdate.overwaterAlert = Number(body.overwaterAlert);

          if (turningPumpOn) {
            controlUpdate.pumpActive = true;
            controlUpdate.flushActive = Boolean(body.flushActive);
            controlUpdate.manualTrigger = true;
            controlUpdate.pumpDurationSec = Number(body.pumpDurationSec) || 15;
          } else if (stoppingPump || body.autoMode !== undefined) {
            controlUpdate.pumpActive = false;
            controlUpdate.flushActive = false;
            controlUpdate.manualTrigger = false;
            controlUpdate.pumpDurationSec = 0;
          }

          await writeDeviceControl(env, targetDeviceId, controlUpdate);

          return json({
            success: true,
            deviceId: targetDeviceId,
            message: controlUpdate.pumpActive ? 'Pompa air diaktifkan.' : 'Pengaturan irigasi diperbarui.',
            control: controlUpdate,
          });
        }
      }

      if (path === '/api/weather' && method === 'GET') {
        const lat = url.searchParams.get('lat') || '-8.409518';
        const lon = url.searchParams.get('lon') || '115.188919';

        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,uv_index&hourly=temperature_2m,relative_humidity_2m,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max&timezone=auto`;

        const weatherRes = await fetch(weatherUrl, {
          cf: { cacheTtl: 600, cacheEverything: true },
        });

        if (!weatherRes.ok) {
          return json({ error: 'Failed to fetch weather from provider' }, 502);
        }

        const weatherData = await weatherRes.json();
        return json(weatherData, 200, {
          'Cache-Control': 'public, max-age=600, s-maxage=600',
        });
      }

      if (path === '/api/ai/analyze' && method === 'POST') {
        const body = await request.json();
        const prompt = body.prompt || '';
        const systemInstruction = body.systemInstruction;
        const provider = ['auto', 'gemini', 'cloudflare'].includes(body.provider) ? body.provider : 'auto';
        const apiKey = env.GEMINI_API_KEY || (body.apiKey ? String(body.apiKey).trim() : '');

        const runCloudflareAi = async () => {
          if (!env.AI) {
            throw new Error('Cloudflare Workers AI binding (env.AI) not configured');
          }
          const messages = [];
          if (systemInstruction) {
            messages.push({
              role: 'system',
              content: typeof systemInstruction === 'string' ? systemInstruction : JSON.stringify(systemInstruction),
            });
          }
          messages.push({ role: 'user', content: String(prompt) });
          const cfModels = [
            '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
            '@cf/meta/llama-4-scout-17b-16e-instruct',
            '@cf/qwen/qwen3.8-27b',
          ];
          let lastCfErr = 'Cloudflare Workers AI error';
          for (const cfModel of cfModels) {
            try {
              const cfRes = await env.AI.run(cfModel, {
                messages,
                max_tokens: 1500,
              });
              const text =
                cfRes?.response ||
                cfRes?.result?.response ||
                cfRes?.choices?.[0]?.message?.content ||
                '';
              if (text) return { text, cfModel };
            } catch (err) {
              lastCfErr = err?.message || lastCfErr;
            }
          }
          throw new Error(lastCfErr);
        };

        const runGeminiModels = async () => {
          if (!apiKey) {
            throw new Error('GEMINI_API_KEY binding not configured on Worker');
          }
          const candidates = Array.from(
            new Set([
              body.model || 'gemini-3.8-flash',
              'gemini-3.8-flash',
              'gemini-3.5-flash',
              'gemini-3.5-flash-lite',
              'gemini-flash-latest',
            ])
          );
          const geminiBody = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 2048 },
          };
          if (systemInstruction) {
            geminiBody.system_instruction = {
              parts: [{ text: typeof systemInstruction === 'string' ? systemInstruction : JSON.stringify(systemInstruction) }],
            };
          }
          let lastErrMsg = 'Gemini error';
          let lastStatus = 503;
          for (const mdl of candidates) {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent?key=${apiKey}`;
            const geminiRes = await fetch(geminiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(geminiBody),
            });
            const geminiData = await geminiRes.json().catch(() => ({}));
            if (geminiRes.ok) {
              const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
              if (text) return { text, modelUsed: mdl };
            }
            lastStatus = geminiRes.status || 503;
            lastErrMsg = geminiData.error?.message || `Gemini ${mdl} returned ${lastStatus}`;
          }
          const err = new Error(lastErrMsg);
          err.status = lastStatus;
          throw err;
        };

        if (provider === 'cloudflare') {
          const { text, cfModel } = await runCloudflareAi();
          return json({ success: true, text, providerUsed: 'cloudflare', modelUsed: cfModel });
        }

        if (provider === 'gemini') {
          try {
            const { text, modelUsed } = await runGeminiModels();
            return json({ success: true, text, providerUsed: 'gemini', modelUsed });
          } catch (gErr) {
            return json({ error: gErr.message || 'Gemini error' }, gErr.status || 503);
          }
        }

        try {
          const { text, modelUsed } = await runGeminiModels();
          return json({ success: true, text, providerUsed: 'gemini', modelUsed });
        } catch (gErr) {
          console.warn('[Worker AI] Gemini failed, falling back to Cloudflare Workers AI:', gErr.message);
          const { text, cfModel } = await runCloudflareAi();
          return json({ success: true, text, providerUsed: 'cloudflare', modelUsed: cfModel });
        }
      }

      return json({ error: 'Endpoint not found', path }, 404);
    } catch (err) {
      console.error('[Worker Error]', err.stack || err.message);
      return json(
        {
          error: err.message || 'Internal Edge Worker Error',
          timestamp: new Date().toISOString(),
        },
        500
      );
    }
  },
};

