const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://enzoponik-worker.abibhaskaramulya.workers.dev';

export async function getLatestObservations(deviceId) {
  try {
    const url = deviceId
      ? `${BASE_URL}/api/observation/latest?deviceId=${encodeURIComponent(deviceId)}`
      : `${BASE_URL}/api/observation/latest`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Backend responded ${res.status}`);
    return res.json();
  } catch (err) {
    console.warn('[API] getLatestObservations failed:', err.message);
    return [];
  }
}

export async function triggerPumpControl(pumpActive = true, pumpDurationSec = 5) {
  const res = await fetch(`${BASE_URL}/api/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pumpActive, flushActive: pumpActive, pumpDurationSec }),
  });
  if (!res.ok) throw new Error(`Backend responded ${res.status}`);
  return res.json();
}
