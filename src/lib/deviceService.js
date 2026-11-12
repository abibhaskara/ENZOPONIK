/**
 * ENZOPONIK - Multi-Device IoT Data Engineering Service
 * Manages device registry, quota enforcement (Freemium 1 vs Pro Multi-device),
 * real-time telemetry subscriptions, and daily snapshots with retention TTL (30 days vs 12 months).
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';

/**
 * Auto-generate a device ID matching pattern: ezpn-[3 numbers][5 letters]
 * @param {'lower'|'upper'} casing - 'lower' (ezpn-742kxmpt) or 'upper' (EZPN-742KXMPT)
 * @returns {string} Generated device identifier
 */
export function generateDeviceId(casing = 'lower') {
  const digits = Math.floor(100 + Math.random() * 900); // 3 digits: 100 - 999
  const charset = 'abcdefghjkmnpqrstuvwxyz'; // 23 unambiguous lowercase letters
  let letterPart = '';
  for (let i = 0; i < 5; i++) {
    letterPart += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  const id = `ezpn-${digits}${letterPart}`;
  return casing === 'upper' ? id.toUpperCase() : id;
}

/**
 * Fetch all devices owned by the given Google user UID
 * @param {string} uid - User's Google UID
 * @returns {Promise<Array>} List of devices
 */
export async function getUserDevices(uid) {
  if (!isFirebaseConfigured || !uid) return [];

  try {
    const q = query(collection(db, 'devices'), where('ownerUid', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('[DeviceService] Error fetching user devices:', err);
    return [];
  }
}

/**
 * Claim and register a new device to a user account with Freemium Quota Check
 * @param {string} uid - Owner's UID
 * @param {string} deviceId - Physical Device Identifier (e.g., 'ezpn-742kxmpt')
 * @param {string} customName - Optional user-assigned label
 * @param {string} userTier - 'free' | 'pro'
 */
export async function claimDevice(uid, deviceId, customName = '', userTier = 'free') {
  if (!isFirebaseConfigured || !uid || !deviceId) {
    throw new Error('Device ID dan autentikasi diperlukan.');
  }

  const cleanDeviceId = deviceId.trim().toUpperCase();

  // 1. Quota Check for Freemium Users (Ponytail rule: Free max 1 device)
  const existingDevices = await getUserDevices(uid);
  const alreadyClaimedBySameUser = existingDevices.some((d) => d.id === cleanDeviceId);

  if (!alreadyClaimedBySameUser && userTier === 'free' && existingDevices.length >= 1) {
    const error = new Error('LIMIT_REACHED: Paket Free dibatasi maksimal 1 alat. Upgrade ke Pro untuk menambahkan lebih banyak alat.');
    error.code = 'LIMIT_REACHED';
    throw error;
  }

  // 2. Check if already claimed by someone else
  const deviceRef = doc(db, 'devices', cleanDeviceId);
  const existingDoc = await getDoc(deviceRef);
  if (existingDoc.exists()) {
    const data = existingDoc.data();
    if (data.ownerUid && data.ownerUid !== uid) {
      throw new Error('Alat ini sudah terdaftar di bawah akun lain.');
    }
  }

  // 3. Register device under user
  const deviceData = {
    ownerUid: uid,
    deviceId: cleanDeviceId,
    name: customName || `Menara ${existingDevices.length + 1}`,
    claimedAt: serverTimestamp(),
    status: 'online',
    lastSeen: serverTimestamp(),
  };

  await setDoc(deviceRef, deviceData, { merge: true });

  // Update active device in user profile if it's their first device
  if (existingDevices.length === 0) {
    const userDocRef = doc(db, 'users', uid);
    await setDoc(userDocRef, { activeDeviceId: cleanDeviceId }, { merge: true });
  }

  return { id: cleanDeviceId, ...deviceData };
}

/**
 * Delete / unclaim a device
 * @param {string} uid
 * @param {string} deviceId
 */
export async function deleteDevice(uid, deviceId) {
  if (!deviceId) return;
  const cleanDeviceId = deviceId.trim().toUpperCase();

  if (isFirebaseConfigured) {
    try {
      const deviceRef = doc(db, 'devices', cleanDeviceId);
      await deleteDoc(deviceRef);
    } catch (err) {
      console.warn(`[DeviceService] Failed to delete device ${cleanDeviceId} from Firestore:`, err.message);
    }
  }
}

/**
 * Real-time listener for a specific device's state and live telemetry
 * @param {string} deviceId
 * @param {function} onUpdate
 * @returns {function} Unsubscribe callback
 */
export function subscribeToDevice(deviceId, onUpdate) {
  if (!isFirebaseConfigured || !deviceId) {
    return () => {};
  }

  const deviceRef = doc(db, 'devices', deviceId);
  return onSnapshot(
    deviceRef,
    (snap) => {
      if (snap.exists()) {
        onUpdate({ id: snap.id, ...snap.data() });
      }
    },
    (err) => {
      console.warn(`[DeviceService] Device ${deviceId} listener error:`, err.message);
    }
  );
}

/**
 * Save daily aggregated crop snapshot with automated retention TTL
 * - Free tier: 30 days retention
 * - Pro tier: 365 days (12 months) retention
 * @param {string} deviceId
 * @param {object} snapshotData - { avgTemp, avgHumidity, avgMoisture, healthScore, date }
 * @param {string} userTier - 'free' | 'pro'
 */
export async function saveDailySnapshot(deviceId, snapshotData, userTier = 'free') {
  if (!isFirebaseConfigured || !deviceId) return;

  const todayStr = snapshotData.date || new Date().toISOString().slice(0, 10);
  const retentionDays = userTier === 'pro' ? 365 : 30;
  const expireDate = new Date();
  expireDate.setDate(expireDate.getDate() + retentionDays);

  const payload = {
    date: todayStr,
    avgTemp: snapshotData.avgTemp ?? 27.0,
    avgHumidity: snapshotData.avgHumidity ?? 75.0,
    avgMoisture: snapshotData.avgMoisture ?? 70.0,
    healthScore: snapshotData.healthScore ?? 90,
    tier: userTier,
    expireAt: expireDate, // For Firestore native TTL / clean-up policy
    createdAt: serverTimestamp(),
  };

  try {
    const snapshotRef = doc(db, 'devices', deviceId, 'daily_snapshots', todayStr);
    await setDoc(snapshotRef, payload, { merge: true });
  } catch (err) {
    console.error(`[DeviceService] Failed to save daily snapshot for ${deviceId}:`, err);
  }
}

/**
 * Fetch historical daily snapshots for charting and AI analysis
 * @param {string} deviceId
 * @param {number} maxDays - Max days to fetch (e.g. 30 for free, up to 365 for pro)
 */
export async function getDeviceDailySnapshots(deviceId, maxDays = 30) {
  if (!isFirebaseConfigured || !deviceId) return [];

  try {
    const snapshotsRef = collection(db, 'devices', deviceId, 'daily_snapshots');
    const q = query(snapshotsRef, orderBy('date', 'desc'), limit(maxDays));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
  } catch (err) {
    console.error(`[DeviceService] Error fetching snapshots for ${deviceId}:`, err);
    return [];
  }
}

