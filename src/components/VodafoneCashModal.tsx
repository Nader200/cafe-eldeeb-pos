/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useEffect } from 'react';
import { X, Smartphone, Receipt, CreditCard, Wallet, RotateCcw, SlidersHorizontal, CheckCircle2, AlertCircle } from 'lucide-react';
import { dbService } from '../dbService';
import { VodafoneCashBreakdownItem } from '../types';

interface VodafoneCashModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  operatorName: string;
  currency?: string;
  onAdjusted?: () => void;
}

const CATEGORY_META: Record<VodafoneCashBreakdownItem['category'], { label: string; colorClass: string; icon: React.ReactNode }> = {
  INVOICE: {
    label: 'فاتورة مبيعات',
    colorClass: 'bg-fuchsia-950/60 text-fuchsia-300 border-fuchsia-700/50',
    icon: <Receipt className="w-3.5 h-3.5" />
  },
  CREDIT_PAYMENT: {
    label: 'سداد آجل',
    colorClass: 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50',
    icon: <CreditCard className="w-3.5 h-3.5" />
  },
  WALLET_DEPOSIT: {
    label: 'إيداع محفظة عميل',
    colorClass: 'bg-sky-950/60 text-sky-300 border-sky-700/50',
    icon: <Wallet className="w-3.5 h-3.5" />
  },
  RETURN_REFUND: {
    label: 'مرتجع',
    colorClass: 'bg-red-950/60 text-red-300 border-red-700/50',
    icon: <RotateCcw className="w-3.5 h-3.5" />
  },
  ADJUSTMENT: {
    label: 'تسوية يدوية',
    colorClass: 'bg-amber-950/60 text-amber-300 border-amber-700/50',
    icon: <SlidersHorizontal className="w-3.5 h-3.5" />
  }
};

export default function VodafoneCashModal({
  isOpen,
  onClose,
  isAdmin,
  operatorName,
  currency = 'ج.م',
  onAdjusted
}: VodafoneCashModalProps) {
  const [refreshTick, setRefreshTick] = useState(0);
  const [adjustMode, setAdjustMode] = useState<'TARGET' | 'DELTA_SUB' | 'DELTA_ADD'>('TARGET');
  const [amountInput, setAmountInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const breakdown = useMemo(() => {
    if (!isOpen) return { items: [], total: 0, shiftStart: null };
    return dbService.getShiftVodafoneCashBreakdown();
  }, [isOpen, refreshTick]);

  useEffect(() => {
    if (isOpen) {
      setFeedback(null);
      setReasonInput('');
      setAmountInput(String(breakdown.total));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const parsedNum = parseFloat(amountInput);
  const isValidNumber = !isNaN(parsedNum) && parsedNum >= 0;

  const computedDelta = (() => {
    if (!isValidNumber) return 0;
    if (adjustMode === 'TARGET') return Math.round((parsedNum - breakdown.total) * 100) / 100;
    if (adjustMode === 'DELTA_SUB') return -Math.round(parsedNum * 100) / 100;
    return Math.round(parsedNum * 100) / 100;
  })();

  const projectedNewBalance = Math.max(0, Math.round((breakdown.total + computedDelta) * 100) / 100);

  const handleApplyAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!isValidNumber) {
      setFeedback({ type: 'error', text: 'يرجى إدخال مبلغ صحيح.' });
      return;
    }
    if (computedDelta === 0) {
      setFeedback({ type: 'error', text: 'الرصيد الجديد مطابق للرصيد الحالي ولا يوجد فرق لتسويته.' });
      return;
    }

    const defaultReason =
      adjustMode === 'TARGET'
        ? `مطابقة الرصيد الفعلي على محفظة فودافون كاش (${projectedNewBalance} ${currency})`
        : adjustMode === 'DELTA_SUB'
        ? 'خصم فرق / رسوم تحويل فودافون كاش'
        : 'إضافة فرق تحويل فودافون كاش';

    const res = dbService.adjustVodafoneCashBalance(
      computedDelta,
      reasonInput.trim() || defaultReason,
      operatorName
    );

    setRefreshTick(t => t + 1);
    setAmountInput(String(res.newBalance));
    setReasonInput('');
    setFeedback({
      type: 'success',
      text: `تمت تسوية رصيد محفظة فودافون كاش بنجاح من ${res.previousBalance.toLocaleString('ar-EG')} إلى ${res.newBalance.toLocaleString('ar-EG')} ${currency}.`
    });
    if (onAdjusted) onAdjusted();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] flex flex-col bg-[#120d16] border border-fuchsia-600/40 rounded-3xl shadow-[0_0_50px_rgba(192,38,211,0.2)] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-fuchsia-800/30 bg-fuchsia-950/30 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-fuchsia-600/20 border border-fuchsia-500/40 flex items-center justify-center text-fuchsia-300">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">تفاصيل وتسوية محفظة فودافون كاش</h3>
              <p className="text-[10px] text-fuchsia-300/80 font-medium">كشف كامل للتحويلات الواردة في الوردية الحالية ومطابقتها</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-black/40 border border-gray-800 text-gray-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Total Summary Card */}
          <div className="bg-gradient-to-l from-fuchsia-950/50 via-[#1a0f22] to-black border border-fuchsia-600/40 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold text-fuchsia-300/90 block">إجمالي وارد المحفظة المسجل بالوردية:</span>
              <span className="text-2xl font-black font-mono text-white">
                {breakdown.total.toLocaleString('ar-EG')} <span className="text-xs font-sans text-fuchsia-300">{currency}</span>
              </span>
            </div>
            <div className="text-left">
              <span className="text-[10px] text-gray-400 block">عدد العمليات</span>
              <span className="text-sm font-black font-mono text-fuchsia-300">{breakdown.items.length} عملية</span>
            </div>
          </div>

          {/* Feedback Banner */}
          {feedback && (
            <div
              className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-950/50 border-emerald-600/50 text-emerald-300'
                  : 'bg-red-950/50 border-red-600/50 text-red-300'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          {/* Itemized Breakdown List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-gray-200">📋 كشف عمليات فودافون كاش ({breakdown.items.length})</h4>
              <span className="text-[10px] text-gray-500">الأحدث أولاً</span>
            </div>

            {breakdown.items.length === 0 ? (
              <div className="p-6 text-center bg-black/40 border border-gray-800/80 rounded-2xl text-xs text-gray-400">
                لا توجد تحويلات فودافون كاش مسجلة في الوردية الحالية حتى الآن.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {breakdown.items.map(item => {
                  const meta = CATEGORY_META[item.category];
                  const timeLabel = (() => {
                    try {
                      return new Date(item.timestamp).toLocaleTimeString('ar-EG', {
                        hour: '2-digit',
                        minute: '2-digit'
                      });
                    } catch {
                      return '';
                    }
                  })();

                  return (
                    <div
                      key={item.id}
                      className="bg-black/50 border border-gray-800/80 rounded-xl p-2.5 flex items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-bold ${meta.colorClass}`}>
                            {meta.icon}
                            <span>{meta.label}</span>
                          </span>
                          {timeLabel && <span className="text-[9px] text-gray-500 font-mono">{timeLabel}</span>}
                        </div>
                        <p className="text-xs font-bold text-white truncate">{item.label}</p>
                        {item.sublabel && (
                          <p className="text-[10px] text-gray-400 truncate">{item.sublabel}</p>
                        )}
                      </div>

                      <div
                        className={`font-mono font-black text-xs shrink-0 px-2 py-1 rounded-lg border ${
                          item.amount >= 0
                            ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
                            : 'bg-red-950/40 border-red-800/50 text-red-300'
                        }`}
                      >
                        {item.amount >= 0 ? '+' : ''}
                        {item.amount.toLocaleString('ar-EG')} {currency}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Admin-Only Reconciliation Form */}
          {isAdmin && (
            <form
              onSubmit={handleApplyAdjustment}
              className="bg-black/60 border border-amber-600/30 rounded-2xl p-4 space-y-3"
            >
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-black text-amber-300">تسوية ومطابقة رصيد المحفظة (خاص بالأدمن)</h4>
              </div>
              <p className="text-[10px] text-gray-400 leading-relaxed">
                في حالة وجود فرق بسيط مثل رسوم تحويل أو تقريب مبلغ، يمكنك ضبط الرصيد الفعلي الموجود على خط فودافون كاش مباشرة ليطابق الواقع في جميع الشاشات.
              </p>

              {/* Mode Switcher */}
              <div className="grid grid-cols-3 gap-1.5 text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setAdjustMode('TARGET');
                    setAmountInput(String(breakdown.total));
                  }}
                  className={`py-2 px-2 rounded-xl border transition-all cursor-pointer ${
                    adjustMode === 'TARGET'
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-black'
                      : 'bg-black/50 border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  ضبط الرصيد الفعلي
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdjustMode('DELTA_SUB');
                    setAmountInput('');
                  }}
                  className={`py-2 px-2 rounded-xl border transition-all cursor-pointer ${
                    adjustMode === 'DELTA_SUB'
                      ? 'bg-red-500/20 border-red-400 text-red-300 font-black'
                      : 'bg-black/50 border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  خصم فرق (-)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdjustMode('DELTA_ADD');
                    setAmountInput('');
                  }}
                  className={`py-2 px-2 rounded-xl border transition-all cursor-pointer ${
                    adjustMode === 'DELTA_ADD'
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-black'
                      : 'bg-black/50 border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  إضافة فرق (+)
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold text-gray-300 block mb-1">
                    {adjustMode === 'TARGET'
                      ? `الرصيد الفعلي على المحفظة (${currency})`
                      : adjustMode === 'DELTA_SUB'
                      ? `قيمة الخصم / الرسوم (${currency})`
                      : `قيمة الإضافة (${currency})`}
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={amountInput}
                    onChange={e => setAmountInput(e.target.value)}
                    placeholder={adjustMode === 'TARGET' ? 'مثال: 1530' : 'مثال: 5'}
                    className="w-full px-3 py-2 bg-black border border-gray-700 focus:border-fuchsia-500 rounded-xl text-sm font-mono font-bold text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-300 block mb-1">سبب التسوية (اختياري)</label>
                  <input
                    type="text"
                    value={reasonInput}
                    onChange={e => setReasonInput(e.target.value)}
                    placeholder="مثال: رسوم تحويل / مطابقة الرصيد"
                    className="w-full px-3 py-2 bg-black border border-gray-700 focus:border-fuchsia-500 rounded-xl text-xs text-white outline-none"
                  />
                </div>
              </div>

              {/* Live Preview */}
              {isValidNumber && computedDelta !== 0 && (
                <div className="bg-fuchsia-950/30 border border-fuchsia-700/40 rounded-xl px-3 py-2 text-[11px] font-bold text-fuchsia-200 flex items-center justify-between gap-2">
                  <span>
                    سيتم تسجيل تسوية ({computedDelta > 0 ? `+${computedDelta}` : computedDelta} {currency})
                  </span>
                  <span className="font-mono text-white">
                    الرصيد الجديد: {projectedNewBalance.toLocaleString('ar-EG')} {currency}
                  </span>
                </div>
              )}

              <button
                type="submit"
                disabled={!isValidNumber || computedDelta === 0}
                className="w-full py-2.5 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-xs rounded-xl transition-all cursor-pointer shadow-lg active:scale-95"
              >
                حفظ تسوية رصيد محفظة فودافون كاش ✓
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
