import React, { useState, useEffect } from 'react';
import {
  Sun,
  Moon,
  ShieldAlert,
  ArrowLeftRight,
  CheckCircle2,
  DollarSign,
  Lock,
  X,
  AlertTriangle,
  History,
  Receipt,
  TrendingUp,
  TrendingDown,
  KeyRound,
  Eye,
  EyeOff,
  Clock
} from 'lucide-react';
import { Shift, ShiftType } from '../types';
import { dbService } from '../dbService';

interface ShiftHandoverModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeShift: Shift | null;
  onShiftUpdated: () => void;
  cashierName?: string;
}

export default function ShiftHandoverModal({
  isOpen,
  onClose,
  activeShift,
  onShiftUpdated,
  cashierName = 'الكاشير'
}: ShiftHandoverModalProps) {
  // Common states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Start Shift State
  const [startType, setStartType] = useState<ShiftType>('DAY');
  const [startOpeningBalance, setStartOpeningBalance] = useState<number>(0);

  // Deliver / Handover State (Cashier)
  const [declaredCash, setDeclaredCash] = useState<string>('');
  const [adminSecurityPassword, setAdminSecurityPassword] = useState<string>('');
  const [showSecPassword, setShowSecPassword] = useState<boolean>(false);

  // Receive State (Admin)
  const [actualReceivedCash, setActualReceivedCash] = useState<string>('');
  const [discrepancyReason, setDiscrepancyReason] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setSuccessMsg(null);
      setDeclaredCash('');
      setAdminSecurityPassword('');
      setActualReceivedCash('');
      setDiscrepancyReason('');

      if (activeShift) {
        // Recalculate metrics for accurate real-time values
        const currentWithMetrics = dbService.calculateShiftMetrics(activeShift);
        setDeclaredCash(String(currentWithMetrics.expected_cash));
        setActualReceivedCash(String(currentWithMetrics.declared_cash ?? currentWithMetrics.expected_cash));
      } else {
        const lastDrawer = dbService.getActiveDrawer();
        setStartOpeningBalance(lastDrawer?.opening_balance || 0);
      }
    }
  }, [isOpen, activeShift]);

  if (!isOpen) return null;

  const currentMetrics = activeShift ? dbService.calculateShiftMetrics(activeShift) : null;

  // Handler 1: Start New Shift
  const handleStartShift = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      dbService.startShift(startType, Number(startOpeningBalance) || 0, cashierName);
      setLoading(false);
      setSuccessMsg('تم بدء الوردية الجديدة بنجاح! 🚀');
      setTimeout(() => {
        onShiftUpdated();
        onClose();
      }, 1000);
    } catch (err: any) {
      setLoading(false);
      setErrorMsg(err.message || 'حدث خطأ أثناء فتح الوردية');
    }
  };

  // Handler 2: Submit Shift for Handover (Cashier + Admin Sec Password)
  const handleSubmitForHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;

    setErrorMsg(null);
    const numericDeclared = parseFloat(declaredCash);
    if (isNaN(numericDeclared) || numericDeclared < 0) {
      setErrorMsg('يرجى إدخال المبلغ الفعلي بالدرج بشكل صحيح');
      return;
    }

    if (!adminSecurityPassword.trim()) {
      setErrorMsg('يرجى إدخال كلمة مرور حماية الشاشات الحساسة للإغلاق والتأكيد الإداري');
      return;
    }

    setLoading(true);
    try {
      await dbService.submitShiftForHandover(
        activeShift.id,
        numericDeclared,
        adminSecurityPassword.trim(),
        cashierName
      );
      setLoading(false);
      setSuccessMsg('تم تسليم الوردية وإرسالها للأدمن للاستلام والتأكيد ⏳');
      setTimeout(() => {
        onShiftUpdated();
        onClose();
      }, 1200);
    } catch (err: any) {
      setLoading(false);
      setErrorMsg(err.message || 'حدث خطأ أثناء إغلاق الوردية');
    }
  };

  // Handler 3: Complete Shift Handover (Admin)
  const handleCompleteHandover = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;

    setErrorMsg(null);
    const numericActual = parseFloat(actualReceivedCash);
    if (isNaN(numericActual) || numericActual < 0) {
      setErrorMsg('يرجى إدخال المبلغ الفعلي المستلم بيدك');
      return;
    }

    const expected = currentMetrics?.expected_cash || 0;
    const diff = Math.round((numericActual - expected) * 100) / 100;

    if (diff !== 0 && (!discrepancyReason || !discrepancyReason.trim())) {
      setErrorMsg(`يوجد فرق قدره ${Math.abs(diff)} ج.م (${diff > 0 ? 'زيادة' : 'عجز'}). يجب كتابة السبب للتأكيد!`);
      return;
    }

    setLoading(true);
    try {
      dbService.completeShiftAndHandover(
        activeShift.id,
        numericActual,
        discrepancyReason.trim(),
        cashierName || 'أدمن النظام'
      );
      setLoading(false);
      setSuccessMsg('تم استلام الوردية بنجاح وبدء الوردية التالية تلقائيًا 🎉');
      setTimeout(() => {
        onShiftUpdated();
        onClose();
      }, 1200);
    } catch (err: any) {
      setLoading(false);
      setErrorMsg(err.message || 'حدث خطأ أثناء استلام الوردية');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in" dir="rtl">
      <div className="w-full max-w-xl bg-[#0e0e0e] border border-gold-500/30 rounded-3xl p-6 shadow-[0_0_50px_rgba(212,175,55,0.15)] relative overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gold-500/20 to-amber-500/10 border border-gold-500/40 flex items-center justify-center shadow-inner">
              <ArrowLeftRight className="w-6 h-6 text-gold-400" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                نظام تسليم وتسلم الورديات
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-gold-500/10 text-gold-400 border border-gold-500/30">
                  Shift Handover
                </span>
              </h2>
              <p className="text-xs text-gray-400 font-bold">
                إدارة وروديتَي النهار والمساء بدقة وتدقيق مالي موثوق
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white rounded-xl hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notifications */}
        {errorMsg && (
          <div className="mb-4 p-3 bg-red-950/80 border border-red-800/80 rounded-2xl text-red-200 text-xs font-bold flex items-center gap-2 animate-shake">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-950/80 border border-emerald-800/80 rounded-2xl text-emerald-200 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Scenario 1: NO ACTIVE SHIFT -> START NEW SHIFT */}
        {!activeShift && (
          <form onSubmit={handleStartShift} className="space-y-5">
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4">
              <label className="block text-xs font-bold text-gray-300 mb-3">اختر الوردية المراد فتحها:</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setStartType('DAY')}
                  className={`p-4 rounded-2xl border flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                    startType === 'DAY'
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                      : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-700'
                  }`}
                >
                  <Sun className="w-7 h-7 text-amber-400" />
                  <span className="text-sm font-black">☀️ وردية النهار (الكاشير)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStartType('NIGHT')}
                  className={`p-4 rounded-2xl border flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                    startType === 'NIGHT'
                      ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.2)]'
                      : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-700'
                  }`}
                >
                  <Moon className="w-7 h-7 text-indigo-400" />
                  <span className="text-sm font-black">🌙 وردية المساء (الأدمن)</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gold-400 mb-1.5">
                الرصيد الافتتاحي للدرج عند بدء الوردية (ج.م):
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  required
                  value={startOpeningBalance}
                  onChange={(e) => setStartOpeningBalance(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full bg-[#141414] border border-gray-800 focus:border-gold-500 text-white rounded-2xl py-3 px-4 text-base font-black text-center font-mono focus:outline-none"
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-500">ج.م</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-gold-600 via-amber-500 to-gold-500 hover:from-gold-500 hover:to-gold-400 text-black font-black text-sm rounded-2xl shadow-[0_0_20px_rgba(212,175,55,0.3)] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span>تأكيد وبدء الوردية الآن</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Scenario 2: ACTIVE SHIFT IS OPEN -> CASHIER HANDOVER / DELIVER */}
        {activeShift && activeShift.status === 'OPEN' && currentMetrics && (
          <form onSubmit={handleSubmitForHandover} className="space-y-4">
            {/* Shift Banner & Summary Stats */}
            <div className="bg-gray-900/70 border border-gray-800 rounded-2xl p-4">
              <div className="flex items-center justify-between pb-3 border-b border-gray-800/80 mb-3">
                <div className="flex items-center gap-2">
                  {currentMetrics.shift_type === 'DAY' ? (
                    <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-black flex items-center gap-1.5">
                      <Sun className="w-4 h-4" /> ☀️ وردية النهار (الكاشير)
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 text-xs font-black flex items-center gap-1.5">
                      <Moon className="w-4 h-4" /> 🌙 وردية المساء (الأدمن)
                    </span>
                  )}
                  <span className="text-xs text-gray-400 font-bold flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-gray-500" />
                    بدأت: {new Date(currentMetrics.started_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <span className="text-xs font-bold text-gray-400">
                  المسؤول: <strong className="text-white">{currentMetrics.cashier_name}</strong>
                </span>
              </div>

              {/* Financial Metrics Grid */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-black/40 p-2.5 rounded-xl border border-gray-800">
                  <span className="block text-[10px] font-bold text-gray-400">الافتتاحي</span>
                  <span className="text-xs font-black text-amber-400 font-mono">{currentMetrics.opening_balance} ج.م</span>
                </div>
                <div className="bg-black/40 p-2.5 rounded-xl border border-gray-800">
                  <span className="block text-[10px] font-bold text-emerald-400 flex items-center justify-center gap-0.5">
                    <TrendingUp className="w-3 h-3" /> مبيعات
                  </span>
                  <span className="text-xs font-black text-emerald-400 font-mono">+{currentMetrics.cash_in} ج.م</span>
                </div>
                <div className="bg-black/40 p-2.5 rounded-xl border border-gray-800">
                  <span className="block text-[10px] font-bold text-rose-400 flex items-center justify-center gap-0.5">
                    <TrendingDown className="w-3 h-3" /> مصروفات
                  </span>
                  <span className="text-xs font-black text-rose-400 font-mono">-{currentMetrics.cash_out} ج.م</span>
                </div>
                <div className="bg-black/60 p-2.5 rounded-xl border border-gold-500/40">
                  <span className="block text-[10px] font-bold text-gold-400">المتوقع بالدرج</span>
                  <span className="text-xs font-black text-gold-300 font-mono">{currentMetrics.expected_cash} ج.م</span>
                </div>
              </div>
            </div>

            {/* Declared Cash Input */}
            <div>
              <label className="block text-xs font-bold text-white mb-1.5">
                العد الفعلي الموجود في الدرج الآن (ج.م):
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  required
                  value={declaredCash}
                  onChange={(e) => setDeclaredCash(e.target.value)}
                  placeholder="أدخل المبلغ بعد العد اليدوي..."
                  className="w-full bg-[#141414] border border-gray-800 focus:border-gold-500 text-white rounded-2xl py-3 px-4 text-base font-black text-center font-mono focus:outline-none"
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-500">ج.م</span>
              </div>
              {declaredCash !== '' && !isNaN(parseFloat(declaredCash)) && (
                <div className="mt-2 text-center text-xs font-bold">
                  {parseFloat(declaredCash) - currentMetrics.expected_cash === 0 ? (
                    <span className="text-emerald-400">العد الفعلي مطابق تمامًا للمتوقع (لا يوجد عجز أو زيادة)</span>
                  ) : parseFloat(declaredCash) - currentMetrics.expected_cash > 0 ? (
                    <span className="text-emerald-300">
                      توجد زيادة في الدرج بقيمة +{parseFloat(declaredCash) - currentMetrics.expected_cash} ج.م
                    </span>
                  ) : (
                    <span className="text-rose-400">
                      يوجد عجز بالدرج بقيمة {parseFloat(declaredCash) - currentMetrics.expected_cash} ج.م
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Admin Security Password Requirement */}
            <div className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-4">
              <label className="block text-xs font-bold text-amber-300 mb-1.5 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                تأكيد التوثيق الإداري (Admin Security Password):
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-gold-500/70">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showSecPassword ? 'text' : 'password'}
                  required
                  value={adminSecurityPassword}
                  onChange={(e) => setAdminSecurityPassword(e.target.value)}
                  placeholder="أدخل كلمة مرور الشاشات الحساسة للتأكيد..."
                  className="w-full bg-[#141414] border border-gray-800 focus:border-amber-500 text-white placeholder-gray-600 rounded-xl py-2.5 pr-10 pl-10 text-xs font-bold focus:outline-none font-mono text-right"
                />
                <button
                  type="button"
                  onClick={() => setShowSecPassword(!showSecPassword)}
                  className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 hover:text-amber-400 cursor-pointer"
                >
                  {showSecPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-gray-400 font-bold mt-1.5">
                * ملاحظة: لا تقبل كلمة مرور تسجيل الدخول العادية، يلزم استخدام Admin Security Password المستقلة.
              </p>
            </div>

            {/* Submit Action */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-amber-600 via-gold-500 to-amber-500 hover:from-amber-500 hover:to-gold-400 text-black font-black text-xs rounded-2xl shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>تسليم الوردية وإرسالها للأدمن للاستلام</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Scenario 3: ACTIVE SHIFT IS PENDING_HANDOVER -> ADMIN RECEIVE & COMPLETE */}
        {activeShift && activeShift.status === 'PENDING_HANDOVER' && currentMetrics && (
          <form onSubmit={handleCompleteHandover} className="space-y-4">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
              <div className="flex items-center justify-between pb-2 border-b border-amber-500/20 mb-3">
                <span className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
                  وردية معلقة بانتظار استلام الأدمن ⏳
                </span>
                <span className="text-[11px] font-bold text-gray-400">
                  الكاشير المسلّم: <strong className="text-white">{currentMetrics.cashier_name}</strong>
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center my-3">
                <div className="bg-black/40 p-2 rounded-xl border border-gray-800">
                  <span className="block text-[10px] font-bold text-gray-400">المتوقع بالحسابات</span>
                  <span className="text-xs font-black text-gold-400 font-mono">{currentMetrics.expected_cash} ج.م</span>
                </div>
                <div className="bg-black/40 p-2 rounded-xl border border-gray-800">
                  <span className="block text-[10px] font-bold text-gray-400">المسلّم من الكاشير</span>
                  <span className="text-xs font-black text-amber-300 font-mono">{currentMetrics.declared_cash} ج.م</span>
                </div>
                <div className="bg-black/40 p-2 rounded-xl border border-gray-800">
                  <span className="block text-[10px] font-bold text-gray-400">فرق الكاشير</span>
                  <span className={`text-xs font-black font-mono ${
                    (currentMetrics.discrepancy || 0) === 0 ? 'text-emerald-400' : (currentMetrics.discrepancy || 0) > 0 ? 'text-emerald-300' : 'text-rose-400'
                  }`}>
                    {currentMetrics.discrepancy || 0} ج.م
                  </span>
                </div>
              </div>
            </div>

            {/* Actual Received Input */}
            <div>
              <label className="block text-xs font-bold text-emerald-400 mb-1.5">
                المبلغ الفعلي المقبوض في يدك الآن (ج.م):
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  required
                  value={actualReceivedCash}
                  onChange={(e) => setActualReceivedCash(e.target.value)}
                  placeholder="أدخل المبلغ المقبوض فعلًا..."
                  className="w-full bg-[#141414] border border-gray-800 focus:border-emerald-500 text-white rounded-2xl py-3 px-4 text-base font-black text-center font-mono focus:outline-none"
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-500">ج.م</span>
              </div>
            </div>

            {/* Discrepancy Reason Input if needed */}
            {actualReceivedCash !== '' && !isNaN(parseFloat(actualReceivedCash)) && parseFloat(actualReceivedCash) !== currentMetrics.expected_cash && (
              <div className="bg-rose-950/30 border border-rose-800/60 rounded-2xl p-3.5 space-y-2">
                <div className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>
                    تنبيه: يوجد فرق قدره {Math.abs(parseFloat(actualReceivedCash) - currentMetrics.expected_cash)} ج.م ({parseFloat(actualReceivedCash) - currentMetrics.expected_cash > 0 ? 'زيادة' : 'عجز'}).
                  </span>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-300 mb-1">
                    سبب الفرق (إجباري للتأكيد وحفظ السجل):
                  </label>
                  <textarea
                    required
                    value={discrepancyReason}
                    onChange={(e) => setDiscrepancyReason(e.target.value)}
                    placeholder="اكتب سبب العجز أو الزيادة هنا..."
                    className="w-full bg-[#121212] border border-gray-800 focus:border-rose-500 text-white rounded-xl p-2.5 text-xs font-bold focus:outline-none"
                    rows={2}
                  />
                </div>
              </div>
            )}

            {/* Complete Action */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-black font-black text-xs rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span>تأكيد استلام الوردية وبدء الوردية التالية تلقائيًا</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
