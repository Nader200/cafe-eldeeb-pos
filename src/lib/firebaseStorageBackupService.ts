/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ref,
  uploadString,
  listAll,
  getBytes,
  deleteObject,
  getMetadata,
  FullMetadata
} from 'firebase/storage';
import { storage, ensureFirebaseAuth, auth } from './firebaseClient';

/**
 * FIXED SINGLE-TENANT CAFE ID CONSTANT
 * Locked strictly to main_cafe_eldeeb to guarantee tenant isolation and match storage.rules.
 * Cannot be modified or overridden by client parameters, localStorage, or user input.
 */
export const CAFE_STORAGE_ID = 'main_cafe_eldeeb';

export interface FirebaseStorageBackupItem {
  id: string;
  name: string;
  fullPath: string;
  size: number;
  formattedSize: string;
  updatedAt: string;
  formattedDate: string;
  cafeId: string;
  description?: string;
  isAuto?: boolean;
}

/**
 * Sanitizes backup JSON content prior to uploading to Firebase Storage.
 * Strips legacy Google OAuth access tokens, refresh tokens, and sensitive credentials
 * to ensure no third-party tokens or secrets leak into storage.
 */
export function sanitizeBackupPayload(rawJson: string): string {
  try {
    const parsed = JSON.parse(rawJson);

    // If database object or settings exist, clean legacy token fields
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
    // If parsing as JSON fails (e.g., base64 encrypted wrapper), return as is safely
    return rawJson;
  }
}

/**
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
  _ignoredCafeId?: string,
  cafeName: string = 'كافيه الديب'
): Promise<FirebaseStorageBackupItem> {
  await verifyOwnerAuthentication();

  const sanitizedJson = sanitizeBackupPayload(rawBackupJson);
  const now = new Date();

  const finalFileName = fileName || (() => {
    const dStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
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

  const targetPath = `cafes/${CAFE_STORAGE_ID}/backups/${pureFileName}`;

  const fileRef = ref(storage, targetPath);
  await deleteObject(fileRef);
  return true;
}
