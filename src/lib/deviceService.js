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
import { getStoredLang, translateKey } from '../locales/translations';

const LOCAL_OWNER_REGISTRY_KEY = 'enzoponik_device_owners';

function getLocalOwnerRegistry() {
  try {
    const raw = localStorage.getItem(LOCAL_OWNER_REGISTRY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalOwnerRegistry(map) {
  try {
    localStorage.setItem(LOCAL_OWNER_REGISTRY_KEY, JSON.stringify(map));
  } catch {}
}

function getUserScopedDevicesKey(uid) {
  return `enzoponik_devices_${uid || 'anon'}`;
}

export function loadLocalUserDevices(uid) {
  if (!uid) return [];
  try {
    const raw = localStorage.getItem(getUserScopedDevicesKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((d) => !d.ownerUid || d.ownerUid === uid)
      : [];
  } catch {
    return [];
  }
}

export function saveLocalUserDevices(uid, list) {
  if (!uid) return;
  try {
    localStorage.setItem(getUserScopedDevicesKey(uid), JSON.stringify(list || []));
  } catch {}
}

export async function getUserDevices(uid) {
  if (!uid) return [];
  const localDevs = loadLocalUserDevices(uid);
  if (!isFirebaseConfigured) return localDevs;

  try {
    const q = query(collection(db, 'devices'), where('ownerUid', '==', uid));
    const snap = await getDocs(q);
    const cloudDevs = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((d) => d.ownerUid === uid);

    const owners = getLocalOwnerRegistry();
    cloudDevs.forEach((d) => {
      owners[d.id] = uid;
    });
    saveLocalOwnerRegistry(owners);

    if (cloudDevs.length > 0) {
      saveLocalUserDevices(uid, cloudDevs);
      return cloudDevs;
    }
    return localDevs;
  } catch (err) {
    console.error('[DeviceService] Error fetching user devices:', err);
    return localDevs;
  }
}

export function subscribeToUserDevices(uid, onUpdate) {
  if (!uid || !isFirebaseConfigured) {
    return () => {};
  }

  const q = query(collection(db, 'devices'), where('ownerUid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const cloudDevs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((d) => d.ownerUid === uid);

      const owners = getLocalOwnerRegistry();
      cloudDevs.forEach((d) => {
        owners[d.id] = uid;
      });
      saveLocalOwnerRegistry(owners);
      saveLocalUserDevices(uid, cloudDevs);
      onUpdate(cloudDevs);
    },
    (err) => {
      console.warn('[DeviceService] User devices listener error:', err.message);
    }
  );
}

export async function claimDevice(uid, deviceId, customName = '', userTier = 'free') {
  const lang = getStoredLang();
  if (!uid || !deviceId) {
    throw new Error(translateKey(lang, 'device_err_auth_required'));
  }

  const cleanDeviceId = deviceId.trim().toUpperCase();
  const alreadyClaimedMsg = translateKey(lang, 'device_err_already_claimed');

  const owners = getLocalOwnerRegistry();
  if (owners[cleanDeviceId] && owners[cleanDeviceId] !== uid) {
    const err = new Error(alreadyClaimedMsg);
    err.code = 'DEVICE_ALREADY_CLAIMED';
    throw err;
  }

  if (isFirebaseConfigured) {
    const deviceRef = doc(db, 'devices', cleanDeviceId);
    const existingDoc = await getDoc(deviceRef).catch(() => null);
    if (existingDoc && existingDoc.exists()) {
      const data = existingDoc.data();
      if (data.ownerUid && data.ownerUid !== uid) {
        owners[cleanDeviceId] = data.ownerUid;
        saveLocalOwnerRegistry(owners);
        const err = new Error(alreadyClaimedMsg);
        err.code = 'DEVICE_ALREADY_CLAIMED';
        throw err;
      }
    }
  }

  const existingDevices = await getUserDevices(uid);
  const alreadyClaimedBySameUser = existingDevices.some((d) => (d.id || d.deviceId) === cleanDeviceId);

  if (!alreadyClaimedBySameUser && userTier === 'free' && existingDevices.length >= 1) {
    const error = new Error(`LIMIT_REACHED: ${translateKey(lang, 'qr_limit_reached')}`);
    error.code = 'LIMIT_REACHED';
    throw error;
  }

  const deviceName = customName || translateKey(lang, 'default_tower_name', { id: existingDevices.length + 1 });
  const localRecord = {
    id: cleanDeviceId,
    deviceId: cleanDeviceId,
    ownerUid: uid,
    name: deviceName,
    status: 'online',
  };

  owners[cleanDeviceId] = uid;
  saveLocalOwnerRegistry(owners);

  const nextLocalList = [...existingDevices.filter((d) => (d.id || d.deviceId) !== cleanDeviceId), localRecord];
  saveLocalUserDevices(uid, nextLocalList);

  if (isFirebaseConfigured) {
    const deviceRef = doc(db, 'devices', cleanDeviceId);
    await setDoc(
      deviceRef,
      {
        ownerUid: uid,
        deviceId: cleanDeviceId,
        name: deviceName,
        claimedAt: serverTimestamp(),
        status: 'online',
        lastSeen: serverTimestamp(),
      },
      { merge: true }
    );

    if (existingDevices.length === 0) {
      const userDocRef = doc(db, 'users', uid);
      await setDoc(userDocRef, { activeDeviceId: cleanDeviceId }, { merge: true }).catch(() => null);
    }
  }

  return localRecord;
}

export async function deleteDevice(uid, deviceId) {
  if (!deviceId) return;
  const cleanDeviceId = deviceId.trim().toUpperCase();

  const owners = getLocalOwnerRegistry();
  if (!owners[cleanDeviceId] || owners[cleanDeviceId] === uid) {
    delete owners[cleanDeviceId];
    saveLocalOwnerRegistry(owners);
  }
  if (uid) {
    const remaining = loadLocalUserDevices(uid).filter((d) => (d.id || d.deviceId) !== cleanDeviceId);
    saveLocalUserDevices(uid, remaining);
  }

  if (isFirebaseConfigured) {
    try {
      const deviceRef = doc(db, 'devices', cleanDeviceId);
      const snap = await getDoc(deviceRef).catch(() => null);
      if (!snap || !snap.exists() || !snap.data().ownerUid || snap.data().ownerUid === uid) {
        await deleteDoc(deviceRef);
      }
    } catch (err) {
      console.warn(`[DeviceService] Failed to delete device ${cleanDeviceId} from Firestore:`, err.message);
    }
  }
}

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

export async function saveDailySnapshot(deviceId, snapshotData, userTier = 'free') {
  if (!isFirebaseConfigured || !deviceId) return;

  const todayStr = snapshotData.date || new Date().toISOString().slice(0, 10);
  const retentionDays = userTier === 'pro' ? 365 : 30;
  const expireDate = new Date();
  expireDate.setDate(expireDate.getDate() + retentionDays);

  if (
    snapshotData?.avgTemp == null ||
    snapshotData?.avgHumidity == null ||
    snapshotData?.avgMoisture == null ||
    snapshotData?.healthScore == null
  ) {
    return;
  }

  const payload = {
    date: todayStr,
    avgTemp: Number(snapshotData.avgTemp),
    avgHumidity: Number(snapshotData.avgHumidity),
    avgMoisture: Number(snapshotData.avgMoisture),
    healthScore: Number(snapshotData.healthScore),
    tier: userTier,
    expireAt: expireDate,
    createdAt: serverTimestamp(),
  };

  try {
    const snapshotRef = doc(db, 'devices', deviceId, 'daily_snapshots', todayStr);
    await setDoc(snapshotRef, payload, { merge: true });
  } catch (err) {
    console.error(`[DeviceService] Failed to save daily snapshot for ${deviceId}:`, err);
  }
}

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

function getJsonByteSize(data) {
  if (data == null) return 0;
  try {
    return new TextEncoder().encode(JSON.stringify(data)).length;
  } catch {
    return 0;
  }
}

export async function measureCloudStorageUsage({ devices = [] }) {
  if (!isFirebaseConfigured || !Array.isArray(devices) || devices.length === 0) {
    return { bytes: 0, docCount: 0 };
  }

  const idVariants = [
    ...new Set(
      devices
        .map((d) => String(d.id || d.deviceId || '').trim())
        .filter(Boolean)
        .flatMap((id) => [id, id.toUpperCase(), id.toLowerCase()])
    ),
  ];

  if (idVariants.length === 0) {
    return { bytes: 0, docCount: 0 };
  }

  const seenIds = new Set();
  let bytes = 0;

  for (let i = 0; i < idVariants.length; i += 10) {
    const chunk = idVariants.slice(i, i + 10);
    try {
      const q = query(collection(db, 'telemetry_history'), where('deviceId', 'in', chunk));
      const snap = await getDocs(q);
      for (const docSnap of snap.docs) {
        if (seenIds.has(docSnap.id)) continue;
        seenIds.add(docSnap.id);
        bytes += getJsonByteSize({ id: docSnap.id, ...docSnap.data() });
      }
    } catch (err) {
      console.warn('[DeviceService] Failed to measure telemetry_history storage:', err.message);
    }
  }

  return { bytes, docCount: seenIds.size };
}

