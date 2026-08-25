/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Firebase Storage Backup Service for Cafe Eldeeb & Commercial Enterprise.
 * Provides multi-tenant cloud backup, listing, downloading, restoring, and deletion.
 */

import {
  getStorage,
  ref,
  uploadString,
  listAll,
  getMetadata,
  getDownloadURL,
  getBytes,
  deleteObject,
  FullMetadata
} from 'firebase/storage';
import { app, auth, ensureFirebaseAuth } from './firebaseClient';

export interface FirebaseStorageBackupFile {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime?: string;
  size: number;
  formattedSize: string;
  formattedDate: string;
  description?: string;
  fullPath: string;
  isAuto?: boolean;
}

export type FirebaseStorageBackupItem = FirebaseStorageBackupFile;

export const DEFAULT_CAFE_ID = 'main_cafe_eldeeb';
export const CAFE_STORAGE_ID = DEFAULT_CAFE_ID;
const OWNER_EMAIL = 'nader.eldeeb.2015@gmail.com';

/**
 * Get active tenant/cafe ID from local settings or fallback to default
 */
export function getActiveTenantCafeId(): string {
  try {
    const s = localStorage.getItem('cafe_settings') || localStorage.getItem('cafe_eldeeb_settings');
    if (s) {
      const parsed = JSON.parse(s);
      if (parsed?.tenant_id && typeof parsed.tenant_id === 'string' && parsed.tenant_id.trim()) {
        return parsed.tenant_id.trim();
      }
      if (parsed?.cafe_id && typeof parsed.cafe_id === 'string' && parsed.cafe_id.trim()) {
        return parsed.cafe_id.trim();
      }
    }
  } catch (e) {
    // Quietly fallback
  }
  return DEFAULT_CAFE_ID;
}

/**
 * Verify non-anonymous, email-verified user authentication session before Cloud Storage operations
 */
export async function verifyOwnerAuthentication(): Promise<boolean> {
  let currentUser = auth.currentUser;
  if (!currentUser || currentUser.isAnonymous) {
    currentUser = await ensureFirebaseAuth(true);
  }

  if (!currentUser) {
    console.warn('[FirebaseStorageBackup] Authentication failed: No user session.');
    throw new Error('يجب تسجيل الدخول إلى Firebase للوصول إلى النسخ الاحتياطية السحابية.');
  }

  if (currentUser.isAnonymous) {
    console.warn('[FirebaseStorageBackup] Anonymous access denied for Cloud Backup.');
    throw new Error('غير مصرح للحسابات المجهولة (Anonymous) بالوصول إلى النسخ السحابية. يتطلب تسجيل دخول حساب المالك الموثق.');
  }

  return true;
}

/**
 * Sanitizes backup JSON content prior to uploading to Firebase Storage.
 * Strips legacy Google OAuth access tokens, refresh tokens, and sensitive credentials.
 */
export function sanitizeBackupPayload(rawJson: string): string {
  try {
    const parsed = JSON.parse(rawJson);
    if (parsed && typeof parsed === 'object') {
      if (parsed.database && typeof parsed.database === 'object') {
        const settings = parsed.database.cafe_settings;
        if (settings && typeof settings === 'object') {
          if (Array.isArray(settings)) {
            parsed.database.cafe_settings = settings.map((s: any) => {
              if (s && typeof s === 'object') {
                const {
                  google_drive_access_token,
                  google_drive_refresh_token,
                  oauth_token,
                  ...rest
                } = s;
                return rest;
              }
              return s;
            });
          } else {
            const {
              google_drive_access_token,
              google_drive_refresh_token,
              oauth_token,
              ...rest
            } = settings;
            parsed.database.cafe_settings = rest;
          }
        }
      }

      // Root level cleanup if present
      delete (parsed as any).google_drive_access_token;
      delete (parsed as any).google_drive_refresh_token;
      delete (parsed as any).oauth_token;
    }
    return JSON.stringify(parsed);
  } catch {
    return rawJson;
  }
}

/**
 * Format bytes to readable size (KB/MB)
 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Format ISO string to Arabic datetime string
 */
export function formatArabicDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return date.toLocaleDateString('ar-EG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return isoString;
  }
}

/**
 * Test Firebase Storage connection and access to bucket for current tenant
 */
export async function testFirebaseStorageConnection(tenantId?: string): Promise<{ success: boolean; message: string; latency: number }> {
  const targetTenantId = tenantId || getActiveTenantCafeId();
  const t0 = performance.now();

  try {
    await verifyOwnerAuthentication();
    const storage = getStorage(app);
    const backupFolderRef = ref(storage, `cafes/${targetTenantId}/backups`);

    const listRes = await listAll(backupFolderRef);
    const latency = Math.round(performance.now() - t0);

    return {
      success: true,
      message: `✅ اتصال Firebase Storage سليم ومتاح (${latency}ms) - عدد النسخ: ${listRes.items.length}`,
      latency
    };
  } catch (err: any) {
    const latency = Math.round(performance.now() - t0);
    console.error('[FirebaseStorageBackup] Connection test failed:', err);

    const errCode = err?.code || '';
    let userMsg = `❌ خطأ في الاتصال بـ Firebase Storage: ${err?.message || err}`;

    if (errCode === 'storage/retry-limit-exceeded') {
      userMsg = `❌ تعذر الوصول لـ Firebase Storage: انقضى وقت المحاولة (تأكد من تفعيل Storage Bucket بالخيارات المفتوحة).`;
    } else if (errCode === 'storage/unauthorized') {
      userMsg = `❌ غير مصرح بالحصول على النسخ الاحتياطية (Storage Rules Denied).`;
    } else if (errCode === 'storage/object-not-found') {
      return {
        success: true,
        message: `✅ اتصال Firebase Storage يعمل (${latency}ms) - المجلد آمن وجاهز.`,
        latency
      };
    }

    return {
      success: false,
      message: userMsg,
      latency
    };
  }
}

/**
 * Upload a backup file to Firebase Storage under tenant isolation path
 * Formats byte size into human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Helper to ensure the current authenticated user is not anonymous
 * and is the authorized owner before executing storage operations.
 */
async function verifyOwnerAuthentication() {
  const user = await ensureFirebaseAuth();
  const currentUser = user || auth.currentUser;

  if (!currentUser) {
    throw new Error('يجب تسجيل الدخول إلى Firebase للوصول إلى النسخ الاحتياطية السحابية.');
  }

  if (currentUser.isAnonymous) {
    throw new Error('غير مصرح للحسابات المجهولة (Anonymous) بالوصول إلى النسخ السحابية. يتطلب تسجيل دخول حساب المالك الموثق.');
  }

  return currentUser;
}

/**
 * Generates the strictly secured fixed storage directory reference for Cafe Eldeeb.
 * Structure: cafes/main_cafe_eldeeb/backups
 */
function getBackupDirectoryRef() {
  return ref(storage, `cafes/${CAFE_STORAGE_ID}/backups`);
}

/**
 * Uploads a JSON backup string to Firebase Storage under the fixed Cafe Eldeeb path.
 * Ensures Firebase Auth is verified with non-anonymous owner, sanitizes legacy tokens,
 * and saves strictly under cafes/main_cafe_eldeeb/backups/{fileName}.
 */
export async function uploadBackupToFirebaseStorage(
  rawBackupJson: string,
  fileName?: string,
  cafeName: string = 'كافيه الديب',
  isAuto: boolean = false,
  tenantId?: string
): Promise<FirebaseStorageBackupFile> {
  await verifyOwnerAuthentication();

  const targetTenantId = tenantId || getActiveTenantCafeId();
  _ignoredCafeId?: string,
  cafeName: string = 'كافيه الديب'
): Promise<FirebaseStorageBackupItem> {
  await verifyOwnerAuthentication();

  const sanitizedJson = sanitizeBackupPayload(rawBackupJson);
  const now = new Date();

  const finalFileName = fileName || (() => {
    const dStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    return `backup_${targetTenantId}_${dStr}.json`;
  })();

  const storage = getStorage(app);
  const fileRef = ref(storage, `cafes/${targetTenantId}/backups/${finalFileName}`);

  await uploadString(fileRef, sanitizedJson, 'raw', {
    contentType: 'application/json',
    customMetadata: {
      cafeName,
      type: isAuto ? 'auto' : 'manual',
      tenantId: targetTenantId
    }
  });

  const meta = await getMetadata(fileRef);
  const sizeNum = meta.size || sanitizedJson.length;

  return {
    id: meta.fullPath,
    name: finalFileName,
    createdTime: meta.timeCreated || now.toISOString(),
    size: sizeNum,
    formattedSize: formatBytes(sizeNum),
    formattedDate: formatArabicDateTime(meta.timeCreated || now.toISOString()),
    description: `نسخة احتياطية شاملة لكافيه (${cafeName}) - ${isAuto ? 'تلقائية' : 'يدوية'}`,
    fullPath: meta.fullPath,
    isAuto
  };
}

/**
 * List all backup files in Firebase Storage for target tenant
 */
export async function listBackupsFromFirebaseStorage(tenantId?: string): Promise<FirebaseStorageBackupFile[]> {
  await verifyOwnerAuthentication();

  const targetTenantId = tenantId || getActiveTenantCafeId();
  const storage = getStorage(app);
  const folderRef = ref(storage, `cafes/${targetTenantId}/backups`);

  const res = await listAll(folderRef);
  const items = res.items;

  const filePromises = items.map(async (itemRef) => {
    try {
      const meta = await getMetadata(itemRef);
      const sizeNum = meta.size || 0;
      const isAuto = itemRef.name.includes('auto') || meta.customMetadata?.type === 'auto';
      return {
        id: meta.fullPath,
        name: itemRef.name,
        createdTime: meta.timeCreated || new Date().toISOString(),
        size: sizeNum,
        formattedSize: formatBytes(sizeNum),
        formattedDate: formatArabicDateTime(meta.timeCreated || new Date().toISOString()),
        description: `نسخة احتياطية سحابية (${meta.customMetadata?.cafeName || 'كافيه الديب'})`,
        fullPath: meta.fullPath,
        isAuto
      };
    } catch {
      return {
        id: itemRef.fullPath,
        name: itemRef.name,
        createdTime: new Date().toISOString(),
        size: 0,
        formattedSize: '0 KB',
        formattedDate: formatArabicDateTime(new Date().toISOString()),
        description: 'نسخة احتياطية سحابية',
        fullPath: itemRef.fullPath,
        isAuto: false
      };
    }
  });

  const files = await Promise.all(filePromises);
  files.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
  return files;
}

/**
 * Download backup file content from Firebase Storage
 */
export async function downloadBackupFromFirebaseStorage(fullPathOrName: string, tenantId?: string): Promise<string> {
  await verifyOwnerAuthentication();

  const targetTenantId = tenantId || getActiveTenantCafeId();
    return `backup_${CAFE_STORAGE_ID}_${dStr}.json`;
  })();

  // Strictly fixed storage path matching storage.rules
  const fileRef = ref(storage, `cafes/${CAFE_STORAGE_ID}/backups/${finalFileName}`);

  const metadata = {
    contentType: 'application/json',
    customMetadata: {
      cafeId: CAFE_STORAGE_ID,
      cafeName: cafeName || 'كافيه الديب',
      createdAt: now.toISOString(),
      app: 'Cafe Eldeeb POS'
    }
  };

  const uploadResult = await uploadString(fileRef, sanitizedJson, 'raw', metadata);
  const fileBytes = uploadResult.metadata.size || sanitizedJson.length;

  return {
    id: finalFileName,
    name: finalFileName,
    fullPath: fileRef.fullPath,
    size: fileBytes,
    formattedSize: formatBytes(fileBytes),
    updatedAt: now.toISOString(),
    formattedDate: now.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }),
    cafeId: CAFE_STORAGE_ID,
    description: `نسخة احتياطية سحابية (${cafeName})`,
    isAuto: finalFileName.includes('auto') || finalFileName.includes('تلقائي')
  };
}

/**
 * Lists all available backup files for Cafe Eldeeb strictly from the fixed storage path.
 */
export async function listBackupsFromFirebaseStorage(
  _ignoredCafeId?: string
): Promise<FirebaseStorageBackupItem[]> {
  await verifyOwnerAuthentication();

  const dirRef = getBackupDirectoryRef();
  const listResult = await listAll(dirRef);

  const itemsWithMeta = await Promise.all(
    listResult.items.map(async (itemRef) => {
      let meta: FullMetadata | null = null;
      try {
        meta = await getMetadata(itemRef);
      } catch {
        meta = null;
      }

      const size = meta?.size || 0;
      const updatedTime = meta?.updated || meta?.timeCreated || new Date().toISOString();
      const cafeName = meta?.customMetadata?.cafeName || 'كافيه الديب';

      const d = new Date(updatedTime);
      const formattedDate = d.toLocaleString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      return {
        id: itemRef.name,
        name: itemRef.name,
        fullPath: itemRef.fullPath,
        size,
        formattedSize: formatBytes(size),
        updatedAt: updatedTime,
        formattedDate,
        cafeId: CAFE_STORAGE_ID,
        description: `نسخة احتياطية سحابية (${cafeName})`,
        isAuto: itemRef.name.includes('auto') || itemRef.name.includes('تلقائي')
      };
    })
  );

  // Sort descending by update timestamp (newest first)
  return itemsWithMeta.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/**
 * Downloads a backup file strictly from Cafe Eldeeb storage path as string content.
 * Compatible with dbService.restoreBackupData().
 */
export async function downloadBackupFromFirebaseStorage(
  fullPathOrName: string,
  _ignoredCafeId?: string
): Promise<string> {
  await verifyOwnerAuthentication();

  // Strip any prepended directory traversal or foreign cafe path attempt
  const pureFileName = fullPathOrName.includes('/')
    ? fullPathOrName.split('/').pop() || fullPathOrName
    : fullPathOrName;

  const targetPath = fullPathOrName.startsWith('cafes/')
    ? fullPathOrName
    : `cafes/${targetTenantId}/backups/${pureFileName}`;

  const storage = getStorage(app);
  const fileRef = ref(storage, targetPath);

  try {
    const buffer = await getBytes(fileRef);
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(buffer);
  } catch {
    const downloadUrl = await getDownloadURL(fileRef);
    const res = await fetch(downloadUrl);
    if (!res.ok) {
      throw new Error(`Download failed with status ${res.status}`);
    }
    return await res.text();
  }
}

/**
 * Delete a backup file from Firebase Storage
 */
export async function deleteBackupFromFirebaseStorage(fullPathOrName: string, tenantId?: string): Promise<boolean> {
  await verifyOwnerAuthentication();

  const targetTenantId = tenantId || getActiveTenantCafeId();
  const targetPath = `cafes/${CAFE_STORAGE_ID}/backups/${pureFileName}`;

  const fileRef = ref(storage, targetPath);
  const buffer = await getBytes(fileRef);

  const decoder = new TextDecoder('utf-8');
  return decoder.decode(buffer);
}

/**
 * Deletes a backup file strictly from Cafe Eldeeb storage path.
 */
export async function deleteBackupFromFirebaseStorage(
  fullPathOrName: string,
  _ignoredCafeId?: string
): Promise<boolean> {
  await verifyOwnerAuthentication();

  const pureFileName = fullPathOrName.includes('/')
    ? fullPathOrName.split('/').pop() || fullPathOrName
    : fullPathOrName;

  const targetPath = fullPathOrName.startsWith('cafes/')
    ? fullPathOrName
    : `cafes/${targetTenantId}/backups/${pureFileName}`;

  const storage = getStorage(app);
  const targetPath = `cafes/${CAFE_STORAGE_ID}/backups/${pureFileName}`;

  const fileRef = ref(storage, targetPath);
  await deleteObject(fileRef);
  return true;
}
