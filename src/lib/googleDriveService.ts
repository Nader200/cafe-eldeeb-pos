/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import firebaseConfig from '../../firebase-applet-config.json';
import { auth } from './firebaseClient';
import {
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import {
  GoogleSignIn
} from '@capawesome/capacitor-google-sign-in';
import {
  Capacitor
} from '@capacitor/core';

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

const GOOGLE_EMAIL_SCOPE =
  'https://www.googleapis.com/auth/userinfo.email';

const GOOGLE_PROFILE_SCOPE =
  'https://www.googleapis.com/auth/userinfo.profile';

const DEFAULT_GOOGLE_WEB_CLIENT_ID =
  '864337937711-gi69esgs44rn7d2li3mb6bfjhdspe2pv.apps.googleusercontent.com';

let nativeGoogleInitialized = false;

/**
 * Resolve Google WEB OAuth Client ID.
 *
 * IMPORTANT:
 * @capawesome/capacitor-google-sign-in expects the
 * WEB OAuth Client ID in initialize(), including Android.
 */
function resolveGoogleWebClientId(
  clientId?: string
): string {
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

    storedSettings = raw
      ? JSON.parse(raw)
      : null;
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

  const validClientId =
    candidates.find(
      (value) =>
        typeof value === 'string' &&
        value.includes(
          '.apps.googleusercontent.com'
        )
    );

  return (
    validClientId ||
    DEFAULT_GOOGLE_WEB_CLIENT_ID
  );
}

/**
 * Initialize native Google authorization.
 *
 * The requested OAuth scopes are what allow
 * the native plugin to return an OAuth accessToken.
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
    '[Google Native Drive] initialized with OAuth scopes'
  );
}

/**
 * Load Google Identity Services.
 *
 * Used on Web only.
 */
export function loadGisScript(): Promise<void> {
  return new Promise((resolve) => {
    if (
      (window as any).google?.accounts?.oauth2
    ) {
      resolve();
      return;
    }

    const existing =
      document.querySelector(
        'script[src="https://accounts.google.com/gsi/client"]'
      );

    if (existing) {
      existing.addEventListener(
        'load',
        () => resolve()
      );

      setTimeout(
        () => resolve(),
        2000
      );

      return;
    }

    const script =
      document.createElement('script');

    script.src =
      'https://accounts.google.com/gsi/client';

    script.async = true;
    script.defer = true;

    script.onload = () => resolve();
    script.onerror = () => resolve();

    document.head.appendChild(
      script
    );
  });
}

/**
 * Fetch Google user profile using an OAuth access token.
 *
 * IMPORTANT:
 * This function expects an OAuth access token.
 * An ID token must never be passed here.
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
    const response =
      await fetch(
        'https://www.googleapis.com/oauth2/v3/userinfo',
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`
          }
        }
      );

    if (response.ok) {
      const data =
        await response.json();

      return {
        email:
          data.email ||
          'حساب Google',

        name:
          data.name ||
          data.given_name ||
          'مستخدم Google',

        picture:
          data.picture
      };
    }
  } catch (error) {
    console.warn(
      '[Google Drive] Failed to fetch Google profile:',
      error
    );
  }

  return null;
}

/**
 * Native Android Google Drive OAuth.
 *
 * IMPORTANT:
 *
 * ONLY result.accessToken is accepted.
 *
 * result.idToken is NEVER used as an API token.
 */
async function requestNativeGoogleDriveAuth(
  clientId: string
): Promise<GoogleDriveUser | null> {
  try {
    await initializeNativeGoogle(
      clientId
    );

    console.log(
      '[Android Native GoogleDrive] Starting OAuth authorization...'
    );

    const result =
      await GoogleSignIn.signIn();

    console.log(
      '[Android Native GoogleDrive] Native result:',
      {
        hasUserId:
          !!result?.userId,

        hasEmail:
          !!result?.email,

        hasIdToken:
          !!result?.idToken,

        hasAccessToken:
          !!result?.accessToken,

        hasServerAuthCode:
          !!result?.serverAuthCode
      }
    );

    /*
     * =====================================================
     * CRITICAL SECURITY RULE
     * =====================================================
     *
     * NEVER do:
     *
     * result.accessToken || result.idToken
     *
     * An ID token is NOT an OAuth API access token.
     *
     * Google Drive API requires an OAuth access token.
     * =====================================================
     */

    const accessToken =
      result?.accessToken || '';

    if (!accessToken.trim()) {
      console.error(
        '[Android Native GoogleDrive] No OAuth access token returned by Google.',
        {
          hasIdToken:
            !!result?.idToken,

          hasServerAuthCode:
            !!result?.serverAuthCode
        }
      );

      return null;
    }

    const profile =
      await fetchGoogleProfile(
        accessToken
      );

    const email =
      profile?.email ||
      result?.email ||
      'user@google.com';

    const name =
      profile?.name ||
      result?.displayName ||
      result?.givenName ||
      'مستخدم Google';

    const picture =
      profile?.picture ||
      result?.imageUrl ||
      undefined;

    console.log(
      '[Android Native GoogleDrive] OAuth access token acquired for:',
      email
    );

    return {
      email,
      name,
      picture,
      accessToken,
      expiresAt:
        Date.now() +
        3600 * 1000
    };
  } catch (error: any) {
    console.error(
      '[Android Native GoogleDrive] OAuth failed:',
      error?.message ||
        error
    );

    return null;
  }
}

/**
 * Web Google Drive OAuth using Google Identity Services.
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

        clearTimeout(
          timeout
        );

        resolve(value);
      };

      const timeout =
        setTimeout(() => {
          console.warn(
            '[Web Google Drive] OAuth timeout'
          );

          finish(null);
        }, 45000);

      const google =
        (window as any).google;

      if (
        !google?.accounts?.oauth2
      ) {
        console.warn(
          '[Web Google Drive] Google Identity Services unavailable'
        );

        finish(null);
        return;
      }

      try {
        const client =
          google.accounts.oauth2.initTokenClient(
            {
              client_id:
                clientId,

              scope: [
                DRIVE_FILE_SCOPE,
                GOOGLE_EMAIL_SCOPE,
                GOOGLE_PROFILE_SCOPE
              ].join(' '),

              callback:
                async (
                  response: any
                ) => {
                  if (
                    !response?.access_token ||
                    response?.error
                  ) {
                    console.warn(
                      '[Web Google Drive] OAuth error:',
                      response?.error
                    );

                    finish(null);
                    return;
                  }

                  const accessToken =
                    response.access_token;

                  const expiresIn =
                    response.expires_in ||
                    3600;

                  const profile =
                    await fetchGoogleProfile(
                      accessToken
                    );

                  finish({
                    accessToken,

                    expiresAt:
                      Date.now() +
                      expiresIn *
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

              error_callback:
                (
                  error: any
                ) => {
                  console.warn(
                    '[Web Google Drive] OAuth error:',
                    error
                  );

                  finish(null);
                }
            }
          );

        client.requestAccessToken();
      } catch (error) {
        console.error(
          '[Web Google Drive] OAuth exception:',
          error
        );

        finish(null);
      }
    }
  );
}

/**
 * Firebase Google OAuth fallback.
 *
 * Web only.
 *
 * IMPORTANT:
 * Firebase ID token is NOT used.
 * Only credential.accessToken is accepted.
 */
async function requestFirebaseGoogleDriveAuth():
  Promise<GoogleDriveUser | null> {
  try {
    const provider =
      new GoogleAuthProvider();

    provider.addScope(
      DRIVE_FILE_SCOPE
    );

    provider.addScope(
      GOOGLE_EMAIL_SCOPE
    );

    provider.addScope(
      GOOGLE_PROFILE_SCOPE
    );

    provider.setCustomParameters({
      prompt:
        'select_account'
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
     * NEVER use Firebase ID token
     * as a Google Drive API token.
     */
    if (!accessToken) {
      console.error(
        '[Firebase Google Drive] No OAuth access token returned'
      );

      return null;
    }

    return {
      email:
        result.user?.email ||
        'user@google.com',

      name:
        result.user?.displayName ||
        'مستخدم Google',

      picture:
        result.user?.photoURL ||
        undefined,

      accessToken,

      expiresAt:
        Date.now() +
        3600 * 1000
    };
  } catch (error: any) {
    console.warn(
      '[Firebase Google Drive] OAuth failed:',
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
    resolveGoogleWebClientId(
      clientId
    );

  console.log(
    '[Google Drive] Client ID:',
    `...${resolvedClientId.slice(-20)}`
  );

  /*
   * =====================================================
   * ANDROID
   * =====================================================
   *
   * Native Google Sign-In only.
   *
   * We deliberately do NOT fall back to GIS
   * inside the Android WebView.
   */
  if (
    Capacitor.isNativePlatform()
  ) {
    return requestNativeGoogleDriveAuth(
      resolvedClientId
    );
  }

  /*
   * =====================================================
   * WEB
   * =====================================================
   */

  const gisUser =
    await requestWebGoogleDriveAuth(
      resolvedClientId
    );

  if (gisUser) {
    return gisUser;
  }

  return requestFirebaseGoogleDriveAuth();
}

/**
 * Format bytes into human-readable size.
 */
export function formatBytes(
  bytes: number
): string {
  if (
    !bytes ||
    bytes <= 0
  ) {
    return '0 KB';
  }

  if (
    bytes <
    1024 * 1024
  ) {
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
 * Format ISO date into Arabic friendly format.
 */
export function formatArabicDateTime(
  isoString: string
): string {
  try {
    const date =
      new Date(
        isoString
      );

    if (
      isNaN(
        date.getTime()
      )
    ) {
      return isoString;
    }

    return date.toLocaleDateString(
      'ar-EG',
      {
        weekday:
          'long',

        year:
          'numeric',

        month:
          'long',

        day:
          'numeric',

        hour:
          '2-digit',

        minute:
          '2-digit'
      }
    );
  } catch {
    return isoString;
  }
}

/**
 * List backup files from Google Drive.
 */
export async function listGoogleDriveBackups(
  accessToken: string
): Promise<GoogleDriveBackupFile[]> {
  if (
    !accessToken ||
    !accessToken.trim()
  ) {
    throw new Error(
      'UNAUTHORIZED'
    );
  }

  try {
    const q =
      encodeURIComponent(
        "mimeType = 'application/json' and trashed = false"
      );

    const fields =
      encodeURIComponent(
        'files(id, name, createdTime, modifiedTime, size, description, appProperties)'
      );

    const url =
      `https://www.googleapis.com/drive/v3/files` +
      `?q=${q}` +
      `&fields=${fields}` +
      `&orderBy=createdTime%20desc`;

    const response =
      await fetch(
        url,
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`
          }
        }
      );

    if (!response.ok) {
      if (
        response.status ===
        401
      ) {
        throw new Error(
          'UNAUTHORIZED'
        );
      }

      if (
        response.status ===
        403
      ) {
        throw new Error(
          'FORBIDDEN'
        );
      }

      throw new Error(
        `Google Drive API error: ${response.status}`
      );
    }

    const data =
      await response.json();

    const files =
      data.files || [];

    return files.map(
      (
        file: any
      ) => {
        const sizeNum =
          parseInt(
            file.size ||
              '0',
            10
          );

        const isAuto =
          file.name
            ?.toLowerCase()
            .includes(
              'auto'
            ) ||
          file.appProperties
            ?.type ===
            'auto';

        return {
          id:
            file.id,

          name:
            file.name,

          createdTime:
            file.createdTime,

          modifiedTime:
            file.modifiedTime,

          size:
            sizeNum,

          formattedSize:
            formatBytes(
              sizeNum
            ),

          formattedDate:
            formatArabicDateTime(
              file.createdTime
            ),

          description:
            file.description ||
            'نسخة احتياطية لكافيه الديب POS',

          appProperties:
            file.appProperties ||
            {},

          isAuto
        };
      }
    );
  } catch (error: any) {
    if (
      error?.message !==
      'UNAUTHORIZED'
    ) {
      console.warn(
        '[Google Drive] Failed to list backups:',
        error?.message ||
          error
      );
    }

    throw error;
  }
}

/**
 * Upload a backup file to Google Drive.
 */
export async function uploadBackupToGoogleDrive(
  accessToken: string,
  fileName: string,
  jsonContent: string,
  cafeName: string = 'كافيه الديب',
  isAuto: boolean = false
): Promise<GoogleDriveBackupFile> {
  if (
    !accessToken ||
    !accessToken.trim()
  ) {
    throw new Error(
      'UNAUTHORIZED'
    );
  }

  const metadata = {
    name:
      fileName,

    mimeType:
      'application/json',

    description:
      `نسخة احتياطية شاملة لكافيه (${cafeName}) - ${
        isAuto
          ? 'تلقائية'
          : 'يدوية'
      }`,

    appProperties: {
      app:
        'eldeeb_pos_enterprise',

      cafe:
        cafeName,

      type:
        isAuto
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

  const closeDelim =
    '\r\n--' +
    boundary +
    '--';

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(
      metadata
    ) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    jsonContent +
    closeDelim;

  const response =
    await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method:
          'POST',

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          'Content-Type':
            `multipart/related; boundary=${boundary}`
        },

        body:
          multipartRequestBody
      }
    );

  if (!response.ok) {
    if (
      response.status ===
      401
    ) {
      throw new Error(
        'UNAUTHORIZED'
      );
    }

    if (
      response.status ===
      403
    ) {
      throw new Error(
        'FORBIDDEN'
      );
    }

    const errorText =
      await response
        .text()
        .catch(
          () => ''
        );

    throw new Error(
      `Upload failed with status ${response.status}${
        errorText
          ? `: ${errorText}`
          : ''
      }`
    );
  }

  const uploaded =
    await response.json();

  const sizeNum =
    new TextEncoder().encode(
      jsonContent
    ).length;

  const now =
    new Date().toISOString();

  return {
    id:
      uploaded.id,

    name:
      uploaded.name ||
      fileName,

    createdTime:
      now,

    size:
      sizeNum,

    formattedSize:
      formatBytes(
        sizeNum
      ),

    formattedDate:
      formatArabicDateTime(
        now
      ),

    description:
      metadata.description,

    appProperties:
      metadata.appProperties,

    isAuto
  };
}

/**
 * Download a backup file from Google Drive.
 */
export async function downloadBackupFromGoogleDrive(
  accessToken: string,
  fileId: string
): Promise<string> {
  if (
    !accessToken ||
    !accessToken.trim()
  ) {
    throw new Error(
      'UNAUTHORIZED'
    );
  }

  if (
    !fileId ||
    !fileId.trim()
  ) {
    throw new Error(
      'INVALID_FILE_ID'
    );
  }

  const url =
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      fileId
    )}?alt=media`;

  const response =
    await fetch(
      url,
      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`
        }
      }
    );

  if (!response.ok) {
    if (
      response.status ===
      401
    ) {
      throw new Error(
        'UNAUTHORIZED'
      );
    }

    if (
      response.status ===
      403
    ) {
      throw new Error(
        'FORBIDDEN'
      );
    }

    throw new Error(
      `Download failed with status ${response.status}`
    );
  }

  return response.text();
}

/**
 * Delete a backup file from Google Drive.
 */
export async function deleteBackupFromGoogleDrive(
  accessToken: string,
  fileId: string
): Promise<boolean> {
  if (
    !accessToken ||
    !accessToken.trim()
  ) {
    throw new Error(
      'UNAUTHORIZED'
    );
  }

  if (
    !fileId ||
    !fileId.trim()
  ) {
    return false;
  }

  const url =
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      fileId
    )}`;

  const response =
    await fetch(
      url,
      {
        method:
          'DELETE',

        headers: {
          Authorization:
            `Bearer ${accessToken}`
        }
      }
    );

  if (
    response.ok ||
    response.status ===
      204
  ) {
    return true;
  }

  if (
    response.status ===
    401
  ) {
    throw new Error(
      'UNAUTHORIZED'
    );
  }

  if (
    response.status ===
    403
  ) {
    throw new Error(
      'FORBIDDEN'
    );
  }

  return false;
}
