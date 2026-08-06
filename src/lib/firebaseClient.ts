/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  memoryLocalCache,
  doc,
  getDocFromServer,
  onSnapshot,
  setDoc,
  collection,
  getDocs
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

console.log("===== FIREBASE RUNTIME =====");
console.log("projectId =", (firebaseConfig as any).projectId);
console.log("appId =", (firebaseConfig as any).appId);
console.log("authDomain =", (firebaseConfig as any).authDomain);

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

// Initialize Firestore with memoryLocalCache and forced long polling to avoid WebSocket hangs in iframe sandboxes
export const db = (() => {
  try {
    const settings = {
      experimentalForceLongPolling: true,
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

export const auth = getAuth(app);

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
