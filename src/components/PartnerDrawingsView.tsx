/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { getEldeebLogoSvgString, getEldeebLogoDataUrl } from '../lib/logoSvg';
import {
  Users,
  Plus,
  Search,
  Filter,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Coins,
  FileText,
  Printer,
  Trash2,
  Edit,
  ShieldAlert,
  X,
  Check,
  UserCheck,
  PieChart,
  Download,
  AlertCircle
} from 'lucide-react';
import { dbService, isPurchaseExpense } from '../dbService';
import { Partner, PartnerDrawing } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface PartnerDrawingsViewProps {
  onShowSuccessAlert: (msg: string) => void;
  onShowWarningAlert: (msg: string) => void;
}

export default function PartnerDrawingsView({ onShowSuccessAlert, onShowWarningAlert }: PartnerDrawingsViewProps) {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'Admin';

  const [partners, setPartners] = useState<Partner[]>([]);
  const [drawings, setDrawings] = useState<PartnerDrawing[]>([]);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedPartnerFilter, setSelectedPartnerFilter] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Active view mode
  const [activeTab, setActiveTab] = useState<'drawings_list' | 'partner_statements'>('drawings_list');

  // Modal State for Add / Edit Drawing
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingDrawing, setEditingDrawing] = useState<PartnerDrawing | null>(null);
  const [partnerId, setPartnerId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState<string>('توزيع أرباح');
  const [notes, setNotes] = useState<string>('');

  // Modal State for Partner Statement Detail
  const [statementPartner, setStatementPartner] = useState<Partner | null>(null);

  // Load fresh datasets
  const loadData = () => {
    setPartners(dbService.getPartners());
    setDrawings(dbService.getPartnerDrawings());
  };

  useEffect(() => {
    loadData();
    const handleSync = () => loadData();
    window.addEventListener('cafe_db_synced_remote', handleSync);
    return () => window.removeEventListener('cafe_db_synced_remote', handleSync);
  }, []);

  // Compute Total Business Net Profit (Sales - Costs - Expenses)
  const businessFinancials = useMemo(() => {
    const invoices = dbService.getInvoices().filter(i => i.invoice_status !== 'CANCELLED');
    const invoiceItems = dbService.getInvoiceItems();
    const validInvoiceIds = new Set(invoices.map(i => i.id));
    const expenses = dbService.getExpenses().filter(e => !isPurchaseExpense(e));
    const returnTransactions = dbService.getReturnTransactions();

    const totalSales = invoices.reduce((sum, i) => sum + i.total, 0) - returnTransactions.reduce((sum, r) => sum + r.total_return_amount, 0);
    const totalCost = invoiceItems
      .filter(item => validInvoiceIds.has(item.invoice_id))
      .reduce((sum, item) => sum + (item.cost_price * item.quantity), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    const grossProfit = Math.max(0, totalSales - totalCost);
    const netProfit = grossProfit - totalExpenses;

    return {
      totalSales,
      totalCost,
      totalExpenses,
      grossProfit,
      netProfit
    };
  }, [drawings]);

  // Compute overall partner drawing stats
  const stats = useMemo(() => {
    const totalDrawings = drawings.reduce((sum, d) => sum + (d.amount || 0), 0);
    const totalOwnershipPercent = partners.reduce((sum, p) => sum + (p.ownership_percent || 0), 0);
    const netProfit = businessFinancials.netProfit;
    const remainingNetProfit = netProfit - totalDrawings;

    return {
      totalPartners: partners.length,
      totalOwnershipPercent,
      totalDrawings,
      netProfit,
      remainingNetProfit
    };
  }, [partners, drawings, businessFinancials]);

  // Filtered drawings list
  const filteredDrawings = useMemo(() => {
    return drawings.filter(d => {
      // Partner filter
      if (selectedPartnerFilter !== 'ALL' && d.partner_id !== selectedPartnerFilter) {
        return false;
      }
      // Date range filter
      if (startDate && d.date < startDate) return false;
      if (endDate && d.date > endDate) return false;
      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const partnerMatch = d.partner_name?.toLowerCase().includes(term);
        const reasonMatch = d.reason?.toLowerCase().includes(term);
        const notesMatch = d.notes?.toLowerCase().includes(term);
        const amountMatch = d.amount.toString().includes(term);
        if (!partnerMatch && !reasonMatch && !notesMatch && !amountMatch) return false;
      }
      return true;
    }).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [drawings, selectedPartnerFilter, startDate, endDate, searchTerm]);

  // Save / Update Partner Drawing
  const handleSaveDrawing = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!partnerId) {
      onShowWarningAlert('يرجى اختيار الشريك!');
      return;
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      onShowWarningAlert('يرجى إدخال مبلغ صحيح أكبر من الصفر!');
      return;
    }

    const selectedPartner = partners.find(p => p.id === partnerId);
    if (!selectedPartner) {
      onShowWarningAlert('الشريك المحدد غير موجود!');
      return;
    }

    try {
      dbService.savePartnerDrawing({
        id: editingDrawing?.id,
        partner_id: selectedPartner.id,
        partner_name: selectedPartner.name,
        amount: numAmount,
        date: date || new Date().toISOString().split('T')[0],
        reason: reason || 'توزيع أرباح',
        notes: notes || '',
        created_by: currentUser?.name || 'المدير العام',
        created_at: editingDrawing?.created_at
      }, currentUser?.name || 'المدير العام');

      onShowSuccessAlert(
        editingDrawing
          ? `تم تعديل مسحوب الشريك "${selectedPartner.name}" بقيمة ${numAmount.toLocaleString()} ج.م بنجاح`
          : `تم تسجيل مسحوب جديد للشريك "${selectedPartner.name}" بقيمة ${numAmount.toLocaleString()} ج.م بنجاح`
      );

      closeModal();
      loadData();
    } catch (err: any) {
      onShowWarningAlert(err.message || 'حدث خطأ أثناء حفظ المسحوب');
    }
  };

  // Delete Drawing
  const handleDeleteDrawing = (drawing: PartnerDrawing) => {
    if (!isAdmin) {
      onShowWarningAlert('تنبيه أمان: هذه العملية مقتصرة فقط على أدمن النظام والمدير العام!');
      return;
    }

    if (window.confirm(`هل أنت متأكد من حذف مسحوب الشريك "${drawing.partner_name}" بقيمة ${drawing.amount.toLocaleString()} ج.م؟`)) {
      try {
        dbService.deletePartnerDrawing(drawing.id, currentUser?.name || 'المدير العام');
        onShowSuccessAlert(`تم حذف مسحوب الشريك "${drawing.partner_name}" وتسجيل الحركة في كشف المراجعة بنجاح`);
        loadData();
      } catch (err: any) {
        onShowWarningAlert(err.message || 'فشلت عملية الحذف');
      }
    }
  };

  // Open modal for editing
  const handleEditDrawing = (drawing: PartnerDrawing) => {
    if (!isAdmin) {
      onShowWarningAlert('تنبيه أمان: تعديل مسحوبات الشركاء مقتصر فقط على مدير النظام!');
      return;
    }
    setEditingDrawing(drawing);
    setPartnerId(drawing.partner_id);
    setAmount(drawing.amount.toString());
    setDate(drawing.date);
    setReason(drawing.reason);
    setNotes(drawing.notes || '');
    setShowModal(true);
  };

  // Reset modal fields
  const closeModal = () => {
    setShowModal(false);
    setEditingDrawing(null);
    setPartnerId(partners.length > 0 ? partners[0].id : '');
    setAmount('');
    setDate(new Date().toISOString().split('T')[0]);
    setReason('توزيع أرباح');
    setNotes('');
  };

  // Print Partner Statement
  const handlePrintStatement = (partner: Partner) => {
    const partnerDrawings = drawings.filter(d => d.partner_id === partner.id);
    const totalPartnerDrawings = partnerDrawings.reduce((sum, d) => sum + d.amount, 0);
    const earnedShare = (businessFinancials.netProfit * (partner.ownership_percent / 100));
    const dueBalance = earnedShare - totalPartnerDrawings;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html dir="rtl">
        <head>
          <title>كشف حساب الشريك - ${partner.name}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 25px; color: #000; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px; }
            .title { font-size: 22px; font-weight: bold; margin-bottom: 5px; }
            .subtitle { font-size: 14px; color: #555; }
            .summary-box { display: flex; justify-content: space-between; background: #f8f9fa; border: 1px solid #ddd; padding: 15px; border-radius: 8px; margin-bottom: 25px; }
            .summary-item { text-align: center; }
            .summary-item .label { font-size: 12px; color: #666; }
            .summary-item .value { font-size: 16px; font-weight: bold; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { border: 1px solid #ccc; padding: 10px; text-align: right; font-size: 12px; }
            th { background-color: #eee; }
            .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #777; border-top: 1px solid #eee; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <img src="${getEldeebLogoDataUrl(300, false, 'gold')}" alt="Cafe Eldeeb Logo" style="height: 155px; width: auto; margin: 0 auto 12px; display: block; filter: contrast(115%) brightness(102%); image-rendering: -webkit-optimize-contrast;" />
            <div class="title">كافيه الديب POS Enterprise</div>
            <div class="subtitle">تقرير كشف حساب الشريك: ${partner.name}</div>
            <div class="subtitle">التاريخ: ${new Date().toLocaleDateString('ar-EG')}</div>
          </div>

          <div class="summary-box">
            <div class="summary-item">
              <div class="label">نسبة الملكية</div>
              <div class="value">${partner.ownership_percent}%</div>
            </div>
            <div class="summary-item">
              <div class="label">إجمالي أرباح الشريك المستحقة</div>
              <div class="value" style="color: green;">${earnedShare.toLocaleString()} ج.م</div>
            </div>
            <div class="summary-item">
              <div class="label">إجمالي المسحوبات</div>
              <div class="value" style="color: red;">${totalPartnerDrawings.toLocaleString()} ج.م</div>
            </div>
            <div class="summary-item">
              <div class="label">الرصيد المتبقي المستحق</div>
              <div class="value" style="color: ${dueBalance >= 0 ? 'green' : 'red'};">${dueBalance.toLocaleString()} ج.م</div>
            </div>
          </div>

          <h3>سجل مسحوبات الشريك التفصيلي (${partnerDrawings.length} عملية)</h3>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>التاريخ</th>
                <th>المبلغ</th>
                <th>السبب</th>
                <th>الملاحظات</th>
                <th>بواسطة</th>
              </tr>
            </thead>
            <tbody>
              ${partnerDrawings.map((d, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${d.date}</td>
                  <td><b>${d.amount.toLocaleString()} ج.م</b></td>
                  <td>${d.reason}</td>
                  <td>${d.notes || 'لا يوجد'}</td>
                  <td>${d.created_by || 'المدير'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer">
            هذا التقرير صادر آلياً من نظام كافيه الديب الـمـلـوكـي POS ولا يحتاج لتوقيع.
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="flex flex-col gap-6 w-full text-right max-w-7xl mx-auto p-2 sm:p-4 text-white animate-fade-in" dir="rtl">
      
      {/* 1. HEADER & TOP BANNER */}
      <div className="bg-[#0c0d10] border border-gold-500/20 p-5 rounded-3xl shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex items-center gap-3.5 z-10">
          <div className="w-12 h-12 rounded-2xl bg-amber-950/40 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg shrink-0">
            <Coins className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
              <span>مسحوبات الشركاء</span>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono">
                النظام المحاسبي الملوكي
              </span>
            </h1>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              إدارة وتوثيق مسحوبات الشركاء بأعلى معايير الدقة المحاسبية - المسحوبات توزيع أرباح ولا تخفض صافي أرباح الكافيه التشغيلية.
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-3 w-full md:w-auto z-10">
          <button
            onClick={() => {
              if (partners.length === 0) {
                onShowWarningAlert('يرجى أولاً تعريف الشركاء من شاشة الإعدادات قسم (الشركاء)!');
                return;
              }
              setPartnerId(partners[0].id);
              setShowModal(true);
            }}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-amber-500 to-gold-500 hover:from-amber-400 hover:to-gold-400 text-black font-black text-xs rounded-2xl shadow-xl transition-all cursor-pointer active:scale-95"
          >
            <Plus className="w-4.5 h-4.5 stroke-[2.5]" />
            <span>تسجيل مسحوب شريك جديد</span>
          </button>
        </div>
      </div>

      {/* 2. STATS OVERVIEW METRICS GRID */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Total Partners */}
        <div className="bg-[#0e0f13] border border-gray-800/80 p-4 rounded-2xl shadow-lg relative overflow-hidden">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[11px] font-bold text-gray-400">عدد الشركاء</span>
            <div className="p-2 rounded-xl bg-blue-950/40 text-blue-400 border border-blue-800/30">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-white font-mono">
            {stats.totalPartners} <span className="text-xs font-sans text-gray-400">شركاء</span>
          </div>
          <span className="text-[10px] text-blue-400 block mt-1 font-mono">
            إجمالي حصص الملكية: {stats.totalOwnershipPercent}%
          </span>
        </div>

        {/* Total Cafe Net Profit */}
        <div className="bg-[#0e0f13] border border-emerald-900/40 p-4 rounded-2xl shadow-lg relative overflow-hidden">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[11px] font-bold text-gray-400">صافي ربح الكافيه</span>
            <div className="p-2 rounded-xl bg-emerald-950/40 text-emerald-400 border border-emerald-800/30">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-emerald-400 font-mono">
            {stats.netProfit.toLocaleString()} <span className="text-xs font-sans text-gray-400">ج.م</span>
          </div>
          <span className="text-[10px] text-emerald-500/80 block mt-1">
            ربح المبيعات الحقيقي (لا ينخفض بالمسحوبات)
          </span>
        </div>

        {/* Total Partner Drawings */}
        <div className="bg-[#0e0f13] border border-amber-900/40 p-4 rounded-2xl shadow-lg relative overflow-hidden">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[11px] font-bold text-gray-400">إجمالي مسحوبات الشركاء</span>
            <div className="p-2 rounded-xl bg-amber-950/40 text-amber-400 border border-amber-800/30">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-amber-400 font-mono">
            {stats.totalDrawings.toLocaleString()} <span className="text-xs font-sans text-gray-400">ج.م</span>
          </div>
          <span className="text-[10px] text-amber-500/80 block mt-1 font-mono">
            مجموع السلف وتوزيعات الأرباح المسحوبة
          </span>
        </div>

        {/* Remaining Net Profit Balance */}
        <div className="bg-[#0e0f13] border border-purple-900/40 p-4 rounded-2xl shadow-lg relative overflow-hidden">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[11px] font-bold text-gray-400">الرصيد المتبقي للشركاء</span>
            <div className="p-2 rounded-xl bg-purple-950/40 text-purple-400 border border-purple-800/30">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-xl font-black font-mono ${stats.remainingNetProfit >= 0 ? 'text-purple-300' : 'text-red-400'}`}>
            {stats.remainingNetProfit.toLocaleString()} <span className="text-xs font-sans text-gray-400">ج.م</span>
          </div>
          <span className="text-[10px] text-purple-400/80 block mt-1">
            الأرباح المتاحة للتوزيع بعد المسحوبات
          </span>
        </div>
      </div>

      {/* 3. TABS SWITCHER & FILTERS BAR */}
      <div className="bg-[#0c0d10] border border-gray-800/80 p-3.5 rounded-2xl shadow-md flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
        
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 bg-[#060708] p-1 rounded-xl border border-gray-800/60">
          <button
            onClick={() => setActiveTab('drawings_list')}
            className={`px-4 py-2 rounded-lg text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'drawings_list'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-inner'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>سجل المسحوبات التفصيلي ({filteredDrawings.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('partner_statements')}
            className={`px-4 py-2 rounded-lg text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'partner_statements'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-inner'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>كشوف حسابات ومستحقات الشركاء</span>
          </button>
        </div>

        {/* Filters */}
        {activeTab === 'drawings_list' && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative min-w-[160px] flex-1 sm:flex-none">
              <Search className="w-3.5 h-3.5 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="بحث عن مسحوب..."
                className="w-full bg-[#060708] border border-gray-800 rounded-xl pr-8 pl-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Partner Dropdown Filter */}
            <select
              value={selectedPartnerFilter}
              onChange={e => setSelectedPartnerFilter(e.target.value)}
              className="bg-[#060708] border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="ALL">جميع الشركاء</option>
              {partners.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.ownership_percent}%)</option>
              ))}
            </select>

            {/* Date Range */}
            <div className="flex items-center gap-1.5 bg-[#060708] border border-gray-800 rounded-xl px-2 py-1 text-xs">
              <Calendar className="w-3.5 h-3.5 text-gray-500" />
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none"
              />
              <span className="text-gray-500 text-[10px]">إلى</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* 4. MAIN CONTENT PANELS */}
      {activeTab === 'drawings_list' ? (
        /* TAB 1: DRAWINGS LIST TABLE */
        <div className="bg-[#0c0d10] border border-gray-800/80 rounded-3xl p-4 shadow-xl overflow-x-auto">
          {filteredDrawings.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-gray-900 border border-gray-800 text-gray-500 flex items-center justify-center mx-auto text-xl">
                🧮
              </div>
              <p className="text-xs text-gray-400 font-bold">لا توجد مسحوبات مسجلة طِبقاً لمعايير البحث الحالية.</p>
              {partners.length === 0 && (
                <p className="text-[11px] text-amber-400">
                  تنبيه: لا يوجد شركاء معرفين في النظام. يرجى الذهاب لشاشة <b>الإعدادات ➔ الشركاء</b> لإضافة بيانات الشركاء أولاً.
                </p>
              )}
            </div>
          ) : (
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-[11px]">
                  <th className="py-3 px-3 font-bold">التاريخ</th>
                  <th className="py-3 px-3 font-bold">اسم الشريك</th>
                  <th className="py-3 px-3 font-bold">المبلغ المسحوب</th>
                  <th className="py-3 px-3 font-bold">السبب / البيان</th>
                  <th className="py-3 px-3 font-bold">الملاحظات</th>
                  <th className="py-3 px-3 font-bold">بواسطة</th>
                  <th className="py-3 px-3 font-bold text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {filteredDrawings.map((drawing) => (
                  <tr key={drawing.id} className="hover:bg-gray-900/40 transition-colors">
                    <td className="py-3.5 px-3 font-mono font-bold text-gray-300">
                      {drawing.date}
                    </td>
                    <td className="py-3.5 px-3 font-bold text-white">
                      <span className="flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                        {drawing.partner_name}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 font-mono font-black text-amber-400 text-sm">
                      {drawing.amount.toLocaleString()} ج.م
                    </td>
                    <td className="py-3.5 px-3">
                      <span className="px-2.5 py-1 bg-amber-950/40 border border-amber-800/40 text-amber-300 rounded-lg text-[10px] font-bold">
                        {drawing.reason}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-gray-400 text-[11px] max-w-[200px] truncate">
                      {drawing.notes || '—'}
                    </td>
                    <td className="py-3.5 px-3 text-gray-400 text-[11px]">
                      {drawing.created_by || 'المدير'}
                    </td>
                    <td className="py-3.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleEditDrawing(drawing)}
                          title="تعديل المسحوب"
                          className="p-1.5 bg-gray-900 hover:bg-gray-800 text-gray-300 hover:text-white rounded-lg border border-gray-700 transition-all cursor-pointer"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteDrawing(drawing)}
                          title="حذف المسحوب"
                          className="p-1.5 bg-red-950/40 hover:bg-red-900 text-red-400 hover:text-white rounded-lg border border-red-800/50 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        /* TAB 2: PARTNER STATEMENTS CARDS */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {partners.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-[#0c0d10] border border-gray-800 rounded-3xl space-y-3">
              <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
              <p className="text-xs text-gray-300 font-bold">لم يتم تسجيل أي شركاء في النظام بعد.</p>
              <p className="text-[11px] text-gray-500">
                يرجى إضافة الشركاء ونسب ملكيتهم من قسم (الشركاء) داخل شاشة الإعدادات.
              </p>
            </div>
          ) : (
            partners.map(partner => {
              const partnerDrawings = drawings.filter(d => d.partner_id === partner.id);
              const totalDrawings = partnerDrawings.reduce((sum, d) => sum + d.amount, 0);
              const earnedShare = businessFinancials.netProfit * (partner.ownership_percent / 100);
              const dueBalance = earnedShare - totalDrawings;

              return (
                <div key={partner.id} className="bg-[#0c0d10] border border-gray-800 hover:border-amber-500/40 p-5 rounded-3xl shadow-xl flex flex-col justify-between transition-all">
                  
                  {/* Top info */}
                  <div>
                    <div className="flex justify-between items-start mb-4 border-b border-gray-800 pb-3">
                      <div>
                        <h3 className="text-base font-black text-white flex items-center gap-2">
                          <UserCheck className="w-4.5 h-4.5 text-amber-400" />
                          <span>{partner.name}</span>
                        </h3>
                        {partner.phone && (
                          <span className="text-[11px] text-gray-400 block mt-0.5 font-mono">
                            📞 {partner.phone}
                          </span>
                        )}
                      </div>
                      <span className="px-3 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-black font-mono">
                        نسبة الملكية: {partner.ownership_percent}%
                      </span>
                    </div>

                    {/* Accounting numbers breakdown */}
                    <div className="space-y-2.5 text-xs my-4">
                      <div className="flex justify-between items-center bg-[#060708] p-2.5 rounded-xl border border-gray-800">
                        <span className="text-gray-400 font-bold">أرباح الشريك المستحقة:</span>
                        <span className="font-mono font-black text-emerald-400 text-sm">
                          {earnedShare.toLocaleString()} ج.م
                        </span>
                      </div>

                      <div className="flex justify-between items-center bg-[#060708] p-2.5 rounded-xl border border-gray-800">
                        <span className="text-gray-400 font-bold">إجمالي مسحوبات الشريك:</span>
                        <span className="font-mono font-black text-amber-400 text-sm">
                          {totalDrawings.toLocaleString()} ج.م
                        </span>
                      </div>

                      <div className={`flex justify-between items-center p-3 rounded-xl border font-black ${
                        dueBalance >= 0 
                          ? 'bg-purple-950/20 border-purple-800/40 text-purple-300' 
                          : 'bg-red-950/20 border-red-800/40 text-red-400'
                      }`}>
                        <span>الرصيد المستحق للشريك:</span>
                        <span className="font-mono text-base">
                          {dueBalance.toLocaleString()} ج.م
                        </span>
                      </div>
                    </div>

                    {partner.notes && (
                      <p className="text-[10px] text-gray-500 bg-[#060708] p-2 rounded-lg border border-gray-800/50 mb-4">
                        💡 {partner.notes}
                      </p>
                    )}
                  </div>

                  {/* Print and view statement */}
                  <div className="pt-3 border-t border-gray-800/80 flex items-center gap-2">
                    <button
                      onClick={() => setStatementPartner(partner)}
                      className="flex-1 py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-bold text-xs rounded-xl border border-gray-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-amber-400" />
                      <span>عرض التفاصيل</span>
                    </button>

                    <button
                      onClick={() => handlePrintStatement(partner)}
                      title="طباعة كشف حساب الشريك"
                      className="p-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl transition-all cursor-pointer"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </div>

                </div>
              );
            })
          )}
        </div>
      )}

      {/* MODAL 1: ADD / EDIT PARTNER DRAWING */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0e0f13] border border-amber-500/30 w-full max-w-md rounded-3xl p-6 shadow-2xl relative animate-scale-up text-right">
            
            <button
              onClick={closeModal}
              className="absolute left-4 top-4 p-1.5 bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white rounded-xl transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-5 border-b border-gray-800 pb-3">
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <Coins className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">
                  {editingDrawing ? 'تعديل مسحوب شريك' : 'تسجيل مسحوب شريك جديد'}
                </h3>
                <p className="text-[11px] text-gray-400">سحب من أرباح الشريك المستحقة</p>
              </div>
            </div>

            <form onSubmit={handleSaveDrawing} className="space-y-4 text-xs">
              
              {/* Partner Select */}
              <div>
                <label className="block text-gray-300 font-bold mb-1.5">اسم الشريك *</label>
                <select
                  value={partnerId}
                  onChange={e => setPartnerId(e.target.value)}
                  required
                  className="w-full bg-[#060708] border border-gray-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value="" disabled>اختر الشريك...</option>
                  {partners.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (حصة الملكية: {p.ownership_percent}%)</option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-gray-300 font-bold mb-1.5">المبلغ (ج.م) *</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="أدخل المبلغ المسحوب..."
                  required
                  className="w-full bg-[#060708] border border-gray-800 rounded-xl p-3 text-white font-mono text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-gray-300 font-bold mb-1.5">التاريخ *</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  required
                  className="w-full bg-[#060708] border border-gray-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Reason */}
              <div>
                <label className="block text-gray-300 font-bold mb-1.5">السبب / نوع المسحوب *</label>
                <select
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  required
                  className="w-full bg-[#060708] border border-gray-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value="توزيع أرباح">توزيع أرباح</option>
                  <option value="سلفة على حساب الأرباح">سلفة على حساب الأرباح</option>
                  <option value="مسحوبات شخصية">مسحوبات شخصية</option>
                  <option value="تسوية سابقة">تسوية سابقة</option>
                  <option value="أخرى">أخرى</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-gray-300 font-bold mb-1.5">ملاحظات (اختياري)</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="أي تفاصيل أو ملاحظات إضافية..."
                  className="w-full bg-[#060708] border border-gray-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-3 pt-3 border-t border-gray-800">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-gold-500 hover:from-amber-400 hover:to-gold-400 text-black font-black text-xs rounded-xl shadow-lg transition-all cursor-pointer"
                >
                  {editingDrawing ? 'تحديث المسحوب' : 'حفظ المسحوب'}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-5 py-3 bg-gray-900 hover:bg-gray-800 text-gray-300 font-bold text-xs rounded-xl border border-gray-700 transition-all cursor-pointer"
                >
                  إلغاء
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: PARTNER STATEMENT DETAIL */}
      {statementPartner && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0e0f13] border border-amber-500/30 w-full max-w-2xl rounded-3xl p-6 shadow-2xl relative animate-scale-up text-right max-h-[90vh] flex flex-col">
            
            <button
              onClick={() => setStatementPartner(null)}
              className="absolute left-4 top-4 p-1.5 bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white rounded-xl transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-4 border-b border-gray-800 pb-3 shrink-0">
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <UserCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">
                  كشف حساب الشريك: {statementPartner.name}
                </h3>
                <p className="text-[11px] text-gray-400">نسبة الملكية: {statementPartner.ownership_percent}%</p>
              </div>
            </div>

            {/* Summary Cards */}
            {(() => {
              const pDrawings = drawings.filter(d => d.partner_id === statementPartner.id);
              const totalPDrawings = pDrawings.reduce((sum, d) => sum + d.amount, 0);
              const earned = businessFinancials.netProfit * (statementPartner.ownership_percent / 100);
              const due = earned - totalPDrawings;

              return (
                <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="bg-[#060708] border border-gray-800 p-3 rounded-xl text-center">
                      <span className="text-gray-400 block text-[10px] mb-1">الأرباح المستحقة</span>
                      <span className="font-mono font-black text-emerald-400 text-sm">{earned.toLocaleString()} ج.م</span>
                    </div>
                    <div className="bg-[#060708] border border-gray-800 p-3 rounded-xl text-center">
                      <span className="text-gray-400 block text-[10px] mb-1">إجمالي المسحوبات</span>
                      <span className="font-mono font-black text-amber-400 text-sm">{totalPDrawings.toLocaleString()} ج.م</span>
                    </div>
                    <div className={`border p-3 rounded-xl text-center font-black ${
                      due >= 0 ? 'bg-purple-950/30 border-purple-800/40 text-purple-300' : 'bg-red-950/30 border-red-800/40 text-red-400'
                    }`}>
                      <span className="block text-[10px] mb-1">الرصيد المتبقي</span>
                      <span className="font-mono text-sm">{due.toLocaleString()} ج.م</span>
                    </div>
                  </div>

                  <h4 className="text-xs font-bold text-white pt-2 border-t border-gray-800">
                    سجل المسحوبات التفصيلي ({pDrawings.length} عملية)
                  </h4>

                  {pDrawings.length === 0 ? (
                    <div className="py-8 text-center text-xs text-gray-500 border border-gray-800/60 rounded-2xl bg-[#060708]">
                      لا توجد مسحوبات مسجلة لهذا الشريك حتى الآن.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pDrawings.map((d, index) => (
                        <div key={d.id} className="bg-[#060708] border border-gray-800/80 p-3 rounded-xl flex justify-between items-center text-xs">
                          <div>
                            <div className="font-bold text-white flex items-center gap-2">
                              <span>#{index + 1} - {d.reason}</span>
                              <span className="text-[10px] text-gray-500 font-mono">({d.date})</span>
                            </div>
                            {d.notes && <p className="text-[11px] text-gray-400 mt-1">{d.notes}</p>}
                          </div>
                          <div className="font-mono font-black text-amber-400 text-sm">
                            {d.amount.toLocaleString()} ج.م
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Footer buttons */}
            <div className="pt-4 border-t border-gray-800 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => handlePrintStatement(statementPartner)}
                className="px-5 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/40 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة الكشف</span>
              </button>
              <button
                onClick={() => setStatementPartner(null)}
                className="px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-gray-300 font-bold text-xs rounded-xl border border-gray-700 transition-all cursor-pointer"
              >
                إغلاق
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
