/**
 * ENZOPONIK - Cloudflare Worker Edge IoT & Agronomy Gateway
 *
 * Responsibilities:
 * 1. Ingest telemetry from physical ESP32 hardware (Capacitive Soil Moisture).
 * 2. Automate water pump actuator relay logic (< 50% ON, >= 80% OFF).
 * 3. Synchronize live state & time-series to Google Cloud Firestore (enzoponik).
 * 4. Serve CORS-enabled REST endpoints for the HARU web application.
 * 5. Provide edge-cached weather proxy & Gemini AI agronomy proxy.
 */

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

// Convert native JS values to Firestore REST fields format
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
      // Check if ISO date string
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

// Convert Firestore REST fields back to plain JS object
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

// Firestore REST Helpers
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
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${docPath}?key=${env.FIREBASE_API_KEY}`;
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // 1. CORS Preflight
    if (method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      // 2. Health & Root Info
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

      // 3. IoT Telemetry Ingestion (ESP32 -> Cloudflare Worker -> Firestore)
      if (path === '/api/telemetry' && method === 'POST') {
        const payload = await request.json();
        const deviceId = (payload.deviceId || env.DEFAULT_DEVICE_ID || 'ENZOPONIK-01').toUpperCase();
        const rawMoisture = payload.soilMoisture != null ? Number(payload.soilMoisture) : null;

        if (rawMoisture === null || isNaN(rawMoisture)) {
          return json({ error: 'Missing or invalid "soilMoisture" in JSON payload' }, 400);
        }

        const nowIso = new Date().toISOString();

        // Cek apakah ada perintah manual dari Web Dashboard / Settings
        const controlDoc = await getFirestoreDoc(env, 'device_controls/enzoponik_core').catch(() => null);
        const manualTrigger = Boolean(controlDoc && (controlDoc.pumpActive || controlDoc.flushActive));

        // Cerdas: Evaluasi kondisi pompa air otomatis atau manual override
        let pumpActive = Boolean(payload.pumpActive);
        let pumpDurationSec = Number(payload.pumpDurationSec || 0);

        if (manualTrigger) {
          pumpActive = true;
          pumpDurationSec = Number(controlDoc.pumpDurationSec || 5);
          // Reset flag manual trigger setelah diambil oleh ESP32
          await patchFirestoreDoc(env, 'device_controls/enzoponik_core', {
            pumpActive: false,
            flushActive: false,
            pumpDurationSec: 0,
            updatedAt: nowIso,
          }).catch(() => null);
        } else if (rawMoisture <= 50) {
          pumpActive = true;
          pumpDurationSec = 15;
        } else if (rawMoisture >= 80) {
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
          timestamp: nowIso,
          updatedAt: nowIso,
        };

        // Simpan ke Firestore (Async di background edge via ctx.waitUntil jika memungkinkan)
        const updateCurrentPromise = patchFirestoreDoc(env, 'telemetry/current', liveData);
        const appendHistoryPromise = appendFirestoreDoc(env, 'telemetry_history', {
          deviceId,
          soilMoisture: liveData.soilMoisture,
          pumpActive,
          timestamp: nowIso,
        });

        // Update heartbeat menara
        const updateDevicePromise = patchFirestoreDoc(env, `devices/${deviceId}`, {
          lastSeen: nowIso,
          status: 'online',
        }).catch(() => null);

        // Jika kelembaban kritis, buat notifikasi alert
        let alertPromise = Promise.resolve();
        if (rawMoisture <= 45) {
          alertPromise = appendFirestoreDoc(env, 'alerts', {
            title: 'Kelembaban Tanah Kritis!',
            desc: `Sensor mendeteksi kelembaban tanah turun ke ${Math.round(rawMoisture)}%. Pompa irigasi otomatis diaktifkan.`,
            type: 'warning',
            read: false,
            timestamp: nowIso,
          }).catch(() => null);
        }

        // Tunggu penyimpanan Firestore
        await Promise.all([updateCurrentPromise, appendHistoryPromise, updateDevicePromise, alertPromise]);

        // Berikan respons balik ke ESP32 mikrokontroler dengan instruksi pompa
        return json({
          success: true,
          deviceId,
          soilMoisture: liveData.soilMoisture,
          control: {
            pumpActive,
            pumpDurationSec,
            command: pumpActive ? 'RUN_PUMP' : 'STOP_PUMP',
          },
          serverTime: nowIso,
        });
      }

      // 4. Latest Observation Endpoint (Konsumsi oleh src/lib/api.js di frontend)
      if (path === '/api/observation/latest' && method === 'GET') {
        const liveDoc = await getFirestoreDoc(env, 'telemetry/current');
        if (!liveDoc) {
          return json([]);
        }

        return json([
          {
            node_id: liveDoc.deviceId || env.DEFAULT_DEVICE_ID || 'ENZOPONIK-01',
            soilMoisture: liveDoc.soilMoisture ?? null,
            temperature: liveDoc.temperature ?? null,
            humidity: liveDoc.humidity ?? null,
            pumpActive: Boolean(liveDoc.pumpActive),
            pumpDurationSec: liveDoc.pumpDurationSec ?? 0,
            timestamp: liveDoc.timestamp || new Date().toISOString(),
          },
        ]);
      }

      // 5. Actuator Pump Remote Control
      if (path === '/api/control') {
        if (method === 'GET') {
          const controlDoc = (await getFirestoreDoc(env, 'device_controls/enzoponik_core')) || {};
          return json({
            success: true,
            control: {
              pumpActive: Boolean(controlDoc.pumpActive),
              flushActive: Boolean(controlDoc.flushActive),
              pumpDurationSec: controlDoc.pumpDurationSec || 0,
              updatedAt: controlDoc.updatedAt || null,
            },
          });
        }

        if (method === 'POST') {
          const body = await request.json();
          const nowIso = new Date().toISOString();
          const controlUpdate = {
            pumpActive: Boolean(body.pumpActive),
            flushActive: Boolean(body.flushActive),
            pumpDurationSec: body.pumpDurationSec || (body.pumpActive ? 15 : 0),
            updatedAt: nowIso,
          };

          await patchFirestoreDoc(env, 'device_controls/enzoponik_core', controlUpdate);

          // Update juga live singleton agar UI seketika merespon
          await patchFirestoreDoc(env, 'telemetry/current', {
            pumpActive: controlUpdate.pumpActive,
            pumpDurationSec: controlUpdate.pumpDurationSec,
            updatedAt: nowIso,
          });

          return json({
            success: true,
            message: controlUpdate.pumpActive ? 'Pompa air diaktifkan.' : 'Pompa air dimatikan.',
            control: controlUpdate,
          });
        }
      }

      // 6. Hyperlocal Weather Proxy dengan Edge Caching
      if (path === '/api/weather' && method === 'GET') {
        const lat = url.searchParams.get('lat') || '-8.409518';
        const lon = url.searchParams.get('lon') || '115.188919';

        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,uv_index&hourly=temperature_2m,relative_humidity_2m,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max&timezone=auto`;

        // Cache di Edge selama 10 menit (600 detik)
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

      // 7. Gemini AI Agronomy Proxy (Edge Fallback)
      if (path === '/api/ai/analyze' && method === 'POST') {
        const body = await request.json();
        const prompt = body.prompt || '';
        const systemInstruction = body.systemInstruction;
        const apiKey = env.GEMINI_API_KEY || (body.apiKey ? String(body.apiKey).trim() : '');
        if (!apiKey) {
          return json({ error: 'GEMINI_API_KEY binding not configured on Worker' }, 500);
        }
        const model = body.model || 'gemini-3.5-flash';

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const geminiBody = {
          contents: [{ parts: [{ text: prompt }] }],
        };
        if (systemInstruction) {
          geminiBody.system_instruction = {
            parts: [{ text: typeof systemInstruction === 'string' ? systemInstruction : JSON.stringify(systemInstruction) }],
          };
        }

        const geminiRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiBody),
        });

        const geminiData = await geminiRes.json();
        if (!geminiRes.ok) {
          return json({ error: geminiData.error?.message || 'Gemini error' }, geminiRes.status);
        }

        const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return json({ success: true, text });
      }

      // 8. Route Tidak Ditemukan
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

