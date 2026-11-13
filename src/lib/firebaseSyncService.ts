/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { doc, setDoc, onSnapshot, collection, Unsubscribe } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, ensureFirebaseAuth } from './firebaseClient';
import { safeStorage } from './safeStorage';

export type SyncStatus = 'connected' | 'syncing' | 'offline' | 'error';

export interface SyncState {
  status: SyncStatus;
  lastSyncTime: string | null;
  deviceId: string;
  cafeId: string;
  isOnline: boolean;
  syncedKeysCount: number;
  pendingDirtyCount: number;
}

const DEVICE_ID_KEY = 'cafe_device_id';
const DEFAULT_CAFE_ID = 'main_cafe_eldeeb';
const DELETED_RECORDS_KEY = 'cafe_deleted_records';
const DIRTY_PREFIX = '__dirty_';
const META_UPDATED_PREFIX = '__meta_updated_';
const MAX_TOMBSTONES = 1000;
const TOMBSTONE_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const PUSH_DEBOUNCE_MS = 120;
const FIRESTORE_SAFE_LIMIT_BYTES = 950 * 1024;

const ALL_SYNC_KEYS: string[] = [
  'cafe_deleted_records',
  'cafe_categories', 'cafe_products', 'cafe_customers', 'cafe_suppliers',
  'cafe_supplier_purchases', 'cafe_supplier_payments',
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

const MERGEABLE_ARRAY_KEYS = new Set<string>([
  'cafe_categories', 'cafe_products', 'cafe_customers', 'cafe_suppliers',
  'cafe_supplier_purchases', 'cafe_supplier_payments',
  'cafe_invoices', 'cafe_invoice_items', 'cafe_expenses', 'cafe_inventory_transactions',
  'cafe_credit_payments', 'cafe_cash_drawers', 'cafe_daily_closes',
  'cafe_credit_adjustments', 'cafe_cash_history', 'cafe_wallet_transactions',
  'cafe_customer_notes', 'cafe_customer_visits', 'cafe_credit_transactions_system',
  'cafe_tables_system', 'cafe_employees', 'cafe_employee_transactions', 'cafe_ps_devices',
  'cafe_ps_sessions', 'cafe_daily_raw_materials', 'cafe_raw_materials',
  'cafe_inventory_batches', 'cafe_inventory_batch_logs', 'cafe_batch_consumptions',
  'cafe_auth_users', 'cafe_partners', 'cafe_partner_drawings',
  'cafe_shifts', 'cafe_shift_handovers', 'cafe_returns_list'
]);

function getDeviceId(): string {
  let devId = safeStorage.getItem(DEVICE_ID_KEY);
  if (!devId) {
    devId = 'dev_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
    safeStorage.setItem(DEVICE_ID_KEY, devId);
  }
  return devId;
}

function parseTimestampMs(val: any): number {
  if (!val) return 0;
  if (typeof val === 'number' && !isNaN(val)) return val;
  if (typeof val === 'string') {
    const num = Number(val);
    if (!isNaN(num) && num > 1000000000000) return num;
    const parsed = Date.parse(val);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function getItemTimestamp(item: any): number {
  if (!item || typeof item !== 'object') return 0;
  return Math.max(
    parseTimestampMs(item.updated_at),
    parseTimestampMs(item.closed_at),
    parseTimestampMs(item.ended_at),
    parseTimestampMs(item.created_at),
    parseTimestampMs(item.invoice_date),
    parseTimestampMs(item.opened_at),
    parseTimestampMs(item.timestamp),
    parseTimestampMs(item.date)
  );
}

function canonicalNormalize(val: any): any {
  if (val === undefined || val === null) return undefined;
  if (Array.isArray(val)) {
    return val.map(item => {
      const n = canonicalNormalize(item);
      return n === undefined ? null : n;
    });
  }
  if (typeof val === 'object') {
    const out: Record<string, any> = {};
    for (const k of Object.keys(val).sort()) {
      const n = canonicalNormalize(val[k]);
      if (n !== undefined) {
        out[k] = n;
      }
    }
    return out;
  }
  return val;
}

function canonicalStringify(val: any): string {
  try {
    return JSON.stringify(canonicalNormalize(val)) ?? 'null';
  } catch (e) {
    return String(val);
  }
}

function loadDeletedRecordsMap(): Record<string, number> {
  try {
    const raw = safeStorage.getItem(DELETED_RECORDS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (e) {}
  return {};
}

function pruneDeletedRecordsMap(map: Record<string, number>): Record<string, number> {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  const entries = Object.entries(map).filter(([, ts]) => typeof ts === 'number' && ts >= cutoff);
  if (entries.length > MAX_TOMBSTONES) {
    entries.sort((a, b) => b[1] - a[1]);
    entries.length = MAX_TOMBSTONES;
  }
  const result: Record<string, number> = {};
  for (const [k, v] of entries) {
    result[k] = v;
  }
  return result;
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
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private pendingPromises: Map<string, { promise: Promise<void>; resolvers: Array<() => void> }> = new Map();

  constructor() {
    this.init();
  }

  private init() {
    if (typeof window === 'undefined') return;

    this.updateCafeIdFromSettings();

    console.log('[FIREBASE DIAGNOSTICS] Firebase projectId:', (db.app.options as any).projectId);
    console.log('[FIREBASE DIAGNOSTICS] Firebase app name:', db.app.name);
    console.log('[FIREBASE DIAGNOSTICS] DEFAULT_CAFE_ID:', DEFAULT_CAFE_ID);
    console.log('[FIREBASE DIAGNOSTICS] Actual cafeId:', this.cafeId);
    console.log(`[FIREBASE DIAGNOSTICS] Firestore Collection Path: cafes/${this.cafeId}/sync_store`);

    this.status = navigator.onLine ? 'connected' : 'offline';
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
    window.addEventListener('focus', () => this.handleForeground());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.handleForeground();
      } else if (document.visibilityState === 'hidden') {
        this.flushPendingPushes().catch(() => {});
      }
    });
    window.addEventListener('pagehide', () => {
      this.flushPendingPushes().catch(() => {});
    });
    window.addEventListener('beforeunload', () => {
      this.flushPendingPushes().catch(() => {});
    });

    this.startListening();

    // Ensure any dirty keys left over from a previous session/crash are pushed on startup
    if (navigator.onLine && this.hasPendingDirtyKeys()) {
      setTimeout(() => {
        this.syncAllLocalToCloud().catch(() => {});
      }, 500);
    }
  }

  private handleForeground() {
    if (navigator.onLine) {
      this.status = 'connected';
      if (!this.unsubscribeSnapshot) {
        this.startListening();
      }
      if (this.hasPendingDirtyKeys()) {
        this.syncAllLocalToCloud().catch(() => {});
      }
      this.notifyState();
    }
  }

  public updateCafeIdFromSettings() {
    this.cafeId = DEFAULT_CAFE_ID;
  }

  private handleOnline() {
    this.status = 'connected';
    this.notifyState();
    if (!this.unsubscribeSnapshot) {
      this.startListening();
    }
    this.syncAllLocalToCloud().catch(() => {});
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

  private getPendingDirtyCount(): number {
    let count = 0;
    for (const key of ALL_SYNC_KEYS) {
      if (safeStorage.getItem(`${DIRTY_PREFIX}${key}`)) {
        count++;
      }
    }
    return count;
  }

  public hasPendingDirtyKeys(): boolean {
    return this.getPendingDirtyCount() > 0 || this.debounceTimers.size > 0;
  }

  public getState(): SyncState {
    return {
      status: this.status,
      lastSyncTime: this.lastSyncTime,
      deviceId: this.deviceId,
      cafeId: this.cafeId,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      syncedKeysCount: ALL_SYNC_KEYS.length,
      pendingDirtyCount: this.getPendingDirtyCount()
    };
  }

  private notifyState() {
    const state = this.getState();
    this.listeners.forEach(cb => cb(state));
  }

  /**
   * Record deleted ID(s) in tombstone store so remote snapshots never resurrect deleted records
   */
  public recordDeletion(collectionKey: string, id: string): void {
    if (!collectionKey || !id) return;
    this.recordDeletions(collectionKey, [id]);
  }

  public recordDeletions(collectionKey: string, ids: string[]): void {
    if (!collectionKey || !ids || ids.length === 0) return;
    const now = Date.now();
    const map = loadDeletedRecordsMap();
    for (const id of ids) {
      if (id) {
        map[`${collectionKey}::${id}`] = now;
      }
    }
    const pruned = pruneDeletedRecordsMap(map);
    safeStorage.setItem(DELETED_RECORDS_KEY, JSON.stringify(pruned));
    this.pushKeyToCloud(DELETED_RECORDS_KEY, pruned).catch(() => {});
  }

  /**
   * Merge two ID-based arrays without wiping out newly added local or remote items
   */
  private mergeCollectionArrays(
    key: string,
    localArr: any[],
    remoteArr: any[],
    deletedMap: Record<string, number>,
    localUpdatedAt: number,
    remoteUpdatedAt: number,
    localIsDirty: boolean
  ): { merged: any[]; changedLocal: boolean; needsPushBack: boolean } {
    const byId = new Map<string, { item: any; ts: number; source: 'local' | 'remote' }>();
    const unkeyedLocal: any[] = [];
    const unkeyedRemote: any[] = [];

    for (const item of localArr) {
      if (!item || typeof item !== 'object' || !item.id) {
        if (item !== undefined && item !== null) unkeyedLocal.push(item);
        continue;
      }
      const id = String(item.id);
      const itemTs = getItemTimestamp(item);
      const delTs = deletedMap[`${key}::${id}`] || 0;
      if (delTs > 0 && delTs >= itemTs) {
        continue; // Deleted more recently than last edit
      }
      const existing = byId.get(id);
      if (!existing || itemTs >= existing.ts) {
        byId.set(id, { item, ts: itemTs, source: 'local' });
      }
    }

    for (const item of remoteArr) {
      if (!item || typeof item !== 'object' || !item.id) {
        if (item !== undefined && item !== null) unkeyedRemote.push(item);
        continue;
      }
      const id = String(item.id);
      const itemTs = getItemTimestamp(item);
      const delTs = deletedMap[`${key}::${id}`] || 0;
      if (delTs > 0 && delTs >= itemTs) {
        // Ensure local copy is also removed if tombstone is newer
        byId.delete(id);
        continue;
      }

      const existing = byId.get(id);
      if (!existing) {
        byId.set(id, { item, ts: itemTs, source: 'remote' });
      } else {
        // Both local and remote have this ID: pick fresher record
        if (itemTs > existing.ts) {
          byId.set(id, { item, ts: itemTs, source: 'remote' });
        } else if (itemTs === existing.ts) {
          // Equal item timestamps: if local has dirty unpushed edits, keep local; otherwise take remote when remoteUpdatedAt >= localUpdatedAt
          if (!localIsDirty && remoteUpdatedAt >= localUpdatedAt) {
            byId.set(id, { item, ts: itemTs, source: 'remote' });
          }
        }
      }
    }

    let merged: any[];
    if (byId.size > 0 || (unkeyedLocal.length === 0 && unkeyedRemote.length === 0)) {
      merged = Array.from(byId.values()).map(v => v.item);
      if (unkeyedLocal.length > 0 || unkeyedRemote.length > 0) {
        merged = [...merged, ...(remoteUpdatedAt >= localUpdatedAt && !localIsDirty ? unkeyedRemote : unkeyedLocal)];
      }
    } else {
      merged = remoteUpdatedAt >= localUpdatedAt && !localIsDirty ? remoteArr : localArr;
    }

    const remoteIds = new Set<string>();
    const remoteById = new Map<string, any>();
    for (const r of remoteArr) {
      if (r && typeof r === 'object' && r.id) {
        const id = String(r.id);
        remoteIds.add(id);
        remoteById.set(id, r);
      }
    }

    const changedLocal = canonicalStringify(merged) !== canonicalStringify(localArr);

    let needsPushBack = false;
    if (localIsDirty) {
      needsPushBack = canonicalStringify(merged) !== canonicalStringify(remoteArr);
    } else {
      for (const item of merged) {
        if (!item || typeof item !== 'object' || !item.id) continue;
        const id = String(item.id);
        if (!remoteIds.has(id)) {
          needsPushBack = true;
          break;
        }
        const rem = remoteById.get(id);
        if (getItemTimestamp(item) > getItemTimestamp(rem)) {
          needsPushBack = true;
          break;
        }
      }
    }

    return { merged, changedLocal, needsPushBack };
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
        this.status = 'syncing';
        this.notifyState();

        let updatedAny = false;
        const updatedKeys: string[] = [];

        const changes = snapshot.docChanges().filter(c => c.type !== 'removed');

        // 1. Process tombstones FIRST so deleted records are respected during collection merges
        const deletedChange = changes.find(c => c.doc.data()?.key === DELETED_RECORDS_KEY);
        if (deletedChange) {
          const delDocData = deletedChange.doc.data();
          const remoteDel = delDocData?.data;
          const remoteDelUpdatedAt = delDocData?.updatedAt || 0;
          this.cloudTimestamps.set(DELETED_RECORDS_KEY, remoteDelUpdatedAt);

          if (remoteDel && typeof remoteDel === 'object' && !Array.isArray(remoteDel)) {
            const localDel = loadDeletedRecordsMap();
            const mergedDel: Record<string, number> = { ...localDel };
            let localNeedsUpdate = false;
            let remoteNeedsUpdate = false;

            for (const [k, ts] of Object.entries(remoteDel)) {
              const numTs = typeof ts === 'number' ? ts : 0;
              if (!mergedDel[k] || numTs > mergedDel[k]) {
                mergedDel[k] = numTs;
                localNeedsUpdate = true;
              }
            }
            for (const [k, ts] of Object.entries(localDel)) {
              const remTs = typeof (remoteDel as any)[k] === 'number' ? (remoteDel as any)[k] : 0;
              if (ts > remTs) {
                remoteNeedsUpdate = true;
              }
            }

            const prunedDel = pruneDeletedRecordsMap(mergedDel);
            if (localNeedsUpdate) {
              safeStorage.setItem(DELETED_RECORDS_KEY, JSON.stringify(prunedDel));
              safeStorage.setItem(`${META_UPDATED_PREFIX}${DELETED_RECORDS_KEY}`, String(Math.max(
                parseInt(safeStorage.getItem(`${META_UPDATED_PREFIX}${DELETED_RECORDS_KEY}`) || '0', 10),
                remoteDelUpdatedAt
              )));
            }
            if (remoteNeedsUpdate && navigator.onLine) {
              this.pushKeyToCloud(DELETED_RECORDS_KEY, prunedDel).catch(() => {});
            }
          }
        }

        const currentDeletedMap = loadDeletedRecordsMap();

        // 2. Process all other collection/document changes
        changes.forEach((change) => {
          const docSnap = change.doc;
          const docData = docSnap.data();
          if (!docData || !docData.key) return;

          const key = docData.key;
          if (key === DELETED_RECORDS_KEY) return;

          const remoteData = docData.data;
          const remoteUpdatedAt = docData.updatedAt || 0;
          this.cloudTimestamps.set(key, remoteUpdatedAt);

          const localMetaKey = `${META_UPDATED_PREFIX}${key}`;
          const localUpdatedAt = parseInt(safeStorage.getItem(localMetaKey) || '0', 10);
          const localIsDirty = Boolean(safeStorage.getItem(`${DIRTY_PREFIX}${key}`));
          const localVal = safeStorage.getItem(key);

          // Ignore our own echoed writes when local state is clean and up to date
          if (docData.deviceId === this.deviceId && !localIsDirty && remoteUpdatedAt >= localUpdatedAt) {
            safeStorage.setItem(localMetaKey, String(remoteUpdatedAt));
            return;
          }

          // Special safe merge for all ID-based array collections (products, customers, invoices, etc.)
          if (MERGEABLE_ARRAY_KEYS.has(key) && Array.isArray(remoteData)) {
            let localArr: any[] = [];
            let hasValidLocalArr = false;
            if (localVal) {
              try {
                const parsed = JSON.parse(localVal);
                if (Array.isArray(parsed)) {
                  localArr = parsed;
                  hasValidLocalArr = true;
                }
              } catch (e) {}
            }

            if (!hasValidLocalArr) {
              // Local copy missing or empty -> accept remote (minus deleted tombstones)
              const filteredRemote = remoteData.filter(item => {
                if (!item || typeof item !== 'object' || !item.id) return true;
                const delTs = currentDeletedMap[`${key}::${item.id}`] || 0;
                return !(delTs > 0 && delTs >= getItemTimestamp(item));
              });
              this.isProcessingRemoteChange = true;
              try {
                safeStorage.setItem(key, JSON.stringify(filteredRemote));
                safeStorage.setItem(localMetaKey, String(remoteUpdatedAt));
                updatedAny = true;
                updatedKeys.push(key);
              } finally {
                this.isProcessingRemoteChange = false;
              }
              return;
            }

            const { merged, changedLocal, needsPushBack } = this.mergeCollectionArrays(
              key,
              localArr,
              remoteData,
              currentDeletedMap,
              localUpdatedAt,
              remoteUpdatedAt,
              localIsDirty
            );

            if (changedLocal) {
              this.isProcessingRemoteChange = true;
              try {
                safeStorage.setItem(key, JSON.stringify(merged));
                const nextTs = Math.max(localUpdatedAt, remoteUpdatedAt);
                safeStorage.setItem(localMetaKey, String(nextTs));
                updatedAny = true;
                updatedKeys.push(key);
              } catch (err) {
                console.error(`Error applying merged remote sync for key ${key}:`, err);
              } finally {
                this.isProcessingRemoteChange = false;
              }
            } else if (!localIsDirty && remoteUpdatedAt > localUpdatedAt) {
              safeStorage.setItem(localMetaKey, String(remoteUpdatedAt));
            }

            if ((needsPushBack || localIsDirty) && navigator.onLine) {
              this.pushKeyToCloud(key, merged).catch(() => {});
            }
            return;
          }

          // Non-array or object keys (e.g. cafe_settings, flags)
          const shouldAcceptRemote =
            !localIsDirty && (
              remoteUpdatedAt > localUpdatedAt ||
              localUpdatedAt === 0 ||
              !localVal ||
              (remoteUpdatedAt === localUpdatedAt && remoteData !== null && remoteData !== undefined)
            );

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
                    console.warn('[FirebaseSync] Guarded local complete cafe_settings from incomplete remote snapshot');
                    const repairedLocal = {
                      ...(existingLocal || {}),
                      is_setup_completed: true
                    };
                    safeStorage.setItem('cafe_settings', JSON.stringify(repairedLocal));
                    safeStorage.setItem(localMetaKey, String(Date.now()));
                    this.pushKeyToCloud('cafe_settings', repairedLocal).catch(() => {});
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
          } else if ((localIsDirty || localUpdatedAt > remoteUpdatedAt) && localVal) {
            try {
              const parsed = JSON.parse(localVal);
              this.pushKeyToCloud(key, parsed).catch(() => {});
            } catch (e) {}
          }
        });

        this.lastSyncTime = new Date().toLocaleTimeString('ar-EG', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        this.status = navigator.onLine ? 'connected' : 'offline';
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
   * Queue a debounced/coalesced push for a key.
   * Marks the key dirty immediately in persistent storage and only clears the dirty flag after setDoc succeeds.
   */
  public pushKeyToCloud(key: string, _data: any): Promise<void> {
    if (this.isProcessingRemoteChange) {
      return Promise.resolve();
    }

    const now = Date.now();
    safeStorage.setItem(`${META_UPDATED_PREFIX}${key}`, String(now));
    safeStorage.setItem(`${DIRTY_PREFIX}${key}`, String(now));
    this.notifyState();

    // Clear existing debounce timer for this key so rapid mutations coalesce into one clean push of the latest state
    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    let pendingEntry = this.pendingPromises.get(key);
    if (!pendingEntry) {
      const resolvers: Array<() => void> = [];
      const promise = new Promise<void>((resolve) => {
        resolvers.push(resolve);
      });
      pendingEntry = { promise, resolvers };
      this.pendingPromises.set(key, pendingEntry);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      this.executePushFromStorage(key);
    }, PUSH_DEBOUNCE_MS);

    this.debounceTimers.set(key, timer);
    return pendingEntry.promise;
  }

  /**
   * Immediately execute all pending debounced writes without waiting for the debounce window
   */
  public async flushPendingPushes(): Promise<void> {
    const keysToFlush = Array.from(this.debounceTimers.keys());
    const promises: Promise<void>[] = [];

    for (const key of keysToFlush) {
      const timer = this.debounceTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        this.debounceTimers.delete(key);
      }
      const pending = this.pendingPromises.get(key);
      if (pending) {
        promises.push(pending.promise);
      }
      this.executePushFromStorage(key);
    }

    // Also include any active in-flight pushes
    for (const p of this.activePushes.values()) {
      promises.push(p);
    }

    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }

  private resolvePending(key: string) {
    const pendingEntry = this.pendingPromises.get(key);
    if (pendingEntry) {
      this.pendingPromises.delete(key);
      pendingEntry.resolvers.forEach(r => r());
    }
  }

  private async executePushFromStorage(key: string): Promise<void> {
    const cafeId = DEFAULT_CAFE_ID;
    this.cafeId = cafeId;
    const docPath = `cafes/${cafeId}/sync_store/${key}`;

    const existingPush = this.activePushes.get(key);
    if (existingPush) {
      try {
        await existingPush;
      } catch (e) {}
    }

    let pushResolver: () => void = () => {};
    const pushPromise = new Promise<void>((resolve) => {
      pushResolver = resolve;
    });
    this.activePushes.set(key, pushPromise);

    try {
      ensureFirebaseAuth().catch(() => {});

      if (!navigator.onLine) {
        this.status = 'offline';
        this.notifyState();
        this.resolvePending(key);
        return;
      }

      // Always read the LATEST persisted value from safeStorage right before pushing
      const dirtyStampAtStart = safeStorage.getItem(`${DIRTY_PREFIX}${key}`) || String(Date.now());
      const rawStored = safeStorage.getItem(key);
      let latestData: any = null;
      if (rawStored !== null) {
        try {
          latestData = JSON.parse(rawStored);
        } catch (e) {
          latestData = rawStored;
        }
      }

      this.status = 'syncing';
      this.notifyState();

      let sanitizedData: any = null;
      if (latestData !== undefined && latestData !== null) {
        try {
          sanitizedData = JSON.parse(JSON.stringify(latestData));
        } catch (e) {
          sanitizedData = latestData;
        }
      }

      let payloadSizeBytes = 0;
      try {
        payloadSizeBytes = new Blob([JSON.stringify(sanitizedData || {})]).size;
      } catch (e) {
        payloadSizeBytes = 0;
      }

      if (payloadSizeBytes > FIRESTORE_SAFE_LIMIT_BYTES) {
        console.warn(`[SYNC WARNING] Payload for ${key} is ${payloadSizeBytes} bytes, near Firestore 1 MiB limit. Compacting bulky base64 blobs...`);
        if (key === 'cafe_invoices' && Array.isArray(sanitizedData)) {
          // 1. Remove duplicate receiptImageUrl aliases if identical to receipt_image_url
          let compact = sanitizedData.map((inv: any) => {
            if (!inv || typeof inv !== 'object') return inv;
            if (inv.receiptImageUrl !== undefined && inv.receipt_image_url && inv.receiptImageUrl === inv.receipt_image_url) {
              const copy = { ...inv };
              delete copy.receiptImageUrl;
              return copy;
            }
            return inv;
          });

          const measure = (d: any) => {
            try { return new Blob([JSON.stringify(d || {})]).size; } catch { return 0; }
          };
          payloadSizeBytes = measure(compact);

          // 2. If still over Firestore limit, strip inline data:image/ blobs from oldest non-OPEN/non-DRAFT invoices
          if (payloadSizeBytes > FIRESTORE_SAFE_LIMIT_BYTES) {
            const indexed = compact.map((inv: any, idx: number) => ({
              idx,
              inv,
              isOpenOrDraft: ['OPEN', 'DRAFT'].includes(String(inv?.invoice_status || '').toUpperCase().trim()),
              ts: getItemTimestamp(inv),
              hasBigImg: (typeof inv?.receipt_image_url === 'string' && inv.receipt_image_url.startsWith('data:image/') && inv.receipt_image_url.length > 10000) ||
                         (typeof inv?.receiptImageUrl === 'string' && inv.receiptImageUrl.startsWith('data:image/') && inv.receiptImageUrl.length > 10000)
            }));
            // Strip oldest closed invoices first, preserving OPEN/DRAFT invoices
            const candidates = indexed
              .filter(e => !e.isOpenOrDraft && e.hasBigImg)
              .sort((a, b) => a.ts - b.ts);
            for (const c of candidates) {
              if (payloadSizeBytes <= FIRESTORE_SAFE_LIMIT_BYTES) break;
              const copy = { ...compact[c.idx] };
              if (typeof copy.receipt_image_url === 'string' && copy.receipt_image_url.startsWith('data:image/')) {
                copy.receipt_image_url = '';
              }
              if (typeof copy.receiptImageUrl === 'string' && copy.receiptImageUrl.startsWith('data:image/')) {
                delete copy.receiptImageUrl;
              }
              compact[c.idx] = copy;
              payloadSizeBytes = measure(compact);
            }
          }
          sanitizedData = compact;
        }
      }

      const writeTimestamp = Math.max(
        parseInt(safeStorage.getItem(`${META_UPDATED_PREFIX}${key}`) || '0', 10),
        Date.now()
      );
      safeStorage.setItem(`${META_UPDATED_PREFIX}${key}`, String(writeTimestamp));

      const docRef = doc(db, 'cafes', cafeId, 'sync_store', key);
      const payload = {
        key,
        data: sanitizedData,
        updatedAt: writeTimestamp,
        deviceId: this.deviceId,
        cafeId
      };

      await setDoc(docRef, payload);

      // Mark cloud timestamp ONLY AFTER setDoc succeeds
      this.cloudTimestamps.set(key, writeTimestamp);

      // Clear dirty flag only if no newer local write occurred while setDoc was in flight
      const currentDirtyStamp = safeStorage.getItem(`${DIRTY_PREFIX}${key}`);
      if (!currentDirtyStamp || currentDirtyStamp === dirtyStampAtStart) {
        safeStorage.removeItem(`${DIRTY_PREFIX}${key}`);
      } else if (!this.debounceTimers.has(key)) {
        // Newer write occurred during in-flight setDoc; schedule a follow-up push
        const followUpTimer = setTimeout(() => {
          this.debounceTimers.delete(key);
          this.executePushFromStorage(key);
        }, PUSH_DEBOUNCE_MS);
        this.debounceTimers.set(key, followUpTimer);
      }

      this.lastSyncTime = new Date().toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      this.status = navigator.onLine ? 'connected' : 'offline';
      this.resolvePending(key);
    } catch (error: any) {
      console.error(`=== PUSH WRITE FAILED [${key}] ===`, docPath, error?.code, error?.message);
      handleFirestoreError(error, OperationType.WRITE, docPath);
      this.status = 'error';
      // Dirty flag intentionally kept so syncAllLocalToCloud retries automatically
      this.resolvePending(key);
    } finally {
      this.activePushes.delete(key);
      pushResolver();
      this.notifyState();
    }
  }

  /**
   * Push local keys that are dirty (failed/offline) OR strictly newer than cloud data
   */
  public async syncAllLocalToCloud(): Promise<void> {
    if (!navigator.onLine) return;

    await this.flushPendingPushes();

    this.status = 'syncing';
    this.notifyState();

    this.updateCafeIdFromSettings();

    try {
      for (const key of ALL_SYNC_KEYS) {
        const val = safeStorage.getItem(key);
        const isDirty = Boolean(safeStorage.getItem(`${DIRTY_PREFIX}${key}`));
        const localUpdatedAt = parseInt(safeStorage.getItem(`${META_UPDATED_PREFIX}${key}`) || '0', 10);
        const remoteUpdatedAt = this.cloudTimestamps.get(key) || 0;

        if (val !== null && (isDirty || localUpdatedAt > remoteUpdatedAt)) {
          await this.executePushFromStorage(key);
        }
      }
      this.lastSyncTime = new Date().toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      this.status = navigator.onLine ? 'connected' : 'offline';
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
    await this.flushPendingPushes();
    let pushedCount = 0;
    for (const key of ALL_SYNC_KEYS) {
      const val = safeStorage.getItem(key);
      if (val !== null) {
        try {
          safeStorage.setItem(`${DIRTY_PREFIX}${key}`, String(Date.now()));
          await this.executePushFromStorage(key);
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
