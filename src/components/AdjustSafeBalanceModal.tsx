import React, { useState, useEffect } from 'react';
import {
  RotateCcw,
  Pencil,
  ShieldAlert,
  Lock,
  Eye,
  EyeOff,
  X,
  AlertTriangle,
  CheckCircle2,
  Home,
  Users
} from 'lucide-react';
import { dbService } from '../dbService';
import { isAdminSecurityPasswordSet } from '../lib/securityService';
import { useAuth } from '../contexts/AuthContext';
import { SafeType } from '../types';

interface AdjustSafeBalanceModalProps {
  isOpen: boolean;
  initialSafeType: SafeType;
  initialMode: 'ADJUST' | 'RESET';
  onClose: () => void;
  onSuccess?: () => void;
  onShowSuccessAlert?: (msg: string) => void;
  onShowWarningAlert?: (msg: string) => void;
}

export default function AdjustSafeBalanceModal({
  isOpen,
  initialSafeType,
  initialMode,
  onClose,
  onSuccess,
  onShowSuccessAlert,
  onShowWarningAlert
}: AdjustSafeBalanceModalProps) {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'Admin';
  const hasSecPass = isAdminSecurityPasswordSet();

  const [safeType, setSafeType] = useState<SafeType>(initialSafeType);
  const [mode, setMode] = useState<'ADJUST' | 'RESET'>(initialMode);
  const [newBalanceInput, setNewBalanceInput] = useState<string>('0');
  const [reason, setReason] = useState<string>('');
  const [credential, setCredential] = useState<string>('');
  const [showCred, setShowCred] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const privateSafeBalance = isOpen ? dbService.getSafeBalance('PRIVATE_SAFE') : 0;
  const rentBoxBalance = isOpen ? dbService.getSafeBalance('RENT_BOX') : 0;
  const gamiaBoxBalance = isOpen ? dbService.getSafeBalance('GAMIA_BOX') : 0;

  const getSafeBalanceByType = (t: SafeType) => {
    if (t === 'RENT_BOX') return rentBoxBalance;
    if (t === 'GAMIA_BOX') return gamiaBoxBalance;
    return privateSafeBalance;
  };
  const getSafeLabel = (t: SafeType) => {
    if (t === 'RENT_BOX') return 'قسم الإيجار';
    if (t === 'GAMIA_BOX') return 'قسم الجمعية';
    return 'الخزنة الخاصة';
  };

  const currentSafeBalance = getSafeBalanceByType(safeType);
  const safeLabel = getSafeLabel(safeType);

  useEffect(() => {
    if (isOpen) {
      const normalizedInit: SafeType = initialSafeType === 'MAIN_SAFE' ? 'PRIVATE_SAFE' : initialSafeType;
      setSafeType(normalizedInit);
      setMode(initialMode);
      const startBal = dbService.getSafeBalance(normalizedInit);
      setNewBalanceInput(initialMode === 'RESET' ? '0' : String(startBal));
      setReason(
        initialMode === 'RESET'
          ? 'تصفير الرصيد لتصحيح خطأ حسابي'
          : 'تعديل الرصيد يدوياً لتصحيح خطأ حسابي'
      );
      setCredential('');
      setErrorMsg(null);
      setLoading(false);
    }
  }, [isOpen, initialSafeType, initialMode]);

  const handleChangeSafe = (nextSafe: SafeType) => {
    setSafeType(nextSafe);
    setErrorMsg(null);
    const bal = getSafeBalanceByType(nextSafe);
    if (mode === 'ADJUST') {
      setNewBalanceInput(String(bal));
    } else {
      setNewBalanceInput('0');
    }
  };

  const handleChangeMode = (nextMode: 'ADJUST' | 'RESET') => {
    setMode(nextMode);
    setErrorMsg(null);
    if (nextMode === 'RESET') {
      setNewBalanceInput('0');
      if (!reason.trim() || reason.includes('تعديل رصيد الخزنة يدوياً')) {
        setReason('تصفير رصيد الخزنة لتصحيح خطأ حسابي');
      }
    } else {
      setNewBalanceInput(String(currentSafeBalance));
      if (!reason.trim() || reason.includes('تصفير رصيد الخزنة')) {
        setReason('تعديل رصيد الخزنة يدوياً لتصحيح خطأ حسابي');
      }
    }
  };

  if (!isOpen) return null;

  const parsedTargetBalance =
    mode === 'RESET' ? 0 : Math.round((parseFloat(newBalanceInput) || 0) * 100) / 100;
  const delta = Math.round((parsedTargetBalance - currentSafeBalance) * 100) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!isAdmin) {
      const msg = 'عذراً! تعديل وتصفير أرصدة الخزن متاح للأدمن فقط.';
      setErrorMsg(msg);
      onShowWarningAlert?.(msg);
      return;
    }

    if (mode === 'ADJUST') {
      const raw = parseFloat(newBalanceInput);
      if (newBalanceInput.trim() === '' || isNaN(raw) || raw < 0) {
        setErrorMsg('يرجى إدخال قيمة رصيد صحيحة (0 أو أكبر).');
        return;
      }
    }

    if (!reason.trim()) {
      setErrorMsg('يرجى كتابة سبب التعديل أو التصفير للتوثيق في سجل المراقبة.');
      return;
    }

    if (!credential.trim()) {
      setErrorMsg(
        hasSecPass
          ? 'يرجى إدخال كلمة مرور حماية الشاشات الحساسة (Admin Security Password)'
          : 'يرجى إدخال رمز الأمان PIN الخاص بالأدمن'
      );
      return;
    }

    setLoading(true);
    try {
      const res = await dbService.adjustSafeBalanceAdmin(
        safeType,
        parsedTargetBalance,
        credential.trim(),
        reason.trim(),
        currentUser?.name || 'أدمن النظام',
        mode
      );
      setLoading(false);
      onShowSuccessAlert?.(
        mode === 'RESET'
          ? `تم تصفير رصيد ${safeLabel} إلى 0 ج.م بنجاح ✅ (الرصيد السابق: ${res.previousBalance.toLocaleString('ar-EG')} ج.م)`
          : `تم تعديل رصيد ${safeLabel} إلى ${res.newBalance.toLocaleString('ar-EG')} ج.م بنجاح ✅`
      );
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setLoading(false);
      const msg = err?.message || 'حدث خطأ أثناء تحديث رصيد الخزنة';
      setErrorMsg(msg);
      onShowWarningAlert?.(msg);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/85 backdrop-blur-md z-[70] flex items-center justify-center p-4 animate-fade-in overflow-y-auto"
      dir="rtl"
    >
      <div className="w-full max-w-md bg-[#0a0a0c] border-2 border-gold-500/40 rounded-3xl p-5 sm:p-6 shadow-[0_0_50px_rgba(212,175,55,0.2)] relative my-auto">
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
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
              mode === 'RESET'
                ? 'bg-red-950/60 border-red-500/40 text-red-400'
                : 'bg-gold-500/15 border-gold-500/40 text-gold-400'
            }`}
          >
            {mode === 'RESET' ? <RotateCcw className="w-5 h-5" /> : <Pencil className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="text-sm font-black text-white flex items-center gap-2 flex-wrap">
              <span>{mode === 'RESET' ? 'تصفير رصيد الخزنة' : 'تعديل رصيد الخزنة'}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-gold-500/15 text-gold-400 border border-gold-500/30">
                للأدمن فقط 👑
              </span>
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              تصحيح أو تصفير أرصدة الخزنة الخاصة وقسم الإيجار وقسم الجمعية عند وجود خطأ
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
            {/* Safe / Box Selector */}
            <div>
              <label className="block text-[11px] font-bold text-gray-400 mb-1.5">اختر الخزنة / القسم:</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleChangeSafe('PRIVATE_SAFE')}
                  className={`py-2.5 px-2 rounded-xl text-[11px] font-black border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    safeType === 'PRIVATE_SAFE'
                      ? 'bg-gold-500/20 border-gold-500 text-gold-300 shadow'
                      : 'bg-black/40 border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>الخزنة الخاصة</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleChangeSafe('RENT_BOX')}
                  className={`py-2.5 px-2 rounded-xl text-[11px] font-black border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    safeType === 'RENT_BOX'
                      ? 'bg-sky-600/25 border-sky-500 text-sky-300 shadow'
                      : 'bg-black/40 border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  <Home className="w-3.5 h-3.5 shrink-0" />
                  <span>قسم الإيجار</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleChangeSafe('GAMIA_BOX')}
                  className={`py-2.5 px-2 rounded-xl text-[11px] font-black border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    safeType === 'GAMIA_BOX'
                      ? 'bg-purple-600/25 border-purple-500 text-purple-300 shadow'
                      : 'bg-black/40 border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  <span>قسم الجمعية</span>
                </button>
              </div>
            </div>

            {/* Mode Switcher */}
            <div className="grid grid-cols-2 gap-2 bg-black/50 p-1 rounded-xl border border-gray-800">
              <button
                type="button"
                onClick={() => handleChangeMode('ADJUST')}
                className={`py-2 rounded-lg text-[11px] font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  mode === 'ADJUST'
                    ? 'bg-gold-600 text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>تعديل الرصيد يدوياً</span>
              </button>
              <button
                type="button"
                onClick={() => handleChangeMode('RESET')}
                className={`py-2 rounded-lg text-[11px] font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  mode === 'RESET'
                    ? 'bg-red-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>تصفير إلى 0 ج.م</span>
              </button>
            </div>

            {/* New Balance Input (in ADJUST mode) */}
            {mode === 'ADJUST' && (
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1.5">
                  الرصيد الجديد الصحيح لـ{safeLabel} (ج.م) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  required
                  value={newBalanceInput}
                  onChange={(e) => setNewBalanceInput(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-[#141416] border border-gray-700 focus:border-gold-500 text-gold-400 rounded-xl py-2.5 px-3 text-lg font-black text-center font-mono focus:outline-none"
                />
              </div>
            )}

            {/* Live Balance Summary */}
            <div className="bg-black/60 border border-gray-800 rounded-2xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 font-bold">الرصيد الحالي في {safeLabel}:</span>
                <span className="font-mono font-black text-white">
                  {currentSafeBalance.toLocaleString('ar-EG')} ج.م
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-gray-900 pt-2">
                <span className="text-gray-400 font-bold">مقدار التعديل (الفرق):</span>
                <span
                  className={`font-mono font-black ${
                    delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-gray-400'
                  }`}
                >
                  {delta > 0 ? `+${delta.toLocaleString('ar-EG')}` : delta.toLocaleString('ar-EG')} ج.م
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-gray-900 pt-2">
                <span className="text-emerald-400 font-bold">الرصيد الجديد بعد الحفظ:</span>
                <span className="font-mono font-black text-emerald-400 text-sm flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {parsedTargetBalance.toLocaleString('ar-EG')} ج.م
                </span>
              </div>
            </div>

            {/* Info Banner */}
            <div className="bg-amber-950/25 border border-amber-500/30 rounded-2xl p-3 text-[11px] text-amber-200/90 leading-relaxed flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                يتم تسجيل حركة تسوية موثقة في سجل حركات الخزن وسجل المراقبة (Audit Log) مع الحفاظ على تاريخ الحركات السابقة بالكامل.
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
                سبب التعديل / التصفير *
              </label>
              <input
                type="text"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="مثال: تصحيح مبلغ مُدخل بالخطأ..."
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
                  value={credential}
                  onChange={(e) => setCredential(e.target.value)}
                  placeholder={hasSecPass ? 'أدخل Admin Security Password...' : '••••'}
                  className="w-full bg-[#141416] border border-gray-800 focus:border-gold-500 text-white rounded-xl py-2.5 pr-4 pl-10 text-xs font-mono font-bold focus:outline-none text-right"
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
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="submit"
                disabled={loading}
                className={`py-3 font-black text-xs rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95 ${
                  mode === 'RESET'
                    ? 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white'
                    : 'bg-gradient-to-r from-gold-600 to-amber-500 hover:from-gold-500 hover:to-amber-400 text-black'
                }`}
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : mode === 'RESET' ? (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>تأكيد تصفير الخزنة</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>حفظ الرصيد الجديد</span>
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
