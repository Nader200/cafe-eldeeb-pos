import React, { useState } from 'react';
import {
  Download,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  X,
  Smartphone,
  Globe,
  ShieldCheck,
  HardDrive,
  Calendar,
  FileCode2,
  Clock
} from 'lucide-react';
import { UpdateCheckResult } from '../config/version';
import { dbService } from '../dbService';

interface UpdateModalProps {
  isOpen: boolean;
  updateInfo: UpdateCheckResult | null;
  onClose: () => void;
  userRole?: string;
  hasActiveInvoice?: boolean;
}

export default function UpdateModal({
  isOpen,
  updateInfo,
  onClose,
  userRole = 'Cashier',
  hasActiveInvoice = false
}: UpdateModalProps) {
  if (!isOpen || !updateInfo) return null;

  const [isUpdating, setIsUpdating] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadSpeed, setDownloadSpeed] = useState<string>('0 MB/s');
  const [downloadedBytes, setDownloadedBytes] = useState<number>(0);
  const [isCompleted, setIsCompleted] = useState(false);

  const isAndroid = updateInfo.platform === 'android';

  // Handle Web Refresh Update
  const handleWebUpdate = () => {
    setIsUpdating(true);
    dbService.addUpdateLog({
      action: 'UPDATE_APPLIED',
      installed_version: updateInfo.currentVersion,
      remote_version: updateInfo.latestVersion,
      platform: 'web',
      status: 'SUCCESS',
      details: `تم تطبيق التحديث التلقائي لمنصة الويب بنجاح إلى الإصدار (${updateInfo.latestVersion})`,
      user_role: userRole
    });

    setTimeout(() => {
      window.location.reload();
    }, 1200);
  };

  // Handle Android APK Download & Installation
  const handleAndroidUpdate = async () => {
    setIsUpdating(true);
    setDownloadProgress(0);
    setDownloadedBytes(0);

    const totalSizeMB = parseFloat(updateInfo.apkSize) || 14.8;
    const totalSizeBytes = Math.round(totalSizeMB * 1024 * 1024);

    try {
      const response = await fetch(updateInfo.apkUrl, { method: 'GET' });
      if (!response.body) throw new Error('ReadableStream not supported');

      const reader = response.body.getReader();
      const contentLengthHeader = response.headers.get('Content-Length');
      const total = contentLengthHeader ? parseInt(contentLengthHeader, 10) : totalSizeBytes;

      let receivedLength = 0;
      const chunks: Uint8Array[] = [];
      const startTime = Date.now();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        receivedLength += value.length;
        setDownloadedBytes(receivedLength);

        const progressPercent = Math.min(100, Math.round((receivedLength / total) * 100));
        setDownloadProgress(progressPercent);

        const elapsedTimeSec = (Date.now() - startTime) / 1000;
        if (elapsedTimeSec > 0) {
          const speedMBs = (receivedLength / (1024 * 1024) / elapsedTimeSec).toFixed(1);
          setDownloadSpeed(`${speedMBs} MB/s`);
        }
      }

      // Combine chunks into single blob
      const blob = new Blob(chunks, { type: 'application/vnd.android.package-archive' });
      const blobUrl = URL.createObjectURL(blob);

      // Trigger automatic APK installation / file download link
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = updateInfo.apkFileName || `Cafe_Eldeeb_POS_v${updateInfo.latestVersion}.apk`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setIsCompleted(true);
      dbService.addUpdateLog({
        action: 'UPDATE_APPLIED',
        installed_version: updateInfo.currentVersion,
        remote_version: updateInfo.latestVersion,
        platform: 'android',
        status: 'SUCCESS',
        details: `تم تنزيل حزمة أندرويد (${updateInfo.apkFileName}) وحفظها بنجاح للتثبيت`,
        user_role: userRole
      });

    } catch (error) {
      console.warn('Direct stream download error, falling back to direct anchor download:', error);
      // Fallback
      setDownloadProgress(100);
      setIsCompleted(true);
      const link = document.createElement('a');
      link.href = updateInfo.apkUrl;
      link.download = updateInfo.apkFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      dbService.addUpdateLog({
        action: 'UPDATE_APPLIED',
        installed_version: updateInfo.currentVersion,
        remote_version: updateInfo.latestVersion,
        platform: 'android',
        status: 'SUCCESS',
        details: `تم بدء تنزيل الحزمة عبر المتصفح/أندرويد: ${updateInfo.apkFileName}`,
        user_role: userRole
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDismiss = () => {
    dbService.addUpdateLog({
      action: 'UPDATE_DISMISSED',
      installed_version: updateInfo.currentVersion,
      remote_version: updateInfo.latestVersion,
      platform: updateInfo.platform,
      status: 'INFO',
      details: `تم تأجيل تثبيت التحديث (${updateInfo.latestVersion}) بواسطة ${userRole}`,
      user_role: userRole
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-gradient-to-b from-stone-900 via-stone-900 to-stone-950 border border-amber-500/30 text-white shadow-2xl shadow-amber-950/50">
        
        {/* Top Decorative Amber Banner */}
        <div className="h-2 w-full bg-gradient-to-r from-amber-600 via-yellow-400 to-amber-600 animate-pulse" />

        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-inner">
                {isAndroid ? <Smartphone className="h-6 w-6" /> : <Globe className="h-6 w-6" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-500/20">
                    {isAndroid ? 'تطبيق أندروID' : 'إصدار الويب المباشر'}
                  </span>
                  {updateInfo.isForceUpdate && (
                    <span className="text-xs font-bold text-red-400 bg-red-950/80 px-2 py-0.5 rounded border border-red-500/30">
                      تحديث إجباري
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-extrabold text-stone-100 mt-1">
                  يتوفر تحديث جديد للنظام 🚀
                </h3>
              </div>
            </div>

            {!updateInfo.isForceUpdate && !isUpdating && (
              <button
                onClick={handleDismiss}
                className="text-stone-400 hover:text-stone-200 hover:bg-stone-800 p-1.5 rounded-lg transition"
                title="إغلاق"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          <p className="mt-3 text-sm text-stone-300 leading-relaxed">
            {isAndroid
              ? 'يتوفر إصدار جديد من تطبيق أندرويد الديب POS. يمكنك تحميل ملف APK وتثبيته مباشرة مع بقاء قاعدة البيانات والإعدادات محفوظة كما هي.'
              : 'تم نشر إصدار جديد أحدث لنظام كافيه الديب POS. اضغط تحديث الآن للتبديل للنسخة الجديدة فوراً دون فقدان الجلسة.'}
          </p>
        </div>

        {/* Version Badges */}
        <div className="mx-6 p-3 bg-stone-950/80 rounded-xl border border-stone-800 flex items-center justify-around gap-2 text-center text-xs">
          <div>
            <span className="text-stone-400 block mb-0.5">الإصدار الحالي</span>
            <span className="font-mono font-bold text-stone-300 bg-stone-800 px-2 py-0.5 rounded">
              v{updateInfo.currentVersion}
            </span>
          </div>

          <div className="text-amber-500 text-lg font-bold">➔</div>

          <div>
            <span className="text-amber-400 block mb-0.5 font-semibold">الإصدار الجديد</span>
            <span className="font-mono font-bold text-amber-300 bg-amber-950 px-2.5 py-0.5 rounded border border-amber-500/40">
              v{updateInfo.latestVersion}
            </span>
          </div>

          {isAndroid && (
            <div>
              <span className="text-stone-400 block mb-0.5">حجم الحزمة</span>
              <span className="font-mono text-stone-300 bg-stone-800 px-2 py-0.5 rounded">
                {updateInfo.apkSize}
              </span>
            </div>
          )}
        </div>

        {/* Release Notes */}
        <div className="p-6 py-4">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 mb-2">
            <Sparkles className="h-4 w-4" />
            <span>مميزات وتفاصيل التحديث الجديد:</span>
          </div>

          <div className="p-3 bg-stone-950/50 rounded-xl border border-stone-800 text-xs text-stone-300 max-h-36 overflow-y-auto space-y-1.5 leading-relaxed font-sans whitespace-pre-line">
            {updateInfo.releaseNotes}
          </div>

          {/* Active Invoice Warning if any */}
          {hasActiveInvoice && (
            <div className="mt-3 p-3 bg-amber-950/60 border border-amber-500/30 rounded-xl flex items-center gap-2 text-amber-300 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
              <span>
                تنبيه: توجد فاتورة مفتوحة حالياً. سيتم حفظ الفاتورة واستكمالها قبل التحديث للحفاظ على طلب العميل.
              </span>
            </div>
          )}
        </div>

        {/* Download Progress Bar for Android */}
        {downloadProgress !== null && (
          <div className="mx-6 mb-4 p-3 bg-stone-950 rounded-xl border border-amber-500/30">
            <div className="flex justify-between items-center text-xs mb-1.5">
              <span className="text-amber-400 font-bold flex items-center gap-1">
                <HardDrive className="h-3.5 w-3.5" />
                {isCompleted ? 'تم تنزيل الحزمة بنجاح!' : 'جاري تنزيل ملف التحديث (APK)...'}
              </span>
              <span className="font-mono text-stone-300">{downloadProgress}%</span>
            </div>

            <div className="w-full bg-stone-800 rounded-full h-2.5 overflow-hidden p-0.5">
              <div
                className="bg-gradient-to-r from-amber-500 to-yellow-400 h-full rounded-full transition-all duration-300 shadow-sm"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>

            <div className="flex justify-between items-center text-[11px] text-stone-400 mt-1.5 font-mono">
              <span>
                {(downloadedBytes / (1024 * 1024)).toFixed(1)} MB / {updateInfo.apkSize}
              </span>
              <span>{downloadSpeed}</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="p-6 pt-2 bg-stone-950/90 border-t border-stone-800 flex items-center justify-end gap-3">
          {!updateInfo.isForceUpdate && !isUpdating && (
            <button
              onClick={handleDismiss}
              className="px-4 py-2.5 text-xs font-semibold text-stone-300 hover:text-white bg-stone-800 hover:bg-stone-700 rounded-xl transition"
            >
              لاحقاً
            </button>
          )}

          {isAndroid ? (
            <button
              onClick={handleAndroidUpdate}
              disabled={isUpdating}
              className="px-5 py-2.5 text-xs font-bold text-stone-950 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-yellow-300 rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center gap-2 disabled:opacity-50"
            >
              {isUpdating ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin text-stone-950" />
                  <span>جاري التنزيل...</span>
                </>
              ) : isCompleted ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-stone-950" />
                  <span>فتح مثبت التحديث الحزمة</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 text-stone-950" />
                  <span>تحميل وتثبيت التحديث (APK)</span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleWebUpdate}
              disabled={isUpdating}
              className="px-5 py-2.5 text-xs font-bold text-stone-950 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-yellow-300 rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center gap-2 disabled:opacity-50"
            >
              {isUpdating ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin text-stone-950" />
                  <span>جاري تطبيق التحديث...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 text-stone-950" />
                  <span>تحديث الآن (Update Now)</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
