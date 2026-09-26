import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile } from '../types';
import { auth as rawAuth, db } from '../firebase/config';
const firebaseAuth = rawAuth as any;
import { GoogleAuthProvider, signInWithCredential, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db as dbHelper } from '../utils/db';
import { notificationService } from './notificationService';

const AUTH_USER_KEY = '@rentora_auth_user';
let authStateListeners: ((user: UserProfile | null) => void)[] = [];
let currentUser: UserProfile | null = null;

let firebaseAuthInitialized = false;
let initPromiseResolve: ((user: UserProfile | null) => void) | null = null;
const initPromise = new Promise<UserProfile | null>((resolve) => {
  initPromiseResolve = resolve;
});

const sanitizeUserDoc = (data: any) => {
  const cleaned: any = {};
  for (const key of Object.keys(data)) {
    if (data[key] !== undefined && data[key] !== null) {
      cleaned[key] = data[key];
    }
  }
  return cleaned;
};

// Set up Firebase Auth state listener
onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
  console.log(`[onAuthStateChanged] user UID: ${firebaseUser?.uid || 'null'}`);
  if (firebaseUser) {
    try {
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        currentUser = {
          uid: firebaseUser.uid,
          name: data.name || firebaseUser.displayName || 'Owner',
          email: data.email || firebaseUser.email || '',
          photoUrl: data.photoUrl || firebaseUser.photoURL || '',
          phone: data.phone || firebaseUser.phoneNumber || '',
          createdAt: data.createdAt,
          updatedAt: data.updatedAt || new Date().toISOString(),
        };
      } else {
        currentUser = {
          uid: firebaseUser.uid,
          name: firebaseUser.displayName || 'Owner',
          email: firebaseUser.email || '',
          photoUrl: firebaseUser.photoURL || '',
          phone: firebaseUser.phoneNumber || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await setDoc(userDocRef, sanitizeUserDoc(currentUser));
      }
      await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(currentUser));
      // Register device FCM push token in background
      notificationService.registerForPushNotificationsAsync(firebaseUser.uid).catch((err) => {
        console.warn('[LandlordAuth] Push token registration ignored in background:', err);
      });
    } catch (e) {
      console.error('Error fetching user profile in onAuthStateChanged', e);
      currentUser = {
        uid: firebaseUser.uid,
        name: firebaseUser.displayName || 'Owner',
        email: firebaseUser.email || '',
        photoUrl: firebaseUser.photoURL || '',
        phone: firebaseUser.phoneNumber || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
  } else {
    currentUser = null;
    await AsyncStorage.removeItem(AUTH_USER_KEY);
  }
  
  firebaseAuthInitialized = true;
  notifyListeners();
  if (initPromiseResolve) {
    initPromiseResolve(currentUser);
  }
});

// Initial loading of user from storage
export const initAuth = async (): Promise<UserProfile | null> => {
  if (firebaseAuthInitialized) {
    return currentUser;
  }
  return initPromise;
};

export const getCurrentUser = (): UserProfile | null => {
  return currentUser;
};

export const logout = async (): Promise<void> => {
  if (currentUser?.uid) {
    await notificationService.unregisterPushNotificationsAsync(currentUser.uid).catch(() => {});
  }
  currentUser = null;
  await AsyncStorage.removeItem(AUTH_USER_KEY);
  dbHelper.clearCache();
  try {
    await signOut(firebaseAuth);
  } catch (e) {
    console.error('Firebase Auth signOut error', e);
  }
  notifyListeners();
};

export const subscribeAuthStateChanged = (callback: (user: UserProfile | null) => void): (() => void) => {
  authStateListeners.push(callback);
  // Call immediately with current state only if Firebase Auth is already initialized
  if (firebaseAuthInitialized) {
    callback(currentUser);
  }
  
  // Return unsubscribe function
  return () => {
    authStateListeners = authStateListeners.filter(listener => listener !== callback);
  };
};

const notifyListeners = () => {
  authStateListeners.forEach(listener => {
    try {
      listener(currentUser);
    } catch (e) {
      console.error('Error executing auth state listener', e);
    }
  });
};

export const signInWithGoogle = async (idToken: string): Promise<UserProfile> => {
  const credential = GoogleAuthProvider.credential(idToken);
  const userCredential = await signInWithCredential(firebaseAuth, credential);
  const firebaseUser = userCredential.user;

  // Check if user profile already exists in Firestore
  const userDocRef = doc(db, 'users', firebaseUser.uid);
  const userDoc = await getDoc(userDocRef);
  
  let userProfile: UserProfile;

  if (userDoc.exists()) {
    const data = userDoc.data();
    userProfile = {
      uid: firebaseUser.uid,
      name: data.name || firebaseUser.displayName || 'Owner',
      email: data.email || firebaseUser.email || '',
      photoUrl: data.photoUrl || firebaseUser.photoURL || '',
      phone: data.phone || firebaseUser.phoneNumber || '',
      createdAt: data.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await setDoc(userDocRef, { updatedAt: userProfile.updatedAt }, { merge: true });
  } else {
    userProfile = {
      uid: firebaseUser.uid,
      name: firebaseUser.displayName || 'Owner',
      email: firebaseUser.email || '',
      photoUrl: firebaseUser.photoURL || '',
      phone: firebaseUser.phoneNumber || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await setDoc(userDocRef, sanitizeUserDoc(userProfile));
  }

  currentUser = userProfile;
  await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(userProfile));
  notifyListeners();
  return userProfile;
};

export const loginWithEmail = async (email: string, password: string): Promise<UserProfile> => {
  const userCredential = await signInWithEmailAndPassword(firebaseAuth, email, password);
  const firebaseUser = userCredential.user;

  const userDocRef = doc(db, 'users', firebaseUser.uid);
  const userDoc = await getDoc(userDocRef);

  let userProfile: UserProfile;

  if (userDoc.exists()) {
    const data = userDoc.data();
    userProfile = {
      uid: firebaseUser.uid,
      name: data.name || 'Owner',
      email: data.email || firebaseUser.email || '',
      photoUrl: data.photoUrl || '',
      phone: data.phone || '',
      createdAt: data.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await setDoc(userDocRef, { updatedAt: userProfile.updatedAt }, { merge: true });
  } else {
    userProfile = {
      uid: firebaseUser.uid,
      name: firebaseUser.displayName || 'Owner',
      email: firebaseUser.email || '',
      photoUrl: '',
      phone: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await setDoc(userDocRef, sanitizeUserDoc(userProfile));
  }

  currentUser = userProfile;
  await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(userProfile));
  notifyListeners();
  return userProfile;
};

export const registerWithEmail = async (name: string, email: string, password: string, phone?: string): Promise<UserProfile> => {
  const userCredential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
  const firebaseUser = userCredential.user;

  const userProfile: UserProfile = {
    uid: firebaseUser.uid,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    photoUrl: '',
    phone: phone?.trim() || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const userDocRef = doc(db, 'users', firebaseUser.uid);
  await setDoc(userDocRef, sanitizeUserDoc(userProfile));

  currentUser = userProfile;
  await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(userProfile));
  notifyListeners();
  return userProfile;
};

export const updateUserProfile = async (uid: string, updates: Partial<UserProfile>): Promise<UserProfile> => {
  const userDocRef = doc(db, 'users', uid);
  
  const cleanUpdates: any = {};
  if (updates.name !== undefined) cleanUpdates.name = updates.name.trim();
  if (updates.email !== undefined) cleanUpdates.email = updates.email.trim().toLowerCase();
  if (updates.phone !== undefined) cleanUpdates.phone = updates.phone.trim();
  if (updates.photoUrl !== undefined) cleanUpdates.photoUrl = updates.photoUrl;
  
  cleanUpdates.updatedAt = new Date().toISOString();

  // If there's an existing user profile locally, update it
  if (currentUser && currentUser.uid === uid) {
    currentUser = {
      ...currentUser,
      ...cleanUpdates
    };
    await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(currentUser));
    notifyListeners();
  }

  await setDoc(userDocRef, cleanUpdates, { merge: true });
  return currentUser!;
};
