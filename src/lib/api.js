export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'https://enzoponik-worker.abibhaskaramulya.workers.dev';

export async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function getLatestObservations(deviceId) {
  try {
    const url = deviceId
      ? `${API_BASE_URL}/api/observation/latest?deviceId=${encodeURIComponent(deviceId)}`
      : `${API_BASE_URL}/api/observation/latest`;
    const res = await fetchWithTimeout(url, { cache: 'no-store' }, 4500);
    if (!res.ok) throw new Error(`Backend responded ${res.status}`);
    return res.json();
  } catch (err) {
    if (err?.name !== 'AbortError') {
      console.warn('[API] getLatestObservations failed:', err.message);
    }
    return [];
  }
}

export async function getEdgeWeather(lat, lon) {
  const res = await fetchWithTimeout(
    `${API_BASE_URL}/api/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`,
    {},
    6000
  );
  if (!res.ok) throw new Error(`Edge weather responded ${res.status}`);
  return res.json();
}
