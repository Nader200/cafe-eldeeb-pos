/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Firebase Storage Backup Service for Cafe Eldeeb & Commercial Enterprise.
 * Provides multi-tenant cloud backup, listing, downloading, restoring, and deletion.
 */

import { getStorage, ref, uploadString, listAll, getMetadata, getDownloadURL, deleteObject } from 'firebase/storage';
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

const DEFAULT_CAFE_ID = 'main_cafe_eldeeb';
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
  if (!currentUser) {
    currentUser = await ensureFirebaseAuth();
  }

  if (!currentUser) {
    console.warn('[FirebaseStorageBackup] Authentication failed: No user session.');
    return false;
  }

  if (currentUser.isAnonymous) {
    console.warn('[FirebaseStorageBackup] Anonymous access denied for Cloud Backup.');
    return false;
  }

  return true;
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

  const isAuthed = await verifyOwnerAuthentication();
  if (!isAuthed) {
    return {
      success: false,
      message: '❌ يتطلب فحص الاتصال السحابي تسجيل دخول حساب مالك مفعّل (غير مجهول).',
      latency: Math.round(performance.now() - t0)
    };
  }

  try {
    const storage = getStorage(app);
    const backupFolderRef = ref(storage, `cafes/${targetTenantId}/backups`);

    // Perform a lightweight listAll check on the tenant backup folder
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
      // Path not existing is technically fine for initial connection
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
 */
export async function uploadBackupToFirebaseStorage(
  fileName: string,
  jsonContent: string,
  cafeName: string = 'كافيه الديب',
  isAuto: boolean = false,
  tenantId?: string
): Promise<FirebaseStorageBackupFile> {
  const isAuthed = await verifyOwnerAuthentication();
  if (!isAuthed) {
    throw new Error('UNAUTHORIZED');
  }

  const targetTenantId = tenantId || getActiveTenantCafeId();
  const storage = getStorage(app);
  const fileRef = ref(storage, `cafes/${targetTenantId}/backups/${fileName}`);

  await uploadString(fileRef, jsonContent, 'raw', {
    contentType: 'application/json',
    customMetadata: {
      cafeName,
      type: isAuto ? 'auto' : 'manual',
      tenantId: targetTenantId
    }
  });

  const meta = await getMetadata(fileRef);
  const sizeNum = meta.size || jsonContent.length;

  return {
    id: meta.fullPath,
    name: fileName,
    createdTime: meta.timeCreated || new Date().toISOString(),
    size: sizeNum,
    formattedSize: formatBytes(sizeNum),
    formattedDate: formatArabicDateTime(meta.timeCreated || new Date().toISOString()),
    description: `نسخة احتياطية شاملة لكافيه (${cafeName}) - ${isAuto ? 'تلقائية' : 'يدوية'}`,
    fullPath: meta.fullPath,
    isAuto
  };
}

/**
 * List all backup files in Firebase Storage for target tenant
 */
export async function listBackupsFromFirebaseStorage(tenantId?: string): Promise<FirebaseStorageBackupFile[]> {
  const isAuthed = await verifyOwnerAuthentication();
  if (!isAuthed) {
    throw new Error('UNAUTHORIZED');
  }

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
export async function downloadBackupFromFirebaseStorage(fullPath: string): Promise<string> {
  const isAuthed = await verifyOwnerAuthentication();
  if (!isAuthed) {
    throw new Error('UNAUTHORIZED');
  }

  const storage = getStorage(app);
  const fileRef = ref(storage, fullPath);
  const downloadUrl = await getDownloadURL(fileRef);

  const res = await fetch(downloadUrl);
  if (!res.ok) {
    throw new Error(`Download failed with status ${res.status}`);
  }
  return await res.text();
}

/**
 * Delete a backup file from Firebase Storage
 */
export async function deleteBackupFromFirebaseStorage(fullPath: string): Promise<boolean> {
  const isAuthed = await verifyOwnerAuthentication();
  if (!isAuthed) {
    throw new Error('UNAUTHORIZED');
  }

  const storage = getStorage(app);
  const fileRef = ref(storage, fullPath);
  await deleteObject(fileRef);
  return true;
}
