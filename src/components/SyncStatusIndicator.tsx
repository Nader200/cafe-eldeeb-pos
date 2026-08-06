/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Cloud, CloudOff, RefreshCw, CheckCircle2, AlertCircle, Laptop, ShieldCheck, Database, Info, X, Wrench } from 'lucide-react';
import { firebaseSyncService, SyncState } from '../lib/firebaseSyncService';
import DebugSyncCenterModal from './DebugSyncCenterModal';

interface SyncStatusIndicatorProps {
  className?: string;
}

export default function SyncStatusIndicator({ className = '' }: SyncStatusIndicatorProps) {
  const [syncState, setSyncState] = useState<SyncState>(firebaseSyncService.getState());
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isDebugCenterOpen, setIsDebugCenterOpen] = useState<boolean>(false);
  const [isManualSyncing, setIsManualSyncing] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = firebaseSyncService.subscribe((newState) => {
      setSyncState(newState);
    });
    return () => unsubscribe();
  }, []);

  const handleManualSync = async () => {
    setIsManualSyncing(true);
    await firebaseSyncService.syncAllLocalToCloud();
    setTimeout(() => {
      setIsManualSyncing(false);
    }, 800);
  };

  const getStatusBadge = () => {
    if (syncState.status === 'syncing' || isManualSyncing) {
      return (
        <div className="flex items-center gap-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2.5 py-1 rounded-full text-[11px] font-bold animate-pulse">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
          <span>تتم المزامنة...</span>
        </div>
      );
    }

    if (syncState.status === 'offline' || !syncState.isOnline) {
      return (
        <div className="flex items-center gap-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-full text-[11px] font-bold">
          <CloudOff className="w-3.5 h-3.5 text-amber-400" />
          <span>أوفلاين (حفظ محلي)</span>
        </div>
      );
    }

    if (syncState.status === 'error') {
      return (
        <div className="flex items-center gap-1.5 bg-red-500/10 text-red-400 border border-red-500/30 px-2.5 py-1 rounded-full text-[11px] font-bold">
          <AlertCircle className="w-3.5 h-3.5 text-red-400" />
          <span>خطأ بالمزامنة</span>
        </div>
      );
    }

    // Connected
    return (
      <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-full text-[11px] font-extrabold shadow-sm">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        <Cloud className="w-3.5 h-3.5 text-emerald-400" />
        <span>مزامنة سحابية فورية</span>
      </div>
    );
  };

  return (
    <>
      {/* Header Widget */}
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className={`flex items-center gap-2 hover:opacity-90 transition-all cursor-pointer ${className}`}
        title="انقر لمشاهدة تفاصيل المزامنة السحابية الفورية بين الأجهزة"
      >
        {getStatusBadge()}
        {syncState.lastSyncTime && (
          <span className="text-[10px] text-gray-400 font-mono hidden sm:inline-block dir-ltr">
            {syncState.lastSyncTime}
          </span>
        )}
      </button>

      {/* Details Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in" dir="rtl">
          <div className="bg-luxury-card border border-luxury-border rounded-3xl p-6 max-w-md w-full shadow-2xl relative overflow-hidden space-y-5">
            <div className="absolute top-0 left-0 w-48 h-48 bg-gold-500/5 rounded-full blur-3xl pointer-events-none" />

            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gold-500/10 border border-gold-500/20 text-gold-500 flex items-center justify-center">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">نظام المزامنة السحابية الفورية</h3>
                  <p className="text-[11px] text-gray-400">Firebase Live Multi-Device Sync</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Status Info Box */}
            <div className="bg-luxury-bg border border-gray-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 font-bold">حالة الاتصال بالسحابة:</span>
                {getStatusBadge()}
              </div>

              <div className="flex items-center justify-between border-t border-gray-800/60 pt-2.5">
                <span className="text-xs text-gray-400 font-bold">توقيت آخر مزامنة:</span>
                <span className="text-xs text-gold-400 font-mono font-bold">
                  {syncState.lastSyncTime || 'لم تتم بعد'}
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-gray-800/60 pt-2.5">
                <span className="text-xs text-gray-400 font-bold">معرّف الكافيه السحابي:</span>
                <span className="text-[11px] text-emerald-400 font-mono bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-900/40">
                  {syncState.cafeId}
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-gray-800/60 pt-2.5">
                <span className="text-xs text-gray-400 font-bold">رمز الجهاز الحالي:</span>
                <span className="text-[10px] text-gray-300 font-mono truncate max-w-[150px]">
                  {syncState.deviceId}
                </span>
              </div>
            </div>

            {/* Feature Highlights */}
            <div className="space-y-2 text-xs text-gray-300">
              <div className="flex items-start gap-2 bg-gray-900/40 p-2.5 rounded-xl border border-gray-800/80">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>مزامنة فورية لكل المبيعات والفواتير والمنتجات والمخزون عبر الأجهزة المتعددة.</span>
              </div>
              <div className="flex items-start gap-2 bg-gray-900/40 p-2.5 rounded-xl border border-gray-800/80">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>دعم تام للعمل بدون إنترنت (Offline Mode) وإعادة المزامنة التلقائية فور عودة الشبكة.</span>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isManualSyncing || !syncState.isOnline}
                className="w-full sm:flex-1 py-2.5 bg-gradient-to-r from-gold-600 to-gold-500 hover:from-gold-500 hover:to-gold-400 text-black font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isManualSyncing ? 'animate-spin' : ''}`} />
                {isManualSyncing ? 'جاري المزامنة...' : 'مزامنة الكافيه بالكامل الآن'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setIsDebugCenterOpen(true);
                }}
                className="w-full sm:w-auto px-4 py-2.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Wrench className="w-4 h-4 text-blue-400" />
                <span>Debug Center 🔧</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Debug Sync Center Modal */}
      <DebugSyncCenterModal
        isOpen={isDebugCenterOpen}
        onClose={() => setIsDebugCenterOpen(false)}
      />
    </>
  );
}
