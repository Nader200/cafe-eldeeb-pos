import {
  CURRENT_APP_VERSION,
  ClientPlatform,
  RemoteVersionInfo,
  UpdateCheckResult,
  detectClientPlatform,
  isNewerVersion
} from '../config/version';
import { dbService } from '../dbService';

export async function fetchRemoteVersion(): Promise<RemoteVersionInfo> {
  try {
    const res = await fetch('/api/version', {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (!res.ok) throw new Error(`Server status ${res.status}`);
    const data = await res.json();
    return data as RemoteVersionInfo;
  } catch (err) {
    console.warn('[UpdateService] Failed to fetch remote version:', err);
    // Return fallback remote version info matching current version if network unavailable
    return {
      webVersion: CURRENT_APP_VERSION,
      androidVersion: CURRENT_APP_VERSION,
      releaseNotes: 'تعذر الاتصال بخادم التحديثات المباشرة.',
      releaseDate: new Date().toISOString().split('T')[0],
      apkUrl: '/api/download-apk',
      apkFileName: `Cafe_Eldeeb_POS_v${CURRENT_APP_VERSION}.apk`,
      apkSize: '14.8 MB',
      forceUpdate: false
    };
  }
}

export async function checkForUpdates(
  overridePlatform?: ClientPlatform,
  userRole: string = 'Admin'
): Promise<UpdateCheckResult> {
  const platform = overridePlatform || detectClientPlatform();
  const remoteInfo = await fetchRemoteVersion();
  const now = new Date().toISOString();

  const remoteVer = platform === 'android' ? remoteInfo.androidVersion : remoteInfo.webVersion;
  const hasUpdate = isNewerVersion(CURRENT_APP_VERSION, remoteVer);
  const isForceUpdate = Boolean(remoteInfo.forceUpdate && hasUpdate);

  // Update last check date in settings
  dbService.saveSettings({
    last_update_check_date: now,
    last_installed_version: CURRENT_APP_VERSION
  });

  // Log in update history
  dbService.addUpdateLog({
    action: hasUpdate ? 'UPDATE_DETECTED' : 'CHECK_FOR_UPDATES',
    installed_version: CURRENT_APP_VERSION,
    remote_version: remoteVer,
    platform: platform,
    status: hasUpdate ? 'WARNING' : 'INFO',
    details: hasUpdate
      ? `يتوفر تحديث جديد (${remoteVer}) لمنصة ${platform === 'android' ? 'أندرويد' : 'الويب'}`
      : `النظام يحدث بالفعل إلى أحدث إصدار (${CURRENT_APP_VERSION})`,
    user_role: userRole
  });

  return {
    hasUpdate,
    isForceUpdate,
    currentVersion: CURRENT_APP_VERSION,
    latestVersion: remoteVer,
    platform,
    releaseNotes: remoteInfo.releaseNotes || 'تحديث شامل لتحسينات الأداء والاستقرار.',
    apkUrl: remoteInfo.apkUrl || '/api/download-apk',
    apkFileName: remoteInfo.apkFileName || `Cafe_Eldeeb_POS_v${remoteVer}.apk`,
    apkSize: remoteInfo.apkSize || '14.8 MB',
    releaseDate: remoteInfo.releaseDate || now.split('T')[0],
    checkedAt: now
  };
}

export async function publishRemoteVersionConfig(
  config: Partial<RemoteVersionInfo>
): Promise<boolean> {
  try {
    const res = await fetch('/api/version', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    return res.ok;
  } catch (err) {
    console.error('[UpdateService] Failed to publish version config:', err);
    return false;
  }
}
