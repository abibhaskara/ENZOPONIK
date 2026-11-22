import {
  collection,
  doc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import { API_BASE_URL, fetchWithTimeout } from './api';

const TELEMETRY_COLLECTION = 'telemetry_history';
const ALERTS_COLLECTION = 'alerts';

export function subscribeToTelemetryHistory(callback, maxReadings = 50) {
  if (!isFirebaseConfigured) {
    return () => {};
  }

  const historyQuery = query(
    collection(db, TELEMETRY_COLLECTION),
    orderBy('timestamp', 'desc'),
    limit(maxReadings)
  );

  return onSnapshot(
    historyQuery,
    (snapshot) => {
      const list = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        const dateObj = d.timestamp?.toDate
          ? d.timestamp.toDate()
          : (d.timestamp ? new Date(d.timestamp) : new Date());
        return {
          id: docSnap.id,
          ...d,
          timestamp: dateObj,
          soil: d.soilMoisture != null ? Number(d.soilMoisture) : null,
          uv: d.uvIndex != null ? Number(d.uvIndex) : 0,
        };
      }).reverse();
      callback(list);
    },
    (err) => {
      console.warn('[Firebase] Telemetry history listener error:', err.message);
    }
  );
}

export function subscribeToAlerts(callback, maxAlerts = 25) {
  if (!isFirebaseConfigured) {
    return () => {};
  }

  const alertsQuery = query(
    collection(db, ALERTS_COLLECTION),
    orderBy('timestamp', 'desc'),
    limit(maxAlerts)
  );

  return onSnapshot(
    alertsQuery,
    (snapshot) => {
      const list = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        const tsMs = d.timestamp?.toDate?.()?.getTime()
          ?? (typeof d.timestamp === 'number' ? d.timestamp : Date.parse(d.timestamp) || Date.now());
        return {
          id: docSnap.id,
          ...d,
          timestamp: tsMs,
          time: tsMs,
        };
      });
      callback(list);
    },
    (err) => {
      console.warn('[Firebase] Alerts listener error:', err.message);
    }
  );
}

export async function markAlertAsRead(alertId) {
  if (!isFirebaseConfigured || !alertId) return;
  try {
    const alertRef = doc(db, ALERTS_COLLECTION, String(alertId));
    await updateDoc(alertRef, { read: true });
  } catch (err) {
    console.warn('[Firebase] Could not mark alert as read:', err.message);
  }
}

export async function getDeviceControl(deviceId) {
  const cleanId = (deviceId || '').trim().toUpperCase();
  if (!cleanId) return null;

  const res = await fetchWithTimeout(
    `${API_BASE_URL}/api/control?deviceId=${encodeURIComponent(cleanId)}`,
    { cache: 'no-store' },
    5000
  );
  if (!res.ok) throw new Error(`Control fetch responded ${res.status}`);
  const data = await res.json();
  return data?.control || null;
}

export async function updateDeviceControl(command, deviceId) {
  const cleanId = (deviceId || '').trim().toUpperCase();
  if (!cleanId) return null;

  const res = await fetchWithTimeout(
    `${API_BASE_URL}/api/control`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: cleanId, ...command }),
    },
    6000
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Control update responded ${res.status}`);
  }
  return res.json();
}
