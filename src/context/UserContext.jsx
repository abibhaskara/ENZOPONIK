import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { subscribeToAuth, signInWithGoogle, logOut } from '../lib/authService';
import { getUserDevices, claimDevice as claimDeviceService, deleteDevice as deleteDeviceService } from '../lib/deviceService';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

const STORAGE_KEY = 'enzoponik_user';

const DEFAULT_USER = {
  name: 'Petani Enzoponik',
  email: '',
  avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=Sophie',
  onboarded: true,
  subscriptionTier: 'free', // 'free' (1 device, 30 days) | 'pro' (multi-device, 365 days)
  activeDeviceId: 'EZPN-396QQVMZ',
  cropProfile: null,
};

function loadUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('manik_user');
    if (!raw) return DEFAULT_USER;
    const parsed = JSON.parse(raw);
    if ((parsed.activeDeviceId || '').startsWith('MANIK-TOWER') || !parsed.activeDeviceId) {
      parsed.activeDeviceId = 'EZPN-396QQVMZ';
    }
    // Clean out any legacy mock Tomato profile or unlinked profile
    if (parsed.cropProfile && parsed.cropProfile.cropName === 'Tomato') {
      parsed.cropProfile = null;
    }
    return parsed;
  } catch {
    return DEFAULT_USER;
  }
}

function saveUser(user) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [user, setUser] = useState(() => loadUser());
  const [googleUser, setGoogleUser] = useState(null);
  const [devices, setDevices] = useState(() => {
    try {
      const stored = localStorage.getItem('enzoponik_devices');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [{ id: 'EZPN-396QQVMZ', deviceId: 'EZPN-396QQVMZ', name: 'Menara ENZOPONIK 1', status: 'online' }];
  });
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Sync with Firebase Auth
  useEffect(() => {
    const unsub = subscribeToAuth(async (authUser) => {
      setLoadingAuth(false);
      if (authUser) {
        setGoogleUser(authUser);
        setUser(prev => {
          const updated = {
            ...prev,
            uid: authUser.uid,
            name: authUser.displayName || prev.name,
            email: authUser.email || prev.email,
            avatarUrl: authUser.photoURL || prev.avatarUrl,
            subscriptionTier: authUser.subscriptionTier || prev.subscriptionTier || 'free',
            activeDeviceId: (authUser.activeDeviceId && !authUser.activeDeviceId.startsWith('MANIK-TOWER')) ? authUser.activeDeviceId : '',
            onboarded: true,
          };
          saveUser(updated);
          return updated;
        });

        // Load devices owned by this user
        try {
          const userDevs = await getUserDevices(authUser.uid);
          if (userDevs && userDevs.length > 0) {
            setDevices(userDevs.filter(d => !((d.id || d.deviceId || '').startsWith('MANIK-TOWER'))));
          } else {
            setDevices([]);
          }
        } catch (e) {
          console.warn('[UserContext] Could not load user devices:', e);
        }
      } else {
        setGoogleUser(null);
      }
    });

    return () => unsub();
  }, []);

  const updateUser = useCallback((partial) => {
    setUser(prev => {
      const next = { ...prev, ...partial };
      saveUser(next);
      return next;
    });
  }, []);

  const loginWithGoogle = useCallback(async () => {
    try {
      const profile = await signInWithGoogle();
      if (profile) {
        setUser(prev => {
          const next = {
            ...prev,
            uid: profile.uid,
            name: profile.displayName || prev.name,
            email: profile.email || prev.email,
            avatarUrl: profile.photoURL || prev.avatarUrl,
            subscriptionTier: profile.subscriptionTier || 'free',
            activeDeviceId: (profile.activeDeviceId && !profile.activeDeviceId.startsWith('MANIK-TOWER')) ? profile.activeDeviceId : '',
            onboarded: true,
          };
          saveUser(next);
          return next;
        });
      }
      return profile;
    } catch (err) {
      console.error('[UserContext] Google login failed:', err);
      throw err;
    }
  }, []);

  const loginAsGuest = useCallback(() => {
    setUser(prev => {
      const next = {
        ...prev,
        uid: 'guest_' + Math.random().toString(36).slice(2, 9),
        name: 'Tamu / Demo Farmer',
        email: 'tamu@haru.local',
        onboarded: true,
        activeDeviceId: '',
      };
      saveUser(next);
      return next;
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      await logOut();
    } catch {}
    localStorage.removeItem(STORAGE_KEY);
    setGoogleUser(null);
    setUser(DEFAULT_USER);
  }, []);

  // Switch active IoT device
  const selectActiveDevice = useCallback(async (deviceId) => {
    setUser(prev => {
      const next = { ...prev, activeDeviceId: deviceId };
      saveUser(next);
      return next;
    });

    if (user?.uid) {
      try {
        await setDoc(doc(db, 'users', user.uid), { activeDeviceId: deviceId }, { merge: true });
      } catch (err) {
        console.warn('[UserContext] Could not update active device in Firestore:', err);
      }
    }
  }, [user?.uid]);

  // Add / Claim a new IoT device (enforces Freemium limits with local fallback)
  const addDevice = useCallback(async (deviceId, customName) => {
    const cleanId = (deviceId || '').trim().toUpperCase();
    if (!cleanId) throw new Error('Device ID tidak valid.');

    const uid = user?.uid || 'offline_user';
    const tier = user?.subscriptionTier || 'free';

    let claimed = {
      id: cleanId,
      deviceId: cleanId,
      name: customName || `Menara ${cleanId}`,
      status: 'online',
    };

    try {
      const cloudClaimed = await claimDeviceService(uid, cleanId, customName, tier);
      if (cloudClaimed) claimed = cloudClaimed;
    } catch (e) {
      console.warn('[UserContext] Cloud claim fallback to local device:', e.message);
    }

    setDevices(prev => {
      const next = [...prev.filter(d => (d.id || d.deviceId) !== cleanId), claimed];
      try { localStorage.setItem('enzoponik_devices', JSON.stringify(next)); } catch {}
      return next;
    });
    await selectActiveDevice(cleanId);
    return claimed;
  }, [user?.uid, user?.subscriptionTier, selectActiveDevice]);

  // Remove / Unclaim an IoT device
  const removeDevice = useCallback(async (deviceId) => {
    const uid = user?.uid || 'offline_user';
    await deleteDeviceService(uid, deviceId);
    setDevices(prev => prev.filter(d => (d.id || d.deviceId) !== deviceId));
    if (user?.activeDeviceId === deviceId) {
      setUser(prev => {
        const remaining = devices.filter(d => (d.id || d.deviceId) !== deviceId);
        const nextActive = remaining.length > 0 ? (remaining[0].id || remaining[0].deviceId) : '';
        const updated = { ...prev, activeDeviceId: nextActive };
        saveUser(updated);
        return updated;
      });
    }
  }, [user?.uid, user?.activeDeviceId, devices]);

  // Upgrade or toggle subscription tier ('free' | 'pro')
  const setSubscriptionTier = useCallback(async (tier) => {
    setUser(prev => {
      const next = { ...prev, subscriptionTier: tier };
      saveUser(next);
      return next;
    });

    if (user?.uid) {
      try {
        await setDoc(doc(db, 'users', user.uid), { subscriptionTier: tier }, { merge: true });
      } catch (e) {
        console.warn('[UserContext] Could not save subscription tier in Firestore:', e);
      }
    }
  }, [user?.uid]);

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
        loadingAuth,
        devices,
        activeDeviceId: user?.activeDeviceId || (devices[0]?.id || ''),
        selectActiveDevice,
        addDevice,
        removeDevice,
        subscriptionTier: user?.subscriptionTier || 'free',
        setSubscriptionTier,
        updateUser,
        loginWithGoogle,
        loginAsGuest,
        logout,
        harvestInfo,
        cropProfile,
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
