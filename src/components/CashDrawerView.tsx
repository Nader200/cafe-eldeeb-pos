import React, { useState, useEffect } from 'react';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Minus,
  Lock,
  Unlock,
  History,
  FileText,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Calendar,
  Clock,
  Coins,
  ShieldAlert,
  Printer
} from 'lucide-react';
import { dbService } from '../dbService';
import { getEldeebLogoDataUrl } from '../lib/logoSvg';
import { AppSettings, CashDrawer, CashMovement } from '../types';

interface CashDrawerViewProps {
  settings: AppSettings;
  onShowSuccessAlert: (msg: string) => void;
  onShowWarningAlert: (msg: string) => void;
}

export default function CashDrawerView({
  settings,
  onShowSuccessAlert,
  onShowWarningAlert
}: CashDrawerViewProps) {
  // Navigation tabs
  const [activeSubTab, setActiveSubTab] = useState<'control' | 'count' | 'history' | 'report'>('control');

  // Common states
  const [activeDrawer, setActiveDrawer] = useState<CashDrawer>(() => dbService.getActiveDrawer());
  const [history, setHistory] = useState<CashMovement[]>(() => dbService.getCashHistory());

  // Form states: Set Opening Cash
  const [openingAmount, setOpeningAmount] = useState<number>(0);
  const [openingDate, setOpeningDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [openingTime, setOpeningTime] = useState<string>(() => {
    const now = new Date();
    return now.toTimeString().split(' ')[0].substring(0, 5);
  });
  const [openingNotes, setOpeningNotes] = useState<string>('');
  const [openingPin, setOpeningPin] = useState<string>('');

  // Form states: Cash Adjustment
  const [adjType, setAdjType] = useState<'ADD' | 'WITHDRAW'>('ADD');
  const [adjAmount, setAdjAmount] = useState<number>(0);
  const [adjReason, setAdjReason] = useState<string>('');
  const [adjNotes, setAdjNotes] = useState<string>('');
  const [adjPin, setAdjPin] = useState<string>('');

  // Form states: End of Day Count
  const [actualCash, setActualCash] = useState<number>(0);
  const [countNotes, setCountNotes] = useState<string>('');
  const [countPin, setCountPin] = useState<string>('');
  const [countResult, setCountResult] = useState<{
    expected: number;
    actual: number;
    difference: number;
    status: 'NO_DIFFERENCE' | 'SHORTAGE' | 'OVER';
  } | null>(null);

  // Sync state on tab/action change
  const refreshData = () => {
    setActiveDrawer(dbService.getActiveDrawer());
    setHistory(dbService.getCashHistory());
  };

  useEffect(() => {
    refreshData();
  }, [activeSubTab]);

  // Current calculations
  const expectedCash = activeDrawer.opening_balance + activeDrawer.cash_in - activeDrawer.cash_out;

  // Handles
  const handleSetOpeningCashSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (openingPin !== settings.pin_code) {
      onShowWarningAlert('رمز الأمان PIN للمسؤول غير صحيح!');
      return;
    }

    try {
      dbService.setOpeningCash(
        openingAmount,
        openingDate,
        openingTime,
        openingNotes,
        'Administrator'
      );
      onShowSuccessAlert(`تم تعيين رصيد أول المدة بنجاح بقيمة ${openingAmount.toLocaleString()} ج.م.`);
      setOpeningAmount(0);
      setOpeningNotes('');
      setOpeningPin('');
      refreshData();
    } catch (err: any) {
      onShowWarningAlert(err.message || 'فشلت العملية');
    }
  };

  const handleAdjustCashSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (adjPin !== settings.pin_code) {
      onShowWarningAlert('رمز الأمان PIN للمسؤول غير صحيح!');
      return;
    }

    if (adjAmount <= 0) {
      onShowWarningAlert('يرجى إدخال مبلغ صحيح أكبر من صفر');
      return;
    }

    const directionText = adjType === 'ADD' ? 'توريد وإيداع' : 'سحب وصرف';
    try {
      dbService.adjustCash(
        adjType,
        adjAmount,
        adjReason,
        adjNotes,
        'Administrator'
      );
      onShowSuccessAlert(`تم تسجيل حركة ${directionText} بقيمة ${adjAmount.toLocaleString()} ج.م بنجاح.`);
      setAdjAmount(0);
      setAdjReason('');
      setAdjNotes('');
      setAdjPin('');
      refreshData();
    } catch (err: any) {
      onShowWarningAlert(err.message || 'فشلت العملية');
    }
  };

  const handleEndDaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (countPin !== settings.pin_code) {
      onShowWarningAlert('رمز الأمان PIN للمسؤول غير صحيح!');
      return;
    }

    const difference = actualCash - expectedCash;
    let status: 'NO_DIFFERENCE' | 'SHORTAGE' | 'OVER' = 'NO_DIFFERENCE';
    if (difference < 0) status = 'SHORTAGE';
    if (difference > 0) status = 'OVER';

    setCountResult({
      expected: expectedCash,
      actual: actualCash,
      difference,
      status
    });

    onShowSuccessAlert('تم احتساب ومطابقة رصيد الخزينة بنجاح.');
    setCountPin('');
  };

  // Calculations for Daily Cash Report
  const reportData = React.useMemo(() => {
    // Opening Cash
    const opening = activeDrawer.opening_balance;

    // Filter today's cash history movements for individual components
    const todayStr = new Date().toISOString().split('T')[0];
    const todayMovements = history.filter(h => h.date === todayStr);

    let sales = 0;
    let collections = 0;
    let expenses = 0;
    let adjustmentsAdd = 0;
    let adjustmentsSub = 0;

    todayMovements.forEach(m => {
      if (m.transaction_type === 'CASH_SALE') {
        sales += m.amount;
      } else if (m.transaction_type === 'CUSTOMER_PAYMENT') {
        collections += m.amount;
      } else if (m.transaction_type === 'EXPENSE') {
        expenses += m.amount;
      } else if (m.transaction_type === 'CASH_ADJUSTMENT_ADD') {
        adjustmentsAdd += m.amount;
      } else if (m.transaction_type === 'CASH_ADJUSTMENT_SUB') {
        adjustmentsSub += m.amount;
      }
    });

    // In case there are no history elements recorded yet (or for older dates),
    // fallback to active drawer values to ensure calculation continuity.
    if (sales === 0 && collections === 0 && expenses === 0) {
      sales = activeDrawer.cash_in; // simple fallback
    }

    const expected = opening + sales + collections + adjustmentsAdd - expenses - adjustmentsSub;

    return {
      opening,
      sales,
      collections,
      expenses,
      adjustments: adjustmentsAdd - adjustmentsSub,
      expected
    };
  }, [activeDrawer, history]);

  // Arabic Labels Mapping for transaction types
  const getMovementLabel = (type: CashMovement['transaction_type']) => {
    switch (type) {
      case 'OPENING_CASH':
        return { label: 'رصيد افتتاحي', color: 'bg-blue-950/40 text-blue-400 border-blue-950/30' };
      case 'CASH_SALE':
        return { label: 'مبيعات نقدية', color: 'bg-green-950/40 text-green-400 border-green-950/30' };
      case 'CUSTOMER_PAYMENT':
        return { label: 'تحصيل من عميل', color: 'bg-emerald-950/40 text-emerald-400 border-emerald-950/30' };
      case 'EXPENSE':
        return { label: 'مصروفات الدرج', color: 'bg-rose-950/40 text-rose-400 border-rose-950/30' };
      case 'CASH_WITHDRAWAL':
        return { label: 'مرتجع / سحب', color: 'bg-red-950/40 text-red-400 border-red-950/30' };
      case 'CASH_ADJUSTMENT_ADD':
        return { label: 'تسوية (زيادة نقدية)', color: 'bg-amber-950/40 text-amber-400 border-amber-950/30' };
      case 'CASH_ADJUSTMENT_SUB':
        return { label: 'تسوية (عجز وسحب)', color: 'bg-orange-950/40 text-orange-400 border-orange-950/30' };
      default:
        return { label: 'قيد نقدية يدوية', color: 'bg-gray-900 text-gray-400 border-gray-800' };
    }
  };

  const handlePrintReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = `
      <html dir="rtl">
        <head>
          <title>تقرير مطابقة الخزينة اليومية - ${settings.cafe_name}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; line-height: 1.6; }
            .header { text-align: center; border-b: 2px solid #ccc; padding-bottom: 15px; margin-bottom: 25px; }
            .title { font-size: 22px; font-weight: bold; margin: 5px 0; }
            .subtitle { font-size: 14px; color: #666; }
            .stats-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            .stats-table th, .stats-table td { border: 1px solid #ddd; padding: 12px; text-align: right; }
            .stats-table th { bg-color: #f5f5f5; font-weight: bold; }
            .total-row { font-weight: bold; background-color: #eef2f7; }
            .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #888; border-t: 1px solid #eee; padding-top: 15px; }
          </style>
        </head>
        <body onload="window.print()">
          <div class="header">
            <img src="${getEldeebLogoDataUrl(300, false, 'gold')}" alt="Cafe Eldeeb Logo" style="height: 145px; width: auto; margin: 0 auto 10px; display: block; filter: contrast(115%) brightness(102%); image-rendering: -webkit-optimize-contrast;" />
            <div class="title">${settings.cafe_name}</div>
            <div class="subtitle">تقرير وجرد مطابقة درج النقدية اليومي المعتمد</div>
            <div>التاريخ: ${new Date().toLocaleDateString('ar-EG')}</div>
          </div>
          
          <table class="stats-table">
            <thead>
              <tr>
                <th>البند المالي</th>
                <th style="text-align: left;">القيمة المالية (ج.م)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>الرصيد الافتتاحي (أول اليوم)</td>
                <td style="text-align: left; font-family: monospace;">${reportData.opening.toLocaleString()} ج.م</td>
              </tr>
              <tr>
                <td>المبيعات النقدية المستلمة (+)</td>
                <td style="text-align: left; font-family: monospace;">${reportData.sales.toLocaleString()} ج.م</td>
              </tr>
              <tr>
                <td>تحصيلات دفعات العملاء بالآجل (+)</td>
                <td style="text-align: left; font-family: monospace;">${reportData.collections.toLocaleString()} ج.m</td>
              </tr>
              <tr>
                <td>التسويات والتعديلات اليدوية للخزينة (+/-)</td>
                <td style="text-align: left; font-family: monospace;">${reportData.adjustments.toLocaleString()} ج.م</td>
              </tr>
              <tr>
                <td>المصروفات والنفقات المدفوعة (-)</td>
                <td style="text-align: left; font-family: monospace;">${reportData.expenses.toLocaleString()} ج.م</td>
              </tr>
              <tr class="total-row">
                <td>الرصيد الدفتري المتوقع بالدرج</td>
                <td style="text-align: left; font-family: monospace;">${reportData.expected.toLocaleString()} ج.م</td>
              </tr>
              ${countResult ? `
                <tr>
                  <td>الرصيد الفعلي الموجود بالدرج</td>
                  <td style="text-align: left; font-family: monospace; font-weight: bold;">${countResult.actual.toLocaleString()} ج.م</td>
                </tr>
                <tr style="background-color: ${countResult.difference < 0 ? '#fde8e8' : countResult.difference > 0 ? '#def7ec' : '#f3f4f6'}">
                  <td>الفارق والتسوية</td>
                  <td style="text-align: left; font-family: monospace; font-weight: bold;">
                    ${countResult.difference === 0 ? 'مطابق تماماً (0)' : `${countResult.difference > 0 ? '+' : ''}${countResult.difference.toLocaleString()} ج.م`}
                  </td>
                </tr>
              ` : ''}
            </tbody>
          </table>

          <div style="margin-top: 30px;">
            <p><strong>توقيع المسؤول:</strong> ........................................</p>
          </div>

          <div class="footer">
            <p>${settings.receipt_footer || 'شكراً لتعاملكم معنا'}</p>
          </div>
        </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Visual Title Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-luxury-card border border-luxury-border p-6 rounded-3xl shadow-md">
        <div>
          <h2 className="text-xl font-bold text-white mb-1.5 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-gold-500" />
            نظام إدارة درج النقدية والتسويات (إداري)
          </h2>
          <p className="text-gray-400 text-xs">مراقبة دقيقة لكافة التدفقات النقدية والتحصيلات والمصروفات بالصندوق على مدار اليوم</p>
        </div>

        {/* Dynamic Live Status Card */}
        <div className="bg-luxury-bg border border-gray-900 rounded-2xl px-5 py-3 text-right flex items-center gap-4">
          <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-ping"></div>
          <div>
            <span className="text-[10px] text-gray-500 block mb-0.5">الرصيد الدفتري الحالي بالدرج</span>
            <span className="text-lg font-black font-mono text-gold-500">{expectedCash.toLocaleString()} ج.م</span>
          </div>
        </div>
      </div>

      {/* Sub Tabs Navigation */}
      <div className="flex flex-wrap gap-2 bg-luxury-card/30 border border-luxury-border/50 p-1.5 rounded-2xl">
        <button
          onClick={() => setActiveSubTab('control')}
          className={`flex-1 py-2.5 px-4 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeSubTab === 'control'
              ? 'bg-gold-600 text-black font-extrabold shadow-md'
              : 'text-gray-400 hover:text-white hover:bg-gray-900/60'
          }`}
        >
          ⚙️ إيداع وتسويات أول المدة
        </button>
        <button
          onClick={() => setActiveSubTab('count')}
          className={`flex-1 py-2.5 px-4 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeSubTab === 'count'
              ? 'bg-gold-600 text-black font-extrabold shadow-md'
              : 'text-gray-400 hover:text-white hover:bg-gray-900/60'
          }`}
        >
          📊 مطابقة وجرد آخر اليوم
        </button>
        <button
          onClick={() => setActiveSubTab('history')}
          className={`flex-1 py-2.5 px-4 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeSubTab === 'history'
              ? 'bg-gold-600 text-black font-extrabold shadow-md'
              : 'text-gray-400 hover:text-white hover:bg-gray-900/60'
          }`}
        >
          📜 سجل حركة الخزينة
        </button>
        <button
          onClick={() => setActiveSubTab('report')}
          className={`flex-1 py-2.5 px-4 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeSubTab === 'report'
              ? 'bg-gold-600 text-black font-extrabold shadow-md'
              : 'text-gray-400 hover:text-white hover:bg-gray-900/60'
          }`}
        >
          📑 التقرير اليومي للخزينة
        </button>
      </div>

      {/* Tab 1: Control (Opening Cash & Adjustments) */}
      {activeSubTab === 'control' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Section A: Set Opening Cash */}
          <div className="bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-lg">
            <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-1.5">
              <Plus className="w-5 h-5 text-blue-500" />
              تعيين الرصيد الافتتاحي (أول اليوم)
            </h3>
            <p className="text-gray-400 text-xs mb-5 pb-3 border-b border-gray-900/60">تسجيل رصيد بداية اليوم قبل استقبال أي معاملات تجارية جديدة بالصندوق</p>

            <form onSubmit={handleSetOpeningCashSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 font-bold block mb-1.5">المبلغ الافتتاحي (ج.م) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={openingAmount || ''}
                    onChange={(e) => setOpeningAmount(parseFloat(e.target.value) || 0)}
                    className="w-full bg-luxury-bg border border-gray-800 text-gold-500 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:border-gold-600 text-center font-mono font-black"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-400 font-bold block mb-1.5">رمز مرور المسؤول (PIN) *</label>
                  <input
                    type="password"
                    maxLength={10}
                    required
                    placeholder="••••"
                    value={openingPin}
                    onChange={(e) => setOpeningPin(e.target.value)}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2.5 px-3 text-center tracking-widest text-sm focus:outline-none focus:border-gold-600 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 font-bold block mb-1.5">التاريخ واليوم المعتمد *</label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
                    <input
                      type="date"
                      required
                      value={openingDate}
                      onChange={(e) => setOpeningDate(e.target.value)}
                      className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right pr-9 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-400 font-bold block mb-1.5">وقت التعيين *</label>
                  <div className="relative">
                    <Clock className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
                    <input
                      type="time"
                      required
                      value={openingTime}
                      onChange={(e) => setOpeningTime(e.target.value)}
                      className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right pr-9 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">البيان وملاحظات التسوية الافتتاحية (اختياري)</label>
                <textarea
                  placeholder="مثال: رصيد البداية الصباحي لوردية الكاشير..."
                  value={openingNotes}
                  onChange={(e) => setOpeningNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5"
              >
                تأكيد وحفظ رصيد البداية
              </button>
            </form>
          </div>

          {/* Section B: Cash Adjustment */}
          <div className="bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-lg">
            <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-1.5">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              تسجيل وتعديل الحركات النقدية (إيداع / سحب)
            </h3>
            <p className="text-gray-400 text-xs mb-5 pb-3 border-b border-gray-900/60">إجراء عمليات توريد أو سحوبات نقدية استثنائية من الدرج مع التوثيق المالي الكامل</p>

            <form onSubmit={handleAdjustCashSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 font-bold block mb-1.5">نوع التسوية النقدية *</label>
                  <div className="grid grid-cols-2 gap-1.5 bg-luxury-bg border border-gray-800 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setAdjType('ADD')}
                      className={`py-2 text-xs font-bold rounded-lg transition-all ${
                        adjType === 'ADD'
                          ? 'bg-green-600 text-white shadow'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5 inline mr-1" />
                      إيداع وتوريد نقدية
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjType('WITHDRAW')}
                      className={`py-2 text-xs font-bold rounded-lg transition-all ${
                        adjType === 'WITHDRAW'
                          ? 'bg-red-600 text-white shadow'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <Minus className="w-3.5 h-3.5 inline mr-1" />
                      سحب نقدية ومسحوبات
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-400 font-bold block mb-1.5">مبلغ التسوية (ج.م) *</label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={adjAmount || ''}
                    onChange={(e) => setAdjAmount(parseFloat(e.target.value) || 0)}
                    className="w-full bg-luxury-bg border border-gray-800 text-gold-500 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:border-gold-600 text-center font-mono font-black"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 font-bold block mb-1.5">سبب وغرض الحركة *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: زيادة سلفة، مصروف طوارئ، سحب للمالك..."
                    value={adjReason}
                    onChange={(e) => setAdjReason(e.target.value)}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-400 font-bold block mb-1.5">رمز مرور المسؤول (PIN) *</label>
                  <input
                    type="password"
                    maxLength={10}
                    required
                    placeholder="••••"
                    value={adjPin}
                    onChange={(e) => setAdjPin(e.target.value)}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2.5 px-3 text-center tracking-widest text-sm focus:outline-none focus:border-gold-600 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">تفاصيل وملاحظات إضافية</label>
                <textarea
                  placeholder="أي تفاصيل أو مراجع إضافية..."
                  value={adjNotes}
                  onChange={(e) => setAdjNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right resize-none"
                />
              </div>

              <button
                type="submit"
                className={`w-full py-3 ${adjType === 'ADD' ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500'} text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5`}
              >
                تطبيق الحركة وتحديث الخزينة
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Tab 2: End of Day Count */}
      {activeSubTab === 'count' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form input card */}
          <div className="lg:col-span-1 bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-lg h-fit">
            <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-1.5">
              <Coins className="w-5 h-5 text-amber-500" />
              مطابقة وجرد الخزينة اليومية
            </h3>
            <p className="text-gray-400 text-xs mb-5 pb-3 border-b border-gray-900/60">أدخل قيمة النقدية الفعلية الموجودة مادياً بالدرج لمقارنتها بالدفتري</p>

            <form onSubmit={handleEndDaySubmit} className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">الرصيد الفعلي الموجود بالدرج *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={actualCash || ''}
                  onChange={(e) => setActualCash(parseFloat(e.target.value) || 0)}
                  className="w-full bg-luxury-bg border border-gray-850 text-gold-500 rounded-xl py-3 px-3 text-lg focus:outline-none focus:border-gold-600 text-center font-mono font-black"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">ملاحظات ومراجعة جرد الخزينة (اختياري)</label>
                <textarea
                  placeholder="مثال: مطابقة الرصيد بنجاح دون فارق، ترحيل عجز الصندوق لوردية الغد..."
                  value={countNotes}
                  onChange={(e) => setCountNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-luxury-bg border border-gray-850 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 text-right resize-none"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1.5">رمز مرور المسؤول المعتمد *</label>
                <input
                  type="password"
                  maxLength={10}
                  required
                  placeholder="••••"
                  value={countPin}
                  onChange={(e) => setCountPin(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-850 text-white rounded-xl py-2.5 px-3 text-center tracking-widest text-sm focus:outline-none focus:border-gold-600 font-mono"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-gold-600 hover:bg-gold-500 text-black font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5"
              >
                تطبيق وحساب المطابقة
              </button>
            </form>
          </div>

          {/* Result panel card */}
          <div className="lg:col-span-2 bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-lg flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-1.5">
                <FileText className="w-5 h-5 text-gold-500" />
                مخرجات المطابقة وفوارق الجرد المباشر
              </h3>

              {!countResult ? (
                <div className="text-center py-20 text-gray-500 flex flex-col items-center justify-center">
                  <Coins className="w-12 h-12 text-gray-700 mb-3 animate-pulse" />
                  <p className="font-bold text-sm">بانتظار إجراء المطابقة وتطبيق جرد الخزينة</p>
                  <p className="text-xs max-w-xs text-gray-600 mt-1">أدخل المبلغ الفعلي بالدرج في القائمة اليمنى لتظهر لك الفروقات هنا بالوقت الحقيقي</p>
                </div>
              ) : (
                <div className="space-y-6 animate-fade-in">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Expected block */}
                    <div className="bg-luxury-bg/50 border border-gray-850 rounded-2xl p-4 text-center">
                      <span className="text-[10px] text-gray-400 block mb-1">الرصيد الدفتري المتوقع</span>
                      <span className="text-lg font-black font-mono text-gray-300">
                        {countResult.expected.toLocaleString()} ج.م
                      </span>
                    </div>

                    {/* Actual block */}
                    <div className="bg-luxury-bg/50 border border-gray-850 rounded-2xl p-4 text-center">
                      <span className="text-[10px] text-gray-400 block mb-1">الرصيد الفعلي بالدرج</span>
                      <span className="text-lg font-black font-mono text-gold-500">
                        {countResult.actual.toLocaleString()} ج.م
                      </span>
                    </div>

                    {/* Difference block */}
                    <div className="bg-luxury-bg/50 border border-gray-850 rounded-2xl p-4 text-center">
                      <span className="text-[10px] text-gray-400 block mb-1">الفارق والفرق المالي</span>
                      <span className={`text-lg font-black font-mono ${
                        countResult.difference === 0 ? 'text-green-500' : countResult.difference < 0 ? 'text-red-500' : 'text-emerald-500'
                      }`}>
                        {countResult.difference === 0 ? '0' : `${countResult.difference > 0 ? '+' : ''}${countResult.difference.toLocaleString()}`} ج.م
                      </span>
                    </div>
                  </div>

                  {/* Visual Status Indicator Banner */}
                  <div className={`p-4 rounded-2xl border text-center font-bold flex flex-col items-center justify-center gap-2 ${
                    countResult.status === 'NO_DIFFERENCE'
                      ? 'bg-green-950/40 border-green-900/30 text-green-400'
                      : countResult.status === 'SHORTAGE'
                        ? 'bg-red-950/40 border-red-900/30 text-red-400'
                        : 'bg-emerald-950/40 border-emerald-900/30 text-emerald-400'
                  }`}>
                    {countResult.status === 'NO_DIFFERENCE' && (
                      <>
                        <CheckCircle2 className="w-8 h-8 text-green-500 animate-bounce" />
                        <span className="text-base font-black">مطابقة كاملة - لا يوجد فارق (No Difference)</span>
                        <p className="text-xs font-medium max-w-md text-gray-400">الرصيد الموجود فعلياً بالصندوق يطابق الحسابات الدفترية تماماً بنسبة نجاح 100%.</p>
                      </>
                    )}

                    {countResult.status === 'SHORTAGE' && (
                      <>
                        <XCircle className="w-8 h-8 text-red-500 animate-pulse" />
                        <span className="text-base font-black">عجز نقدية بالصندوق (Cash Shortage)</span>
                        <p className="text-xs font-medium max-w-md text-gray-400">
                          هناك نقص مالي ملموس في درج الكاشير بمقدار{' '}
                          <span className="font-bold text-red-400 font-mono">
                            {Math.abs(countResult.difference).toLocaleString()}
                          </span>{' '}
                          ج.م عن الرصيد الدفتري المعتمد.
                        </p>
                      </>
                    )}

                    {countResult.status === 'OVER' && (
                      <>
                        <AlertCircle className="w-8 h-8 text-emerald-500" />
                        <span className="text-base font-black">زيادة نقدية غير مفسرة (Cash Over)</span>
                        <p className="text-xs font-medium max-w-md text-gray-400">
                          هناك فائض مالي إيجابي بالصندوق بمقدار{' '}
                          <span className="font-bold text-emerald-400 font-mono">
                            {countResult.difference.toLocaleString()}
                          </span>{' '}
                          ج.م زيادة عن الدفتر المتوقع. يرجى المراجعة.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {countResult && (
              <div className="flex gap-2 mt-6">
                <button
                  type="button"
                  onClick={handlePrintReport}
                  className="flex-1 py-3 bg-luxury-bg border border-gray-800 hover:bg-gray-900 text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Printer className="w-4 h-4 text-gold-500" />
                  طباعة التقرير والمطابقة
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCountResult(null);
                    setActualCash(0);
                    setCountNotes('');
                  }}
                  className="py-3 px-6 bg-red-950/40 text-red-400 hover:bg-red-900/30 border border-red-900/30 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  إعادة تهيئة
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Cash Drawer History */}
      {activeSubTab === 'history' && (
        <div className="bg-luxury-card border border-luxury-border rounded-3xl p-5 shadow-lg">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-1.5">
            <History className="w-4.5 h-4.5 text-gold-500" />
            سجل حركات ودائنية الخزينة المتكامل (Cash Drawer History)
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-900 text-gray-400 font-bold">
                  <th className="pb-3 pt-1 px-2 text-center">نوع الحركة</th>
                  <th className="pb-3 pt-1 px-2 text-left">الرصيد السابق</th>
                  <th className="pb-3 pt-1 px-2 text-center">قيمة الحركة والفرق</th>
                  <th className="pb-3 pt-1 px-2 text-left">الرصيد الجديد</th>
                  <th className="pb-3 pt-1 px-2 text-center">التاريخ والوقت</th>
                  <th className="pb-3 pt-1 px-2">البيان وسبب المعاملة</th>
                  <th className="pb-3 pt-1 px-2">المسؤول</th>
                  <th className="pb-3 pt-1 px-2">ملاحظات إدارية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-900/40">
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-500 font-medium">
                      لا توجد قيود مسجلة في سجل الخزينة اليومية حالياً
                    </td>
                  </tr>
                ) : (
                  [...history].reverse().map(item => {
                    const typeStyle = getMovementLabel(item.transaction_type);
                    const isAdd = [
                      'OPENING_CASH',
                      'CASH_SALE',
                      'CUSTOMER_PAYMENT',
                      'CASH_ADJUSTMENT_ADD',
                      'MANUAL_ADD'
                    ].includes(item.transaction_type);

                    return (
                      <tr key={item.id} className="hover:bg-luxury-bg/40 transition-colors">
                        <td className="py-3 px-2 text-center">
                          <span className={`inline-block px-2 py-0.5 border rounded-full font-bold text-[9px] ${typeStyle.color}`}>
                            {typeStyle.label}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-left font-mono text-gray-400">
                          {item.previous_balance.toLocaleString()} ج.م
                        </td>
                        <td className={`py-3 px-2 text-center font-bold ${
                          isAdd ? 'text-green-500' : 'text-red-500'
                        }`}>
                          {isAdd ? '+' : '-'}{item.amount.toLocaleString()} ج.م
                        </td>
                        <td className="py-3 px-2 text-left font-mono font-bold text-white">
                          {item.new_balance.toLocaleString()} ج.م
                        </td>
                        <td className="py-3 px-2 text-center text-gray-400 font-mono">
                          {item.date} <span className="text-[10px] text-gray-600">{item.time}</span>
                        </td>
                        <td className="py-3 px-2 text-gray-300 font-medium max-w-xs truncate" title={item.notes}>
                          {item.notes}
                        </td>
                        <td className="py-3 px-2 font-mono text-gray-400">{item.user}</td>
                        <td className="py-3 px-2 text-gray-500 italic max-w-xs truncate" title={item.notes}>
                          {item.notes || '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Daily Cash Report */}
      {activeSubTab === 'report' && (
        <div className="bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-lg space-y-6">
          <div className="flex justify-between items-center pb-4 border-b border-gray-900">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <FileText className="w-5 h-5 text-gold-500" />
                توليد التقرير المالي والتدفقات النقدية
              </h3>
              <p className="text-[10px] text-gray-400 mt-0.5">تفصيل كافة المعاملات والمبالغ الواردة والخارجة من درج الكاشير اليوم</p>
            </div>
            <button
              onClick={handlePrintReport}
              className="py-2 px-4 bg-gold-600 hover:bg-gold-500 text-black font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-md flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              تصدير وطباعة التقرير
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Opening Cash */}
            <div className="bg-luxury-bg border border-gray-900 p-4 rounded-2xl relative overflow-hidden">
              <span className="text-xs text-gray-400 block mb-1">الرصيد الافتتاحي (أول اليوم)</span>
              <span className="text-2xl font-black font-mono text-blue-400">
                {reportData.opening.toLocaleString()} ج.م
              </span>
              <div className="absolute left-4 bottom-4 opacity-5">
                <Coins className="w-16 h-16" />
              </div>
            </div>

            {/* Cash Sales */}
            <div className="bg-luxury-bg border border-gray-900 p-4 rounded-2xl relative overflow-hidden">
              <span className="text-xs text-gray-400 block mb-1">المبيعات المقبوضة نقداً (+)</span>
              <span className="text-2xl font-black font-mono text-green-400">
                {reportData.sales.toLocaleString()} ج.م
              </span>
              <div className="absolute left-4 bottom-4 opacity-5">
                <ArrowUpRight className="w-16 h-16" />
              </div>
            </div>

            {/* Credit Collections */}
            <div className="bg-luxury-bg border border-gray-900 p-4 rounded-2xl relative overflow-hidden">
              <span className="text-xs text-gray-400 block mb-1">تحصيلات ديون العملاء (+)</span>
              <span className="text-2xl font-black font-mono text-emerald-400">
                {reportData.collections.toLocaleString()} ج.م
              </span>
              <div className="absolute left-4 bottom-4 opacity-5">
                <ArrowUpRight className="w-16 h-16" />
              </div>
            </div>

            {/* Expenses */}
            <div className="bg-luxury-bg border border-gray-900 p-4 rounded-2xl relative overflow-hidden">
              <span className="text-xs text-gray-400 block mb-1">المصروفات من الدرج (-)</span>
              <span className="text-2xl font-black font-mono text-rose-400">
                {reportData.expenses.toLocaleString()} ج.م
              </span>
              <div className="absolute left-4 bottom-4 opacity-5">
                <ArrowDownRight className="w-16 h-16" />
              </div>
            </div>

            {/* Adjustments */}
            <div className="bg-luxury-bg border border-gray-900 p-4 rounded-2xl relative overflow-hidden">
              <span className="text-xs text-gray-400 block mb-1">صافي التسويات اليدوية (+/-)</span>
              <span className={`text-2xl font-black font-mono ${reportData.adjustments >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {reportData.adjustments >= 0 ? '+' : ''}{reportData.adjustments.toLocaleString()} ج.م
              </span>
              <div className="absolute left-4 bottom-4 opacity-5">
                <ShieldAlert className="w-16 h-16" />
              </div>
            </div>

            {/* Expected Balance */}
            <div className="bg-luxury-bg border border-gold-600/30 p-4 rounded-2xl relative overflow-hidden col-span-1 md:col-span-2 lg:col-span-1">
              <span className="text-xs text-gold-400 block mb-1">الرصيد الدفتري المتوقع</span>
              <span className="text-2xl font-black font-mono text-gold-500">
                {reportData.expected.toLocaleString()} ج.م
              </span>
              <div className="absolute left-4 bottom-4 opacity-5">
                <Wallet className="w-16 h-16 text-gold-500" />
              </div>
            </div>
          </div>

          {/* Conditional reconciliation stats if matching is performed */}
          {countResult && (
            <div className="bg-luxury-bg/50 border border-gray-900 rounded-2xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                نتائج مطابقة وجرد الخزينة الختامي لهذا التقرير
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-medium">
                <div className="p-3 bg-luxury-bg border border-gray-850 rounded-xl flex justify-between">
                  <span className="text-gray-400">الرصيد المتوقع:</span>
                  <span className="font-mono text-white font-bold">{countResult.expected.toLocaleString()} ج.م</span>
                </div>
                <div className="p-3 bg-luxury-bg border border-gray-850 rounded-xl flex justify-between">
                  <span className="text-gray-400">الرصيد الفعلي بالدرج:</span>
                  <span className="font-mono text-gold-500 font-bold">{countResult.actual.toLocaleString()} ج.م</span>
                </div>
                <div className="p-3 bg-luxury-bg border border-gray-850 rounded-xl flex justify-between">
                  <span className="text-gray-400">الفارق المسجل:</span>
                  <span className={`font-mono font-bold ${countResult.difference === 0 ? 'text-green-500' : countResult.difference < 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                    {countResult.difference === 0 ? 'مطابق (0)' : `${countResult.difference > 0 ? '+' : ''}${countResult.difference.toLocaleString()} ج.م`}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
