/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Safe localStorage wrapper to prevent iframe SecurityError and crashes
export const safeStorage = (() => {
  let memoryStorage: Record<string, string> = {};
  let useRealStorage = false;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const testKey = '__storage_test__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      useRealStorage = true;
    }
  } catch (e) {
    useRealStorage = false;
  }

  return {
    getItem(key: string): string | null {
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
      if (useRealStorage) {
        try {
          window.localStorage.setItem(key, value);
          return;
        } catch (e) {
          // fallback
        }
      }
      memoryStorage[key] = String(value);
    },
    removeItem(key: string): void {
      if (useRealStorage) {
        try {
          window.localStorage.removeItem(key);
          return;
        } catch (e) {
          // fallback
        }
      }
      delete memoryStorage[key];
    },
    clear(): void {
      if (useRealStorage) {
        try {
          window.localStorage.clear();
          return;
        } catch (e) {
          // fallback
        }
      }
      memoryStorage = {};
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
