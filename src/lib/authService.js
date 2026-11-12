/**
 * ENZOPONIK - Firebase Authentication Service
 * Handles Google OAuth, user profile sync, and session management.
 */
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from './firebase';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * Sign in with Google Popup
 * Creates or updates user record in Firestore `users/{uid}`
 */
export async function signInWithGoogle() {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase configuration missing.');
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    // Check if user record exists in Firestore
    const userDocRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userDocRef);

    let profileData = {
      uid: user.uid,
      displayName: user.displayName || 'Farmer Enzoponik',
      email: user.email,
      photoURL: user.photoURL,
      lastLoginAt: serverTimestamp(),
    };

    if (!snap.exists()) {
      // First-time user setup: default to 'free' tier with empty device
      profileData = {
        ...profileData,
        subscriptionTier: 'free', // 'free' | 'pro'
        activeDeviceId: '',
        createdAt: serverTimestamp(),
      };
      await setDoc(userDocRef, profileData);
    } else {
      await setDoc(userDocRef, profileData, { merge: true });
      profileData = { ...snap.data(), ...profileData };
    }

    return profileData;
  } catch (error) {
    console.error('[AuthService] Google Sign-in Error:', error);
    throw error;
  }
}

/**
 * Sign out current user
 */
export async function logOut() {
  if (!isFirebaseConfigured) return;
  try {
    await signOut(auth);
  } catch (error) {
    console.error('[AuthService] Sign-out Error:', error);
    throw error;
  }
}

/**
 * Listen to auth state changes and fetch Firestore profile
 */
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

