/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Cloud,
  CloudOff,
  Copy,
  Download,
  Trash2,
  Play,
  Zap,
  Server,
  Database,
  Smartphone,
  User,
  X,
  FileText,
  ShieldCheck,
  Check
} from 'lucide-react';
import { firebaseSyncService, SyncState } from '../lib/firebaseSyncService';
import { syncDiagnosticLogger, LogEvent, PushInfo, SnapshotInfo } from '../lib/syncDiagnosticLogger';
import { db, auth } from '../lib/firebaseClient';
import { dbService } from '../dbService';
import { safeStorage } from '../lib/safeStorage';

interface DebugSyncCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DebugSyncCenterModal({ isOpen, onClose }: DebugSyncCenterModalProps) {
  const [syncState, setSyncState] = useState<SyncState>(firebaseSyncService.getState());
  const [events, setEvents] = useState<LogEvent[]>(syncDiagnosticLogger.getEvents());
  const [lastPush, setLastPush] = useState<PushInfo | null>(syncDiagnosticLogger.getLastPush());
  const [lastSnapshot, setLastSnapshot] = useState<SnapshotInfo | null>(syncDiagnosticLogger.getLastSnapshot());
  const [docsReceivedCount, setDocsReceivedCount] = useState<number>(syncDiagnosticLogger.getDocsReceivedCount());

  const [copied, setCopied] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Local storage counts state
  const [localStorageCounts, setLocalStorageCounts] = useState({
    products: 0,
    categories: 0,
    baristaOrders: 0,
    invoices: 0,
    openInvoices: 0
  });

  const refreshLocalStorageCounts = () => {
    try {
      const getArrayCount = (key: string) => {
        const val = safeStorage.getItem(key);
        if (!val) return 0;
        try {
          const parsed = JSON.parse(val);
          return Array.isArray(parsed) ? parsed.length : 0;
        } catch (e) {
          return 0;
        }
      };

      const invs = dbService.getInvoices();
      const openInvs = invs.filter((i: any) => i.payment_status === 'UNPAID' || i.invoice_status === 'OPEN');

      setLocalStorageCounts({
        products: getArrayCount('cafe_products'),
        categories: getArrayCount('cafe_categories'),
        baristaOrders: getArrayCount('cafe_barista_orders'),
        invoices: invs.length,
        openInvoices: openInvs.length
      });
    } catch (e) {
      console.error('Error getting storage counts:', e);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    refreshLocalStorageCounts();

    const unsubSync = firebaseSyncService.subscribe((state) => {
      setSyncState(state);
      refreshLocalStorageCounts();
    });

    const unsubDiag = syncDiagnosticLogger.subscribe(() => {
      setEvents(syncDiagnosticLogger.getEvents());
      setLastPush(syncDiagnosticLogger.getLastPush());
      setLastSnapshot(syncDiagnosticLogger.getLastSnapshot());
      setDocsReceivedCount(syncDiagnosticLogger.getDocsReceivedCount());
      refreshLocalStorageCounts();
    });

    return () => {
      unsubSync();
      unsubDiag();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Firebase Info
  const firebaseInitialized = !!db && !!db.app;
  const projectId = (db?.app?.options as any)?.projectId || 'N/A';
  const appId = (db?.app?.options as any)?.appId || 'cafe-eldeeb-app';
  const currentUser = dbService.getCurrentUser();
  const userRole = currentUser?.role || 'Admin/Manager';
  const userEmail = auth?.currentUser?.email || (currentUser as any)?.email || (currentUser as any)?.username || 'Nader.Eldeeb.2015@gmail.com';

  // Handlers for tools
  const handleForcePushAll = async () => {
    setIsProcessing(true);
    setActionMessage('جاري رفع جميع البيانات المحلية إلى Cloud...');
    try {
      const count = await firebaseSyncService.forcePushAllKeys();
      setActionMessage(`تم رفع ${count} مستند بنجاح!`);
    } catch (e: any) {
      setActionMessage(`فشل الرفع: ${e?.message || e}`);
    } finally {
      setIsProcessing(false);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleForcePullAll = () => {
    setIsProcessing(true);
    setActionMessage('جاري إعادة طلب البيانات والجلب من Firestore...');
    try {
      firebaseSyncService.restartFirestoreListener();
      setActionMessage('تم إرسال طلب الجلب وإعادة الاستماع بنجاح!');
    } catch (e: any) {
      setActionMessage(`فشل الجلب: ${e?.message || e}`);
    } finally {
      setIsProcessing(false);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleRestartListener = () => {
    setIsProcessing(true);
    setActionMessage('جاري إعادة تشغيل مستمع Firestore...');
    try {
      firebaseSyncService.restartFirestoreListener();
      setActionMessage('تم إعادة تشغيل المستمع بنجاح!');
    } catch (e: any) {
      setActionMessage(`فشل إعادة التشغيل: ${e?.message || e}`);
    } finally {
      setIsProcessing(false);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleClearLocalCache = () => {
    if (window.confirm('هل أنت تأكد من رغبتك في تفريغ ذاكرة التخزين المؤقت للسجلات في مركز التشخيص؟')) {
      syncDiagnosticLogger.clearLogs();
      setActionMessage('تم تفريغ سجل التشخيص المباشر!');
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const generateFullLogText = () => {
    const textLines = [];
    textLines.push("==========================================");
    textLines.push("    CAFE ELDEEB - DIAGNOSTIC REPORT");
    textLines.push(`    Generated: ${new Date().toISOString()}`);
    textLines.push("==========================================");
    textLines.push("");
    textLines.push("=== FIREBASE STATUS ===");
    textLines.push(`Firebase Initialized: ${firebaseInitialized ? 'YES' : 'NO'}`);
    textLines.push(`Project ID: ${projectId}`);
    textLines.push(`App ID: ${appId}`);
    textLines.push(`Cafe ID: ${syncState.cafeId}`);
    textLines.push(`Device ID: ${syncState.deviceId}`);
    textLines.push(`User Role: ${userRole}`);
    textLines.push(`User Email: ${userEmail}`);
    textLines.push(`Connection Status: ${syncState.isOnline ? 'CONNECTED' : 'DISCONNECTED'}`);
    textLines.push(`Sync Status: ${syncState.status.toUpperCase()}`);
    textLines.push("");
    textLines.push("=== LAST PUSH ===");
    if (lastPush) {
      textLines.push(`Time: ${lastPush.time}`);
      textLines.push(`Key: ${lastPush.key}`);
      textLines.push(`Path: ${lastPush.path}`);
      textLines.push(`Size: ${(lastPush.sizeBytes / 1024).toFixed(2)} KB`);
      textLines.push(`Status: ${lastPush.status}`);
      if (lastPush.error) textLines.push(`Error: ${lastPush.error}`);
    } else {
      textLines.push("No push recorded yet.");
    }
    textLines.push("");
    textLines.push("=== LAST SNAPSHOT ===");
    if (lastSnapshot) {
      textLines.push(`Time: ${lastSnapshot.time}`);
      textLines.push(`Collection: ${lastSnapshot.collection}`);
      textLines.push(`Document: ${lastSnapshot.docId}`);
      textLines.push(`Change Type: ${lastSnapshot.changeType}`);
      textLines.push(`From DeviceId: ${lastSnapshot.deviceId}`);
      textLines.push(`Payload Size: ${(lastSnapshot.sizeBytes / 1024).toFixed(2)} KB`);
    } else {
      textLines.push("No snapshot received yet.");
    }
    textLines.push("");
    textLines.push("=== LOCAL STORAGE COUNTS ===");
    textLines.push(`cafe_products: ${localStorageCounts.products}`);
    textLines.push(`cafe_categories: ${localStorageCounts.categories}`);
    textLines.push(`cafe_barista_orders: ${localStorageCounts.baristaOrders}`);
    textLines.push(`cafe_invoices: ${localStorageCounts.invoices}`);
    textLines.push(`cafe_open_invoices: ${localStorageCounts.openInvoices}`);
    textLines.push("");
    textLines.push("=== FIRESTORE CACHE / RECEIVED ===");
    textLines.push(`Documents Received Count: ${docsReceivedCount}`);
    textLines.push("");
    textLines.push("=== REALTIME EVENT LOGS (Last 100) ===");
    events.forEach(ev => {
      textLines.push(`[${ev.time}] [${ev.type}] ${ev.title} ${ev.details ? '- ' + ev.details : ''}`);
    });
    return textLines.join("\n");
  };

  const handleCopyLogs = () => {
    const text = generateFullLogText();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleExportLogs = () => {
    const text = generateFullLogText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sync_diagnostic_${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getBadgeForType = (type: LogEvent['type']) => {
    switch (type) {
      case 'PUSH_SUCCESS':
        return <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold">PUSH SUCCESS</span>;
      case 'PUSH_FAILED':
        return <span className="bg-red-500/20 text-red-400 border border-red-500/40 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold">PUSH FAILED</span>;
      case 'SNAPSHOT':
        return <span className="bg-blue-500/20 text-blue-400 border border-blue-500/40 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold">SNAPSHOT</span>;
      case 'UI_REFRESH':
        return <span className="bg-purple-500/20 text-purple-400 border border-purple-500/40 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold">UI REFRESH</span>;
      case 'ERROR':
        return <span className="bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold">ERROR</span>;
      case 'ACTION':
        return <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold">ACTION</span>;
      default:
        return <span className="bg-gray-700/50 text-gray-300 border border-gray-600 text-[10px] px-1.5 py-0.5 rounded font-mono">INFO</span>;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fade-in" dir="rtl">
      <div className="bg-[#121620] border border-gold-500/30 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl relative overflow-hidden text-gray-100">
        
        {/* Top Glow Bar */}
        <div className="h-1 bg-gradient-to-r from-gold-600 via-emerald-500 to-blue-500 w-full" />

        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-gray-800 flex items-center justify-between bg-[#181d2c]/80 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gold-500/10 border border-gold-500/30 text-gold-400 flex items-center justify-center">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white">🔧 Debug Sync Center</h2>
                <span className="text-[10px] bg-gold-500/20 text-gold-300 px-2 py-0.5 rounded-full font-bold border border-gold-500/30">
                  تشخيص مباشر
                </span>
              </div>
              <p className="text-xs text-gray-400">مركز مراقبة وتتبع المزامنة اللحظية بين الأجهزة بدون F12</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-gray-800/80 hover:bg-gray-700 text-gray-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Message Banner */}
        {actionMessage && (
          <div className="bg-blue-900/40 border-b border-blue-500/40 p-3 px-5 flex items-center gap-2 text-xs font-bold text-blue-200 animate-fade-in">
            <Zap className="w-4 h-4 text-blue-400 shrink-0" />
            <span>{actionMessage}</span>
          </div>
        )}

        {/* Scrollable Body Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-xs flex-1">

          {/* Section 1: FIREBASE STATUS */}
          <div className="bg-[#1a202e] border border-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 border-b border-gray-800 pb-2">
              <Server className="w-4 h-4 text-gold-400" />
              <h3 className="font-extrabold text-white text-sm">FIREBASE STATUS</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-[#121620] p-3 rounded-lg border border-gray-800 space-y-1">
                <span className="text-[11px] text-gray-400 block font-bold">Firebase Initialized</span>
                <span className={`font-mono font-bold text-xs ${firebaseInitialized ? 'text-emerald-400' : 'text-red-400'}`}>
                  {firebaseInitialized ? 'YES ✅' : 'NO ❌'}
                </span>
              </div>

              <div className="bg-[#121620] p-3 rounded-lg border border-gray-800 space-y-1">
                <span className="text-[11px] text-gray-400 block font-bold">Project ID</span>
                <span className="font-mono text-gold-300 font-bold truncate block">{projectId}</span>
              </div>

              <div className="bg-[#121620] p-3 rounded-lg border border-gray-800 space-y-1">
                <span className="text-[11px] text-gray-400 block font-bold">Current Cafe ID</span>
                <span className="font-mono text-emerald-400 font-bold truncate block">{syncState.cafeId}</span>
              </div>

              <div className="bg-[#121620] p-3 rounded-lg border border-gray-800 space-y-1">
                <span className="text-[11px] text-gray-400 block font-bold">Connection Status</span>
                <span className={`font-mono font-bold text-xs ${syncState.isOnline ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {syncState.isOnline ? 'CONNECTED 🟢' : 'DISCONNECTED 🔴'}
                </span>
              </div>

              <div className="bg-[#121620] p-3 rounded-lg border border-gray-800 space-y-1">
                <span className="text-[11px] text-gray-400 block font-bold">Current Device ID</span>
                <span className="font-mono text-gray-300 text-[10px] truncate block dir-ltr">{syncState.deviceId}</span>
              </div>

              <div className="bg-[#121620] p-3 rounded-lg border border-gray-800 space-y-1">
                <span className="text-[11px] text-gray-400 block font-bold">User Role</span>
                <span className="font-mono text-purple-300 font-bold block">{userRole}</span>
              </div>

              <div className="bg-[#121620] p-3 rounded-lg border border-gray-800 space-y-1 col-span-1 sm:col-span-2">
                <span className="text-[11px] text-gray-400 block font-bold">User Email</span>
                <span className="font-mono text-blue-300 truncate block dir-ltr">{userEmail}</span>
              </div>
            </div>
          </div>

          {/* Section 2: LAST PUSH & LAST SNAPSHOT */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* LAST PUSH */}
            <div className="bg-[#1a202e] border border-gray-800 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-2 border-b border-gray-800 pb-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                <h3 className="font-extrabold text-white text-sm">LAST PUSH</h3>
              </div>

              {lastPush ? (
                <div className="space-y-2 font-mono text-[11px]">
                  <div className="flex justify-between border-b border-gray-800/60 pb-1">
                    <span className="text-gray-400">Time:</span>
                    <span className="text-gold-300 font-bold">{lastPush.time}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-800/60 pb-1">
                    <span className="text-gray-400">Key:</span>
                    <span className="text-emerald-400 font-bold">{lastPush.key}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-800/60 pb-1">
                    <span className="text-gray-400">Path:</span>
                    <span className="text-gray-300 text-[10px] truncate max-w-[180px] dir-ltr">{lastPush.path}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-800/60 pb-1">
                    <span className="text-gray-400">Size:</span>
                    <span className="text-gray-300">{(lastPush.sizeBytes / 1024).toFixed(2)} KB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Status:</span>
                    <span className={lastPush.status === 'SUCCESS' ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                      {lastPush.status}
                    </span>
                  </div>
                  {lastPush.error && (
                    <div className="text-red-400 text-[10px] bg-red-950/40 p-1.5 rounded border border-red-900/50 mt-1">
                      {lastPush.error}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-500 text-xs italic py-2">لم يتم إجراء أي عملية رفع حتى الآن.</p>
              )}
            </div>

            {/* LAST SNAPSHOT */}
            <div className="bg-[#1a202e] border border-gray-800 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-2 border-b border-gray-800 pb-2">
                <Cloud className="w-4 h-4 text-blue-400" />
                <h3 className="font-extrabold text-white text-sm">LAST SNAPSHOT</h3>
              </div>

              {lastSnapshot ? (
                <div className="space-y-2 font-mono text-[11px]">
                  <div className="flex justify-between border-b border-gray-800/60 pb-1">
                    <span className="text-gray-400">Time:</span>
                    <span className="text-gold-300 font-bold">{lastSnapshot.time}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-800/60 pb-1">
                    <span className="text-gray-400">Document:</span>
                    <span className="text-blue-400 font-bold">{lastSnapshot.docId}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-800/60 pb-1">
                    <span className="text-gray-400">Change Type:</span>
                    <span className="text-purple-300 font-bold">{lastSnapshot.changeType}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-800/60 pb-1">
                    <span className="text-gray-400">From DeviceId:</span>
                    <span className="text-gray-300 text-[10px] truncate max-w-[150px] dir-ltr">{lastSnapshot.deviceId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Payload Size:</span>
                    <span className="text-gray-300">{(lastSnapshot.sizeBytes / 1024).toFixed(2)} KB</span>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-xs italic py-2">لم يتم استلام أي Snapshot حتى الآن.</p>
              )}
            </div>
          </div>

          {/* Section 3: LOCAL STORAGE & FIRESTORE CACHE */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* LOCAL STORAGE COUNTS */}
            <div className="bg-[#1a202e] border border-gray-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-purple-400" />
                  <h3 className="font-extrabold text-white text-sm">LOCAL STORAGE COUNTS</h3>
                </div>
                <button
                  type="button"
                  onClick={refreshLocalStorageCounts}
                  className="text-[10px] text-gray-400 hover:text-gold-400 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  تحديث
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono">
                <div className="bg-[#121620] p-2.5 rounded border border-gray-800 text-center">
                  <span className="text-[10px] text-gray-400 block">cafe_products</span>
                  <span className="text-base font-black text-emerald-400">{localStorageCounts.products}</span>
                </div>
                <div className="bg-[#121620] p-2.5 rounded border border-gray-800 text-center">
                  <span className="text-[10px] text-gray-400 block">cafe_categories</span>
                  <span className="text-base font-black text-blue-400">{localStorageCounts.categories}</span>
                </div>
                <div className="bg-[#121620] p-2.5 rounded border border-gray-800 text-center">
                  <span className="text-[10px] text-gray-400 block">barista_orders</span>
                  <span className="text-base font-black text-amber-400">{localStorageCounts.baristaOrders}</span>
                </div>
                <div className="bg-[#121620] p-2.5 rounded border border-gray-800 text-center">
                  <span className="text-[10px] text-gray-400 block">cafe_invoices</span>
                  <span className="text-base font-black text-purple-400">{localStorageCounts.invoices}</span>
                </div>
                <div className="bg-[#121620] p-2.5 rounded border border-gray-800 text-center col-span-2 sm:col-span-1">
                  <span className="text-[10px] text-gray-400 block">open_invoices</span>
                  <span className="text-base font-black text-rose-400">{localStorageCounts.openInvoices}</span>
                </div>
              </div>
            </div>

            {/* FIRESTORE CACHE & RECEIVE COUNTER */}
            <div className="bg-[#1a202e] border border-gray-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 border-b border-gray-800 pb-2">
                <Activity className="w-4 h-4 text-amber-400" />
                <h3 className="font-extrabold text-white text-sm">FIRESTORE CACHE & RECEPTION</h3>
              </div>

              <div className="bg-[#121620] p-4 rounded-xl border border-gray-800 flex items-center justify-between">
                <div>
                  <span className="text-xs text-gray-400 font-bold block">إجمالي المستندات التي تم استلامها:</span>
                  <span className="text-[10px] text-gray-500">منذ تشغيل التطبيق في هذه الجلسة</span>
                </div>
                <span className="text-2xl font-black text-gold-400 font-mono bg-gold-500/10 px-3 py-1 rounded-lg border border-gold-500/30">
                  {docsReceivedCount}
                </span>
              </div>
            </div>
          </div>

          {/* Section 4: TOOLS BUTTONS */}
          <div className="bg-[#1a202e] border border-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 border-b border-gray-800 pb-2">
              <Zap className="w-4 h-4 text-gold-400" />
              <h3 className="font-extrabold text-white text-sm">DIAGNOSTIC TOOLS (أدوات التحكم)</h3>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleForcePushAll}
                className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 p-2.5 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Force Push All</span>
              </button>

              <button
                type="button"
                disabled={isProcessing}
                onClick={handleForcePullAll}
                className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 p-2.5 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Force Pull All</span>
              </button>

              <button
                type="button"
                disabled={isProcessing}
                onClick={handleRestartListener}
                className="bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 p-2.5 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Restart Listener</span>
              </button>

              <button
                type="button"
                onClick={handleClearLocalCache}
                className="bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 p-2.5 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Local Logs</span>
              </button>

              <button
                type="button"
                onClick={handleCopyLogs}
                className="bg-gold-600/20 hover:bg-gold-600/30 text-gold-300 border border-gold-500/40 p-2.5 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'تم النسخ!' : 'Copy Logs'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportLogs}
                className="bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 p-2.5 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export TXT</span>
              </button>
            </div>
          </div>

          {/* Section 5: REALTIME EVENTS LIVE LOG */}
          <div className="bg-[#1a202e] border border-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-gray-800 pb-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                <h3 className="font-extrabold text-white text-sm">REALTIME EVENTS LIVE LOG</h3>
              </div>
              <span className="text-[10px] text-gray-400 font-mono bg-gray-800 px-2 py-0.5 rounded">
                أحدث {events.length} حدث
              </span>
            </div>

            <div className="bg-[#0e121b] border border-gray-800/80 rounded-xl p-3 max-h-72 overflow-y-auto space-y-2 font-mono text-[11px]">
              {events.length === 0 ? (
                <p className="text-gray-500 text-center py-4 italic">لا توجد أحداث بعد...</p>
              ) : (
                events.map((ev) => (
                  <div key={ev.id} className="p-2 rounded bg-[#151a26] border border-gray-800/60 space-y-1 hover:border-gray-700 transition-colors">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 text-[10px]">{ev.time}</span>
                        {getBadgeForType(ev.type)}
                        <span className="font-bold text-gray-200 text-[11px]">{ev.title}</span>
                      </div>
                      {ev.deviceId && (
                        <span className="text-[9px] text-gray-400 bg-gray-800/80 px-1.5 py-0.5 rounded dir-ltr truncate max-w-[120px]">
                          Dev: {ev.deviceId}
                        </span>
                      )}
                    </div>
                    {ev.details && (
                      <p className="text-gray-400 text-[10px] bg-black/30 p-1 rounded border border-gray-800/40 dir-ltr text-right">
                        {ev.details}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-gray-800 bg-[#181d2c] flex items-center justify-between">
          <span className="text-[11px] text-gray-400">
            تحديث تلقائي لحظي دون الحاجة لأي تنشيط يدوي
          </span>
          <button
            type="button"
            onClick={onClose}
            className="bg-gold-500 hover:bg-gold-600 text-gray-950 font-black px-5 py-2 rounded-xl text-xs transition-all cursor-pointer"
          >
            إغلاق النافذة
          </button>
        </div>

      </div>
    </div>
  );
}
