import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from './firebase';
import { getStoredLang, translateKey } from '../locales/translations';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

function tAuth(key) {
  return translateKey(getStoredLang(), key);
}

function hashCredential(email, password) {
  const input = `enzoponik_salt_v1:${(email || '').trim().toLowerCase()}:${password}`;
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 'ezhash_' + (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

function makeFallbackUid(cleanEmail) {
  return 'ezpn_usr_' + btoa(cleanEmail).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12).toLowerCase();
}

async function syncUserDoc(firebaseUser, customName = null) {
  const userDocRef = doc(db, 'users', firebaseUser.uid);
  const snap = await getDoc(userDocRef).catch(() => null);

  let profileData = {
    uid: firebaseUser.uid,
    displayName: customName || firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : tAuth('default_farmer_name')),
    email: firebaseUser.email || '',
    photoURL: firebaseUser.photoURL || 'https://api.dicebear.com/9.x/thumbs/svg?seed=Sophie',
    lastLoginAt: serverTimestamp(),
  };

  if (!snap || !snap.exists()) {
    profileData = {
      ...profileData,
      subscriptionTier: 'free',
      activeDeviceId: '',
      cropProfile: null,
      createdAt: serverTimestamp(),
    };
    await setDoc(userDocRef, profileData).catch(() => null);
  } else {
    const existing = snap.data();
    profileData = {
      ...existing,
      ...profileData,
      displayName: customName || existing.displayName || profileData.displayName,
      photoURL: existing.photoURL || profileData.photoURL,
      activeDeviceId: existing.activeDeviceId || '',
      cropProfile: existing.cropProfile || null,
    };
    await setDoc(userDocRef, profileData, { merge: true }).catch(() => null);
  }

  return profileData;
}

export async function signInWithGoogle() {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase configuration missing.');
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    return await syncUserDoc(result.user);
  } catch (error) {
    console.error('[AuthService] Google Sign-in Error:', error);
    throw error;
  }
}

export async function loginWithEmail(email, password) {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !password) {
    throw new Error(tAuth('auth_err_empty_credentials'));
  }

  try {
    const result = await signInWithEmailAndPassword(auth, cleanEmail, password);
    return await syncUserDoc(result.user);
  } catch (error) {

    const localAccsRaw = localStorage.getItem('enzoponik_registered_accounts');
    const localAccs = localAccsRaw ? JSON.parse(localAccsRaw) : {};
    const expectedHash = hashCredential(cleanEmail, password);

    if (localAccs[cleanEmail]) {
      const storedAcc = localAccs[cleanEmail];
      const isValid = storedAcc.passwordHash
        ? storedAcc.passwordHash === expectedHash
        : storedAcc.password === password;
      if (!isValid) {
        throw new Error(tAuth('auth_err_wrong_password'));
      }
      if (storedAcc.password) {
        delete storedAcc.password;
        storedAcc.passwordHash = expectedHash;
        localAccs[cleanEmail] = storedAcc;
        try { localStorage.setItem('enzoponik_registered_accounts', JSON.stringify(localAccs)); } catch {}
      }
      if (isFirebaseConfigured && storedAcc.uid) {
        try {
          const snap = await getDoc(doc(db, 'users', storedAcc.uid));
          if (snap.exists()) {
            return { ...storedAcc, ...snap.data(), uid: storedAcc.uid };
          }
          await setDoc(doc(db, 'users', storedAcc.uid), { passwordHash: expectedHash }, { merge: true }).catch(() => null);
        } catch {}
      }
      return storedAcc;
    }

    if (isFirebaseConfigured) {
      const fallbackUid = makeFallbackUid(cleanEmail);
      const snap = await getDoc(doc(db, 'users', fallbackUid)).catch(() => null);
      if (snap && snap.exists()) {
        const cloudProfile = snap.data();
        if (cloudProfile.passwordHash) {
          if (cloudProfile.passwordHash !== expectedHash) {
            throw new Error(tAuth('auth_err_wrong_password'));
          }
          localAccs[cleanEmail] = { ...cloudProfile, uid: fallbackUid };
          try { localStorage.setItem('enzoponik_registered_accounts', JSON.stringify(localAccs)); } catch {}
          return { ...cloudProfile, uid: fallbackUid };
        }
      }
    }
    if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
      throw new Error(tAuth('auth_err_invalid_credential'));
    }
    if (error.code === 'auth/operation-not-allowed') {
      throw new Error(tAuth('auth_err_operation_not_allowed'));
    }
    throw new Error(error.message || tAuth('auth_err_login_failed'));
  }
}

export async function registerWithEmail(name, email, password) {
  const cleanName = (name || '').trim();
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanName) throw new Error(tAuth('auth_err_empty_name'));
  if (!cleanEmail) throw new Error(tAuth('auth_err_empty_email'));
  if (!password || password.length < 6) {
    throw new Error(tAuth('auth_err_short_password'));
  }

  try {
    const result = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    await updateProfile(result.user, {
      displayName: cleanName,
      photoURL: 'https://api.dicebear.com/9.x/thumbs/svg?seed=Sophie',
    }).catch(() => null);
    return await syncUserDoc(result.user, cleanName);
  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      throw new Error(tAuth('auth_err_email_in_use'));
    }

    const localAccsRaw = localStorage.getItem('enzoponik_registered_accounts');
    const localAccs = localAccsRaw ? JSON.parse(localAccsRaw) : {};
    if (localAccs[cleanEmail]) {
      throw new Error(tAuth('auth_err_email_in_use'));
    }
    const uid = makeFallbackUid(cleanEmail);
    if (isFirebaseConfigured) {
      const existingCloud = await getDoc(doc(db, 'users', uid)).catch(() => null);
      if (existingCloud && existingCloud.exists()) {
        throw new Error(tAuth('auth_err_email_in_use'));
      }
    }
    const passwordHash = hashCredential(cleanEmail, password);
    const profileData = {
      uid,
      displayName: cleanName,
      email: cleanEmail,
      passwordHash,
      photoURL: 'https://api.dicebear.com/9.x/thumbs/svg?seed=Sophie',
      subscriptionTier: 'free',
      activeDeviceId: '',
      cropProfile: null,
    };
    try {
      localAccs[cleanEmail] = profileData;
      localStorage.setItem('enzoponik_registered_accounts', JSON.stringify(localAccs));
      await setDoc(doc(db, 'users', uid), {
        uid,
        displayName: cleanName,
        email: cleanEmail,
        passwordHash,
        photoURL: profileData.photoURL,
        subscriptionTier: 'free',
        activeDeviceId: '',
        cropProfile: null,
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch(() => null);
    } catch {}
    return profileData;
  }
}

export async function resetAccountPassword(email, newPassword = null) {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail) throw new Error(tAuth('auth_err_email_not_found'));
  if (newPassword && newPassword.length >= 6) {
    const newHash = hashCredential(cleanEmail, newPassword);
    const localAccsRaw = localStorage.getItem('enzoponik_registered_accounts');
    const localAccs = localAccsRaw ? JSON.parse(localAccsRaw) : {};
    if (localAccs[cleanEmail]) {
      delete localAccs[cleanEmail].password;
      localAccs[cleanEmail].passwordHash = newHash;
      localStorage.setItem('enzoponik_registered_accounts', JSON.stringify(localAccs));
    }
    if (isFirebaseConfigured) {
      const uid = localAccs[cleanEmail]?.uid || makeFallbackUid(cleanEmail);
      await setDoc(doc(db, 'users', uid), { passwordHash: newHash }, { merge: true }).catch(() => null);
    }
    return { mode: 'local_updated' };
  }
  if (isFirebaseConfigured) {
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      return { mode: 'email_sent' };
    } catch {}
  }
  return { mode: 'prompt_new' };
}

export { hashCredential };

export async function logOut() {
  if (!isFirebaseConfigured) return;
  try {
    await signOut(auth);
  } catch (error) {
    console.error('[AuthService] Sign-out Error:', error);
    throw error;
  }
}

export function subscribeToAuth(onUserChange) {
  if (!isFirebaseConfigured) {
    onUserChange(null);
    return () => {};
  }

  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      try {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const snap = await getDoc(userDocRef);
        if (snap.exists()) {
          onUserChange({
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName,
            email: firebaseUser.email,
            photoURL: firebaseUser.photoURL,
            ...snap.data(),
          });
        } else {
          onUserChange({
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName,
            email: firebaseUser.email,
            photoURL: firebaseUser.photoURL,
            subscriptionTier: 'free',
            activeDeviceId: null,
          });
        }
      } catch (e) {
        console.warn('[AuthService] Error fetching user doc:', e.message);
        onUserChange({
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName,
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL,
          subscriptionTier: 'free',
          activeDeviceId: null,
        });
      }
    } else {
      onUserChange(null);
    }
  });
}

