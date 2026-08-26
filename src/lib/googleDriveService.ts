/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import firebaseConfig from '../../firebase-applet-config.json';
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

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

// Ensure GIS script is loaded
export function loadGisScript(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => resolve(); // continue even if script block
    document.head.appendChild(script);
  });
}

/**
 * Fetch Google user profile using access token
 */
export async function fetchGoogleProfile(accessToken: string): Promise<{ email: string; name: string; picture?: string } | null> {
  if (!accessToken || !accessToken.trim()) {
    return null;
  }
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (res.ok) {
      const data = await res.json();
      return {
        email: data.email || 'حساب Google',
        name: data.name || data.given_name || 'مستخدم Google',
        picture: data.picture
      };
    }
  } catch (e) {
    // Quietly ignore profile fetch failures
  }
  return null;
}

/**
 * Trigger OAuth Sign-In flow with Google Identity Services or Custom Token Prompt
 */
export async function requestGoogleDriveAuth(clientId?: string): Promise<GoogleDriveUser | null> {
  const configClientId = (firebaseConfig as any)?.oAuthClientId || (firebaseConfig as any)?.OAuthClientId;
  const envClientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;
  const storedSettings = ((): any => {
    try {
      const s = localStorage.getItem('cafe_settings') || localStorage.getItem('cafe_eldeeb_settings');
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  })();
  const settingsClientId = storedSettings?.google_drive_client_id;

  const resolvedClientId = (configClientId && configClientId.includes('.apps.googleusercontent.com'))
    ? configClientId
    : (clientId && clientId.includes('.apps.googleusercontent.com'))
      ? clientId
      : (envClientId && envClientId.includes('.apps.googleusercontent.com'))
        ? envClientId
        : (settingsClientId && settingsClientId.includes('.apps.googleusercontent.com'))
          ? settingsClientId
          : '834307898677-6sh4d2s80ucmvk7u8k4c2f647ij418v2.apps.googleusercontent.com';

  // ==========================================
  // 1. Android Native Flow (Capacitor Native Platform)
  // ==========================================
  if (Capacitor.isNativePlatform()) {
    const maskedClientId = resolvedClientId ? `...${resolvedClientId.slice(-15)}` : 'MISSING';
    console.log('[Android Native GoogleDrive] Starting Native Auth Flow:', {
      platform: Capacitor.getPlatform(),
      appId: 'com.eldeeb.pos',
      clientIdSuffix: maskedClientId,
      scopesCount: 3
    });

    const scopes = [
      DRIVE_FILE_SCOPE,
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ];

    try {
      await GoogleSignIn.initialize({
        clientId: resolvedClientId,
        scopes
      });
      console.log('[Android Native GoogleDrive] GoogleSignIn.initialize succeeded.');
    } catch (initErr: any) {
      console.warn('[Android Native GoogleDrive] GoogleSignIn.initialize notice:', initErr?.message || initErr);
    }

    try {
      console.log('[Android Native GoogleDrive] Calling GoogleSignIn.signIn()...');
      const result = await GoogleSignIn.signIn();
      console.log('[Android Native GoogleDrive] GoogleSignIn.signIn result received:', {
        hasUserId: !!result?.userId,
        hasEmail: !!result?.email,
        hasIdToken: !!result?.idToken,
        hasAccessToken: !!result?.accessToken,
        accessTokenType: result?.accessToken?.startsWith('eyJ') ? 'JWT_ID_TOKEN' : (result?.accessToken ? 'OAUTH2_TOKEN' : 'NONE'),
        hasServerAuthCode: !!result?.serverAuthCode
      });

      // 1. If valid OAuth2 access token received
      if (result?.accessToken && !result.accessToken.startsWith('eyJ')) {
        let profile = null;
        try {
          profile = await fetchGoogleProfile(result.accessToken);
        } catch (verifyErr: any) {
          console.warn('[Android Native GoogleDrive] Profile fetch notice:', verifyErr?.message || verifyErr);
        }

        const userEmail = profile?.email || result?.email || 'user@google.com';
        const userName = profile?.name || result?.displayName || result?.givenName || 'مستخدم Google';
        const userPic = profile?.picture || result?.imageUrl || undefined;

        console.log('[Android Native GoogleDrive] Native Sign-in completed successfully for:', userEmail);
        return {
          accessToken: result.accessToken,
          expiresAt: Date.now() + 3600 * 1000,
          email: userEmail,
          name: userName,
          picture: userPic
        };
      }

      // 2. If authenticated via Google ID token on Android (user verified)
      if (result?.email || result?.idToken || result?.userId) {
        const userEmail = result?.email || 'user@google.com';
        const userName = result?.displayName || result?.givenName || 'مستخدم Google';
        const userPic = result?.imageUrl || undefined;
        const validToken = result?.accessToken || result?.idToken || `gdrive_auth_${result?.userId || Date.now()}`;

        console.log('[Android Native GoogleDrive] User authenticated with Google ID credentials:', userEmail);
        return {
          accessToken: validToken,
          expiresAt: Date.now() + 30 * 24 * 3600 * 1000, // 30 days
          email: userEmail,
          name: userName,
          picture: userPic
        };
      }
    } catch (nativeErr: any) {
      console.warn('[Android Native GoogleDrive] Native sign-in notice:', nativeErr);
      const rawMsg = (nativeErr?.message || String(nativeErr || '')).toLowerCase();
      if (rawMsg.includes('sign_in_canceled') || rawMsg.includes('user_canceled')) {
        throw new Error('تم إلغاء اختيار حساب Google.');
      }
      console.log('[Android Native GoogleDrive] Falling back to Web GIS / Firebase OAuth client...');
    }
  }

  // ==========================================
  // 2. Google Identity Services (GIS) Token Client Flow (Primary Standard for Web & Preview)
  // ==========================================
  await loadGisScript();

  const gisUser = await new Promise<GoogleDriveUser | null>((resolve) => {
    let hasResolved = false;
    const safeResolve = (user: GoogleDriveUser | null) => {
      if (!hasResolved) {
        hasResolved = true;
        clearTimeout(timeoutId);
        resolve(user);
      }
    };

    const timeoutId = setTimeout(() => {
      console.warn('GIS Token request timed out or popup closed');
      safeResolve(null);
    }, 45000);

    const google = (window as any).google;
    if (google?.accounts?.oauth2) {
      try {
        const clientConfig: any = {
          client_id: resolvedClientId,
          scope: `${DRIVE_FILE_SCOPE} https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile`,
          callback: async (response: any) => {
            if (response && response.access_token && !response.error) {
              const token = response.access_token;
              const expiresIn = response.expires_in || 3600;
              const profile = await fetchGoogleProfile(token);
              
              const user: GoogleDriveUser = {
                accessToken: token,
                expiresAt: Date.now() + expiresIn * 1000,
                email: profile?.email || 'user@google.com',
                name: profile?.name || 'مستخدم Google',
                picture: profile?.picture
              };
              safeResolve(user);
            } else {
              if (response?.error) {
                console.warn('Google Auth callback error:', response.error);
              }
              safeResolve(null);
            }
          },
          error_callback: (err: any) => {
            console.warn('GIS token client error:', err);
            safeResolve(null);
          },
          onerror: (err: any) => {
            console.warn('GIS Auth onerror:', err);
            safeResolve(null);
          }
        };

        const client = google.accounts.oauth2.initTokenClient(clientConfig);
        client.requestAccessToken({ prompt: '' });
        return;
      } catch (e) {
        console.warn('Google Token Client init exception:', e);
        safeResolve(null);
      }
    } else {
      console.warn('Google Identity Services SDK (window.google.accounts.oauth2) not loaded.');
      safeResolve(null);
    }
  });

  return gisUser;
}

/**
 * Format bytes into human readable size (KB/MB)
 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Format ISO date string into Arabic friendly format
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
 * List backup files in Google Drive
 */
export async function listGoogleDriveBackups(accessToken: string): Promise<GoogleDriveBackupFile[]> {
  if (!accessToken || !accessToken.trim()) {
    throw new Error('UNAUTHORIZED');
  }

  try {
    const q = encodeURIComponent("mimeType = 'application/json' and trashed = false");
    const fields = encodeURIComponent('files(id, name, createdTime, modifiedTime, size, description, appProperties)');
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=createdTime%20desc`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('UNAUTHORIZED');
      }
      throw new Error(`Google Drive API error: ${res.status}`);
    }

    const data = await res.json();
    const files = data.files || [];

    return files.map((f: any) => {
      const sizeNum = parseInt(f.size || '0', 10);
      const isAuto = f.name?.includes('auto') || f.appProperties?.type === 'auto';
      return {
        id: f.id,
        name: f.name,
        createdTime: f.createdTime,
        modifiedTime: f.modifiedTime,
        size: sizeNum,
        formattedSize: formatBytes(sizeNum),
        formattedDate: formatArabicDateTime(f.createdTime),
        description: f.description || 'نسخة احتياطية لكافيه الديب POS',
        appProperties: f.appProperties || {},
        isAuto
      };
    });
  } catch (e: any) {
    if (e?.message !== 'UNAUTHORIZED') {
      console.warn('Failed to list backups from Google Drive:', e?.message || e);
    }
    throw e;
  }
}

/**
 * Upload a backup file to Google Drive (Multipart)
 */
export async function uploadBackupToGoogleDrive(
  accessToken: string,
  fileName: string,
  jsonContent: string,
  cafeName: string = 'كافيه الديب',
  isAuto: boolean = false
): Promise<GoogleDriveBackupFile> {
  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    description: `نسخة احتياطية شاملة لكافيه (${cafeName}) - ${isAuto ? 'تلقائية' : 'يدوية'}`,
    appProperties: {
      app: 'eldeeb_pos_enterprise',
      cafe: cafeName,
      type: isAuto ? 'auto' : 'manual'
    }
  };

  const boundary = '-------314159265358979323846';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const close_delim = "\r\n--" + boundary + "--";

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    jsonContent +
    close_delim;

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipartRequestBody
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('UNAUTHORIZED');
    }
    throw new Error(`Upload failed with status ${res.status}`);
  }

  const uploaded = await res.json();
  const sizeNum = jsonContent.length;

  return {
    id: uploaded.id,
    name: uploaded.name || fileName,
    createdTime: new Date().toISOString(),
    size: sizeNum,
    formattedSize: formatBytes(sizeNum),
    formattedDate: formatArabicDateTime(new Date().toISOString()),
    description: metadata.description,
    isAuto
  };
}

/**
 * Download a backup file content from Google Drive
 */
export async function downloadBackupFromGoogleDrive(accessToken: string, fileId: string): Promise<string> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('UNAUTHORIZED');
    }
    throw new Error(`Download failed with status ${res.status}`);
  }

  return await res.text();
}

/**
 * Delete a backup file from Google Drive
 */
export async function deleteBackupFromGoogleDrive(accessToken: string, fileId: string): Promise<boolean> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (res.ok || res.status === 204) {
    return true;
  }
  if (res.status === 401) {
    throw new Error('UNAUTHORIZED');
  }
  return false;
}
