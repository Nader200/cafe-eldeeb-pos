/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { doc, setDoc, getDoc, onSnapshot, collection, Unsubscribe } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType, ensureFirebaseAuth } from './firebaseClient';
import { safeStorage } from './safeStorage';

export type SyncStatus = 'connected' | 'syncing' | 'offline' | 'error';

export interface SyncState {
  status: SyncStatus;
  lastSyncTime: string | null;
  deviceId: string;
  cafeId: string;
  isOnline: boolean;
  syncedKeysCount: number;
}

const DEVICE_ID_KEY = 'cafe_device_id';
const DEFAULT_CAFE_ID = 'main_cafe_eldeeb';

function getDeviceId(): string {
  let devId = safeStorage.getItem(DEVICE_ID_KEY);
  if (!devId) {
    devId = 'dev_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
    safeStorage.setItem(DEVICE_ID_KEY, devId);
  }
  return devId;
}

class FirebaseSyncService {
  private deviceId: string = getDeviceId();
  private cafeId: string = DEFAULT_CAFE_ID;
  private status: SyncStatus = 'offline';
  private lastSyncTime: string | null = null;
  private listeners: ((state: SyncState) => void)[] = [];
  private unsubscribeSnapshot: Unsubscribe | null = null;
  private isProcessingRemoteChange: boolean = false;
  private cloudTimestamps: Map<string, number> = new Map();
  private activePushes: Map<string, Promise<void>> = new Map();

  constructor() {
    this.init();
  }

  private init() {
    if (typeof window === 'undefined') return;

    // Determine Cafe ID from settings or fallback
    this.updateCafeIdFromSettings();

    console.log('[FIREBASE DIAGNOSTICS] Firebase projectId:', (db.app.options as any).projectId);
    console.log('[FIREBASE DIAGNOSTICS] Firebase app name:', db.app.name);
    console.log('[FIREBASE DIAGNOSTICS] DEFAULT_CAFE_ID:', DEFAULT_CAFE_ID);
    console.log('[FIREBASE DIAGNOSTICS] Actual cafeId:', this.cafeId);
    console.log(`[FIREBASE DIAGNOSTICS] Firestore Collection Path: cafes/${this.cafeId}/sync_store`);

    // Online/Offline & Focus/Visibility detection for Android & Web
    this.status = navigator.onLine ? 'connected' : 'offline';
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
    window.addEventListener('focus', () => this.handleForeground());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.handleForeground();
      }
    });

    // Start real-time Firestore listener
    this.startListening();
  }

  private handleForeground() {
    if (navigator.onLine) {
      this.status = 'connected';
      this.startListening();
    }
  }

  public updateCafeIdFromSettings() {
    // Keep cafeId fixed to DEFAULT_CAFE_ID to ensure all clients and devices share the exact same Firestore collection path
    this.cafeId = DEFAULT_CAFE_ID;
  }

  private handleOnline() {
    this.status = 'connected';
    this.notifyState();
    this.startListening();
  }

  private handleOffline() {
    this.status = 'offline';
    this.notifyState();
    if (this.unsubscribeSnapshot) {
      this.unsubscribeSnapshot();
      this.unsubscribeSnapshot = null;
    }
  }

  public subscribe(callback: (state: SyncState) => void): () => void {
    this.listeners.push(callback);
    callback(this.getState());
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  public getState(): SyncState {
    return {
      status: this.status,
      lastSyncTime: this.lastSyncTime,
      deviceId: this.deviceId,
      cafeId: this.cafeId,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      syncedKeysCount: 38
    };
  }

  private notifyState() {
    const state = this.getState();
    this.listeners.forEach(cb => cb(state));
  }

  /**
   * Listen to real-time changes from Firestore for this cafe
   */
  public startListening() {
    if (this.unsubscribeSnapshot) {
      this.unsubscribeSnapshot();
    }

    ensureFirebaseAuth().catch(() => {});

    this.updateCafeIdFromSettings();
    const storePath = `cafes/${this.cafeId}/sync_store`;
    const projectId = (db.app.options as any)?.projectId || 'cafe-eldeeb-pos';

    console.log('CASHIER LISTENER', projectId, this.cafeId, storePath);
    const storeRef = collection(db, 'cafes', this.cafeId, 'sync_store');

    this.unsubscribeSnapshot = onSnapshot(
      storeRef,
      (snapshot) => {
        console.log(
          'CASHIER SNAPSHOT',
          'exists:', !snapshot.empty,
          'fromCache:', snapshot.metadata.fromCache,
          'hasPendingWrites:', snapshot.metadata.hasPendingWrites,
          'data:', snapshot.docs.map(d => ({ id: d.id, key: d.data()?.key, data: d.data()?.data }))
        );

        this.status = 'syncing';
        this.notifyState();

        let updatedAny = false;
        const updatedKeys: string[] = [];

        snapshot.docChanges().forEach((change) => {
          if (change.type === 'removed') return;

          const docSnap = change.doc;
          const docData = docSnap.data();
          if (!docData || !docData.key) return;

          const key = docData.key;
          let remoteData = docData.data;
          const remoteUpdatedAt = docData.updatedAt || 0;

          this.cloudTimestamps.set(key, remoteUpdatedAt);

          const localMetaKey = `__meta_updated_${key}`;
          const localUpdatedAt = parseInt(safeStorage.getItem(localMetaKey) || '0', 10);
          const localVal = safeStorage.getItem(key);

          const isFromOtherDevice = docData.deviceId && docData.deviceId !== this.deviceId;

          // Pure timestamp-based conflict resolution:
          // 1. Accept remote version if it is newer, or if local copy is missing/uninitialized.
          // 2. If timestamps are equal, accept remote safely without data destruction.
          const shouldAcceptRemote =
            remoteUpdatedAt > localUpdatedAt ||
            localUpdatedAt === 0 ||
            !localVal ||
            (remoteUpdatedAt === localUpdatedAt && remoteData !== null && remoteData !== undefined);

          if (shouldAcceptRemote) {
            this.isProcessingRemoteChange = true;
            try {
              if (key === 'cafe_settings') {
                const existingLocalStr = safeStorage.getItem('cafe_settings');
                let existingLocal: any = null;
                try { existingLocal = existingLocalStr ? JSON.parse(existingLocalStr) : null; } catch (e) {}

                const isLocallyComplete = Boolean(
                  (existingLocal && (existingLocal.is_setup_completed === true || (existingLocal.cafe_name && existingLocal.cafe_name.trim().length > 0))) ||
                  safeStorage.getItem('cafe_setup_completed') === 'true'
                );

                const isRemoteComplete = Boolean(
                  remoteData &&
                  (remoteData.is_setup_completed === true || (remoteData.cafe_name && remoteData.cafe_name.trim().length > 0))
                );

                if (isLocallyComplete) {
                  safeStorage.setItem('cafe_setup_completed', 'true');
                  if (!isRemoteComplete) {
                    // Local settings are complete, but remote snapshot is empty/incomplete.
                    // DO NOT OVERWRITE local settings with empty/incomplete remote data!
                    console.warn('[FirebaseSync] Guarded local complete cafe_settings from incomplete remote snapshot');
                    const repairedLocal = {
                      ...(existingLocal || {}),
                      is_setup_completed: true
                    };
                    safeStorage.setItem('cafe_settings', JSON.stringify(repairedLocal));
                    safeStorage.setItem(localMetaKey, String(Date.now()));
                    this.pushKeyToCloud('cafe_settings', repairedLocal);
                    return;
                  }
                } else if (isRemoteComplete) {
                  safeStorage.setItem('cafe_setup_completed', 'true');
                }
              }

              if (remoteData === null || remoteData === undefined) {
                safeStorage.removeItem(key);
              } else {
                safeStorage.setItem(key, JSON.stringify(remoteData));
              }
              safeStorage.setItem(localMetaKey, String(remoteUpdatedAt));
              updatedAny = true;
              updatedKeys.push(key);
            } catch (err) {
              console.error(`Error applying remote sync for key ${key}:`, err);
            } finally {
              this.isProcessingRemoteChange = false;
            }
          } else if (localUpdatedAt > remoteUpdatedAt && localVal) {
            // Local device has newer edits created offline; sync local edit back to cloud
            try {
              const parsed = JSON.parse(localVal);
              this.pushKeyToCloud(key, parsed);
            } catch (e) {}
          }
        });

        this.lastSyncTime = new Date().toLocaleTimeString('ar-EG', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        this.status = 'connected';
        this.notifyState();

        if (updatedAny && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('cafe_db_synced_remote', { detail: { updatedKeys } }));
          window.dispatchEvent(new CustomEvent('open_invoices_updated'));
          window.dispatchEvent(new CustomEvent('storage'));
        }
      },
      (error: any) => {
        const isNetworkErr = error?.code === 'unavailable' || error?.message?.includes('offline') || error?.message?.includes('network-request-failed');
        if (isNetworkErr) {
          console.warn('[Firestore Sync] Network unavailable or offline, maintaining offline sync state.');
          this.status = 'offline';
        } else {
          console.error('Firestore sync error:', error);
          handleFirestoreError(error, OperationType.LIST, `cafes/${this.cafeId}/sync_store`);
          this.status = 'error';
        }
        this.notifyState();
      }
    );
  }

  /**
   * Push a specific key's mutation to Firestore
   */
  public async pushKeyToCloud(key: string, data: any): Promise<void> {
    const cafeId = 'main_cafe_eldeeb';
    this.cafeId = cafeId;
    const docPath = `cafes/${cafeId}/sync_store/${key}`;
    const projectId = (db.app.options as any)?.projectId || 'cafe-eldeeb-pos';

    // Concurrency control: check if a push for this key is already in flight
    const existingPush = this.activePushes.get(key);
    if (existingPush) {
      console.warn(`[CONCURRENCY DETECTED] Multiple calls to pushKeyToCloud("${key}") detected at the same time!`);
      console.warn(`[CONCURRENCY CONTROL] Waiting for active push on key "${key}" to complete before starting new push...`);
      try {
        await existingPush;
      } catch (e) {
        // Continue after previous push finishes or fails
      }
    }

    let pushResolver: () => void = () => {};
    const pushPromise = new Promise<void>((resolve) => {
      pushResolver = resolve;
    });
    this.activePushes.set(key, pushPromise);

    const now = Date.now();
    safeStorage.setItem(`__meta_updated_${key}`, String(now));
    this.cloudTimestamps.set(key, now);

    ensureFirebaseAuth().catch(() => {});

    if (!navigator.onLine) {
      this.status = 'offline';
      this.notifyState();
      this.activePushes.delete(key);
      pushResolver();
      return;
    }

    this.status = 'syncing';
    this.notifyState();

    let sanitizedData: any = null;
    if (data !== undefined && data !== null) {
      try {
        sanitizedData = JSON.parse(JSON.stringify(data, (k, v) => (v === undefined ? null : v)));
      } catch (e) {
        console.warn(`[SYNC] Failed to JSON stringify payload for key ${key}:`, e);
        sanitizedData = data;
      }
    }

    let payloadSizeBytes = 0;
    try {
      payloadSizeBytes = new Blob([JSON.stringify(sanitizedData || {})]).size;
    } catch (e) {
      payloadSizeBytes = 0;
    }

    // Print REQUIRED pre-write diagnostics to console
    console.log(`=== PUSH WRITE START [${key}] ===`);
    console.log('Writing to:', docPath);
    console.log('Project ID:', projectId);
    console.log('Cafe ID:', cafeId);
    console.log('Device ID:', this.deviceId);
    console.log('Document Path:', docPath);
    console.log('Payload Size (Bytes):', payloadSizeBytes);

    const docRef = doc(db, 'cafes', cafeId, 'sync_store', key);
    const payload = {
      key,
      data: sanitizedData,
      updatedAt: now,
      deviceId: this.deviceId,
      cafeId: cafeId
    };

    console.log('ADMIN WRITE', projectId, cafeId, docPath, payload);

    const start = Date.now();

    try {
      console.log(`[SYNC DIRECT PUSH] Invoking setDoc on ${docPath}...`);

      await setDoc(docRef, payload);

      console.log('WRITE COMPLETED');
      const duration = Date.now() - start;

      // Print REQUIRED post-write diagnostics to console
      console.log(`=== PUSH WRITE END [${key}] ===`);
      console.log('هل انتهى await setDoc؟: نعم (COMPLETED)');
      console.log('كم استغرق بالمللي ثانية؟:', duration, 'ms');

      this.lastSyncTime = new Date().toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      this.status = 'connected';
    } catch (error: any) {
      const duration = Date.now() - start;
      console.error(`=== PUSH WRITE FAILED [${key}] after ${duration}ms ===`);
      console.error('setDoc FAILED for path:', docPath);
      console.error('Error object:', error);
      console.error('Error code:', error?.code);
      console.error('Error message:', error?.message);
      console.error('Error stack:', error?.stack);

      handleFirestoreError(error, OperationType.WRITE, docPath);
      this.status = 'error';
      throw error;
    } finally {
      this.activePushes.delete(key);
      pushResolver();
      this.notifyState();
    }
  }

  /**
   * Push local keys that are strictly newer than cloud data
   */
  public async syncAllLocalToCloud(): Promise<void> {
    if (!navigator.onLine) return;

    this.status = 'syncing';
    this.notifyState();

    this.updateCafeIdFromSettings();
    const keysToSync = [
      'cafe_categories', 'cafe_products', 'cafe_customers', 'cafe_suppliers',
      'cafe_invoices', 'cafe_invoice_items', 'cafe_expenses', 'cafe_inventory_transactions',
      'cafe_credit_payments', 'cafe_cash_drawers', 'cafe_daily_closes', 'cafe_settings',
      'cafe_backup_logs', 'cafe_communication_logs', 'cafe_audit_logs', 'cafe_item_modifications',
      'cafe_returns_list', 'cafe_credit_adjustments', 'cafe_cash_history', 'cafe_wallet_transactions',
      'cafe_customer_notes', 'cafe_customer_visits', 'cafe_credit_transactions_system',
      'cafe_tables_system', 'cafe_employees', 'cafe_employee_transactions', 'cafe_ps_devices',
      'cafe_ps_sessions', 'cafe_daily_raw_materials', 'cafe_raw_materials', 'cafe_raw_materials_seeded',
      'cafe_raw_materials_deleted', 'cafe_inventory_batches', 'cafe_inventory_batch_logs',
      'cafe_batch_consumptions', 'cafe_auth_users', 'cafe_auth_audit_logs', 'cafe_partners',
      'cafe_partner_drawings', 'cafe_update_logs', 'cafe_shifts', 'cafe_shift_handovers'
    ];

    try {
      for (const key of keysToSync) {
        const val = safeStorage.getItem(key);
        const localUpdatedAt = parseInt(safeStorage.getItem(`__meta_updated_${key}`) || '0', 10);
        const remoteUpdatedAt = this.cloudTimestamps.get(key) || 0;

        if (val !== null && localUpdatedAt > remoteUpdatedAt) {
          try {
            const parsed = JSON.parse(val);
            await this.pushKeyToCloud(key, parsed);
          } catch (e) {}
        }
      }
      this.lastSyncTime = new Date().toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      this.status = 'connected';
    } catch (e) {
      console.error('Error syncing local keys to cloud:', e);
      this.status = 'error';
    } finally {
      this.notifyState();
    }
  }

  /**
   * Force push all local keys regardless of timestamp comparison
   */
  public async forcePushAllKeys(): Promise<number> {
    const keysToSync = [
      'cafe_categories', 'cafe_products', 'cafe_customers', 'cafe_suppliers',
      'cafe_invoices', 'cafe_invoice_items', 'cafe_expenses', 'cafe_inventory_transactions',
      'cafe_credit_payments', 'cafe_cash_drawers', 'cafe_daily_closes', 'cafe_settings',
      'cafe_backup_logs', 'cafe_communication_logs', 'cafe_audit_logs', 'cafe_item_modifications',
      'cafe_returns_list', 'cafe_credit_adjustments', 'cafe_cash_history', 'cafe_wallet_transactions',
      'cafe_customer_notes', 'cafe_customer_visits', 'cafe_credit_transactions_system',
      'cafe_tables_system', 'cafe_employees', 'cafe_employee_transactions', 'cafe_ps_devices',
      'cafe_ps_sessions', 'cafe_daily_raw_materials', 'cafe_raw_materials', 'cafe_raw_materials_seeded',
      'cafe_raw_materials_deleted', 'cafe_inventory_batches', 'cafe_inventory_batch_logs',
      'cafe_batch_consumptions', 'cafe_auth_users', 'cafe_auth_audit_logs', 'cafe_partners',
      'cafe_partner_drawings', 'cafe_update_logs', 'cafe_shifts', 'cafe_shift_handovers'
    ];

    let pushedCount = 0;
    for (const key of keysToSync) {
      const val = safeStorage.getItem(key);
      if (val !== null) {
        try {
          const parsed = JSON.parse(val);
          await this.pushKeyToCloud(key, parsed);
          pushedCount++;
        } catch (e) {
          console.error(`Failed force push for key ${key}:`, e);
        }
      }
    }

    return pushedCount;
  }

  /**
   * Restart Firestore listener explicitly
   */
  public restartFirestoreListener(): void {
    if (this.unsubscribeSnapshot) {
      this.unsubscribeSnapshot();
      this.unsubscribeSnapshot = null;
    }
    this.startListening();
  }
}

export const firebaseSyncService = new FirebaseSyncService();
