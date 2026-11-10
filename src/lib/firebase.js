import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBT0A4A2ah4bfwC3jWrdZnLpr5FiebQDXk",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "enzoponik.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "enzoponik",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "enzoponik.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "365519708188",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:365519708188:web:c638afa94b9cc6094cffd9",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-S2R91VQM2H"
};

// Initialize Firebase App instance
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore & Auth
export const db = getFirestore(app);
export const auth = getAuth(app);

// Initialize Analytics conditionally (only in browser environments where supported)
export let analytics = null;
if (typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  }).catch(() => {
    // Analytics not supported in this environment
  });
}

export const isFirebaseConfigured = Boolean(
  import.meta.env.VITE_FIREBASE_PROJECT_ID && import.meta.env.VITE_FIREBASE_API_KEY
);
