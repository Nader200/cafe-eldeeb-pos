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
import firebaseAppletConfig from '../../firebase-applet-config.json';

// Firebase Web App configuration from project setup
export const firebaseConfig = {
  projectId: firebaseAppletConfig.projectId || "gen-lang-client-0294038432",
  appId: firebaseAppletConfig.appId || "1:834307898677:web:0f1e42504326b0a403607c",
  apiKey: firebaseAppletConfig.apiKey || "AIzaSyAhkBuGbcAx5s4rrmKxPCK27PyCbNiX2ec",
  authDomain: firebaseAppletConfig.authDomain || "gen-lang-client-0294038432.firebaseapp.com",
  storageBucket: firebaseAppletConfig.storageBucket || "gen-lang-client-0294038432.firebasestorage.app",
  messagingSenderId: firebaseAppletConfig.messagingSenderId || "834307898677",
  measurementId: firebaseAppletConfig.measurementId || ""
};

// Initialize Firebase App
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

// Configure reasonable retry timeout to prevent long hanging requests on connection or permission issues
try {
  storage.maxOperationRetryTime = 10000; // 10 seconds timeout for operations
  storage.maxUploadRetryTime = 30000; // 30 seconds for uploads
} catch {
  // Ignore if configuration not supported by SDK version
}

// Configure persistent auth state for browser / Capacitor WebView
if (typeof window !== 'undefined') {
  setPersistence(auth, indexedDBLocalPersistence).catch(() => {
    setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.warn('[Firebase Auth] Persistence set warning:', err);
    });
  });
}

let authPromise: Promise<User | null> | null = null;

export async function ensureFirebaseAuth(): Promise<User | null> {
  if (auth.currentUser && !auth.currentUser.isAnonymous) {
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

    // If already logged in as verified owner, return directly
    if (auth.currentUser && !auth.currentUser.isAnonymous && auth.currentUser.email === targetEmail) {
      return auth.currentUser;
    }

    try {
      // Check if user session already exists in persistence
      if (auth.currentUser && auth.currentUser.email === targetEmail) {
        return auth.currentUser;
      }
      return auth.currentUser;
    } catch (err: any) {
      console.warn("[Firebase Auth] Auth check error:", err?.message || err);
      return null;
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
