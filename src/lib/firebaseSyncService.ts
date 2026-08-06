/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { doc, setDoc, onSnapshot, collection, Unsubscribe } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebaseClient';
import { safeStorage } from './safeStorage';
import { syncDiagnosticLogger } from './syncDiagnosticLogger';

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
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      let tabDevId = window.sessionStorage.getItem('cafe_tab_device_id');
      if (!tabDevId) {
        tabDevId = 'dev_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
        window.sessionStorage.setItem('cafe_tab_device_id', tabDevId);
      }
      return tabDevId;
    } catch (e) {
      // Fallback if sessionStorage is disabled
    }
  }
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

    this.updateCafeIdFromSettings();
    const storePath = `cafes/${this.cafeId}/sync_store`;
    console.log(`LISTENING TO: ${storePath}`);
    const storeRef = collection(db, 'cafes', this.cafeId, 'sync_store');

    this.unsubscribeSnapshot = onSnapshot(
      storeRef,
      (snapshot) => {
        this.status = 'syncing';
        this.notifyState();

        let updatedAny = false;

        snapshot.docChanges().forEach((change) => {
          if (change.type === 'removed') return;

          const doc = change.doc;
          console.log("===== SNAPSHOT RECEIVED =====");
          console.log("Document ID:", doc.id);
          console.log("Changed key:", doc.id);
          console.log("Data:", doc.data());
          console.log("Time:", new Date().toISOString());

          const docData = doc.data();
          if (!docData || !docData.key) {
            return;
          }

          const key = docData.key;
          console.log(`RECEIVED REMOTE UPDATE FOR: cafes/${this.cafeId}/sync_store/${key}`, { type: change.type, deviceId: docData.deviceId });
          
          syncDiagnosticLogger.recordSnapshot(
            key,
            `cafes/${this.cafeId}/sync_store`,
            change.type,
            docData.deviceId || 'unknown',
            docData.data
          );

          const remoteData = docData.data;
          const remoteUpdatedAt = docData.updatedAt || 0;

          this.cloudTimestamps.set(key, remoteUpdatedAt);

          const localMetaKey = `__meta_updated_${key}`;
          const localUpdatedAt = parseInt(safeStorage.getItem(localMetaKey) || '0', 10);
          const localVal = safeStorage.getItem(key);

          // If remote update is newer or local is uninitialized, accept remote data
          if (remoteUpdatedAt >= localUpdatedAt || localUpdatedAt === 0 || !localVal) {
            this.isProcessingRemoteChange = true;
            try {
              if (remoteData === null || remoteData === undefined) {
                safeStorage.removeItem(key);
              } else {
                safeStorage.setItem(key, JSON.stringify(remoteData));
              }
              safeStorage.setItem(localMetaKey, String(remoteUpdatedAt));
              updatedAny = true;
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
          syncDiagnosticLogger.recordUIRefresh('POSView & BaristaView & InvoicesView');
          // Notify React components across all views to re-render fresh data
          window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
          window.dispatchEvent(new CustomEvent('barista_orders_updated'));
          window.dispatchEvent(new CustomEvent('open_invoices_updated'));
          window.dispatchEvent(new CustomEvent('storage'));
        }
      },
      (error: any) => {
        console.error('Firestore sync error:', error);
        syncDiagnosticLogger.recordError('Firestore Listener Error', error?.message || String(error));
        handleFirestoreError(error, OperationType.LIST, `cafes/${this.cafeId}/sync_store`);
        this.status = 'error';
        this.notifyState();
      }
    );
  }

  /**
   * Push a specific key's mutation to Firestore
   */
  public async pushKeyToCloud(key: string, data: any): Promise<void> {
    const docPath = `cafes/${this.cafeId}/sync_store/${key}`;

    const now = Date.now();
    safeStorage.setItem(`__meta_updated_${key}`, String(now));
    this.cloudTimestamps.set(key, now);

    if (!navigator.onLine) {
      this.status = 'offline';
      this.notifyState();
      syncDiagnosticLogger.recordPushFailure(key, docPath, 'الجهاز غير متصل بالإنترنت (navigator.onLine = false)');
      return;
    }

    this.status = 'syncing';
    this.notifyState();

    // Record PUSH START in Realtime Log immediately
    syncDiagnosticLogger.recordPushStart(key, docPath);

    try {
      this.updateCafeIdFromSettings();
      console.log("===== PUSH START =====");
      console.log("Cafe ID:", this.cafeId);
      console.log("Key:", key);
      console.log("Document Path:", docPath);
      console.log("Payload:", data);

      console.log(`WRITING TO: ${docPath}`);
      const docRef = doc(db, 'cafes', this.cafeId, 'sync_store', key);
      const sanitizedData = data !== undefined ? JSON.parse(JSON.stringify(data)) : null;

      const start = Date.now();
      await setDoc(docRef, {
        key,
        data: sanitizedData,
        updatedAt: now,
        deviceId: this.deviceId,
        cafeId: this.cafeId
      });

      console.log("[SYNC] AFTER setDoc", Date.now() - start, "ms");

      console.log("===== PUSH SUCCESS =====");
      console.log("Document:", key);

      syncDiagnosticLogger.recordPushSuccess(key, docPath, sanitizedData);

      this.lastSyncTime = new Date().toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      this.status = 'connected';
    } catch (error: any) {
      console.error("===== PUSH FAILED =====");
      console.error(error);
      console.error(`Failed to push key ${key} to cloud:`, error);

      const errStr = error?.message || String(error);
      syncDiagnosticLogger.recordPushFailure(key, docPath, errStr);

      handleFirestoreError(error, OperationType.WRITE, docPath);
      this.status = 'error';
    } finally {
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
      'cafe_partner_drawings', 'cafe_update_logs', 'cafe_barista_orders'
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
    syncDiagnosticLogger.addEvent({
      type: 'ACTION',
      title: 'بدء رفع كلي لجميع المستندات المحلية (Force Push All)',
      details: 'Pushing all local keys directly to Firestore...'
    });

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
      'cafe_partner_drawings', 'cafe_update_logs', 'cafe_barista_orders'
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

    syncDiagnosticLogger.addEvent({
      type: 'ACTION',
      title: `اكتمل الرفع الكلي: تم رفع ${pushedCount} مستند`,
      details: `Force Push finished with ${pushedCount} documents.`
    });

    return pushedCount;
  }

  /**
   * Restart Firestore listener explicitly
   */
  public restartFirestoreListener(): void {
    syncDiagnosticLogger.addEvent({
      type: 'ACTION',
      title: 'إعادة تشغيل مستمع Firestore (Restart Listener)',
      details: 'Restarting Firestore snapshot listener...'
    });

    if (this.unsubscribeSnapshot) {
      this.unsubscribeSnapshot();
      this.unsubscribeSnapshot = null;
    }
    this.startListening();
  }
}

export const firebaseSyncService = new FirebaseSyncService();
