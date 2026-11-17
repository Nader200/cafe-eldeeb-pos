import React, { useState, useEffect } from 'react';
import {
  RotateCcw,
  Pencil,
  Trash2,
  ShieldAlert,
  Lock,
  Eye,
  EyeOff,
  X,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { dbService } from '../dbService';
import { isAdminSecurityPasswordSet } from '../lib/securityService';
import { useAuth } from '../contexts/AuthContext';
import { DailyShortage, ShortageTargetAccount } from '../types';

export type ShortageModalMode = 'TOTAL_ADJUST' | 'TOTAL_RESET' | 'RECORD_EDIT' | 'RECORD_DELETE';

interface AdjustShortageModalProps {
  isOpen: boolean;
  initialMode: ShortageModalMode;
  targetRecord?: DailyShortage | null;
  onClose: () => void;
  onSuccess?: () => void;
  onShowSuccessAlert?: (msg: string) => void;
  onShowWarningAlert?: (msg: string) => void;
}

export default function AdjustShortageModal({
  isOpen,
  initialMode,
  targetRecord = null,
  onClose,
  onSuccess,
  onShowSuccessAlert,
  onShowWarningAlert
}: AdjustShortageModalProps) {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'Admin';
  const hasSecPass = isAdminSecurityPasswordSet();

  const [mode, setMode] = useState<ShortageModalMode>(initialMode);
  const [amountInput, setAmountInput] = useState<string>('0');
  const [expectedInput, setExpectedInput] = useState<string>('0');
  const [actualInput, setActualInput] = useState<string>('0');
  const [targetAccount, setTargetAccount] = useState<ShortageTargetAccount>('PRIVATE_SAFE');
  const [reason, setReason] = useState<string>('');
  const [credential, setCredential] = useState<string>('');
  const [showCred, setShowCred] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const currentTotalPending = isOpen ? dbService.getTotalPendingShortage() : 0;

  useEffect(() => {
    if (!isOpen) return;
    setMode(initialMode);
    setCredential('');
    setErrorMsg(null);
    setLoading(false);

    if (targetRecord && (initialMode === 'RECORD_EDIT' || initialMode === 'RECORD_DELETE')) {
      setAmountInput(String(targetRecord.shortage_amount));
      setExpectedInput(String(targetRecord.expected_amount));
      setActualInput(String(targetRecord.actual_amount));
      setTargetAccount(targetRecord.target_account || 'PRIVATE_SAFE');
      setReason(
        initialMode === 'RECORD_DELETE'
          ? 'حذف سجل عجز مكرر أو مدخل بالخطأ'
          : 'تعديل مبلغ العجز لتصحيح خطأ حسابي'
      );
    } else {
      setAmountInput(initialMode === 'TOTAL_RESET' ? '0' : String(dbService.getTotalPendingShortage()));
      setReason(
        initialMode === 'TOTAL_RESET'
          ? 'تصفير خانة العجز لتصحيح خطأ حسابي'
          : 'تعديل إجمالي العجز لتصحيح خطأ حسابي أو تكرار'
      );
    }
  }, [isOpen, initialMode, targetRecord]);

  if (!isOpen) return null;

  const isRecordMode = Boolean(targetRecord && (mode === 'RECORD_EDIT' || mode === 'RECORD_DELETE'));
  const currentBaseValue = isRecordMode
    ? Number(targetRecord?.shortage_amount || 0)
    : currentTotalPending;

  const parsedTargetValue =
    mode === 'TOTAL_RESET' || mode === 'RECORD_DELETE'
      ? 0
      : Math.round((parseFloat(amountInput) || 0) * 100) / 100;

  const delta = Math.round((parsedTargetValue - currentBaseValue) * 100) / 100;

  const switchTotalMode = (next: 'TOTAL_ADJUST' | 'TOTAL_RESET') => {
    setMode(next);
    setErrorMsg(null);
    if (next === 'TOTAL_RESET') {
      setAmountInput('0');
      setReason('تصفير خانة العجز لتصحيح خطأ حسابي');
    } else {
      setAmountInput(String(currentTotalPending));
      setReason('تعديل إجمالي العجز لتصحيح خطأ حسابي أو تكرار');
    }
  };

  const switchRecordMode = (next: 'RECORD_EDIT' | 'RECORD_DELETE') => {
    setMode(next);
    setErrorMsg(null);
    if (next === 'RECORD_DELETE') {
      setReason('حذف سجل عجز مكرر أو مدخل بالخطأ');
    } else if (targetRecord) {
      setAmountInput(String(targetRecord.shortage_amount));
      setReason('تعديل مبلغ العجز لتصحيح خطأ حسابي');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!isAdmin) {
      const msg = 'عذراً! تعديل أو تصفير العجز متاح للأدمن فقط.';
      setErrorMsg(msg);
      onShowWarningAlert?.(msg);
      return;
    }

    if (mode === 'TOTAL_ADJUST') {
      const raw = parseFloat(amountInput);
      if (amountInput.trim() === '' || isNaN(raw) || raw < 0) {
        setErrorMsg('يرجى إدخال قيمة عجز صحيحة (0 أو أكبر).');
        return;
      }
    }

    if (mode === 'RECORD_EDIT') {
      const raw = parseFloat(amountInput);
      if (amountInput.trim() === '' || isNaN(raw) || raw <= 0) {
        setErrorMsg('يرجى إدخال قيمة عجز صحيحة أكبر من صفر (أو اختر حذف السجل).');
        return;
      }
    }

    if (!reason.trim()) {
      setErrorMsg('يرجى كتابة سبب التعديل أو الحذف للتوثيق في سجل المراقبة.');
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

    const opName = currentUser?.name || 'أدمن النظام';
    setLoading(true);
    try {
      if (mode === 'RECORD_DELETE' && targetRecord) {
        await dbService.deleteShortageRecordAdmin(
          targetRecord.id,
          credential.trim(),
          reason.trim(),
          opName
        );
        onShowSuccessAlert?.(
          `تم حذف سجل العجز (${targetRecord.shortage_amount.toLocaleString('ar-EG')} ج.م) بنجاح ✅`
        );
      } else if (mode === 'RECORD_EDIT' && targetRecord) {
        const expVal = parseFloat(expectedInput);
        const actVal = parseFloat(actualInput);
        const updated = await dbService.updateShortageRecordAdmin(
          targetRecord.id,
          {
            newShortageAmount: parsedTargetValue,
            expectedAmount: !isNaN(expVal) && expVal >= 0 ? expVal : undefined,
            actualAmount: !isNaN(actVal) && actVal >= 0 ? actVal : undefined,
            targetAccount,
            notes: reason.trim()
          },
          credential.trim(),
          opName
        );
        onShowSuccessAlert?.(
          `تم تعديل سجل العجز إلى ${updated.shortage_amount.toLocaleString('ar-EG')} ج.م بنجاح ✅`
        );
      } else {
        const res = await dbService.adjustTotalPendingShortageAdmin(
          parsedTargetValue,
          credential.trim(),
          reason.trim(),
          opName,
          mode === 'TOTAL_RESET' ? 'RESET' : 'ADJUST'
        );
        onShowSuccessAlert?.(
          mode === 'TOTAL_RESET'
            ? `تم تصفير خانة العجز إلى 0 ج.م بنجاح ✅ (السابق: ${res.previousTotal.toLocaleString('ar-EG')} ج.م)`
            : `تم تعديل إجمالي مبلغ العجز إلى ${res.newTotal.toLocaleString('ar-EG')} ج.م بنجاح ✅`
        );
      }

      setLoading(false);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setLoading(false);
      const msg = err?.message || 'حدث خطأ أثناء تعديل خانة العجز';
      setErrorMsg(msg);
      onShowWarningAlert?.(msg);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/85 backdrop-blur-md z-[70] flex items-center justify-center p-4 animate-fade-in overflow-y-auto"
      dir="rtl"
    >
      <div className="w-full max-w-md bg-[#0a0a0c] border-2 border-red-500/45 rounded-3xl p-5 sm:p-6 shadow-[0_0_50px_rgba(239,68,68,0.2)] relative my-auto">
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
              mode === 'TOTAL_RESET' || mode === 'RECORD_DELETE'
                ? 'bg-red-950/70 border-red-500/50 text-red-400'
                : 'bg-amber-500/15 border-amber-500/40 text-amber-400'
            }`}
          >
            {mode === 'RECORD_DELETE' ? (
              <Trash2 className="w-5 h-5" />
            ) : mode === 'TOTAL_RESET' ? (
              <RotateCcw className="w-5 h-5" />
            ) : (
              <Pencil className="w-5 h-5" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-black text-white flex items-center gap-2 flex-wrap">
              <span>
                {mode === 'RECORD_DELETE'
                  ? 'حذف سجل عجز مكرر / خاطئ'
                  : mode === 'RECORD_EDIT'
                    ? 'تعديل سجل عجز محدد'
                    : mode === 'TOTAL_RESET'
                      ? 'تصفير إجمالي خانة العجز'
                      : 'تعديل إجمالي مبلغ العجز'}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-gold-500/15 text-gold-400 border border-gold-500/30">
                للأدمن فقط 👑
              </span>
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {isRecordMode
                ? `تاريخ السجل: ${targetRecord?.business_date} | المسؤول: ${targetRecord?.cashier_name}`
                : 'تصحيح أو تصفير حساب العجز في حالة التكرار أو الخطأ الحسابي'}
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
            {/* Mode Switcher */}
            {isRecordMode ? (
              <div className="grid grid-cols-2 gap-2 bg-black/50 p-1 rounded-xl border border-gray-800">
                <button
                  type="button"
                  onClick={() => switchRecordMode('RECORD_EDIT')}
                  className={`py-2 rounded-lg text-[11px] font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    mode === 'RECORD_EDIT' ? 'bg-amber-500 text-black' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>تعديل القيمة</span>
                </button>
                <button
                  type="button"
                  onClick={() => switchRecordMode('RECORD_DELETE')}
                  className={`py-2 rounded-lg text-[11px] font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    mode === 'RECORD_DELETE' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف السجل نهائياً</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 bg-black/50 p-1 rounded-xl border border-gray-800">
                <button
                  type="button"
                  onClick={() => switchTotalMode('TOTAL_ADJUST')}
                  className={`py-2 rounded-lg text-[11px] font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    mode === 'TOTAL_ADJUST' ? 'bg-amber-500 text-black' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>تعديل إجمالي العجز</span>
                </button>
                <button
                  type="button"
                  onClick={() => switchTotalMode('TOTAL_RESET')}
                  className={`py-2 rounded-lg text-[11px] font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    mode === 'TOTAL_RESET' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>تصفير إلى 0 ج.م</span>
                </button>
              </div>
            )}

            {/* Amount Inputs */}
            {(mode === 'TOTAL_ADJUST' || mode === 'RECORD_EDIT') && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">
                    {mode === 'RECORD_EDIT' ? 'قيمة العجز الصحيحة لهذا السجل (ج.م) *' : 'إجمالي مبلغ العجز الصحيح (ج.م) *'}
                  </label>
                  <input
                    type="number"
                    min={mode === 'RECORD_EDIT' ? Math.max(0.5, Number(targetRecord?.paid_amount || 0)) : 0}
                    step="0.5"
                    required
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-[#141416] border border-gray-700 focus:border-amber-500 text-amber-400 rounded-xl py-2.5 px-3 text-lg font-black text-center font-mono focus:outline-none"
                  />
                </div>

                {mode === 'RECORD_EDIT' && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-400 mb-1">المتوقع (ج.م)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={expectedInput}
                        onChange={(e) => setExpectedInput(e.target.value)}
                        className="w-full bg-[#141416] border border-gray-800 focus:border-amber-500 text-white rounded-xl py-2 px-2.5 text-xs font-mono font-bold text-center focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-400 mb-1">الفعلي (ج.م)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={actualInput}
                        onChange={(e) => setActualInput(e.target.value)}
                        className="w-full bg-[#141416] border border-gray-800 focus:border-amber-500 text-white rounded-xl py-2 px-2.5 text-xs font-mono font-bold text-center focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Live Comparison Card */}
            <div className="bg-black/60 border border-gray-800 rounded-2xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 font-bold">
                  {isRecordMode ? 'قيمة السجل الحالية:' : 'إجمالي العجز المعلق حالياً:'}
                </span>
                <span className="font-mono font-black text-red-400">
                  {currentBaseValue.toLocaleString('ar-EG')} ج.م
                </span>
              </div>
              {isRecordMode && Number(targetRecord?.paid_amount || 0) > 0 && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-400">المسدد سابقاً من السجل:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {Number(targetRecord?.paid_amount || 0).toLocaleString('ar-EG')} ج.م
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-gray-900 pt-2">
                <span className="text-gray-400 font-bold">الفرق بعد التعديل:</span>
                <span
                  className={`font-mono font-black ${
                    delta < 0 ? 'text-emerald-400' : delta > 0 ? 'text-red-400' : 'text-gray-400'
                  }`}
                >
                  {delta > 0 ? `+${delta.toLocaleString('ar-EG')}` : delta.toLocaleString('ar-EG')} ج.م
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-gray-900 pt-2">
                <span className="text-emerald-400 font-bold">
                  {mode === 'RECORD_DELETE' ? 'حالة السجل بعد التنفيذ:' : 'القيمة الجديدة بعد الحفظ:'}
                </span>
                <span className="font-mono font-black text-emerald-400 text-sm flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {mode === 'RECORD_DELETE'
                    ? 'محذوف نهائياً'
                    : `${parsedTargetValue.toLocaleString('ar-EG')} ج.م`}
                </span>
              </div>
            </div>

            {mode === 'RECORD_DELETE' && (
              <div className="bg-red-950/35 border border-red-500/40 rounded-2xl p-3 text-[11px] text-red-200 leading-relaxed flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>
                  سيتم حذف هذا السجل نهائياً ومزامنة الحذف سحابياً لإزالة التكرار وتصحيح إجمالي خانة العجز فوراً.
                </span>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 bg-red-950/80 border border-red-800 rounded-xl text-red-200 text-xs font-bold flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="block text-xs font-bold text-gray-300 mb-1.5">
                سبب التعديل / الحذف *
              </label>
              <input
                type="text"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="مثال: حذف عجز مكرر مرتين..."
                className="w-full bg-[#141416] border border-gray-800 focus:border-amber-500 text-white rounded-xl py-2.5 px-3 text-xs font-bold focus:outline-none text-right"
              />
            </div>

            {/* Admin Credential */}
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
                  className="w-full bg-[#141416] border border-gray-800 focus:border-amber-500 text-white rounded-xl py-2.5 pr-4 pl-10 text-xs font-mono font-bold focus:outline-none text-right"
                />
                <button
                  type="button"
                  onClick={() => setShowCred(!showCred)}
                  className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 hover:text-amber-400 cursor-pointer"
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
                  mode === 'TOTAL_RESET' || mode === 'RECORD_DELETE'
                    ? 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white'
                    : 'bg-gradient-to-r from-amber-500 to-gold-500 hover:from-amber-400 hover:to-gold-400 text-black'
                }`}
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : mode === 'RECORD_DELETE' ? (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>تأكيد الحذف</span>
                  </>
                ) : mode === 'TOTAL_RESET' ? (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>تأكيد التصفير (0)</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>حفظ التعديل</span>
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
