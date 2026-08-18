/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Native Google authentication for Cafe Eldeeb POS.
 * Android uses Credential Manager through Capacitor.
 * Web falls back to the existing GIS/Firebase-compatible flow.
 */

import { Capacitor } from '@capacitor/core';
import { GoogleSignIn } from '@capawesome/capacitor-google-sign-in';

const GOOGLE_CLIENT_ID =
  '864337937711-gi69esgs44rn7d2li3mb6bfjhdspe2pv.apps.googleusercontent.com';

export const GOOGLE_DRIVE_SCOPE =
  'https://www.googleapis.com/auth/drive.file';

export const GOOGLE_PROFILE_SCOPE =
  'https://www.googleapis.com/auth/userinfo.profile';

export const GOOGLE_EMAIL_SCOPE =
  'https://www.googleapis.com/auth/userinfo.email';

let lastInitializedScopesKey = '';

export async function initializeGoogleAuth(
  scopes: string[] = [
    GOOGLE_EMAIL_SCOPE,
    GOOGLE_PROFILE_SCOPE,
  ]
): Promise<void> {
  const scopesKey = [...scopes].sort().join(',');
  if (lastInitializedScopesKey === scopesKey) {
    return;
  }

  console.log('[Android Native GoogleAuth] Initializing GoogleSignIn with scopes:', scopes);
  await GoogleSignIn.initialize({
    clientId: GOOGLE_CLIENT_ID,
    scopes,
  });

  lastInitializedScopesKey = scopesKey;
}

export interface NativeGoogleAuthResult {
  accessToken: string;
  email: string;
  name: string;
  picture?: string;
  idToken?: string;
}

export async function signInWithGoogleNative(
  scopes: string[]
): Promise<NativeGoogleAuthResult | null> {
  if (Capacitor.getPlatform() === 'web') {
    return null;
  }

  try {
    await initializeGoogleAuth(scopes);

    const result = await GoogleSignIn.signIn();

    if (!result.accessToken) {
      console.warn(
        'Google Sign-In completed but no access token was returned.'
      );
      return null;
    }

    return {
      accessToken: result.accessToken,
      email: result.email || 'user@gmail.com',
      name: result.displayName || 'مستخدم Google',
      picture: result.imageUrl || undefined,
      idToken: result.idToken || undefined,
    };
  } catch (error: any) {
    console.error('Native Google Sign-In failed:', error);
    throw error;
  }
}

export async function signOutGoogleNative(): Promise<void> {
  if (Capacitor.getPlatform() === 'web') {
    return;
  }

  try {
    await GoogleSignIn.signOut();
  } catch (error) {
    console.warn('Google native sign-out warning:', error);
  }
}
