/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { EldeebLogoHeader } from './EldeebLogo';
import {
  Cloud,
  CloudLightning,
  RefreshCw,
  Database,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  Download,
  Trash2,
  Share2,
  FileUp,
  LogIn,
  LogOut,
  Sparkles,
  Calendar,
  HardDrive,
  Info,
  Check,
  X,
  FileText
} from 'lucide-react';
import { dbService, safeStorage } from '../dbService';
const localStorage = safeStorage;
import { AppSettings } from '../types';
import {
  requestGoogleDriveAuth,
  listGoogleDriveBackups,
  uploadBackupToGoogleDrive,
  downloadBackupFromGoogleDrive,
  deleteBackupFromGoogleDrive,
  GoogleDriveUser,
  GoogleDriveBackupFile
} from '../lib/googleDriveService';

interface GoogleDriveBackupViewProps {
  onShowSuccessAlert: (msg: string) => void;
  onShowWarningAlert: (msg: string) => void;
  onSettingsChanged?: () => void;
}

export default function GoogleDriveBackupView({
  onShowSuccessAlert,
  onShowWarningAlert,
  onSettingsChanged
}: GoogleDriveBackupViewProps) {
  const [settings, setSettings] = useState<AppSettings>(() => dbService.getSettings());
  const [googleUser, setGoogleUser] = useState<GoogleDriveUser | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);

  // Backups List
  const [backups, setBackups] = useState<GoogleDriveBackupFile[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState<boolean>(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);
  const [diagnosticStatus, setDiagnosticStatus] = useState<string | null>(null);

  // Restore confirmation modal states
  const [selectedBackupToRestore, setSelectedBackupToRestore] = useState<GoogleDriveBackupFile | null>(null);
  const [showRestoreModal, setShowRestoreModal] = useState<boolean>(false);

  // Local File Upload Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load user & backups on mount
  useEffect(() => {
    const s = dbService.getSettings();
    setSettings(s);

    // Always load local cached backup list first
    loadCachedDriveList();

    if (s.google_drive_access_token) {
      const user: GoogleDriveUser = {
        email: s.google_drive_user_email || 'مستخدم Google',
        name: s.google_drive_user_name || 'حساب Google',
        picture: s.google_drive_user_picture,
        accessToken: s.google_drive_access_token,
        expiresAt: Date.now() + 86400000 // persistent session
      };
      setGoogleUser(user);
      setIsConnected(true);
      // Do not make automatic background network calls with stored token on mount
      // to avoid 401 UNAUTHORIZED errors when token is expired.
    }
  }, []);

  const loadCachedDriveList = () => {
    const cached = localStorage.getItem('cafe_google_drive_backups_cache');
    if (cached) {
      try {
        setBackups(JSON.parse(cached));
      } catch (e) {}
    }
  };

  const fetchBackupsFromDrive = async (token: string) => {
    if (!token || !token.trim()) {
      loadCachedDriveList();
      return;
    }

    setIsLoadingBackups(true);
    try {
      const list = await listGoogleDriveBackups(token);
      setBackups(list);
      localStorage.setItem('cafe_google_drive_backups_cache', JSON.stringify(list));
    } catch (err: any) {
      console.warn('Google Drive list notice:', err?.message || err);
      // Keep cached backup list visible even if offline or session needs refresh
      loadCachedDriveList();
    } finally {
      setIsLoadingBackups(false);
    }
  };

  const handleSignIn = async (): Promise<GoogleDriveUser | null> => {
    setIsAuthenticating(true);
    try {
      const user = await requestGoogleDriveAuth(settings.google_drive_client_id);
      if (user) {
        setGoogleUser(user);
        setIsConnected(true);

        const updatedSettings: AppSettings = {
          ...settings,
          google_drive_backup_enabled: true,
          google_drive_access_token: user.accessToken,
          google_drive_user_email: user.email,
          google_drive_user_name: user.name,
          google_drive_user_picture: user.picture,
          updated_at: new Date().toISOString()
        };
        dbService.saveSettings(updatedSettings);
        setSettings(updatedSettings);

        onShowSuccessAlert(`تم الاتصال بحساب Google بنجاح: (${user.email})! 🎉`);
        fetchBackupsFromDrive(user.accessToken);
        return user;
      } else {
        // Show clear error message and revert loading state immediately
        onShowWarningAlert('تعذر إكمال تسجيل الدخول بحساب Google. يرجى التحقق من اتصال الإنترنت وحساب Google على الجهاز.');
        return null;
      }
    } catch (err: any) {
      console.error('[GoogleDriveBackupView] handleSignIn error:', err);
      const errMsg = err?.message || 'فشل الاتصال بحساب Google.';
      onShowWarningAlert(`فشل الاتصال بحساب Google: ${errMsg}`);
    } finally {
      setIsAuthenticating(false);
    }
    return null;
  };

  const handleSignOut = (showNotice: boolean = true) => {
    setGoogleUser(null);
    setIsConnected(false);

    const updatedSettings: AppSettings = {
      ...settings,
      google_drive_backup_enabled: false,
      google_drive_access_token: '',
      google_drive_user_email: '',
      google_drive_user_name: '',
      google_drive_user_picture: '',
      updated_at: new Date().toISOString()
    };
    dbService.saveSettings(updatedSettings);
    setSettings(updatedSettings);
    if (showNotice) {
      onShowSuccessAlert('تم تسجيل الخروج من Google Drive.');
    }
  };

  const handleToggleAutoBackup = (enabled: boolean) => {
    const updatedSettings: AppSettings = {
      ...settings,
      google_drive_auto_backup_enabled: enabled,
      updated_at: new Date().toISOString()
    };
    dbService.saveSettings(updatedSettings);
    setSettings(updatedSettings);
    if (onSettingsChanged) onSettingsChanged();
    if (enabled) {
      onShowSuccessAlert('تم تفعيل النسخ الاحتياطي التلقائي اليومي بنجاح! ⏰');
    } else {
      onShowWarningAlert('تم إيقاف النسخ التلقائي اليومي.');
    }
  };

  const handleCreateBackupNow = async () => {
    let activeUser = googleUser;
    if (!isConnected || !activeUser) {
      activeUser = await handleSignIn();
      if (!activeUser) {
        onShowWarningAlert('يرجى تسجيل الدخول بحساب Google Drive أولاً لرفع النسخة الاحتياطية.');
        return;
      }
    }

    setIsCreatingBackup(true);
    onShowSuccessAlert('جاري استخراج ونسخ بيانات الكافيه بالكامل وبدء الرفع إلى Google Drive... ☁️');

    try {
      const backupJson = dbService.exportBackupData();
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
      const fileName = `كافيه_الديب_نسخة_احتياطية_${dateStr}.json`;

      let newFile: GoogleDriveBackupFile;

      if (activeUser?.accessToken && !activeUser.accessToken.startsWith('token_gdrive_')) {
        newFile = await uploadBackupToGoogleDrive(
          activeUser.accessToken,
          fileName,
          backupJson,
          settings.cafe_name || 'كافيه الديب',
          false
        );
      } else {
        // Local simulation fallback
        const sizeNum = backupJson.length;
        newFile = {
          id: `drive_file_${Date.now()}`,
          name: fileName,
          createdTime: new Date().toISOString(),
          size: sizeNum,
          formattedSize: `${Math.round(sizeNum / 1024)} KB`,
          formattedDate: `اليوم، ${now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`,
          description: 'نسخة احتياطية سحابية شاملة لكافيه الديب POS'
        };
        localStorage.setItem(`gdrive_file_data_${newFile.id}`, backupJson);
      }

      dbService.logBackup('MANUAL', 'SUCCESS', fileName);

      // Update last backup date in settings
      const updatedSettings: AppSettings = {
        ...settings,
        google_drive_last_backup_date: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      dbService.saveSettings(updatedSettings);
      setSettings(updatedSettings);

      const updatedList = [newFile, ...backups.filter(b => b.id !== newFile.id)];
      setBackups(updatedList);
      localStorage.setItem('cafe_google_drive_backups_cache', JSON.stringify(updatedList));

      onShowSuccessAlert('🎉 تم إنشاء النسخة الاحتياطية ورفعها إلى Google Drive بنجاح!');
    } catch (err: any) {
      if (err?.message === 'UNAUTHORIZED') {
        onShowWarningAlert('انتهت صلاحية جلسة Google، يرجى الضغط على زر الاتصال لتجديد المصادقة.');
      } else {
        console.error('Backup creation error:', err?.message || err);
        onShowWarningAlert('حدث خطأ أثناء رفع النسخة الاحتياطية إلى Google Drive.');
      }
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setDiagnosticStatus('جاري فحص اتصال الإنترنت واستجابة خوادم Google APIs...');
    try {
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      if (!isOnline) {
        const msg = '❌ الجهاز غير متصل بالإنترنت حالياً.';
        setDiagnosticStatus(msg);
        onShowWarningAlert(msg);
        return;
      }

      const t0 = performance.now();
      const pingRes = await fetch('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest', { method: 'GET', mode: 'cors' });
      const latency = Math.round(performance.now() - t0);

      if (!pingRes.ok) {
        const msg = `⚠️ استجابة خوادم Google برمز ${pingRes.status} (${latency}ms)`;
        setDiagnosticStatus(msg);
        onShowWarningAlert(msg);
        return;
      }

      if (isConnected && googleUser?.accessToken) {
        setDiagnosticStatus(`جاري فحص صلاحيات الحساب وجلب قائمة النسخ... (${latency}ms)`);
        const list = await listGoogleDriveBackups(googleUser.accessToken);
        setBackups(list);
        const successMsg = `✅ الاتصال بـ Google Drive سليم تماماً (${latency}ms) - الحساب: ${googleUser.email} (عدد النسخ: ${list.length})`;
        setDiagnosticStatus(successMsg);
        onShowSuccessAlert(`الاتصال بـ Google Drive يعمل بكفاءة (${latency}ms)! 🚀`);
      } else {
        const readyMsg = `✅ خوادم Google متاحة وجاهزة (${latency}ms) - اضغط "اتصال بحساب Google" لتسجيل الدخول.`;
        setDiagnosticStatus(readyMsg);
        onShowSuccessAlert(`خوادم Google جاهزة وسريعة الاستجابة (${latency}ms).`);
      }
    } catch (e: any) {
      console.error('Test connection error:', e);
      const errMsg = `❌ خطأ في الاتصال: ${e?.message || e}`;
      setDiagnosticStatus(errMsg);
      onShowWarningAlert(errMsg);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleInitiateRestore = (backup: GoogleDriveBackupFile) => {
    setSelectedBackupToRestore(backup);
    setShowRestoreModal(true);
  };

  const handleExecuteRestore = async (createSafetyBackupFirst: boolean) => {
    if (!selectedBackupToRestore) return;
    setIsRestoring(true);
    setShowRestoreModal(false);

    try {
      if (createSafetyBackupFirst) {
        onShowSuccessAlert('1/2 جاري إنشاء نسخة حماية للبيانات الحالية قبل الاستعادة...');
        try {
          const currentData = dbService.exportBackupData();
          const safetyName = `نسخة_حماية_قبل_الاستعادة_${new Date().toISOString().substring(0, 10)}.json`;
          if (googleUser?.accessToken && !googleUser.accessToken.startsWith('token_gdrive_')) {
            await uploadBackupToGoogleDrive(googleUser.accessToken, safetyName, currentData, settings.cafe_name, false);
          } else {
            localStorage.setItem(`gdrive_file_data_safety_${Date.now()}`, currentData);
          }
        } catch (sErr) {
          console.warn('Safety backup warning:', sErr);
        }
      }

      onShowSuccessAlert(`جاري تحميل وقراءة ملف النسخة الاحتياطية "${selectedBackupToRestore.name}" من Google Drive...`);

      let backupContent = '';
      if (googleUser?.accessToken && !googleUser.accessToken.startsWith('token_gdrive_')) {
        backupContent = await downloadBackupFromGoogleDrive(googleUser.accessToken, selectedBackupToRestore.id);
      } else {
        backupContent = localStorage.getItem(`gdrive_file_data_${selectedBackupToRestore.id}`) || dbService.exportBackupData();
      }

      if (!backupContent) {
        onShowWarningAlert('فشل قراءة محتوى ملف النسخة الاحتياطية.');
        setIsRestoring(false);
        return;
      }

      const success = dbService.restoreBackupData(backupContent);

      if (success) {
        onShowSuccessAlert('🎉 تم استعادة جميع بيانات النظام (المنتجات، الفواتير، العملاء، الموردون، والمخزون) بنجاح!');
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else {
        onShowWarningAlert('❌ فشل استعادة البيانات: ملف النسخة غير صالح أو تالف.');
      }
    } catch (err: any) {
      if (err?.message === 'UNAUTHORIZED') {
        onShowWarningAlert('انتهت صلاحية جلسة Google، يرجى الضغط على زر الاتصال لتجديد المصادقة.');
      } else {
        console.error('Restore error:', err?.message || err);
        onShowWarningAlert('حدث خطأ أثناء تنزيل واستعادة النسخة الاحتياطية من Google Drive.');
      }
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDeleteBackup = async (backup: GoogleDriveBackupFile) => {
    if (!confirm(`⚠️ هل أنت متأكد من حذف النسخة الاحتياطية "${backup.name}" نهائياً من Google Drive؟\n\nلا يمكن التراجع عن هذا الإجراء.`)) {
      return;
    }

    setDeletingId(backup.id);
    try {
      if (googleUser?.accessToken && !googleUser.accessToken.startsWith('token_gdrive_')) {
        await deleteBackupFromGoogleDrive(googleUser.accessToken, backup.id);
      }
      localStorage.removeItem(`gdrive_file_data_${backup.id}`);

      const updatedList = backups.filter(b => b.id !== backup.id);
      setBackups(updatedList);
      localStorage.setItem('cafe_google_drive_backups_cache', JSON.stringify(updatedList));

      onShowSuccessAlert('تم حذف النسخة الاحتياطية من Google Drive بنجاح.');
    } catch (err: any) {
      if (err?.message === 'UNAUTHORIZED') {
        onShowWarningAlert('انتهت صلاحية جلسة Google، يرجى الضغط على زر الاتصال لتجديد المصادقة.');
      } else {
        console.error('Delete backup error:', err?.message || err);
        onShowWarningAlert('فشل حذف النسخة من Google Drive.');
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownloadToPhone = async (backup: GoogleDriveBackupFile) => {
    try {
      onShowSuccessAlert('جاري تحضير ملف النسخة للتنزيل على جهازك...');
      let content = '';
      if (googleUser?.accessToken && !googleUser.accessToken.startsWith('token_gdrive_')) {
        content = await downloadBackupFromGoogleDrive(googleUser.accessToken, backup.id);
      } else {
        content = localStorage.getItem(`gdrive_file_data_${backup.id}`) || dbService.exportBackupData();
      }

      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = backup.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onShowSuccessAlert(`تم تنزيل ملف (${backup.name}) على جهازك بنجاح! 📥`);
    } catch (err) {
      console.error('Download to phone error:', err);
      onShowWarningAlert('فشل تنزيل الملف على الهاتف.');
    }
  };

  const handleLocalFileRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) {
        onShowWarningAlert('الملف المختار فارغ أو تالف.');
        return;
      }

      if (confirm(`⚠️ تنبيه استعادة محلي:\n\nهل تريد استعادة بيانات الكافيه من الملف المحدد "${file.name}"؟\nسيتم استبدال قاعدة البيانات الحالية بالنظام بالكامل.`)) {
        const success = dbService.restoreBackupData(content);
        if (success) {
          onShowSuccessAlert('🎉 تم استعادة قاعدة البيانات بالكامل من الملف المحلي بنجاح!');
          setTimeout(() => {
            window.location.reload();
          }, 1200);
        } else {
          onShowWarningAlert('❌ فشل استعادة ملف البيانات المحلي: بنيته غير صالحة.');
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 w-full animate-fade-in" dir="rtl">
      
      {/* 1. Header & Account Status */}
      <div className="bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-64 h-64 bg-gold-600/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="shrink-0 p-1">
                <EldeebLogoHeader className="h-10" />
              </div>
              <div>
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  النسخ الاحتياطي والاستعادة السحابية (Google Drive)
                </h2>
                <p className="text-gray-400 text-xs">
                  تأمين شامل لكافة بيانات الكافيه (المنتجات، الفواتير، العملاء، والمخزون) ومنع فقدان البيانات عند تغيير الهاتف أو تحديث التطبيق.
                </p>
              </div>
            </div>
          </div>

          {/* Account Status Badge & Login Button */}
          <div className="flex items-center gap-3 bg-luxury-bg border border-gray-800 p-3 rounded-2xl w-full lg:w-auto justify-between">
            {isConnected && googleUser ? (
              <div className="flex items-center gap-3">
                {googleUser.picture ? (
                  <img src={googleUser.picture} alt="Profile" className="w-10 h-10 rounded-full border border-gold-500" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-bold text-sm">
                    {googleUser.email.substring(0, 1).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold text-white">{googleUser.name}</p>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-extrabold flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 text-emerald-400" />
                      متصل بالحساب: {googleUser.email}
                    </span>
                  </div>
                </div>
              </div>
            ) : isAuthenticating ? (
              <div className="flex items-center gap-2 text-gold-400 text-xs font-bold animate-pulse">
                <RefreshCw className="w-4 h-4 animate-spin text-gold-500" />
                <span>جاري الاتصال...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-gray-400 text-xs">
                <ShieldCheck className="w-5 h-5 text-amber-500" />
                <span>غير متصل بحساب Google Drive</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTestingConnection}
                className="px-3 py-2 bg-luxury-bg border border-gold-500/40 hover:border-gold-500 text-gold-400 hover:text-gold-300 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CloudLightning className={`w-3.5 h-3.5 ${isTestingConnection ? 'animate-spin' : ''}`} />
                {isTestingConnection ? 'جاري الفحص...' : 'تجربة فحص الاتصال'}
              </button>

              {isConnected ? (
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="px-3 py-1.5 bg-red-950/30 hover:bg-red-900 border border-red-900/40 text-red-400 hover:text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  خروج
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSignIn()}
                  disabled={isAuthenticating}
                  className="px-4 py-2 bg-gradient-to-r from-gold-600 to-gold-500 text-black text-xs font-black rounded-xl hover:opacity-90 transition-all flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
                >
                  <LogIn className="w-4 h-4" />
                  {isAuthenticating ? 'جاري الاتصال...' : 'اتصال بحساب Google'}
                </button>
              )}
            </div>
          </div>
        </div>

        {diagnosticStatus && (
          <div className="mt-3 p-3 bg-luxury-bg/80 border border-gray-800 rounded-2xl flex items-center justify-between text-xs font-mono">
            <span className="text-gray-300">{diagnosticStatus}</span>
            <button
              type="button"
              onClick={() => setDiagnosticStatus(null)}
              className="text-gray-500 hover:text-white text-[10px] px-2 py-0.5"
            >
              إغلاق
            </button>
          </div>
        )}
      </div>

      {/* 2. Control Cards: Instant Backup & Auto Backup Configuration */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Instant Backup Card */}
        <div className="bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-900">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-gold-500" />
                إنشاء نسخة احتياطية فورية
              </h3>
              <span className="text-[10px] bg-gold-600/10 text-gold-500 px-2.5 py-1 rounded-full font-mono font-bold">
                كل البيانات بملف واحد
              </span>
            </div>

            <p className="text-gray-400 text-xs leading-relaxed mb-6">
              تتيح لك حفظ حالة الكافيه الكاملة في ملف سحابي واحد آمن يرفع تلقائياً إلى حساب Google Drive الخاص بك لحماية المبيعات، المنتجات، والعملاء.
            </p>

            {settings.google_drive_last_backup_date && (
              <div className="mb-6 p-3 bg-luxury-bg border border-gray-800 rounded-xl flex items-center justify-between text-xs font-mono">
                <span className="text-gray-400">آخر نسخة احتياطية:</span>
                <span className="text-gold-400 font-bold">
                  {new Date(settings.google_drive_last_backup_date).toLocaleString('ar-EG')}
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            id="create-google-drive-backup-btn"
            onClick={handleCreateBackupNow}
            disabled={isCreatingBackup}
            className="w-full py-3.5 bg-gradient-to-r from-gold-600 to-gold-500 text-black font-black text-xs rounded-2xl shadow-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-98"
          >
            <RefreshCw className={`w-4.5 h-4.5 ${isCreatingBackup ? 'animate-spin' : ''}`} />
            {isCreatingBackup ? 'جاري رفع النسخة الاحتياطية إلى Google Drive...' : 'إنشاء نسخة احتياطية الآن (Google Drive)'}
          </button>
        </div>

        {/* Auto Daily Backup Configuration Card */}
        <div className="bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-900">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gold-500" />
                إعدادات النسخ الاحتياطي التلقائي اليومي
              </h3>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full font-bold">
                تلقائي 24 ساعة
              </span>
            </div>

            <p className="text-gray-400 text-xs leading-relaxed mb-6">
              تلقائياً وبدون أي تدخل، سيقوم النظام بتأمين نسخة جديدة رفعها إلى Google Drive عند فتح التطبيق يومياً وتوفر اتصال بالإنترنت.
            </p>

            <label className="flex items-center gap-3 p-4 bg-luxury-bg border border-gray-800 rounded-2xl cursor-pointer hover:border-gold-600/40 transition-all mb-4">
              <input
                type="checkbox"
                checked={!!settings.google_drive_auto_backup_enabled}
                onChange={(e) => handleToggleAutoBackup(e.target.checked)}
                className="w-5 h-5 accent-gold-500 rounded cursor-pointer"
              />
              <div>
                <span className="text-xs font-bold text-white block">
                  ☑ إنشاء نسخة احتياطية تلقائياً كل يوم
                </span>
                <span className="text-[10px] text-gray-500">
                  تنفذ مرة واحدة يومياً عند الاتصال بالإنترنت
                </span>
              </div>
            </label>
          </div>

          <div className="p-3 bg-gold-600/5 border border-gold-600/20 rounded-xl flex items-center gap-2 text-[11px] text-gold-400">
            <Info className="w-4 h-4 shrink-0 text-gold-500" />
            <span>يتم تخزين النسخ الاحتياطية داخل مجلد خاص بالتطبيق في Google Drive لحماية خصوصيتك.</span>
          </div>
        </div>

      </div>

      {/* 3. Google Drive Backups List Table (شاشة النسخ الاحتياطية) */}
      <div className="bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-gray-900">
          <div>
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-gold-500" />
              النسخ الاحتياطية المحفوظة على Google Drive
            </h3>
            <p className="text-gray-400 text-xs mt-0.5">
              استعرض النسخ المحفوظة سحابياً، واستعد أي حالة سابقة للسيستم بضغطة زر واحدة.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => googleUser?.accessToken && fetchBackupsFromDrive(googleUser.accessToken)}
              disabled={isLoadingBackups || !isConnected}
              className="px-3 py-2 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-300 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-gold-500 ${isLoadingBackups ? 'animate-spin' : ''}`} />
              تحديث القائمة
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-gray-300 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <FileUp className="w-3.5 h-3.5 text-emerald-400" />
              استعادة من ملف محلي
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.enc"
              onChange={handleLocalFileRestore}
              className="hidden"
            />
          </div>
        </div>

        {/* Backups List Display */}
        {isLoadingBackups ? (
          <div className="py-12 text-center text-gray-400 text-xs flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 text-gold-500 animate-spin" />
            <span>جاري الاتصال بـ Google Drive وجلب قائمة النسخ الاحتياطية...</span>
          </div>
        ) : backups.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-xs space-y-2 bg-luxury-bg/50 border border-dashed border-gray-800 rounded-2xl">
            <Database className="w-8 h-8 text-gray-600 mx-auto" />
            <p className="font-bold text-gray-400">لا توجد نسخ احتياطية مسجلة على Google Drive بعد</p>
            <p className="text-[11px] text-gray-500">اضغط على زر "إنشاء نسخة احتياطية الآن" لحفظ أول نسخة سحابية بالكافيه.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-gray-900 text-gray-400 font-bold bg-luxury-bg/80">
                  <th className="py-3 px-4">اسم النسخة الاحتياطية</th>
                  <th className="py-3 px-4">تاريخ الإنشاء</th>
                  <th className="py-3 px-4">الحجم</th>
                  <th className="py-3 px-4 text-center">الإجراءات الخيارات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-900/60">
                {backups.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-900/40 transition-colors">
                    
                    {/* File Name */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gold-500 shrink-0" />
                        <div>
                          <p className="font-bold text-white dir-ltr text-right">{b.name}</p>
                          <span className="text-[10px] text-gray-500">{b.description}</span>
                        </div>
                        {b.isAuto && (
                          <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-extrabold mr-1 shrink-0">
                            تلقائية
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Date */}
                    <td className="py-3.5 px-4 font-mono text-gray-300">
                      {b.formattedDate}
                    </td>

                    {/* Size */}
                    <td className="py-3.5 px-4 font-mono text-gold-400 font-bold">
                      {b.formattedSize}
                    </td>

                    {/* Action buttons */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-center gap-2">
                        
                        {/* Restore button */}
                        <button
                          type="button"
                          onClick={() => handleInitiateRestore(b)}
                          disabled={isRestoring}
                          className="px-3 py-1.5 bg-gold-600 hover:bg-gold-500 text-black font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md active:scale-95 disabled:opacity-50"
                          title="استعادة كافة البيانات من هذه النسخة"
                        >
                          <CloudLightning className="w-3.5 h-3.5" />
                          استعادة
                        </button>

                        {/* Download to phone button */}
                        <button
                          type="button"
                          onClick={() => handleDownloadToPhone(b)}
                          className="px-2.5 py-1.5 bg-luxury-bg border border-gray-800 hover:bg-gray-800 text-gray-300 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                          title="تنزيل الملف على الهاتف"
                        >
                          <Download className="w-3.5 h-3.5 text-blue-400" />
                          تنزيل
                        </button>

                        {/* Delete button */}
                        <button
                          type="button"
                          onClick={() => handleDeleteBackup(b)}
                          disabled={deletingId === b.id}
                          className="px-2.5 py-1.5 bg-red-950/20 hover:bg-red-900/50 border border-red-900/30 text-red-400 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                          title="حذف النسخة من Google Drive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          حذف
                        </button>

                      </div>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Restoration Confirmation & Safety Backup Prompt Modal */}
      {showRestoreModal && selectedBackupToRestore && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" dir="rtl">
          <div className="bg-luxury-card border border-gold-600/30 rounded-3xl p-6 max-w-lg w-full shadow-2xl relative space-y-6">
            
            <div className="flex items-center justify-between pb-3 border-b border-gray-900">
              <div className="flex items-center gap-3">
                <div className="shrink-0 p-1">
                  <EldeebLogoHeader className="h-9" />
                </div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500 animate-bounce" />
                  تأكيد استعادة بيانات كافيه الديب (Google Restore)
                </h3>
              </div>
              <button
                onClick={() => setShowRestoreModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-300 text-xs leading-relaxed space-y-2">
              <p className="font-bold text-sm text-white">⚠️ تنبيه هام قبل الاستعادة:</p>
              <p>
                أنت على وشك استعادة النسخة الاحتياطية <span className="font-bold text-gold-400 dir-ltr inline-block">({selectedBackupToRestore.name})</span>.
              </p>
              <p>
                سيؤدي الاستعادة إلى استبدال كافة الفواتير، المخزون، والعملاء الحالية بالبيانات المخزنة في هذه النسخة.
              </p>
            </div>

            <div className="p-4 bg-luxury-bg border border-gray-800 rounded-2xl space-y-2 text-xs">
              <p className="text-gray-300 font-extrabold text-sm mb-2">
                هل تريد إنشاء نسخة احتياطية من البيانات الحالية قبل الاستعادة؟
              </p>
              <p className="text-gray-400 text-[11px]">
                نوصي بإنشاء نسخة حماية فورية حتى لا تفقد أي عمل تم تسجيله بعد تاريخ هذه النسخة.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={() => handleExecuteRestore(true)}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                نعم، أنشئ نسخة حماية أولاً ثم استعد البيانات (موصى به)
              </button>

              <button
                type="button"
                onClick={() => handleExecuteRestore(false)}
                className="w-full py-3 bg-luxury-bg border border-gray-800 hover:bg-gray-800 text-gray-300 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <CloudLightning className="w-4 h-4 text-gold-500" />
                استعادة مباشرة دون حفظ النسخة الحالية
              </button>

              <button
                type="button"
                onClick={() => setShowRestoreModal(false)}
                className="w-full py-2.5 text-gray-500 hover:text-gray-300 text-xs font-bold transition-all cursor-pointer text-center"
              >
                إلغاء الإجراء
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
