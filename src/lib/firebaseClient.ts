/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getStorage } from 'firebase/storage';
import {
  getAuth,
  signInWithEmailAndPassword,
  signInAnonymously,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  User
} from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  memoryLocalCache,
  doc,
  getDocFromServer,
  onSnapshot,
  setDoc,
  collection,
  getDocs,
  setLogLevel
} from 'firebase/firestore';

// Set Firestore log level to error to suppress transient connection attempt logs
try {
  setLogLevel('error');
} catch {
  // ignore if not supported
}
// Firebase Web App configuration for project cafe-eldeeb-pos
export const firebaseConfig = {
  projectId: "cafe-eldeeb-pos",
  appId: "1:864337937711:web:6ac0c52e98515f602a4dda",
  apiKey: "AIzaSyA-rOKaAUEmfuNsObbduYLQcDLY2s8WAes",
  authDomain: "cafe-eldeeb-pos.firebaseapp.com",
  storageBucket: "cafe-eldeeb-pos.firebasestorage.app",
  messagingSenderId: "864337937711",
  measurementId: "G-6JK5ZJFMH0"
};

// Initialize Firebase App exclusively with cafe-eldeeb-pos project
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

console.log("===== FIREBASE PROJECT CONFIG =====");
console.log("Project ID المستخدم:", firebaseConfig.projectId);
console.log("Firebase App Name:", app.name);

const databaseId = (firebaseConfig as any).firestoreDatabaseId;

// Clean up old firestore_ keys from localStorage if present to prevent QuotaExceededError
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('firestore_')) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => {
      try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ }
    });
  } catch (e) {
    console.warn('Could not clean stale firestore_ localStorage keys:', e);
  }
}

// Initialize Firestore with memoryLocalCache and force long polling for reliable connection across environments
export const db = (() => {
  try {
    const settings = {
      experimentalForceLongPolling: true,
      experimentalAutoDetectLongPolling: true,
      localCache: memoryLocalCache()
    };
    return databaseId && databaseId !== '(default)'
      ? initializeFirestore(app, settings, databaseId)
      : initializeFirestore(app, settings);
  } catch (e1) {
    console.warn('Firestore initialization failed, trying default getFirestore:', e1);
    return databaseId && databaseId !== '(default)' ? getFirestore(app, databaseId) : getFirestore(app);
  }
})();

console.log("Firestore App:", db.app.name);

export const auth = getAuth(app);
export const storage = getStorage(app);

// Configure persistent auth state for browser / Capacitor WebView
if (typeof window !== 'undefined') {
  setPersistence(auth, indexedDBLocalPersistence).catch(() => {
    setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.warn('[Firebase Auth] Persistence set warning:', err);
    });
  });
}

let authPromise: Promise<User | null> | null = null;

export async function ensureFirebaseAuth(forceNonAnonymous = false): Promise<User | null> {
  if (auth.currentUser && (!forceNonAnonymous || !auth.currentUser.isAnonymous)) {
    return auth.currentUser;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return null;
  }
  if (authPromise) {
    return authPromise;
  }

  authPromise = (async () => {
    const targetEmail = "nader.eldeeb.2015@gmail.com";
    const experimentPassword = "password123";

    if (auth.currentUser && !auth.currentUser.isAnonymous && auth.currentUser.email === targetEmail) {
      return auth.currentUser;
    }

    try {
      const credential = await signInWithEmailAndPassword(auth, targetEmail, experimentPassword);
      console.log("===== FIREBASE AUTH STATUS =====");
      console.log("Status: Logged in successfully (Email/Password)");
      console.log("UID:", credential.user.uid);
      console.log("Email:", credential.user.email);
      return credential.user;
    } catch (err: any) {
      console.log("[Firebase Auth Note] Email sign-in fallback check:", err?.code || err?.message);
      if (!auth.currentUser && !forceNonAnonymous) {
        try {
          const anonCred = await signInAnonymously(auth);
          console.log("===== FIREBASE AUTH STATUS =====");
          console.log("Status: Logged in successfully (Anonymous Auth)");
          console.log("UID:", anonCred.user.uid);
          return anonCred.user;
        } catch (anonErr: any) {
          console.warn("[Firebase Auth] Anonymous sign-in notice:", anonErr?.code || anonErr?.message);
          return null;
        }
      }
      return auth.currentUser;
    } finally {
      authPromise = null;
    }
  })();

  return authPromise;
}

// Auto-login check for Firebase Authentication
if (typeof window !== 'undefined') {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log("===== FIREBASE AUTH STATUS =====");
      console.log("Status: Logged in successfully");
      console.log("UID:", user.uid);
      console.log("Email:", user.email || '(anonymous)');
    } else {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        ensureFirebaseAuth().catch((e) => {
          console.warn('[Firebase Auth] Auto auth initialization notice:', e);
        });
      }
    }
  });
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous
    },
    operationType,
    path
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  return errInfo;
}

// Test initial connection as required by skill
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('unavailable') || (error as any).code === 'unavailable')) {
      console.warn('Firestore client is offline or initial connection check failed (will retry automatically).');
    }
    return false;
  }
}
