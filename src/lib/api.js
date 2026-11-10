const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export async function getLatestObservations() {
  if (!BASE_URL) return null;
  const res = await fetch(`${BASE_URL}/api/observation/latest`);
  if (!res.ok) throw new Error(`Backend responded ${res.status}`);
  return res.json();
}
