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
  uploadBackupToFirebaseStorage,
  listBackupsFromFirebaseStorage,
  downloadBackupFromFirebaseStorage,
  deleteBackupFromFirebaseStorage,
  FirebaseStorageBackupItem
} from '../lib/firebaseStorageBackupService';
import { auth, ensureFirebaseAuth } from '../lib/firebaseClient';
import { signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';

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
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [isOwnerVerified, setIsOwnerVerified] = useState<boolean>(false);

  // Backups List
  const [backups, setBackups] = useState<FirebaseStorageBackupItem[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState<boolean>(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);
  const [diagnosticStatus, setDiagnosticStatus] = useState<string | null>(null);

  // Restore confirmation modal states
  const [selectedBackupToRestore, setSelectedBackupToRestore] = useState<FirebaseStorageBackupItem | null>(null);
  const [showRestoreModal, setShowRestoreModal] = useState<boolean>(false);

  // Owner Login Modal states
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [loginEmail, setLoginEmail] = useState<string>('nader.eldeeb.2015@gmail.com');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSendingReset, setIsSendingReset] = useState<boolean>(false);
  const [resetSentMessage, setResetSentMessage] = useState<string | null>(null);

  // Local File Upload Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to verify if user is the authorized owner with verified email
  const checkOwnerStatus = (user: any) => {
    if (
      user &&
      !user.isAnonymous &&
      user.email?.toLowerCase() === 'nader.eldeeb.2015@gmail.com' &&
      user.emailVerified === true
    ) {
      setCurrentUserEmail(user.email);
      setIsOwnerVerified(true);
      setIsConnected(true);
      return true;
    } else {
      setCurrentUserEmail(user?.email || null);
      setIsOwnerVerified(false);
      setIsConnected(false);
      return false;
    }
  };

  // Load cloud backups on mount
  useEffect(() => {
    const s = dbService.getSettings();
    setSettings(s);

    // Load cached list first
    loadCachedBackupList();

    // Check Firebase Auth
    ensureFirebaseAuth()
      .then((user) => {
        const isOwner = checkOwnerStatus(user || auth.currentUser);
        if (isOwner) {
          fetchBackupsFromCloud();
        }
      })
      .catch((err) => {
        console.warn('[CloudBackupView] Auth check warning:', err?.message || err);
      });
  }, []);

  const loadCachedBackupList = () => {
    const cached = localStorage.getItem('cafe_cloud_backups_cache') || localStorage.getItem('cafe_google_drive_backups_cache');
    if (cached) {
      try {
        setBackups(JSON.parse(cached));
      } catch (e) {}
    }
  };

  const fetchBackupsFromCloud = async () => {
    setIsLoadingBackups(true);
    try {
      const list = await listBackupsFromFirebaseStorage();
      setBackups(list);
      localStorage.setItem('cafe_cloud_backups_cache', JSON.stringify(list));
      setIsConnected(true);
    } catch (err: any) {
      console.warn('[CloudBackupView] List notice:', err?.message || err);
      loadCachedBackupList();
    } finally {
      setIsLoadingBackups(false);
    }
  };

  const handleOwnerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError('يرجى إدخال البريد الإلكتروني وكلمة المرور.');
      return;
    }

    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const credential = await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
      const user = credential.user;

      if (!user || user.isAnonymous) {
        await signOut(auth);
        setLoginError('غير مصرح للحسابات المجهولة بالوصول.');
        return;
      }

      if (user.email?.toLowerCase() !== 'nader.eldeeb.2015@gmail.com') {
        await signOut(auth);
        setLoginError('هذا البريد غير مصرح له كمالك لكافيه الديب.');
        onShowWarningAlert('هذا الحساب غير مصرح له بالوصول إلى سحابة كافيه الديب.');
        return;
      }

      // Check email verified status
      if (!user.emailVerified) {
        await signOut(auth);
        setLoginError('البريد الإلكتروني غير مؤكد (Email Not Verified). يرجى تأكيد البريد الإلكتروني أولاً في Firebase.');
        onShowWarningAlert('يجب أن يكون البريد الإلكتروني مؤكداً (Verified) للوصول إلى النسخ السحابية.');
        return;
      }

      checkOwnerStatus(user);
      setShowLoginModal(false);
      setLoginPassword('');
      onShowSuccessAlert('🎉 تم تسجيل الدخول بحساب المالك الموثق بنجاح!');
      fetchBackupsFromCloud();
    } catch (err: any) {
      console.error('[CloudBackupView] Login error:', err);
      let msg = 'فشل تسجيل الدخول. يرجى التحقق من البريد وكلمة المرور.';
      if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') {
        msg = 'كلمة المرور أو البريد الإلكتروني غير صحيح.';
      } else if (err?.code === 'auth/user-not-found') {
        msg = 'حساب المستخدم غير مسجل في Firebase Authentication.';
      } else if (err?.code === 'auth/user-disabled') {
        msg = 'تم تعطيل هذا الحساب من قبل إدارة Firebase.';
      } else if (err?.code === 'auth/network-request-failed') {
        msg = 'تعذر الاتصال بخوادم Firebase. يرجى التحقق من اتصال الإنترنت.';
      } else if (err?.code === 'auth/too-many-requests') {
        msg = 'تم حظر المحاولات مؤقتاً بسبب تكرار المحاولة. يرجى الانتظار قليلاً.';
      } else if (err?.message) {
        msg = `خطأ في المصادقة: ${err.message}`;
      }
      setLoginError(msg);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSendPasswordReset = async () => {
    if (!loginEmail.trim()) {
      setLoginError('يرجى كتابة البريد الإلكتروني لإرسال رابط إعادة التعيين.');
      return;
    }
    setIsSendingReset(true);
    setResetSentMessage(null);
    setLoginError(null);
    try {
      await sendPasswordResetEmail(auth, loginEmail.trim());
      setResetSentMessage(`✅ تم إرسال رابط تعيين كلمة المرور إلى البريد: ${loginEmail.trim()}، يرجى مراجعة صندوق الوارد (أو الرسائل غير المرغوب فيها).`);
    } catch (err: any) {
      console.error('[CloudBackupView] Password reset error:', err);
      let msg = 'تعذر إرسال رابط تعيين كلمة المرور.';
      if (err?.code === 'auth/user-not-found') {
        msg = 'هذا البريد غير مسجل في Firebase Authentication.';
      } else if (err?.message) {
        msg = err.message;
      }
      setLoginError(msg);
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleOwnerLogout = async () => {
    if (confirm('هل أنت متأكد من تسجيل الخروج من سحابة كافيه الديب؟')) {
      try {
        await signOut(auth);
        setIsConnected(false);
        setIsOwnerVerified(false);
        setCurrentUserEmail(null);
        setBackups([]);
        onShowSuccessAlert('تم تسجيل الخروج من السحابة بنجاح.');
      } catch (err: any) {
        onShowWarningAlert('حدث خطأ أثناء تسجيل الخروج.');
      }
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
    if (!isOwnerVerified) {
      setShowLoginModal(true);
      onShowWarningAlert('يجب تسجيل الدخول بحساب المالك أولاً لرفع نسخة سحابية.');
      return;
    }

    setIsCreatingBackup(true);
    onShowSuccessAlert('جاري استخراج ونسخ بيانات الكافيه بالكامل وبدء الرفع إلى السحابة... ☁️');

    try {
      const backupJson = dbService.exportBackupData();
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
      const fileName = `كافيه_الديب_نسخة_احتياطية_${dateStr}.json`;

      const newFile = await uploadBackupToFirebaseStorage(
        backupJson,
        fileName,
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

      const updatedList = [newFile, ...backups.filter(b => b.name !== newFile.name)];
      setBackups(updatedList);
      localStorage.setItem('cafe_cloud_backups_cache', JSON.stringify(updatedList));

      onShowSuccessAlert('🎉 تم إنشاء النسخة الاحتياطية ورفعها إلى السحابة بنجاح!');
    } catch (err: any) {
      console.error('[CloudBackupView] Backup creation error:', err?.message || err);
      onShowWarningAlert(err?.message || 'حدث خطأ أثناء رفع النسخة الاحتياطية إلى السحابة.');
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setDiagnosticStatus('جاري فحص اتصال الإنترنت واستجابة خوادم Firebase Storage...');
    try {
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      if (!isOnline) {
        const msg = '❌ الجهاز غير متصل بالإنترنت حالياً.';
        setDiagnosticStatus(msg);
        onShowWarningAlert(msg);
        return;
      }

      const user = await ensureFirebaseAuth();
      const isOwner = checkOwnerStatus(user || auth.currentUser);

      if (!isOwner) {
        const msg = '❌ يجب تسجيل الدخول بحساب المالك (nader.eldeeb.2015@gmail.com) أولاً.';
        setDiagnosticStatus(msg);
        setShowLoginModal(true);
        onShowWarningAlert(msg);
        return;
      }

      const t0 = performance.now();
      const list = await listBackupsFromFirebaseStorage();
      const latency = Math.round(performance.now() - t0);

      setBackups(list);
      localStorage.setItem('cafe_cloud_backups_cache', JSON.stringify(list));
      setIsConnected(true);

      const successMsg = `✅ الاتصال بـ Firebase Storage سليم تماماً (${latency}ms) - سحابة كافيه الديب جاهزة (عدد النسخ: ${list.length})`;
      setDiagnosticStatus(successMsg);
      onShowSuccessAlert(`الاتصال السحابي يعمل بكفاءة (${latency}ms)! 🚀`);
    } catch (e: any) {
      console.error('[CloudBackupView] Test connection error:', e);
      const errMsg = `❌ خطأ في الاتصال: ${e?.message || e}`;
      setDiagnosticStatus(errMsg);
      onShowWarningAlert(errMsg);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleInitiateRestore = (backup: FirebaseStorageBackupItem) => {
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
          await uploadBackupToFirebaseStorage(currentData, safetyName, settings.cafe_name, false);
        } catch (sErr) {
          console.warn('Safety backup warning:', sErr);
        }
      }

      onShowSuccessAlert(`جاري تحميل وقراءة ملف النسخة الاحتياطية "${selectedBackupToRestore.name}" من السحابة...`);

      const backupContent = await downloadBackupFromFirebaseStorage(
        selectedBackupToRestore.fullPath || selectedBackupToRestore.name
      );

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
      console.error('[CloudBackupView] Restore error:', err?.message || err);
      onShowWarningAlert(err?.message || 'حدث خطأ أثناء تنزيل واستعادة النسخة الاحتياطية من السحابة.');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDeleteBackup = async (backup: FirebaseStorageBackupItem) => {
    if (!confirm(`⚠️ هل أنت متأكد من حذف النسخة الاحتياطية "${backup.name}" نهائياً من السحابة؟\n\nلا يمكن التراجع عن هذا الإجراء.`)) {
      return;
    }

    setDeletingId(backup.name);
    try {
      await deleteBackupFromFirebaseStorage(backup.fullPath || backup.name);

      const updatedList = backups.filter(b => b.name !== backup.name);
      setBackups(updatedList);
      localStorage.setItem('cafe_cloud_backups_cache', JSON.stringify(updatedList));

      onShowSuccessAlert('تم حذف النسخة الاحتياطية من السحابة بنجاح.');
    } catch (err: any) {
      console.error('[CloudBackupView] Delete backup error:', err?.message || err);
      onShowWarningAlert(err?.message || 'فشل حذف النسخة من السحابة.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownloadToPhone = async (backup: FirebaseStorageBackupItem) => {
    try {
      onShowSuccessAlert('جاري تحضير ملف النسخة للتنزيل على جهازك...');
      const content = await downloadBackupFromFirebaseStorage(
        backup.fullPath || backup.name
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
      console.error('[CloudBackupView] Download to phone error:', err);
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
                  النسخ الاحتياطي والاستعادة السحابية (Cloud Backup)
                </h2>
                <p className="text-gray-400 text-xs">
                  تأمين شامل لكافة بيانات الكافيه (المنتجات، الفواتير، العملاء، والمخزون) على السحابة الآمنة لحمايتها من التلف أو الضياع.
                </p>
              </div>
            </div>
          </div>

          {/* Account Status Badge & Actions */}
          <div className="flex items-center gap-3 bg-luxury-bg border border-gray-800 p-3 rounded-2xl w-full lg:w-auto justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border ${
                isOwnerVerified
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                  : 'bg-amber-500/20 border-amber-500/40 text-amber-400'
              }`}>
                <Cloud className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-bold text-white">سحابة كافيه الديب</p>
                  {isOwnerVerified ? (
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-extrabold flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 text-emerald-400" />
                      {currentUserEmail}
                    </span>
                  ) : (
                    <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                      يتطلب تسجيل دخول المالك
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isOwnerVerified ? (
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
                    onClick={handleOwnerLogout}
                    className="p-2 bg-luxury-bg border border-gray-800 hover:border-red-500/40 text-gray-400 hover:text-red-400 rounded-xl transition-all cursor-pointer"
                    title="تسجيل الخروج"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowLoginModal(true)}
                  className="px-3 py-2 bg-gradient-to-r from-gold-600 to-gold-500 text-black text-xs font-extrabold rounded-xl shadow hover:opacity-90 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  تسجيل دخول المالك
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
              تتيح لك حفظ حالة الكافيه الكاملة في ملف سحابي واحد آمن يرفع تلقائياً إلى السحابة المخصصة لكافيه الديب لحماية المبيعات، المنتجات، والعملاء.
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
            {isCreatingBackup ? 'جاري رفع النسخة الاحتياطية إلى السحابة...' : 'إنشاء نسخة احتياطية سحابية الآن (Cloud Backup)'}
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
              تلقائياً وبدون أي تدخل، سيقوم النظام بتأمين نسخة جديدة ورفعها إلى السحابة عند فتح التطبيق يومياً وتوفر اتصال بالإنترنت.
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
            <span>يتم تشفير وتخزين النسخ الاحتياطية سحابياً بشكل معزول ومخصص لكافيه الديب.</span>
          </div>
        </div>

      </div>

      {/* 3. Cloud Backups List Table */}
      <div className="bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-gray-900">
          <div>
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-gold-500" />
              النسخ الاحتياطية المحفوظة سحابياً (Cloud Storage)
            </h3>
            <p className="text-gray-400 text-xs mt-0.5">
              استعرض النسخ المحفوظة سحابياً، واستعد أي حالة سابقة للسيستم بضغطة زر واحدة.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={fetchBackupsFromCloud}
              disabled={isLoadingBackups || !isOwnerVerified}
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
            <span>جاري الاتصال بالسحابة وجلب قائمة النسخ الاحتياطية...</span>
          </div>
        ) : !isOwnerVerified ? (
          <div className="py-12 text-center text-gray-400 text-xs space-y-3 bg-luxury-bg/50 border border-dashed border-gray-800 rounded-2xl p-6">
            <Lock className="w-8 h-8 text-amber-500 mx-auto" />
            <p className="font-bold text-white text-sm">يتطلب الوصول السحابي تسجيل دخول حساب المالك</p>
            <p className="text-gray-400 text-xs max-w-md mx-auto">
              لحماية بيانات الكافيه والنسخ الاحتياطية المالية، يرجى تسجيل الدخول بحساب المالك الرسمي (nader.eldeeb.2015@gmail.com).
            </p>
            <button
              type="button"
              onClick={() => setShowLoginModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-gold-600 to-gold-500 text-black font-extrabold text-xs rounded-xl shadow transition-all cursor-pointer inline-flex items-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              تسجيل الدخول الآن
            </button>
          </div>
        ) : backups.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-xs space-y-2 bg-luxury-bg/50 border border-dashed border-gray-800 rounded-2xl">
            <Database className="w-8 h-8 text-gray-600 mx-auto" />
            <p className="font-bold text-gray-400">لا توجد نسخ احتياطية مسجلة على السحابة بعد</p>
            <p className="text-[11px] text-gray-500">اضغط على زر "إنشاء نسخة احتياطية سحابية الآن" لحفظ أول نسخة سحابية بالكافيه.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-gray-900 text-gray-400 font-bold bg-luxury-bg/80">
                  <th className="py-3 px-4">اسم النسخة الاحتياطية</th>
                  <th className="py-3 px-4">تاريخ الإنشاء</th>
                  <th className="py-3 px-4">الحجم</th>
                  <th className="py-3 px-4 text-center">الإجراءات والخيارات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-900/60">
                {backups.map((b) => (
                  <tr key={b.name} className="hover:bg-gray-900/40 transition-colors">
                    
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
                          disabled={deletingId === b.name}
                          className="px-2.5 py-1.5 bg-red-950/20 hover:bg-red-900/50 border border-red-900/30 text-red-400 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                          title="حذف النسخة من السحابة"
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

      {/* 4. Owner Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" dir="rtl">
          <div className="bg-luxury-card border border-gold-600/40 rounded-3xl p-6 max-w-md w-full shadow-2xl relative space-y-5">

            <div className="flex items-center justify-between pb-3 border-b border-gray-900">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gold-600/20 border border-gold-600/40 flex items-center justify-center text-gold-400">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">
                    تسجيل دخول مالك كافيه الديب
                  </h3>
                  <p className="text-[11px] text-gray-400">Firebase Cloud Authentication</p>
                </div>
              </div>
              <button
                onClick={() => setShowLoginModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleOwnerLogin} className="space-y-4 text-xs">

              {loginError && (
                <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-2xl text-red-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{loginError}</span>
                </div>
              )}

              {resetSentMessage && (
                <div className="p-3 bg-emerald-950/40 border border-emerald-900/50 rounded-2xl text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{resetSentMessage}</span>
                </div>
              )}

              <div>
                <label className="block text-gray-300 font-bold mb-1.5">البريد الإلكتروني المعتمد للمالك:</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    dir="ltr"
                    className="w-full pl-9 pr-3 py-2.5 bg-luxury-bg border border-gray-800 rounded-xl text-white text-xs focus:border-gold-500 focus:outline-none"
                    placeholder="nader.eldeeb.2015@gmail.com"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-gray-300 font-bold">كلمة مرور حساب Firebase:</label>
                  <button
                    type="button"
                    onClick={handleSendPasswordReset}
                    disabled={isSendingReset}
                    className="text-[11px] text-gold-400 hover:text-gold-300 underline cursor-pointer disabled:opacity-50"
                  >
                    {isSendingReset ? 'جاري الإرسال...' : 'نسيت كلمة المرور؟'}
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    dir="ltr"
                    className="w-full pl-9 pr-3 py-2.5 bg-luxury-bg border border-gray-800 rounded-xl text-white text-xs focus:border-gold-500 focus:outline-none"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div className="p-3 bg-gold-600/5 border border-gold-600/20 rounded-xl text-[11px] text-gold-400">
                <span>يتم تشفير وتوثيق الاتصال مباشرة مع خوادم Firebase السحابية دون تخزين كلمات المرور.</span>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full py-3 bg-gradient-to-r from-gold-600 to-gold-500 text-black font-black text-xs rounded-xl shadow-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isLoggingIn ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      جاري التحقق والمصادقة...
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      تسجيل الدخول وتفعيل السحابة
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  className="w-full py-2 text-gray-400 hover:text-white text-xs font-bold transition-all text-center"
                >
                  إلغاء
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* 5. Restoration Confirmation & Safety Backup Prompt Modal */}
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
                  تأكيد استعادة بيانات كافيه الديب (Cloud Restore)
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
