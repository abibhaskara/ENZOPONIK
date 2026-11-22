import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { updateProfile } from 'firebase/auth';
import { subscribeToAuth, signInWithGoogle, loginWithEmail, registerWithEmail, logOut, hashCredential } from '../lib/authService';
import {
  getUserDevices,
  subscribeToUserDevices,
  claimDevice as claimDeviceService,
  deleteDevice as deleteDeviceService,
  loadLocalUserDevices,
  saveLocalUserDevices,
} from '../lib/deviceService';
import { getAiQuotaState, syncAiQuotaFromCloud } from '../lib/geminiUtils';
import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../lib/firebase';
import { getStoredLang, translateKey } from '../locales/translations';

const STORAGE_KEY = 'enzoponik_user';
const PENDING_SYNC_PREFIX = 'enzoponik_pending_sync_';

function getDefaultFarmerName() {
  return translateKey(getStoredLang(), 'default_farmer_name');
}

const ALLOWED_CROP_KEYS = [
  'cropName', 'variety', 'growthStage', 'plantedAt', 'cycleDays',
  'irrigationMethod', 'useCustomThresholds', 'optimalMoisture', 'optimalTemp', 'optimalHumidity',
  'scientificName', 'climateAdaptation', 'harvestType', 'minHst', 'maxHst',
  'pumpOnThreshold', 'pumpOffThreshold', 'criticalDryAlert', 'overwaterAlert',
  'tempIdealMin', 'tempIdealMax', 'tempMaxTolerance',
  'substrateMix', 'towerPlacement', 'technicalNote',
];

const NUMERIC_CROP_KEYS = new Set([
  'cycleDays', 'optimalMoisture', 'optimalTemp', 'optimalHumidity',
  'minHst', 'maxHst', 'pumpOnThreshold', 'pumpOffThreshold',
  'criticalDryAlert', 'overwaterAlert', 'tempIdealMin', 'tempIdealMax', 'tempMaxTolerance',
]);

function getPendingSyncKey(uid) {
  return `${PENDING_SYNC_PREFIX}${uid}`;
}

function loadPendingSync(uid) {
  if (!uid) return {};
  try {
    const raw = localStorage.getItem(getPendingSyncKey(uid));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePendingSync(uid, map) {
  if (!uid) return;
  try {
    if (!map || Object.keys(map).length === 0) {
      localStorage.removeItem(getPendingSyncKey(uid));
    } else {
      localStorage.setItem(getPendingSyncKey(uid), JSON.stringify(map));
    }
  } catch {}
}

function sanitizeCropProfile(cp) {
  if (!cp || typeof cp !== 'object' || !String(cp.cropName || '').trim()) return null;
  const out = {};
  for (const key of ALLOWED_CROP_KEYS) {
    if (cp[key] !== undefined && cp[key] !== null) {
      if (NUMERIC_CROP_KEYS.has(key)) {
        const n = Number(cp[key]);
        if (Number.isFinite(n)) out[key] = n;
      } else if (key === 'useCustomThresholds') {
        out[key] = Boolean(cp[key]);
      } else {
        const s = String(cp[key]).trim();
        if (s !== '' || key !== 'harvestType') out[key] = s;
      }
    }
  }
  return out.cropName ? out : null;
}

function sanitizeLocationConfig(loc) {
  if (!loc || typeof loc !== 'object') return null;
  const out = { isLocked: Boolean(loc.isLocked) };
  const lat = Number(loc.latitude);
  const lon = Number(loc.longitude);
  if (Number.isFinite(lat) && lat >= -90 && lat <= 90) out.latitude = lat;
  if (Number.isFinite(lon) && lon >= -180 && lon <= 180) out.longitude = lon;
  return out;
}

function isValidCloudPhotoUrl(url) {
  if (url == null || url === '') return true;
  return typeof url === 'string' && /^https?:\/\/.+/.test(url.trim());
}

function buildUserCloudPatch(partial, next) {
  const payload = {};
  if ('name' in partial) payload.displayName = next.name || '';
  if ('email' in partial) payload.email = next.email || '';
  if ('avatarUrl' in partial && isValidCloudPhotoUrl(next.avatarUrl)) {
    payload.photoURL = next.avatarUrl ? next.avatarUrl.trim() : '';
  }
  if ('subscriptionTier' in partial && (next.subscriptionTier === 'free' || next.subscriptionTier === 'pro')) {
    payload.subscriptionTier = next.subscriptionTier;
  }
  if ('activeDeviceId' in partial) payload.activeDeviceId = String(next.activeDeviceId || '');
  if ('cropProfile' in partial) payload.cropProfile = sanitizeCropProfile(next.cropProfile);
  if ('locationConfig' in partial) payload.locationConfig = sanitizeLocationConfig(next.locationConfig);
  if ('notificationsEnabled' in partial) payload.notificationsEnabled = Boolean(next.notificationsEnabled);
  if ('autoIrrigation' in partial) payload.autoIrrigation = Boolean(next.autoIrrigation);
  if (partial.password && partial.password.length >= 6 && next.email) {
    payload.passwordHash = hashCredential(next.email, partial.password);
  }
  return payload;
}

const UNAUTHENTICATED_USER = {
  uid: null,
  name: '',
  email: '',
  avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=Sophie',
  isAuthenticated: false,
  onboarded: false,
  subscriptionTier: 'free',
  activeDeviceId: '',
  cropProfile: null,
  locationConfig: null,
  notificationsEnabled: true,
  autoIrrigation: true,
};

function loadUser() {
  try {

    localStorage.removeItem('enzoponik_devices');
    localStorage.removeItem('manik_user');

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return UNAUTHENTICATED_USER;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.isAuthenticated || (!parsed.uid && !parsed.email)) {
      return UNAUTHENTICATED_USER;
    }
    delete parsed.password;

    return {
      ...UNAUTHENTICATED_USER,
      ...parsed,
      isAuthenticated: true,
      onboarded: true,
    };
  } catch {
    return UNAUTHENTICATED_USER;
  }
}

function saveUser(user) {
  if (!user || !user.isAuthenticated) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  const cleanUser = { ...user };
  delete cleanUser.password;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanUser));
}

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [user, setUser] = useState(() => loadUser());
  const userRef = useRef(user);
  userRef.current = user;
  const pendingWritesRef = useRef(loadPendingSync(user?.uid));
  const [googleUser, setGoogleUser] = useState(null);
  const [devices, setDevices] = useState(() => loadLocalUserDevices(loadUser()?.uid));
  const [aiQuota, setAiQuota] = useState(() => getAiQuotaState(loadUser()));

  useEffect(() => {
    let active = true;
    const uid = user?.uid;
    if (!uid || !user?.isAuthenticated) {
      pendingWritesRef.current = {};
      setDevices([]);
      return;
    }

    pendingWritesRef.current = loadPendingSync(uid);
    setDevices(loadLocalUserDevices(uid));

    const initialPendingKeys = Object.keys(pendingWritesRef.current);
    if (isFirebaseConfigured && initialPendingKeys.length > 0) {
      const partialFromLocal = {};
      for (const k of initialPendingKeys) {
        if (k in userRef.current) partialFromLocal[k] = userRef.current[k];
      }
      const flushPatch = buildUserCloudPatch(partialFromLocal, userRef.current);
      if (Object.keys(flushPatch).length > 0) {
        const snapshotTokens = { ...pendingWritesRef.current };
        setDoc(doc(db, 'users', uid), { ...flushPatch, updatedAt: serverTimestamp() }, { merge: true })
          .then(() => {
            if (!active) return;
            const currentPending = { ...pendingWritesRef.current };
            for (const k of initialPendingKeys) {
              if (currentPending[k] === snapshotTokens[k]) delete currentPending[k];
            }
            pendingWritesRef.current = currentPending;
            savePendingSync(uid, currentPending);
          })
          .catch((err) => console.warn('[UserContext] Pending settings flush deferred:', err.message));
      }
    }

    const applyDeviceList = (userDevs) => {
      if (!active) return;
      const validDevs = Array.isArray(userDevs) ? userDevs : [];
      setDevices(validDevs);
      setUser((prev) => {
        if (prev.uid !== uid) return prev;
        const ownsCurrentActive = validDevs.some((d) => (d.id || d.deviceId) === prev.activeDeviceId);
        const nextActiveId = ownsCurrentActive
          ? prev.activeDeviceId
          : validDevs.length > 0
            ? (validDevs[0].id || validDevs[0].deviceId)
            : '';
        if (nextActiveId === prev.activeDeviceId) return prev;
        const updated = { ...prev, activeDeviceId: nextActiveId };
        userRef.current = updated;
        saveUser(updated);
        return updated;
      });
    };

    getUserDevices(uid)
      .then(applyDeviceList)
      .catch((e) => console.warn('[UserContext] Could not load user devices:', e));

    const unsubDevices = subscribeToUserDevices(uid, applyDeviceList);

    let unsubUserDoc = () => {};
    if (isFirebaseConfigured) {
      unsubUserDoc = onSnapshot(
        doc(db, 'users', uid),
        (snap) => {
          if (!active || !snap.exists()) return;
          const cloud = snap.data();
          const pending = pendingWritesRef.current;
          setUser((prev) => {
            if (prev.uid !== uid) return prev;
            const next = {
              ...prev,
              name: !pending.name && cloud.displayName ? cloud.displayName : prev.name,
              email: !pending.email && cloud.email ? cloud.email : prev.email,
              avatarUrl: !pending.avatarUrl && cloud.photoURL ? cloud.photoURL : prev.avatarUrl,
              subscriptionTier: !pending.subscriptionTier && cloud.subscriptionTier ? cloud.subscriptionTier : (prev.subscriptionTier || 'free'),
              activeDeviceId:
                !pending.activeDeviceId && cloud.activeDeviceId !== undefined
                  ? cloud.activeDeviceId
                  : prev.activeDeviceId,
              cropProfile: !pending.cropProfile && cloud.cropProfile !== undefined ? cloud.cropProfile : prev.cropProfile,
              locationConfig: !pending.locationConfig && cloud.locationConfig !== undefined ? cloud.locationConfig : prev.locationConfig,
              notificationsEnabled:
                !pending.notificationsEnabled && cloud.notificationsEnabled !== undefined ? cloud.notificationsEnabled : prev.notificationsEnabled,
              autoIrrigation:
                !pending.autoIrrigation && cloud.autoIrrigation !== undefined ? cloud.autoIrrigation : prev.autoIrrigation,
            };
            userRef.current = next;
            saveUser(next);
            if (cloud.aiQuota) {
              syncAiQuotaFromCloud(cloud.aiQuota, next);
            }
            return next;
          });
        },
        (err) => console.warn('[UserContext] User doc live sync error:', err.message)
      );
    }

    return () => {
      active = false;
      unsubDevices();
      unsubUserDoc();
    };
  }, [user?.uid, user?.isAuthenticated]);

  useEffect(() => {
    setAiQuota(getAiQuotaState(userRef.current));
  }, [user?.uid, user?.email, user?.subscriptionTier]);

  useEffect(() => {
    const handleQuotaUpdated = (e) => {
      const currentUser = userRef.current;
      const nextQuota = e?.detail || getAiQuotaState(currentUser);
      setAiQuota(nextQuota);
      if (currentUser?.uid && isFirebaseConfigured && !e?.detail?._fromCloud) {
        setDoc(
          doc(db, 'users', currentUser.uid),
          {
            aiQuota: {
              date: nextQuota.date,
              used: nextQuota.used,
              lastUsedAt: nextQuota.lastUsedAt || null,
              lastFeature: nextQuota.lastFeature || null,
            },
          },
          { merge: true }
        ).catch(() => null);
      }
    };

    window.addEventListener('enzoponik-ai-quota-updated', handleQuotaUpdated);
    const timer = setInterval(() => {
      setAiQuota(getAiQuotaState(userRef.current));
    }, 30000);

    return () => {
      window.removeEventListener('enzoponik-ai-quota-updated', handleQuotaUpdated);
      clearInterval(timer);
    };
  }, [user?.uid]);

  useEffect(() => {
    const unsub = subscribeToAuth(async (authUser) => {
      if (authUser) {
        setGoogleUser(authUser);
        const pending = loadPendingSync(authUser.uid);
        setUser((prev) => {
          const isSameUser = prev.uid === authUser.uid;
          const base = isSameUser ? prev : UNAUTHENTICATED_USER;
          const keepPending = (field) => isSameUser && Boolean(pending[field]);
          const updated = {
            ...base,
            uid: authUser.uid,
            name: keepPending('name') ? base.name : (authUser.displayName || base.name || getDefaultFarmerName()),
            email: keepPending('email') ? base.email : (authUser.email || base.email || ''),
            avatarUrl: keepPending('avatarUrl') ? base.avatarUrl : (authUser.photoURL || base.avatarUrl || 'https://api.dicebear.com/9.x/thumbs/svg?seed=Sophie'),
            subscriptionTier: keepPending('subscriptionTier') ? base.subscriptionTier : (authUser.subscriptionTier || base.subscriptionTier || 'free'),
            activeDeviceId: keepPending('activeDeviceId') ? base.activeDeviceId : (authUser.activeDeviceId || base.activeDeviceId || ''),
            cropProfile: keepPending('cropProfile') ? base.cropProfile : (authUser.cropProfile !== undefined ? authUser.cropProfile : (base.cropProfile || null)),
            locationConfig: keepPending('locationConfig') ? base.locationConfig : (authUser.locationConfig !== undefined ? authUser.locationConfig : (base.locationConfig || null)),
            notificationsEnabled:
              keepPending('notificationsEnabled')
                ? base.notificationsEnabled
                : (authUser.notificationsEnabled !== undefined ? authUser.notificationsEnabled : (base.notificationsEnabled ?? true)),
            autoIrrigation:
              keepPending('autoIrrigation')
                ? base.autoIrrigation
                : (authUser.autoIrrigation !== undefined ? authUser.autoIrrigation : (base.autoIrrigation ?? true)),
            isAuthenticated: true,
            onboarded: true,
          };
          userRef.current = updated;
          saveUser(updated);
          if (authUser.aiQuota) {
            syncAiQuotaFromCloud(authUser.aiQuota, updated);
          } else {
            setAiQuota(getAiQuotaState(updated));
          }
          return updated;
        });
      } else {
        setGoogleUser(null);
      }
    });

    return () => unsub();
  }, []);

  const updateUser = useCallback(async (partial) => {
    const prev = userRef.current;
    const next = { ...prev, ...partial };
    delete next.password;
    userRef.current = next;
    saveUser(next);
    setUser(next);

    if (next.email) {
      try {
        const localAccsRaw = localStorage.getItem('enzoponik_registered_accounts');
        const localAccs = localAccsRaw ? JSON.parse(localAccsRaw) : {};
        const key = next.email.trim().toLowerCase();
        if (localAccs[key]) {
          const updatedAcc = {
            ...localAccs[key],
            displayName: next.name,
            email: next.email,
            photoURL: next.avatarUrl,
            cropProfile: next.cropProfile || null,
            locationConfig: next.locationConfig || null,
            activeDeviceId: next.activeDeviceId || '',
            subscriptionTier: next.subscriptionTier || 'free',
            notificationsEnabled: next.notificationsEnabled ?? true,
            autoIrrigation: next.autoIrrigation ?? true,
          };
          if (partial.password && partial.password.length >= 6) {
            delete updatedAcc.password;
            updatedAcc.passwordHash = hashCredential(key, partial.password);
          }
          localAccs[key] = updatedAcc;
          localStorage.setItem('enzoponik_registered_accounts', JSON.stringify(localAccs));
        }
      } catch {}
    }

    if (!next.uid || !isFirebaseConfigured) {
      return { ok: true, cloudSynced: false };
    }

    const cloudPatch = buildUserCloudPatch(partial, next);
    const writtenKeys = Object.keys(partial);
    const writeToken = Date.now() + Math.random();
    const nextPending = { ...pendingWritesRef.current };
    for (const k of writtenKeys) nextPending[k] = writeToken;
    pendingWritesRef.current = nextPending;
    savePendingSync(next.uid, nextPending);

    if (Object.keys(cloudPatch).length === 0) {
      return { ok: true, cloudSynced: true };
    }

    try {
      if (auth.currentUser && auth.currentUser.uid === next.uid && ('name' in partial || 'avatarUrl' in partial)) {
        const authPatch = {};
        if ('name' in partial && next.name) authPatch.displayName = next.name;
        if ('avatarUrl' in partial && isValidCloudPhotoUrl(next.avatarUrl)) authPatch.photoURL = next.avatarUrl || '';
        if (Object.keys(authPatch).length > 0) {
          await updateProfile(auth.currentUser, authPatch).catch(() => null);
        }
      }

      await setDoc(doc(db, 'users', next.uid), { ...cloudPatch, updatedAt: serverTimestamp() }, { merge: true });

      const remainingPending = { ...pendingWritesRef.current };
      for (const k of writtenKeys) {
        if (remainingPending[k] === writeToken) delete remainingPending[k];
      }
      pendingWritesRef.current = remainingPending;
      savePendingSync(next.uid, remainingPending);
      return { ok: true, cloudSynced: true };
    } catch (err) {
      console.warn('[UserContext] Could not sync user update to Firestore:', err?.message || err);
      return { ok: true, cloudSynced: false, error: err };
    }
  }, []);

  const applyAuthenticatedProfile = useCallback((profile) => {
    if (!profile) return null;
    const ownedLocal = loadLocalUserDevices(profile.uid);
    setDevices(ownedLocal);
    setUser(() => {
      const rawActive = profile.activeDeviceId || '';
      const validActive =
        rawActive && (ownedLocal.length === 0 || ownedLocal.some((d) => (d.id || d.deviceId) === rawActive))
          ? rawActive
          : (ownedLocal[0]?.id || '');

      const next = {
        ...UNAUTHENTICATED_USER,
        uid: profile.uid,
        name: profile.displayName || profile.name || getDefaultFarmerName(),
        email: profile.email || '',
        avatarUrl: profile.photoURL || profile.avatarUrl || 'https://api.dicebear.com/9.x/thumbs/svg?seed=Sophie',
        subscriptionTier: profile.subscriptionTier || 'free',
        activeDeviceId: validActive,
        cropProfile: profile.cropProfile || null,
        locationConfig: profile.locationConfig || null,
        notificationsEnabled: profile.notificationsEnabled ?? true,
        autoIrrigation: profile.autoIrrigation ?? true,
        isAuthenticated: true,
        onboarded: true,
      };
      saveUser(next);
      if (profile.aiQuota) {
        syncAiQuotaFromCloud(profile.aiQuota, next);
      } else {
        setAiQuota(getAiQuotaState(next));
      }
      return next;
    });
    return profile;
  }, []);

  const loginWithGoogle = useCallback(async () => {
    try {
      const profile = await signInWithGoogle();
      return applyAuthenticatedProfile(profile);
    } catch (err) {
      console.error('[UserContext] Google login failed:', err);
      throw err;
    }
  }, [applyAuthenticatedProfile]);

  const loginWithEmailAccount = useCallback(async (email, password) => {
    const profile = await loginWithEmail(email, password);
    return applyAuthenticatedProfile(profile);
  }, [applyAuthenticatedProfile]);

  const registerWithEmailAccount = useCallback(async (name, email, password) => {
    const profile = await registerWithEmail(name, email, password);
    return applyAuthenticatedProfile(profile);
  }, [applyAuthenticatedProfile]);

  const logout = useCallback(async () => {
    const prevUid = userRef.current?.uid;
    try {
      await logOut();
    } catch {}
    if (prevUid) savePendingSync(prevUid, {});
    pendingWritesRef.current = {};
    localStorage.removeItem(STORAGE_KEY);
    setGoogleUser(null);
    setDevices([]);
    userRef.current = UNAUTHENTICATED_USER;
    setUser(UNAUTHENTICATED_USER);
  }, []);

  const selectActiveDevice = useCallback(async (deviceId) => {
    await updateUser({ activeDeviceId: deviceId });
  }, [updateUser]);

  const addDevice = useCallback(async (deviceId, customName) => {
    const cleanId = (deviceId || '').trim().toUpperCase();
    if (!cleanId) throw new Error(translateKey(getStoredLang(), 'device_err_auth_required'));

    const uid = user?.uid;
    if (!uid) throw new Error(translateKey(getStoredLang(), 'device_err_auth_required'));
    const tier = user?.subscriptionTier || 'free';

    const claimed = await claimDeviceService(uid, cleanId, customName, tier);

    setDevices((prev) => {
      const next = [...prev.filter((d) => (d.id || d.deviceId) !== cleanId), claimed];
      saveLocalUserDevices(uid, next);
      return next;
    });
    await selectActiveDevice(cleanId);
    return claimed;
  }, [user?.uid, user?.subscriptionTier, selectActiveDevice]);

  const removeDevice = useCallback(async (deviceId) => {
    const uid = user?.uid;
    await deleteDeviceService(uid, deviceId);
    setDevices((prev) => {
      const remaining = prev.filter((d) => (d.id || d.deviceId) !== deviceId);
      if (uid) saveLocalUserDevices(uid, remaining);
      return remaining;
    });
    if (user?.activeDeviceId === deviceId) {
      const remaining = devices.filter((d) => (d.id || d.deviceId) !== deviceId);
      const nextActive = remaining.length > 0 ? (remaining[0].id || remaining[0].deviceId) : '';
      await selectActiveDevice(nextActive);
    }
  }, [user?.uid, user?.activeDeviceId, devices, selectActiveDevice]);

  const setSubscriptionTier = useCallback(async (tier) => {
    await updateUser({ subscriptionTier: tier });
  }, [updateUser]);

  const cropProfile = useMemo(() => {
    return user?.cropProfile || null;
  }, [user?.cropProfile]);

  const harvestInfo = useMemo(() => {
    if (!cropProfile || !cropProfile.cropName || !cropProfile.cycleDays) {
      return {
        currentDay: 0,
        totalCycleDays: 0,
        daysToHarvest: 0,
      };
    }
    const plantedAt = cropProfile.plantedAt || new Date().toISOString();
    const totalCycleDays = Number(cropProfile.cycleDays) || 0;
    const plantedDate = new Date(plantedAt);
    const now = new Date();
    const msPerDay = 1000 * 60 * 60 * 24;
    const currentDay = Math.max(1, Math.floor((now - plantedDate) / msPerDay));
    const capped = Math.min(currentDay, totalCycleDays);
    return {
      currentDay: capped,
      totalCycleDays,
      daysToHarvest: Math.max(0, totalCycleDays - capped),
    };
  }, [cropProfile]);

  return (
    <UserContext.Provider
      value={{
        user,
        googleUser,
        devices,
        activeDeviceId:
          devices.length > 0
            ? (devices.some((d) => (d.id || d.deviceId) === user?.activeDeviceId)
                ? user.activeDeviceId
                : (devices[0].id || devices[0].deviceId))
            : '',
        selectActiveDevice,
        addDevice,
        removeDevice,
        subscriptionTier: user?.subscriptionTier || 'free',
        setSubscriptionTier,
        updateUser,
        loginWithGoogle,
        loginWithEmailAccount,
        registerWithEmailAccount,
        logout,
        harvestInfo,
        cropProfile,
        aiQuota,
        aiUsed: aiQuota.used,
        aiMaxQuota: aiQuota.max,
        aiRemaining: aiQuota.remaining,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}
