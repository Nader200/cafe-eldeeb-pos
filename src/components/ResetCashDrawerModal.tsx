import React, { useState, useEffect } from 'react';
import {
  RotateCcw,
  ShieldAlert,
  Lock,
  Eye,
  EyeOff,
  X,
  AlertTriangle,
  CheckCircle2,
  Wallet
} from 'lucide-react';
import { dbService } from '../dbService';
import { isAdminSecurityPasswordSet } from '../lib/securityService';
import { useAuth } from '../contexts/AuthContext';

interface ResetCashDrawerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (result: { previousDrawerBalance: number; previousShiftBalance: number; newBalance: number }) => void;
  onShowSuccessAlert?: (msg: string) => void;
  onShowWarningAlert?: (msg: string) => void;
}

export default function ResetCashDrawerModal({
  isOpen,
  onClose,
  onSuccess,
  onShowSuccessAlert,
  onShowWarningAlert
}: ResetCashDrawerModalProps) {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'Admin';
  const hasSecPass = isAdminSecurityPasswordSet();

  const [credential, setCredential] = useState('');
  const [showCred, setShowCred] = useState(false);
  const [reason, setReason] = useState('تصحيح خطأ حسابي في الدرج');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [drawerBalance, setDrawerBalance] = useState(0);
  const [shiftBalance, setShiftBalance] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCredential('');
      setReason('تصحيح خطأ حسابي في الدرج');
      setErrorMsg(null);
      setLoading(false);
      const d = dbService.getActiveDrawer();
      setDrawerBalance(Math.round((d.opening_balance + d.cash_in - d.cash_out) * 100) / 100);
      const s = dbService.getActiveShift();
      setShiftBalance(s ? s.expected_cash : null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!isAdmin) {
      const msg = 'عذراً! تصفير حساب الدرج متاح للأدمن فقط.';
      setErrorMsg(msg);
      onShowWarningAlert?.(msg);
      return;
    }

    if (!reason.trim()) {
      setErrorMsg('يرجى كتابة سبب تصفير الدرج للتوثيق في سجل المراقبة');
      return;
    }

    if (!credential.trim()) {
      setErrorMsg(
        hasSecPass
          ? 'يرجى إدخال كلمة مرور حماية الشاشات الحساسة (Admin Security Password)'
          : 'يرجى إدخال رمز الأمان (PIN) الخاص بالأدمن'
      );
      return;
    }

    setLoading(true);
    try {
      const result = await dbService.resetCashDrawerAdmin(
        credential.trim(),
        reason.trim(),
        currentUser?.name || 'أدمن النظام'
      );
      setLoading(false);
      onShowSuccessAlert?.('تم تصفير حساب الدرج والوردية الحالية إلى 0 ج.م بنجاح ✅');
      onSuccess?.(result);
      onClose();
    } catch (err: any) {
      setLoading(false);
      const msg = err?.message || 'حدث خطأ أثناء تصفير حساب الدرج';
      setErrorMsg(msg);
      onShowWarningAlert?.(msg);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/85 backdrop-blur-md z-[70] flex items-center justify-center p-4 animate-fade-in"
      dir="rtl"
    >
      <div className="w-full max-w-md bg-[#0a0a0c] border-2 border-red-500/40 rounded-3xl p-6 shadow-[0_0_50px_rgba(239,68,68,0.2)] relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 left-4 p-2 text-gray-400 hover:text-white rounded-xl hover:bg-gray-900 transition-colors cursor-pointer"
          title="إغلاق"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 pb-4 mb-4 border-b border-gray-800">
          <div className="w-12 h-12 rounded-2xl bg-red-950/60 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0">
            <RotateCcw className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <span>تصفير حساب الدرج</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-gold-500/15 text-gold-400 border border-gold-500/30">
                للأدمن فقط 👑
              </span>
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              إعادة تعيين رصيد الدرج والوردية الحالية إلى 0 ج.م عند وجود خطأ حسابي
            </p>
          </div>
        </div>

        {!isAdmin ? (
          <div className="p-4 bg-red-950/60 border border-red-800 rounded-2xl text-red-200 text-xs font-bold text-center space-y-2">
            <ShieldAlert className="w-8 h-8 text-red-400 mx-auto" />
            <p>هذا الإجراء مقصور على الأدمن فقط.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Current Balance Summary */}
            <div className="bg-black/60 border border-gray-800 rounded-2xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 font-bold flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-gold-500" />
                  رصيد الدرج الحالي:
                </span>
                <span className="font-mono font-black text-gold-400 text-sm">
                  {drawerBalance.toLocaleString('ar-EG')} ج.م
                </span>
              </div>
              {shiftBalance !== null && (
                <div className="flex items-center justify-between border-t border-gray-900 pt-2">
                  <span className="text-gray-400 font-bold">المتوقع بالوردية النشطة:</span>
                  <span className="font-mono font-black text-amber-400">
                    {shiftBalance.toLocaleString('ar-EG')} ج.م
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-gray-900 pt-2">
                <span className="text-emerald-400 font-bold">الرصيد بعد التصفير:</span>
                <span className="font-mono font-black text-emerald-400 text-sm flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  0 ج.م
                </span>
              </div>
            </div>

            {/* Info Warning */}
            <div className="bg-amber-950/25 border border-amber-500/30 rounded-2xl p-3 text-[11px] text-amber-200/90 leading-relaxed flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                سيتم تصفير رصيد الدرج والوردية النشطة فوراً وتوثيق العملية في سجل المراقبة (Audit Log).{' '}
                <strong className="text-white">لن تتأثر الفواتير أو المصروفات أو التقارير المحفوظة.</strong>
              </span>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-950/80 border border-red-800 rounded-xl text-red-200 text-xs font-bold flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="block text-xs font-bold text-gray-300 mb-1.5">
                سبب تصفير الدرج *
              </label>
              <input
                type="text"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="مثال: تصحيح رصيد افتتاحي خاطئ بالدرج..."
                className="w-full bg-[#141416] border border-gray-800 focus:border-gold-500 text-white rounded-xl py-2.5 px-3 text-xs font-bold focus:outline-none text-right"
              />
            </div>

            {/* Admin Security Credential */}
            <div>
              <label className="block text-xs font-bold text-amber-300 mb-1.5 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                {hasSecPass
                  ? 'كلمة مرور الشاشات الحساسة (Admin Security Password) *'
                  : 'رمز الأمان PIN للمسؤول (Admin PIN) *'}
              </label>
              <div className="relative">
                <input
                  type={showCred ? 'text' : 'password'}
                  required
                  autoFocus
                  value={credential}
                  onChange={(e) => setCredential(e.target.value)}
                  placeholder={hasSecPass ? 'أدخل Admin Security Password...' : '••••'}
                  className="w-full bg-[#141416] border border-gray-800 focus:border-red-500 text-white rounded-xl py-2.5 pr-4 pl-10 text-xs font-mono font-bold focus:outline-none text-right"
                />
                <button
                  type="button"
                  onClick={() => setShowCred(!showCred)}
                  className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 hover:text-gold-400 cursor-pointer"
                >
                  {showCred ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="py-3 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black text-xs rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>تأكيد تصفير الدرج</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="py-3 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-gray-300 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
