import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBT0A4A2ah4bfwC3jWrdZnLpr5FiebQDXk",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "enzoponik.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "enzoponik",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "enzoponik.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "365519708188",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:365519708188:web:c638afa94b9cc6094cffd9",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-S2R91VQM2H"
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// ponytail: auto-detect long polling prevents Safari WebKit WebChannel aborts (ceiling: slight latency on restrictive networks)
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});
export const auth = getAuth(app);

export const isFirebaseConfigured = Boolean(
  firebaseConfig.projectId && firebaseConfig.apiKey
);
