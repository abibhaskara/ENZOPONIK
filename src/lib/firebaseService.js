/**
 * ENZOPONIK - Firebase Firestore Service Layer
 * Provides real-time synchronization, telemetry persistence, alerts, and remote device control.
 */
import {
  collection,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';

const TELEMETRY_COLLECTION = 'telemetry_history';
const LIVE_TELEMETRY_DOC = 'telemetry/current';
const ALERTS_COLLECTION = 'alerts';
const CONTROLS_DOC = 'device_controls/enzoponik_core';

/**
 * Real-time listener for current sensor telemetry
 * @param {function} callback - Receives updated live sensor state
 * @returns {function} Unsubscribe listener function
 */
export function subscribeToLiveTelemetry(callback) {
  if (!isFirebaseConfigured) {
    console.info('[Firebase] Project not configured. Live Firestore subscription inactive.');
    return () => {};
  }

  const liveDocRef = doc(db, 'telemetry', 'current');
  return onSnapshot(
    liveDocRef,
    (snapshot) => {
      if (snapshot.exists()) {
        callback({ id: snapshot.id, ...snapshot.data() });
      }
    },
    (err) => {
      console.warn('[Firebase] Telemetry listener error:', err.message);
    }
  );
}

/**
 * Real-time listener for telemetry history
 * @param {function} callback - Receives array of recent historical telemetry readings
 * @param {number} maxReadings - Limit of recent records
 * @returns {function} Unsubscribe listener function
 */
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
        const dateObj = d.timestamp?.toDate ? d.timestamp.toDate() : new Date();
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

/**
 * Publish / push telemetry reading to both current state and historical collection
 * @param {object} reading - { soilMoisture, temperature, humidity, lightLevel, uvIndex, etc. }
 */
export async function pushTelemetryReading(reading) {
  if (!isFirebaseConfigured) return;

  const payload = {
    ...reading,
    timestamp: serverTimestamp(),
  };

  try {
    // 1. Update live current state
    await setDoc(doc(db, 'telemetry', 'current'), payload, { merge: true });

    // 2. Append to historical series
    await addDoc(collection(db, TELEMETRY_COLLECTION), payload);
  } catch (err) {
    console.error('[Firebase] Failed to push telemetry reading:', err.message);
  }
}

/**
 * Real-time listener for alerts
 * @param {function} callback - Receives array of alert items
 * @param {number} maxAlerts - Limit of recent alerts to fetch
 * @returns {function} Unsubscribe listener function
 */
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
      const list = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
        time: docSnap.data().timestamp?.toDate?.()?.getTime() || Date.now(),
      }));
      callback(list);
    },
    (err) => {
      console.warn('[Firebase] Alerts listener error:', err.message);
    }
  );
}

/**
 * Mark alert as read
 */
export async function markAlertAsRead(alertId) {
  if (!isFirebaseConfigured || !alertId) return;
  try {
    const alertRef = doc(db, ALERTS_COLLECTION, String(alertId));
    await updateDoc(alertRef, { read: true });
  } catch (err) {
    console.warn('[Firebase] Could not mark alert as read:', err.message);
  }
}

/**
 * Send remote irrigation or device control command
 * @param {object} command - { pumpActive: boolean, autoMode?: boolean, manualTrigger?: boolean, pumpDurationSec?: number }
 */
export async function updateDeviceControl(command) {
  if (!isFirebaseConfigured) {
    console.info('[Firebase Mock] Control command issued:', command);
    return;
  }

  try {
    const controlRef = doc(db, 'device_controls', 'enzoponik_core');
    await setDoc(controlRef, { ...command, updatedAt: serverTimestamp() }, { merge: true });
  } catch (err) {
    console.error('[Firebase] Failed to send control command:', err.message);
  }
}

/**
 * Save user crop configuration profile to Firestore
 */
export async function saveUserCropProfile(userId = 'default_farmer', profile) {
  if (!isFirebaseConfigured) return;
  try {
    const profileRef = doc(db, 'user_profiles', userId);
    await setDoc(profileRef, { cropProfile: profile, updatedAt: serverTimestamp() }, { merge: true });
  } catch (err) {
    console.error('[Firebase] Failed to save crop profile:', err.message);
  }
}

