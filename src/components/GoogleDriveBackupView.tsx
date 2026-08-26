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
  FileUp,
  Calendar,
  HardDrive,
  Info,
  X,
  FileText,
  Lock,
  Mail,
  LogIn,
  LogOut,
  UserCheck
} from 'lucide-react';
import { dbService, safeStorage } from '../dbService';
const localStorage = safeStorage;
import { AppSettings } from '../types';
import {
  GoogleDriveUser,
  GoogleDriveBackupFile,
  requestGoogleDriveAuth,
  listGoogleDriveBackups,
  uploadBackupToGoogleDrive,
  downloadBackupFromGoogleDrive,
  deleteBackupFromGoogleDrive
} from '../lib/googleDriveService';
import {
  getSavedGoogleDriveUser,
  saveGoogleDriveUser,
  authenticateGoogleDrive,
  UnifiedBackupItem
} from '../lib/cloudBackupUnifiedService';

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
  const [googleUser, setGoogleUser] = useState<GoogleDriveUser | null>(() => getSavedGoogleDriveUser());
  const [isConnected, setIsConnected] = useState<boolean>(() => !!getSavedGoogleDriveUser());

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

  // Login Loading State
  const [isConnectingDrive, setIsConnectingDrive] = useState<boolean>(false);

  // Local File Upload Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load cloud backups on mount
  useEffect(() => {
    const s = dbService.getSettings();
    setSettings(s);

    // Load cached list first
    loadCachedBackupList();

    const savedUser = getSavedGoogleDriveUser();
    if (savedUser && savedUser.accessToken) {
      setGoogleUser(savedUser);
      setIsConnected(true);
      fetchBackupsFromDrive(savedUser);
    }
  }, []);

  const loadCachedBackupList = () => {
    const cached = localStorage.getItem('cafe_google_drive_backups_cache') || localStorage.getItem('cafe_cloud_backups_cache');
    if (cached) {
      try {
        setBackups(JSON.parse(cached));
      } catch (e) {}
    }
  };

  const fetchBackupsFromDrive = async (activeUser?: GoogleDriveUser | null) => {
    const userToUse = activeUser || googleUser || getSavedGoogleDriveUser();
    if (!userToUse || !userToUse.accessToken) {
      loadCachedBackupList();
      return;
    }

    setIsLoadingBackups(true);
    try {
      const list = await listGoogleDriveBackups(userToUse.accessToken);
      setBackups(list);
      localStorage.setItem('cafe_google_drive_backups_cache', JSON.stringify(list));
      setIsConnected(true);
    } catch (err: any) {
      console.warn('[GoogleDriveBackupView] List notice:', err?.message || err);
      if (err?.message === 'UNAUTHORIZED') {
        saveGoogleDriveUser(null);
        setGoogleUser(null);
        setIsConnected(false);
        onShowWarningAlert('انتهت صلاحية جلسة Google Drive، يرجى إعادة تسجيل الدخول.');
      }
      loadCachedBackupList();
    } finally {
      setIsLoadingBackups(false);
    }
  };

  const handleConnectGoogleDrive = async () => {
    setIsConnectingDrive(true);
    setDiagnosticStatus('جاري فتح نافذة المصادقة وربط حساب Google Drive...');
    try {
      const user = await authenticateGoogleDrive(true);
      setGoogleUser(user);
      setIsConnected(true);
      onShowSuccessAlert(`🎉 تم ربط حساب Google Drive بنجاح (${user.email})!`);
      setDiagnosticStatus(`✅ متصل بحساب: ${user.email}`);
      await fetchBackupsFromDrive(user);
    } catch (err: any) {
      console.error('[GoogleDriveBackupView] Connect error:', err);
      const msg = err?.message || 'فشل الاتصال بـ Google Drive.';
      setDiagnosticStatus(`❌ خطأ: ${msg}`);
      onShowWarningAlert(msg);
    } finally {
      setIsConnectingDrive(false);
    }
  };

  const handleDisconnectGoogleDrive = async () => {
    if (confirm('هل أنت متأكد من تسجيل الخروج وفصل حساب Google Drive؟')) {
      saveGoogleDriveUser(null);
      setGoogleUser(null);
      setIsConnected(false);
      setBackups([]);
      localStorage.removeItem('cafe_google_drive_backups_cache');
      onShowSuccessAlert('تم فصل حساب Google Drive بنجاح.');
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
    const activeUser = googleUser || getSavedGoogleDriveUser();
    if (!activeUser || !activeUser.accessToken) {
      onShowWarningAlert('يرجى ربط حساب Google Drive أولاً لرفع النسخة الاحتياطية.');
      handleConnectGoogleDrive();
      return;
    }

    setIsCreatingBackup(true);
    onShowSuccessAlert('جاري استخراج ونسخ بيانات الكافيه بالكامل وبدء الرفع إلى Google Drive... ☁️');

    try {
      const backupJson = dbService.exportBackupData();
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
      const fileName = `كافيه_الديب_نسخة_احتياطية_${dateStr}.json`;

      const newFile = await uploadBackupToGoogleDrive(
        activeUser.accessToken,
        fileName,
        backupJson,
        settings.cafe_name || 'كافيه الديب',
        false
      );

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
      console.error('[GoogleDriveBackupView] Backup creation error:', err?.message || err);
      if (err?.message === 'UNAUTHORIZED') {
        saveGoogleDriveUser(null);
        setGoogleUser(null);
        setIsConnected(false);
        onShowWarningAlert('انتهت صلاحية الجلسة، يرجى إعادة ربط حساب Google Drive.');
      } else {
        onShowWarningAlert(err?.message || 'حدث خطأ أثناء رفع النسخة الاحتياطية إلى Google Drive.');
      }
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setDiagnosticStatus('جاري فحص اتصال الإنترنت واستجابة Google Drive API...');
    try {
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      if (!isOnline) {
        const msg = '❌ الجهاز غير متصل بالإنترنت حالياً.';
        setDiagnosticStatus(msg);
        onShowWarningAlert(msg);
        return;
      }

      const activeUser = googleUser || getSavedGoogleDriveUser();
      if (!activeUser || !activeUser.accessToken) {
        const msg = '❌ لم يتم ربط حساب Google Drive بعد. اضغط على "ربط حساب Google Drive".';
        setDiagnosticStatus(msg);
        onShowWarningAlert(msg);
        return;
      }

      const t0 = performance.now();
      const list = await listGoogleDriveBackups(activeUser.accessToken);
      const latency = Math.round(performance.now() - t0);

      setBackups(list);
      localStorage.setItem('cafe_google_drive_backups_cache', JSON.stringify(list));
      setIsConnected(true);

      const successMsg = `✅ الاتصال بـ Google Drive سليم تماماً (${latency}ms) - الحساب: ${activeUser.email} (عدد النسخ: ${list.length})`;
      setDiagnosticStatus(successMsg);
      onShowSuccessAlert(`الاتصال السحابي يعمل بكفاءة (${latency}ms)! 🚀`);
    } catch (e: any) {
      console.error('[GoogleDriveBackupView] Test connection error:', e);
      let errMsg = `❌ خطأ في الاتصال: ${e?.message || e}`;
      if (e?.message === 'UNAUTHORIZED') {
        errMsg = '❌ انتهت صلاحية إذن Google Drive، يرجى إعادة تسجيل الدخول.';
        saveGoogleDriveUser(null);
        setGoogleUser(null);
        setIsConnected(false);
      } else if (!navigator.onLine) {
        errMsg = '❌ تعذر الوصول إلى الخوادم السحابية: يرجى التحقق من اتصال الإنترنت.';
      }
      setDiagnosticStatus(errMsg);
      onShowWarningAlert(errMsg);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handlePromptRestore = (backup: GoogleDriveBackupFile) => {
    setSelectedBackupToRestore(backup);
    setShowRestoreModal(true);
  };

  const handleExecuteRestore = async (createSafetyBackupFirst: boolean) => {
    if (!selectedBackupToRestore) return;
    const activeUser = googleUser || getSavedGoogleDriveUser();
    if (!activeUser || !activeUser.accessToken) {
      onShowWarningAlert('يرجى تسجيل الدخول إلى Google Drive.');
      return;
    }

    setIsRestoring(true);
    setShowRestoreModal(false);

    try {
      // 1. Safety Backup
      if (createSafetyBackupFirst) {
        onShowSuccessAlert('جاري إنشاء نسخة احتياطية للحماية قبل الاستعادة... 🛡️');
        try {
          const currentBackupJson = dbService.exportBackupData();
          const now = new Date();
          const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
          const safetyFileName = `نسخة_حماية_قبل_الاستعادة_${dateStr}.json`;

          await uploadBackupToGoogleDrive(
            activeUser.accessToken,
            safetyFileName,
            currentBackupJson,
            settings.cafe_name || 'كافيه الديب',
            false
          );
        } catch (safetyErr) {
          console.warn('[GoogleDriveBackupView] Safety backup error:', safetyErr);
        }
      }

      // 2. Download and restore target backup
      onShowSuccessAlert('جاري تنزيل النسخة الاحتياطية واستعادة كافة بيانات السيستم...');
      const backupContent = await downloadBackupFromGoogleDrive(
        activeUser.accessToken,
        selectedBackupToRestore.id
      );

      if (!backupContent) {
        throw new Error('فشل تنزيل ملف النسخة الاحتياطية أو الملف فارغ.');
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
      console.error('[GoogleDriveBackupView] Restore error:', err?.message || err);
      onShowWarningAlert(err?.message || 'حدث خطأ أثناء تنزيل واستعادة النسخة الاحتياطية من Google Drive.');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDeleteBackup = async (backup: GoogleDriveBackupFile) => {
    const activeUser = googleUser || getSavedGoogleDriveUser();
    if (!activeUser || !activeUser.accessToken) {
      onShowWarningAlert('يرجى تسجيل الدخول إلى Google Drive.');
      return;
    }

    if (!confirm(`⚠️ هل أنت متأكد من حذف النسخة الاحتياطية "${backup.name}" نهائياً من Google Drive؟\n\nلا يمكن التراجع عن هذا الإجراء.`)) {
      return;
    }

    setDeletingId(backup.id);
    try {
      await deleteBackupFromGoogleDrive(activeUser.accessToken, backup.id);

      const updatedList = backups.filter(b => b.id !== backup.id);
      setBackups(updatedList);
      localStorage.setItem('cafe_google_drive_backups_cache', JSON.stringify(updatedList));

      onShowSuccessAlert('تم حذف النسخة الاحتياطية من Google Drive بنجاح.');
    } catch (err: any) {
      console.error('[GoogleDriveBackupView] Delete backup error:', err?.message || err);
      onShowWarningAlert(err?.message || 'فشل حذف النسخة من Google Drive.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownloadToPhone = async (backup: GoogleDriveBackupFile) => {
    const activeUser = googleUser || getSavedGoogleDriveUser();
    if (!activeUser || !activeUser.accessToken) {
      onShowWarningAlert('يرجى تسجيل الدخول إلى Google Drive.');
      return;
    }

    try {
      onShowSuccessAlert('جاري تحضير ملف النسخة للتنزيل على جهازك...');
      const content = await downloadBackupFromGoogleDrive(
        activeUser.accessToken,
        backup.id
      );

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
    } catch (err: any) {
      console.error('[GoogleDriveBackupView] Download to phone error:', err);
      onShowWarningAlert(err?.message || 'فشل تنزيل الملف على الهاتف.');
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
                  تأمين شامل لكافة بيانات الكافيه (المنتجات، الفواتير، العملاء، والمخزون) على حساب Google Drive الخاص بك مجاناً وآمناً 100%.
                </p>
              </div>
            </div>
          </div>

          {/* Account Status Badge & Actions */}
          <div className="flex items-center gap-3 bg-luxury-bg border border-gray-800 p-3 rounded-2xl w-full lg:w-auto justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border ${
                isConnected && googleUser
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                  : 'bg-amber-500/20 border-amber-500/40 text-amber-400'
              }`}>
                <Cloud className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-bold text-white">Google Drive</p>
                  {isConnected && googleUser ? (
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-extrabold flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 text-emerald-400" />
                      {googleUser.email}
                    </span>
                  ) : (
                    <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                      غير متصل
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isConnected && googleUser ? (
                <>
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTestingConnection}
                    className="px-3 py-2 bg-luxury-bg border border-gold-500/40 hover:border-gold-500 text-gold-400 hover:text-gold-300 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <CloudLightning className={`w-3.5 h-3.5 ${isTestingConnection ? 'animate-spin' : ''}`} />
                    {isTestingConnection ? 'جاري الفحص...' : 'فحص الاتصال'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDisconnectGoogleDrive}
                    className="p-2 bg-luxury-bg border border-gray-800 hover:border-red-500/40 text-gray-400 hover:text-red-400 rounded-xl transition-all cursor-pointer"
                    title="تسجيل الخروج"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleConnectGoogleDrive}
                  disabled={isConnectingDrive}
                  className="px-3 py-2 bg-gradient-to-r from-gold-600 to-gold-500 text-black text-xs font-extrabold rounded-xl shadow hover:opacity-90 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <LogIn className={`w-3.5 h-3.5 ${isConnectingDrive ? 'animate-spin' : ''}`} />
                  {isConnectingDrive ? 'جاري الربط...' : 'ربط حساب Google Drive'}
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
              تتيح لك حفظ حالة الكافيه الكاملة في ملف سحابي واحد آمن يرفع تلقائياً إلى مجلد Google Drive الخاص بك لحماية المبيعات، المنتجات، والعملاء.
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
            id="create-cloud-backup-btn"
            onClick={handleCreateBackupNow}
            disabled={isCreatingBackup}
            className="w-full py-3.5 bg-gradient-to-r from-gold-600 to-gold-500 text-black font-black text-xs rounded-2xl shadow-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-98"
          >
            <RefreshCw className={`w-4.5 h-4.5 ${isCreatingBackup ? 'animate-spin' : ''}`} />
            {isCreatingBackup ? 'جاري رفع النسخة الاحتياطية إلى Google Drive...' : 'إنشاء نسخة احتياطية على Google Drive الآن'}
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
              تلقائياً وبدون أي تدخل، سيقوم النظام بتأمين نسخة جديدة ورفعها إلى Google Drive عند فتح التطبيق يومياً وتوفر اتصال بالإنترنت.
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
                  ☑ إنشاء نسخة احتياطية تلقائياً كل يوم على Google Drive
                </span>
                <span className="text-[10px] text-gray-500">
                  تنفذ مرة واحدة يومياً عند الاتصال بالإنترنت
                </span>
              </div>
            </label>
          </div>

          <div className="p-3 bg-gold-600/5 border border-gold-600/20 rounded-xl flex items-center gap-2 text-[11px] text-gold-400">
            <Info className="w-4 h-4 shrink-0 text-gold-500" />
            <span>يتم تخزين النسخ الاحتياطية بشكل مشفر وآمن ومجاني 100% على حساب Google Drive.</span>
          </div>
        </div>

      </div>

      {/* 3. Cloud Backups List Table */}
      <div className="bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-gray-900">
          <div>
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-gold-500" />
              النسخ الاحتياطية المحفوظة على Google Drive
            </h3>
            <p className="text-gray-400 text-xs mt-0.5">
              استعرض النسخ المحفوظة على درايف، واستعد أي حالة سابقة للسيستم بضغطة زر واحدة.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => fetchBackupsFromDrive()}
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
            <span>جاري جلب قائمة النسخ الاحتياطية من Google Drive...</span>
          </div>
        ) : !isConnected || !googleUser ? (
          <div className="py-12 text-center text-gray-400 text-xs space-y-3 bg-luxury-bg/50 border border-dashed border-gray-800 rounded-2xl p-6">
            <Lock className="w-8 h-8 text-amber-500 mx-auto" />
            <p className="font-bold text-white text-sm">يتطلب الوصول ربط حساب Google Drive</p>
            <p className="text-gray-400 text-xs max-w-md mx-auto">
              لحفظ واستعراض النسخ الاحتياطية السحابية، يرجى ربط حساب Google Drive الخاص بك بضغطة زر واحدة.
            </p>
            <button
              type="button"
              onClick={handleConnectGoogleDrive}
              disabled={isConnectingDrive}
              className="px-4 py-2 bg-gradient-to-r from-gold-600 to-gold-500 text-black font-extrabold text-xs rounded-xl shadow transition-all cursor-pointer inline-flex items-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              {isConnectingDrive ? 'جاري الربط...' : 'ربط حساب Google Drive الآن'}
            </button>
          </div>
        ) : backups.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-xs space-y-2 bg-luxury-bg/50 border border-dashed border-gray-800 rounded-2xl">
            <Database className="w-8 h-8 text-gray-600 mx-auto" />
            <p className="font-bold text-gray-400">لا توجد نسخ احتياطية مسجلة على Google Drive بعد</p>
            <p className="text-[11px] text-gray-500">اضغط على زر "إنشاء نسخة احتياطية على Google Drive الآن" لحفظ أول نسخة سحابية بالكافيه.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-gray-900 text-gray-400 text-[11px]">
                  <th className="pb-3 pr-2">اسم النسخة وتاريخ الإنشاء</th>
                  <th className="pb-3 text-center">النوع</th>
                  <th className="pb-3 text-center">الحجم</th>
                  <th className="pb-3 text-left pl-2">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-900/60">
                {backups.map((backup) => (
                  <tr key={backup.id} className="hover:bg-gray-900/40 transition-colors">
                    <td className="py-3.5 pr-2">
                      <div className="flex items-center gap-2.5">
                        <FileText className="w-4 h-4 text-gold-500 shrink-0" />
                        <div>
                          <p className="font-bold text-white font-mono dir-ltr text-right">{backup.name}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">{backup.formattedDate}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 text-center">
                      {backup.isAuto ? (
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                          تلقائية
                        </span>
                      ) : (
                        <span className="text-[10px] bg-gold-600/10 text-gold-400 border border-gold-600/30 px-2 py-0.5 rounded-full font-bold">
                          يدوية
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 text-center font-mono text-gray-400 text-[11px]">
                      {backup.formattedSize}
                    </td>
                    <td className="py-3.5 text-left pl-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handlePromptRestore(backup)}
                          disabled={isRestoring}
                          className="px-2.5 py-1.5 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/30 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          title="استعادة هذه النسخة"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>استعادة</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownloadToPhone(backup)}
                          className="p-1.5 bg-luxury-bg border border-gray-800 hover:border-gold-500/40 text-gray-300 hover:text-gold-400 rounded-lg transition-all cursor-pointer"
                          title="تنزيل الملف على الهاتف"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteBackup(backup)}
                          disabled={deletingId === backup.id}
                          className="p-1.5 bg-luxury-bg border border-gray-800 hover:border-red-500/40 text-gray-400 hover:text-red-400 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                          title="حذف من السحابة"
                        >
                          <Trash2 className={`w-3.5 h-3.5 ${deletingId === backup.id ? 'animate-spin' : ''}`} />
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
                  تأكيد استعادة بيانات كافيه الديب (Drive Restore)
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
                سيؤدي الاستعادة إلى استبدال كافة الفواتير، المخزون، والعملاء الحالية بالبيانات المخزنة في هذه النسخة السحابية.
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
