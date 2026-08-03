/**
 * Cafe Eldeeb POS Enterprise - Version & Update Configuration
 */

export const CURRENT_APP_VERSION = "4.3.0";
export const CURRENT_APP_BUILD = 430;
export const CURRENT_RELEASE_DATE = "2026-08-03";

export type ClientPlatform = 'web' | 'android';

export interface RemoteVersionInfo {
  webVersion: string;
  androidVersion: string;
  minWebVersion?: string;
  minAndroidVersion?: string;
  releaseNotes: string;
  releaseDate: string;
  apkUrl: string;
  apkFileName: string;
  apkSize: string;
  forceUpdate: boolean;
  updatedAt?: string;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  isForceUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  platform: ClientPlatform;
  releaseNotes: string;
  apkUrl: string;
  apkFileName: string;
  apkSize: string;
  releaseDate: string;
  checkedAt: string;
}

/**
 * Compare two semver-like strings (e.g., "4.2.5" vs "4.3.0").
 * Returns:
 *   1 if v1 > v2
 *  -1 if v1 < v2
 *   0 if v1 == v2
 */
export function compareVersions(v1: string, v2: string): number {
  if (!v1 || !v2) return 0;
  
  const cleanV1 = v1.replace(/^v/i, '').trim();
  const cleanV2 = v2.replace(/^v/i, '').trim();
  
  const parts1 = cleanV1.split('.').map(n => parseInt(n, 10) || 0);
  const parts2 = cleanV2.split('.').map(n => parseInt(n, 10) || 0);
  
  const maxLength = Math.max(parts1.length, parts2.length);
  
  for (let i = 0; i < maxLength; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  
  return 0;
}

/**
 * Check if target version is strictly newer than current version.
 */
export function isNewerVersion(currentVer: string, latestVer: string): boolean {
  return compareVersions(currentVer, latestVer) < 0;
}

/**
 * Detect runtime platform ('android' or 'web').
 */
export function detectClientPlatform(): ClientPlatform {
  if (typeof window === 'undefined') return 'web';
  
  // Check localStorage explicit override first
  const savedPlatform = localStorage.getItem('eldeeb_client_platform');
  if (savedPlatform === 'android' || savedPlatform === 'web') {
    return savedPlatform;
  }
  
  // Check Capacitor / Native Android flags or User Agent
  const win = window as any;
  if (win.Capacitor || win.AndroidBridge || win.cordova) {
    return 'android';
  }
  
  const ua = navigator.userAgent || '';
  if (ua.includes('EldeebAndroidApp') || ua.includes('wv') || (ua.includes('Android') && ua.includes('MobileApp'))) {
    return 'android';
  }
  
  return 'web';
}
