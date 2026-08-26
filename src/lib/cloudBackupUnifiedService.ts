/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GoogleDriveUser,
  GoogleDriveBackupFile,
  requestGoogleDriveAuth,
  listGoogleDriveBackups,
  uploadBackupToGoogleDrive,
  downloadBackupFromGoogleDrive,
  deleteBackupFromGoogleDrive
} from './googleDriveService';
import {
  uploadBackupToFirebaseStorage,
  listBackupsFromFirebaseStorage,
  downloadBackupFromFirebaseStorage,
  deleteBackupFromFirebaseStorage,
  FirebaseStorageBackupItem
} from './firebaseStorageBackupService';
import { safeStorage } from '../dbService';

const localStorage = safeStorage;
const G_DRIVE_USER_KEY = 'cafe_google_drive_user';

export type CloudStorageProvider = 'GOOGLE_DRIVE' | 'FIREBASE_STORAGE';

export interface UnifiedBackupItem {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime?: string;
  size: number;
  formattedSize: string;
  formattedDate: string;
  description?: string;
  provider: CloudStorageProvider;
  isAuto?: boolean;
  rawGoogleDriveFile?: GoogleDriveBackupFile;
  rawFirebaseItem?: FirebaseStorageBackupItem;
}

/**
 * Get active Google Drive user from storage
 */
export function getSavedGoogleDriveUser(): GoogleDriveUser | null {
  try {
    const raw = localStorage.getItem(G_DRIVE_USER_KEY);
    if (!raw) return null;
    const user: GoogleDriveUser = JSON.parse(raw);
    if (user && user.accessToken) {
      return user;
    }
  } catch (e) {
    console.warn('Error reading saved Google Drive user:', e);
  }
  return null;
}

/**
 * Save Google Drive user
 */
export function saveGoogleDriveUser(user: GoogleDriveUser | null): void {
  try {
    if (user) {
      localStorage.setItem(G_DRIVE_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(G_DRIVE_USER_KEY);
    }
  } catch (e) {
    console.warn('Error saving Google Drive user:', e);
  }
}

/**
 * Perform login to Google Drive
 */
export async function authenticateGoogleDrive(forcePrompt: boolean = false): Promise<GoogleDriveUser> {
  const user = await requestGoogleDriveAuth();
  if (!user || !user.accessToken) {
    throw new Error('تعذر إتمام المصادقة مع Google Drive.');
  }
  saveGoogleDriveUser(user);
  return user;
}

/**
 * Unified list backups (Google Drive primary)
 */
export async function listAllCloudBackups(user?: GoogleDriveUser | null): Promise<UnifiedBackupItem[]> {
  const activeUser = user || getSavedGoogleDriveUser();
  
  if (activeUser && activeUser.accessToken) {
    try {
      const gFiles = await listGoogleDriveBackups(activeUser.accessToken);
      return gFiles.map((f): UnifiedBackupItem => ({
        id: f.id,
        name: f.name,
        createdTime: f.createdTime,
        modifiedTime: f.modifiedTime,
        size: f.size,
        formattedSize: f.formattedSize,
        formattedDate: f.formattedDate,
        description: f.description,
        provider: 'GOOGLE_DRIVE',
        isAuto: f.isAuto,
        rawGoogleDriveFile: f
      }));
    } catch (err: any) {
      if (err?.message === 'UNAUTHORIZED') {
        saveGoogleDriveUser(null);
      }
      throw err;
    }
  }

  // Fallback to Firebase Storage if no Google Drive user is logged in
  try {
    const fbItems = await listBackupsFromFirebaseStorage();
    return fbItems.map((f): UnifiedBackupItem => ({
      id: f.fullPath || f.name,
      name: f.name,
      createdTime: f.updatedAt || new Date().toISOString(),
      size: f.size || 0,
      formattedSize: f.formattedSize || '0 KB',
      formattedDate: f.formattedDate || '',
      provider: 'FIREBASE_STORAGE',
      rawFirebaseItem: f
    }));
  } catch {
    return [];
  }
}

/**
 * Upload unified backup
 */
export async function uploadUnifiedCloudBackup(
  backupJson: string,
  fileName: string,
  cafeName: string = 'كافيه الديب',
  user?: GoogleDriveUser | null,
  isAuto: boolean = false
): Promise<UnifiedBackupItem> {
  const activeUser = user || getSavedGoogleDriveUser();

  if (activeUser && activeUser.accessToken) {
    const uploaded = await uploadBackupToGoogleDrive(
      activeUser.accessToken,
      fileName,
      backupJson,
      cafeName,
      isAuto
    );
    return {
      id: uploaded.id,
      name: uploaded.name,
      createdTime: uploaded.createdTime,
      size: uploaded.size,
      formattedSize: uploaded.formattedSize,
      formattedDate: uploaded.formattedDate,
      description: uploaded.description,
      provider: 'GOOGLE_DRIVE',
      isAuto: uploaded.isAuto,
      rawGoogleDriveFile: uploaded
    };
  }

  // Fallback to Firebase Storage
  const fbItem = await uploadBackupToFirebaseStorage(
    backupJson,
    fileName,
    'main_cafe_eldeeb',
    cafeName
  );
  return {
    id: fbItem.fullPath || fbItem.name,
    name: fbItem.name,
    createdTime: fbItem.updatedAt || new Date().toISOString(),
    size: fbItem.size || 0,
    formattedSize: fbItem.formattedSize || '0 KB',
    formattedDate: fbItem.formattedDate || '',
    provider: 'FIREBASE_STORAGE',
    rawFirebaseItem: fbItem
  };
}

/**
 * Download unified backup
 */
export async function downloadUnifiedCloudBackup(
  item: UnifiedBackupItem,
  user?: GoogleDriveUser | null
): Promise<string> {
  if (item.provider === 'GOOGLE_DRIVE') {
    const activeUser = user || getSavedGoogleDriveUser();
    if (!activeUser || !activeUser.accessToken) {
      throw new Error('يرجى تسجيل الدخول إلى حساب Google Drive أولاً لتحميل الملف.');
    }
    return await downloadBackupFromGoogleDrive(activeUser.accessToken, item.id);
  }

  return await downloadBackupFromFirebaseStorage(item.id);
}

/**
 * Delete unified backup
 */
export async function deleteUnifiedCloudBackup(
  item: UnifiedBackupItem,
  user?: GoogleDriveUser | null
): Promise<void> {
  if (item.provider === 'GOOGLE_DRIVE') {
    const activeUser = user || getSavedGoogleDriveUser();
    if (!activeUser || !activeUser.accessToken) {
      throw new Error('يرجى تسجيل الدخول إلى Google Drive.');
    }
    await deleteBackupFromGoogleDrive(activeUser.accessToken, item.id);
    return;
  }

  await deleteBackupFromFirebaseStorage(item.id);
}
