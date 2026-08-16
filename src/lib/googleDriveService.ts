/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import firebaseConfig from '../../firebase-applet-config.json';
import { auth } from './firebaseClient';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { GoogleSignIn } from '@capawesome/capacitor-google-sign-in';
import { Capacitor } from '@capacitor/core';

export interface GoogleDriveUser {
  email: string;
  name: string;
  picture?: string;
  accessToken: string;
  expiresAt: number;
}

export interface GoogleDriveBackupFile {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime?: string;
  size: number;
  formattedSize: string;
  formattedDate: string;
  description?: string;
  appProperties?: Record<string, string>;
  isAuto?: boolean;
}

const DRIVE_FILE_SCOPE =
  'https://www.googleapis.com/auth/drive.file';

const GOOGLE_PROFILE_SCOPE =
  'https://www.googleapis.com/auth/userinfo.profile';

const GOOGLE_EMAIL_SCOPE =
  'https://www.googleapis.com/auth/userinfo.email';

/*
 * IMPORTANT:
 * This is the WEB OAuth Client ID.
 *
 * For @capawesome/capacitor-google-sign-in the clientId passed to
 * initialize() must be the WEB client ID, even on Android.
 */
const DEFAULT_GOOGLE_WEB_CLIENT_ID =
  '864337937711-gi69esgs44rn7d2li3mb6bfjhdspe2pv.apps.googleusercontent.com';

let nativeGoogleInitialized = false;

/**
 * Resolve the Google WEB OAuth Client ID.
 */
function resolveGoogleWebClientId(clientId?: string): string {
  const configClientId =
    (firebaseConfig as any)?.oAuthClientId ||
    (firebaseConfig as any)?.OAuthClientId;

  const envClientId =
    (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;

  let storedSettings: any = null;

  try {
    const raw =
      localStorage.getItem('cafe_settings') ||
      localStorage.getItem('cafe_eldeeb_settings');

    storedSettings = raw ? JSON.parse(raw) : null;
  } catch {
    storedSettings = null;
  }

  const settingsClientId =
    storedSettings?.google_drive_client_id ||
    storedSettings?.gmail_client_id;

  const candidates = [
    clientId,
    settingsClientId,
    envClientId,
    configClientId,
    DEFAULT_GOOGLE_WEB_CLIENT_ID
  ];

  const valid = candidates.find(
    (value) =>
      typeof value === 'string' &&
      value.includes('.apps.googleusercontent.com')
  );

  return valid || DEFAULT_GOOGLE_WEB_CLIENT_ID;
}

/**
 * Initialize native Google authorization.
 *
 * IMPORTANT:
 * We deliberately request OAuth scopes here.
 * Without scopes, the Capacitor plugin may return only an ID token.
 */
async function initializeNativeGoogle(
  clientId: string
): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  if (nativeGoogleInitialized) {
    return;
  }

  await GoogleSignIn.initialize({
    clientId,

    scopes: [
      DRIVE_FILE_SCOPE,
      GOOGLE_EMAIL_SCOPE,
      GOOGLE_PROFILE_SCOPE
    ]
  });

  nativeGoogleInitialized = true;

  console.log(
    '[Google Native] initialized with OAuth scopes successfully'
  );
}

/**
 * Load Google Identity Services on Web only.
 */
export function loadGisScript(): Promise<void> {
  return new Promise((resolve) => {
    if (
      (window as any).google?.accounts?.oauth2
    ) {
      resolve();
      return;
    }

    const existing = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]'
    );

    if (existing) {
      existing.addEventListener('load', () => resolve());

      setTimeout(() => resolve(), 2000);
      return;
    }

    const script = document.createElement('script');

    script.src =
      'https://accounts.google.com/gsi/client';

    script.async = true;
    script.defer = true;

    script.onload = () => resolve();

    script.onerror = () => resolve();

    document.head.appendChild(script);
  });
}

/**
 * Fetch Google user profile using an OAuth access token.
 */
export async function fetchGoogleProfile(
  accessToken: string
): Promise<{
  email: string;
  name: string;
  picture?: string;
} | null> {
  if (!accessToken?.trim()) {
    return null;
  }

  try {
    const response = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    return {
      email: data.email || 'حساب Google',
      name:
        data.name ||
        data.given_name ||
        'مستخدم Google',
      picture: data.picture
    };
  } catch {
    return null;
  }
}

/**
 * Native Android Google authorization.
 *
 * CRITICAL:
 * We accept ONLY result.accessToken.
 *
 * result.idToken is NEVER used as an API access token.
 */
async function requestNativeGoogleDriveAuth(
  clientId: string
): Promise<GoogleDriveUser | null> {
  try {
    await initializeNativeGoogle(clientId);

    console.log(
      '[Android Native GoogleDrive] Starting OAuth authorization...'
    );

    const result =
      await GoogleSignIn.signIn();

    console.log(
      '[Android Native GoogleDrive] Native result:',
      {
        hasEmail: !!result?.email,
        hasIdToken: !!result?.idToken,
        hasAccessToken: !!result?.accessToken,
        hasServerAuthCode:
          !!result?.serverAuthCode
      }
    );

    /*
     * NEVER:
     *
     * const token =
     *   result.accessToken || result.idToken;
     *
     * ID token is NOT accepted here.
     */

    const accessToken =
      result?.accessToken || '';

    if (!accessToken.trim()) {
      console.error(
        '[Android Native GoogleDrive] Google returned NO OAuth access token.',
        {
          hasIdToken: !!result?.idToken,
          hasServerAuthCode:
            !!result?.serverAuthCode
        }
      );

      return null;
    }

    const profile =
      await fetchGoogleProfile(accessToken);

    const email =
      profile?.email ||
      result.email ||
      'user@google.com';

    const name =
      profile?.name ||
      result.displayName ||
      result.givenName ||
      'مستخدم Google';

    console.log(
      '[Android Native GoogleDrive] OAuth access token acquired for:',
      email
    );

    return {
      accessToken,
      expiresAt:
        Date.now() + 3600 * 1000,
      email,
      name,
      picture:
        profile?.picture ||
        result.imageUrl ||
        undefined
    };
  } catch (error: any) {
    console.error(
      '[Android Native GoogleDrive] OAuth failed:',
      error?.message || error
    );

    return null;
  }
}

/**
 * Web GIS OAuth authorization.
 */
async function requestWebGoogleDriveAuth(
  clientId: string
): Promise<GoogleDriveUser | null> {
  await loadGisScript();

  return new Promise<GoogleDriveUser | null>(
    (resolve) => {
      let completed = false;

      const finish = (
        value: GoogleDriveUser | null
      ) => {
        if (completed) {
          return;
        }

        completed = true;
        clearTimeout(timeout);
        resolve(value);
      };

      const timeout = setTimeout(() => {
        console.warn(
          '[Web GoogleDrive] OAuth timed out'
        );

        finish(null);
      }, 45000);

      const google = (window as any).google;

      if (!google?.accounts?.oauth2) {
        finish(null);
        return;
      }

      try {
        const client =
          google.accounts.oauth2.initTokenClient({
            client_id: clientId,

            scope: [
              DRIVE_FILE_SCOPE,
              GOOGLE_EMAIL_SCOPE,
              GOOGLE_PROFILE_SCOPE
            ].join(' '),

            callback: async (
              response: any
            ) => {
              if (
                !response?.access_token ||
                response?.error
              ) {
                console.warn(
                  '[Web GoogleDrive] OAuth error:',
                  response?.error
                );

                finish(null);
                return;
              }

              const accessToken =
                response.access_token;

              const profile =
                await fetchGoogleProfile(
                  accessToken
                );

              finish({
                accessToken,
                expiresAt:
                  Date.now() +
                  (response.expires_in || 3600) *
                    1000,
                email:
                  profile?.email ||
                  'user@google.com',
                name:
                  profile?.name ||
                  'مستخدم Google',
                picture:
                  profile?.picture
              });
            },

            error_callback: (error: any) => {
              console.warn(
                '[Web GoogleDrive] OAuth error:',
                error
              );

              finish(null);
            }
          });

        client.requestAccessToken();
      } catch (error) {
        console.error(
          '[Web GoogleDrive] OAuth exception:',
          error
        );

        finish(null);
      }
    }
  );
}

/**
 * Web Firebase authentication fallback.
 *
 * This is intentionally NOT used on native Android.
 */
async function requestFirebaseGoogleDriveAuth():
  Promise<GoogleDriveUser | null> {
  try {
    const provider =
      new GoogleAuthProvider();

    provider.addScope(DRIVE_FILE_SCOPE);
    provider.addScope(
      GOOGLE_EMAIL_SCOPE
    );
    provider.addScope(
      GOOGLE_PROFILE_SCOPE
    );

    provider.setCustomParameters({
      prompt: 'select_account'
    });

    const result =
      await signInWithPopup(
        auth,
        provider
      );

    const credential =
      GoogleAuthProvider.credentialFromResult(
        result
      );

    const accessToken =
      credential?.accessToken;

    /*
     * Firebase credential must also contain
     * an OAuth access token.
     *
     * ID token is NOT used.
     */
    if (!accessToken) {
      console.error(
        '[Firebase GoogleDrive] No OAuth access token returned'
      );

      return null;
    }

    const user = result.user;

    return {
      accessToken,
      expiresAt:
        Date.now() + 3600 * 1000,
      email:
        user.email ||
        'user@google.com',
      name:
        user.displayName ||
        'مستخدم Google',
      picture:
        user.photoURL ||
        undefined
    };
  } catch (error: any) {
    console.warn(
      '[Firebase GoogleDrive] OAuth failed:',
      error?.code ||
        error?.message ||
        error
    );

    return null;
  }
}

/**
 * Main Google Drive authentication.
 */
export async function requestGoogleDriveAuth(
  clientId?: string
): Promise<GoogleDriveUser | null> {
  const resolvedClientId =
    resolveGoogleWebClientId(clientId);

  console.log(
    '[GoogleDrive] Client ID:',
    `...${resolvedClientId.slice(-20)}`
  );

  /*
   * ANDROID / NATIVE
   *
   * Do NOT fall back to GIS inside Android WebView.
   */
  if (Capacitor.isNativePlatform()) {
    return requestNativeGoogleDriveAuth(
      resolvedClientId
    );
  }

  /*
   * WEB
   */
  const gisUser =
    await requestWebGoogleDriveAuth(
      resolvedClientId
    );

  if (gisUser) {
    return gisUser;
  }

  /*
   * Firebase popup fallback for Web.
   */
  return requestFirebaseGoogleDriveAuth();
}

/**
 * Format bytes.
 */
export function formatBytes(
  bytes: number
): string {
  if (!bytes || bytes <= 0) {
    return '0 KB';
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(
      bytes / 1024
    )} KB`;
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(2)} MB`;
}

/**
 * Format date.
 */
export function formatArabicDateTime(
  isoString: string
): string {
  try {
    const date = new Date(
      isoString
    );

    if (isNaN(date.getTime())) {
      return isoString;
    }

    return date.toLocaleDateString(
      'ar-EG',
      {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }
    );
  } catch {
    return isoString;
  }
}

/**
 * List Google Drive backups.
 */
export async function listGoogleDriveBackups(
  accessToken: string
): Promise<GoogleDriveBackupFile[]> {
  if (!accessToken?.trim()) {
    throw new Error('UNAUTHORIZED');
  }

  const query =
    encodeURIComponent(
      "mimeType = 'application/json' and trashed = false"
    );

  const fields =
    encodeURIComponent(
      'files(id,name,createdTime,modifiedTime,size,description,appProperties)'
    );

  const url =
    `https://www.googleapis.com/drive/v3/files` +
    `?q=${query}` +
    `&fields=${fields}` +
    `&orderBy=createdTime%20desc`;

  try {
    const response =
      await fetch(url, {
        headers: {
          Authorization:
            `Bearer ${accessToken}`
        }
      });

    if (!response.ok) {
      if (
        response.status === 401 ||
        response.status === 403
      ) {
        throw new Error(
          'UNAUTHORIZED'
        );
      }

      throw new Error(
        `Google Drive API error: ${response.status}`
      );
    }

    const data =
      await response.json();

    return (data.files || []).map(
      (file: any) => {
        const size =
          parseInt(
            file.size || '0',
            10
          );

        const isAuto =
          file.name?.includes('auto') ||
          file.appProperties?.type ===
            'auto';

        return {
          id: file.id,
          name: file.name,
          createdTime:
            file.createdTime,
          modifiedTime:
            file.modifiedTime,
          size,
          formattedSize:
            formatBytes(size),
          formattedDate:
            formatArabicDateTime(
              file.createdTime
            ),
          description:
            file.description ||
            'نسخة احتياطية لكافيه الديب POS',
          appProperties:
            file.appProperties || {},
          isAuto
        };
      }
    );
  } catch (error: any) {
    console.warn(
      '[GoogleDrive] Failed to list backups:',
      error?.message || error
    );

    throw error;
  }
}

/**
 * Upload backup to Google Drive.
 */
export async function uploadBackupToGoogleDrive(
  accessToken: string,
  fileName: string,
  jsonContent: string,
  cafeName: string = 'كافيه الديب',
  isAuto: boolean = false
): Promise<GoogleDriveBackupFile> {
  if (!accessToken?.trim()) {
    throw new Error('UNAUTHORIZED');
  }

  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    description:
      `نسخة احتياطية شاملة لكافيه (${cafeName}) - ${
        isAuto ? 'تلقائية' : 'يدوية'
      }`,
    appProperties: {
      app: 'eldeeb_pos_enterprise',
      cafe: cafeName,
      type: isAuto
        ? 'auto'
        : 'manual'
    }
  };

  const boundary =
    '-------314159265358979323846';

  const delimiter =
    '\r\n--' +
    boundary +
    '\r\n';

  const closeDelimiter =
    '\r\n--' +
    boundary +
    '--';

  const body =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    jsonContent +
    closeDelimiter;

  const response =
    await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          'Content-Type':
            `multipart/related; boundary=${boundary}`
        },
        body
      }
    );

  if (!response.ok) {
    if (
      response.status === 401 ||
      response.status === 403
    ) {
      throw new Error(
        'UNAUTHORIZED'
      );
    }

    throw new Error(
      `Upload failed with status ${response.status}`
    );
  }

  const uploaded =
    await response.json();

  const size =
    new Blob([jsonContent]).size;

  const now =
    new Date().toISOString();

  return {
    id: uploaded.id,
    name:
      uploaded.name ||
      fileName,
    createdTime: now,
    size,
    formattedSize:
      formatBytes(size),
    formattedDate:
      formatArabicDateTime(now),
    description:
      metadata.description,
    isAuto
  };
}

/**
 * Download backup.
 */
export async function downloadBackupFromGoogleDrive(
  accessToken: string,
  fileId: string
): Promise<string> {
  if (!accessToken?.trim()) {
    throw new Error('UNAUTHORIZED');
  }

  const response =
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
        fileId
      )}?alt=media`,
      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`
        }
      }
    );

  if (!response.ok) {
    if (
      response.status === 401 ||
      response.status === 403
    ) {
      throw new Error(
        'UNAUTHORIZED'
      );
    }

    throw new Error(
      `Download failed with status ${response.status}`
    );
  }

  return response.text();
}

/**
 * Delete backup.
 */
export async function deleteBackupFromGoogleDrive(
  accessToken: string,
  fileId: string
): Promise<boolean> {
  if (!accessToken?.trim()) {
    throw new Error('UNAUTHORIZED');
  }

  const response =
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
        fileId
      )}`,
      {
        method: 'DELETE',
        headers: {
          Authorization:
            `Bearer ${accessToken}`
        }
      }
    );

  if (
    response.ok ||
    response.status === 204
  ) {
    return true;
  }

  if (
    response.status === 401 ||
    response.status === 403
  ) {
    throw new Error(
      'UNAUTHORIZED'
    );
  }

  return false;
}
