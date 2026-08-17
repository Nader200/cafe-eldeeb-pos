/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Safe localStorage wrapper to prevent iframe SecurityError and QuotaExceededError crashes
export const safeStorage = (() => {
  let memoryStorage: Record<string, string> = {};
  let useRealStorage = false;

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const testKey = '__storage_test__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      useRealStorage = true;

      // Purge any stale large backup or Firestore keys from window.localStorage to keep quota clean
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && (
          k.startsWith('firestore_') ||
          k.startsWith('cafe_backup_content_') ||
          k.startsWith('gdrive_file_data_') ||
          k === 'cafe_audit_logs' ||
          k === 'cafe_update_logs'
        )) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => {
        try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ }
      });
    }
  } catch (e) {
    useRealStorage = false;
  }

  // Only transient large backup blobs are kept in memory to preserve localStorage quota for core POS state
  const isHeavyKey = (key: string): boolean => {
    if (key.startsWith('cafe_backup_content_') || key.startsWith('gdrive_file_data_')) {
      return true;
    }
    return false;
  };

  return {
    getItem(key: string): string | null {
      if (memoryStorage[key] !== undefined) {
        return memoryStorage[key];
      }
      if (useRealStorage) {
        try {
          return window.localStorage.getItem(key);
        } catch (e) {
          return memoryStorage[key] || null;
        }
      }
      return memoryStorage[key] || null;
    },
    setItem(key: string, value: string): void {
      const valueStr = String(value);

      if (isHeavyKey(key)) {
        memoryStorage[key] = valueStr;
        // Clean up from real storage if it was there before
        if (useRealStorage) {
          try { window.localStorage.removeItem(key); } catch (e) {}
        }
        return;
      }

      if (useRealStorage) {
        try {
          window.localStorage.setItem(key, valueStr);
          // Also keep in memory mirror for instant synchronous lookups
          memoryStorage[key] = valueStr;
          return;
        } catch (e: any) {
          console.warn(`localStorage.setItem failed for key ${key} (QuotaExceeded or disabled):`, e);
          // Clean up non-essential log keys if quota exceeded
          try {
            const keysToTrim = ['cafe_audit_logs', 'cafe_update_logs', 'cafe_communication_logs', 'cafe_auth_audit_logs', 'cafe_backup_logs'];
            keysToTrim.forEach(k => {
              try { window.localStorage.removeItem(k); } catch (err) {}
            });
            window.localStorage.setItem(key, valueStr);
            memoryStorage[key] = valueStr;
            return;
          } catch (retryErr) {
            // fallback to in-memory storage if storage completely full
          }
        }
      }
      memoryStorage[key] = valueStr;
    },
    removeItem(key: string): void {
      delete memoryStorage[key];
      if (useRealStorage) {
        try {
          window.localStorage.removeItem(key);
        } catch (e) {
          // fallback
        }
      }
    },
    clear(): void {
      memoryStorage = {};
      if (useRealStorage) {
        try {
          window.localStorage.clear();
        } catch (e) {
          // fallback
        }
      }
    },
    key(index: number): string | null {
      if (useRealStorage) {
        try {
          return window.localStorage.key(index);
        } catch (e) {
          return Object.keys(memoryStorage)[index] || null;
        }
      }
      return Object.keys(memoryStorage)[index] || null;
    },
    get length(): number {
      if (useRealStorage) {
        try {
          return window.localStorage.length;
        } catch (e) {
          return Object.keys(memoryStorage).length;
        }
      }
      return Object.keys(memoryStorage).length;
    }
  };
})();
