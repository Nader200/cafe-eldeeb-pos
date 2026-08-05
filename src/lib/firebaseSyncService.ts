/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { doc, setDoc, onSnapshot, collection, Unsubscribe } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebaseClient';
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
  private syncTimeout: any = null;

  constructor() {
    this.init();
  }

  private init() {
    if (typeof window === 'undefined') return;

    // Determine Cafe ID from settings or fallback
    this.updateCafeIdFromSettings();

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
    try {
      const raw = safeStorage.getItem('cafe_settings');
      if (raw) {
        const settings = JSON.parse(raw);
        if (settings.id && settings.id !== 'settings_1') {
          this.cafeId = `cafe_${settings.id}`;
        } else if (settings.phone) {
          const cleanPhone = settings.phone.replace(/[^0-9]/g, '');
          if (cleanPhone) this.cafeId = `cafe_${cleanPhone}`;
        }
      }
    } catch (e) {
      console.warn('Could not parse cafe settings for sync ID:', e);
    }
  }

  private handleOnline() {
    this.status = 'connected';
    this.notifyState();
    this.startListening();
    this.syncAllLocalToCloud();
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
    const storeRef = collection(db, 'cafes', this.cafeId, 'sync_store');

    this.unsubscribeSnapshot = onSnapshot(
      storeRef,
      (snapshot) => {
        this.status = 'syncing';
        this.notifyState();

        let updatedAny = false;

        snapshot.docChanges().forEach((change) => {
          const docData = change.doc.data();
          if (!docData || !docData.key) {
            return;
          }

          const key = docData.key;
          const remoteData = docData.data;
          const remoteUpdatedAt = docData.updatedAt || 0;

          const localMetaKey = `__meta_updated_${key}`;
          const localUpdatedAt = parseInt(safeStorage.getItem(localMetaKey) || '0', 10);

          // Conflict Resolution: Remote Firestore update takes priority or Last Write Wins
          if (remoteUpdatedAt >= localUpdatedAt || change.type === 'added' || change.type === 'modified') {
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
          // Notify React components across all views to re-render fresh data
          window.dispatchEvent(new CustomEvent('cafe_db_synced_remote'));
          window.dispatchEvent(new CustomEvent('barista_orders_updated'));
          window.dispatchEvent(new CustomEvent('open_invoices_updated'));
          window.dispatchEvent(new CustomEvent('storage'));
        }
      },
      (error) => {
        console.error('Firestore sync error:', error);
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
    if (this.isProcessingRemoteChange) {
      // Do not re-push incoming remote changes back to cloud
      return;
    }

    const now = Date.now();
    safeStorage.setItem(`__meta_updated_${key}`, String(now));

    if (!navigator.onLine) {
      this.status = 'offline';
      this.notifyState();
      return;
    }

    this.status = 'syncing';
    this.notifyState();

    try {
      this.updateCafeIdFromSettings();
      const docRef = doc(db, 'cafes', this.cafeId, 'sync_store', key);
      const sanitizedData = data !== undefined ? JSON.parse(JSON.stringify(data)) : null;
      await setDoc(docRef, {
        key,
        data: sanitizedData,
        updatedAt: now,
        deviceId: this.deviceId,
        cafeId: this.cafeId
      });

      this.lastSyncTime = new Date().toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      this.status = 'connected';
    } catch (error) {
      console.error(`Failed to push key ${key} to cloud:`, error);
      handleFirestoreError(error, OperationType.WRITE, `cafes/${this.cafeId}/sync_store/${key}`);
      this.status = 'error';
    } finally {
      this.notifyState();
    }
  }

  /**
   * Full push of all local keys to cloud database
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
        if (val !== null) {
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
      console.error('Error syncing all local keys to cloud:', e);
      this.status = 'error';
    } finally {
      this.notifyState();
    }
  }
}

export const firebaseSyncService = new FirebaseSyncService();
