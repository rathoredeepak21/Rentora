import { initializeApp, getApps, getApp } from 'firebase/app';
// @ts-ignore
import { Auth, initializeAuth, getReactNativePersistence, getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Replace with your real Firebase config credentials when ready
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyCw3dCHIdgOQPSJEvVX2u0oy2DZ7ZMCmec",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "rentora-31c64.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "rentora-31c64",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "rentora-31c64.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "293604785108",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:293604785108:android:6bc6705b7f4035ab3eb441",
};

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth with AsyncStorage persistence
let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} catch (error) {
  auth = getAuth(app);
}

// Initialize Firestore
const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});

export { app, auth, db };
export default app;
