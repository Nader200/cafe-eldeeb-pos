/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp,
  FileSpreadsheet,
  Download,
  Calendar,
  DollarSign,
  Coffee,
  Coins,
  ArrowUpRight,
  Printer,
  ChevronDown,
  BarChart3,
  Percent,
  Briefcase,
  Smartphone,
  RefreshCw,
  CreditCard,
  Users,
  Eye,
  FileText,
  X
} from 'lucide-react';
import { dbService, isPurchaseExpense } from '../dbService';
import { Invoice, Expense, Product, CashDrawer, InvoiceItem, ReturnTransaction, Partner, PartnerDrawing } from '../types';
import { BatchProfitReportView } from './BatchProfitReportView';
import { EldeebLogoHeader } from './EldeebLogo';
import { exportReportToExcel, exportReportToPDF } from '../utils/reportExporter';

interface ReportsViewProps {
  onShowSuccessAlert: (msg: string) => void;
}

export default function ReportsView({ onShowSuccessAlert }: ReportsViewProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [drawerHistory, setDrawerHistory] = useState<CashDrawer[]>([]);
  const [returnTransactions, setReturnTransactions] = useState<ReturnTransaction[]>([]);
  const [partnersList, setPartnersList] = useState<Partner[]>([]);
  const [partnerDrawingsList, setPartnerDrawingsList] = useState<PartnerDrawing[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('ALL');
  const [timeframe, setTimeframe] = useState<'WEEK' | 'MONTH'>('WEEK');
  const [activeReportTab, setActiveReportTab] = useState<'daily_raw_materials' | 'general' | 'batch_profit' | 'partners_statement' | 'shifts_handovers'>('shifts_handovers');
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [viewReceiptModalUrl, setViewReceiptModalUrl] = useState<string | null>(null);

  const [shiftsList, setShiftsList] = useState<any[]>([]);
  const [shiftHandoversList, setShiftHandoversList] = useState<any[]>([]);

  useEffect(() => {
    const loadData = () => {
      setInvoices(dbService.getInvoices());
      setExpenses(dbService.getExpenses());
      setProducts(dbService.getProducts());
      setInvoiceItems(dbService.getInvoiceItems());
      setDrawerHistory(dbService.getCashDrawers().reverse());
      setReturnTransactions(dbService.getReturnTransactions());
      setPartnersList(dbService.getPartners());
      setPartnerDrawingsList(dbService.getPartnerDrawings());
      setShiftsList(dbService.getShifts().reverse());
      setShiftHandoversList(dbService.getShiftHandovers().reverse());
    };
    loadData();
    window.addEventListener('cafe_db_synced_remote', loadData);
    return () => window.removeEventListener('cafe_db_synced_remote', loadData);
  }, []);

  const settings = useMemo(() => dbService.getSettings(), []);

  // --- Financial Stats ---
  const totals = useMemo(() => {
    const validInvoices = invoices.filter(i => i.invoice_status !== 'CANCELLED');
    const validInvoiceIds = new Set(validInvoices.map(i => i.id));
    
    const initialSales = validInvoices.reduce((sum, i) => sum + i.total, 0);
    const totalRefunds = returnTransactions.reduce((sum, r) => sum + r.total_return_amount, 0);
    const totalSales = initialSales - totalRefunds;
    const totalDiscounts = validInvoices.reduce((sum, i) => sum + (i.discount || 0), 0);
    
    const initialCost = invoiceItems
      .filter(item => validInvoiceIds.has(item.invoice_id))
      .reduce((sum, item) => sum + (item.cost_price * item.quantity), 0);

    let returnedCost = 0;
    returnTransactions.forEach(ret => {
      ret.returned_items.forEach(item => {
        const product = products.find(p => p.id === item.product_id);
        if (product) {
          returnedCost += product.cost_price * item.quantity;
        }
      });
    });
    const totalCost = Math.max(0, initialCost - returnedCost);

    const totalExp = expenses
      .filter(e => !isPurchaseExpense(e))
      .reduce((sum, e) => sum + e.amount, 0);
    const grossProfit = totalSales - totalCost;
    const netProfit = grossProfit - totalExp;

    const now = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    
    const initialThisWeekSales = validInvoices
      .filter(i => (now - new Date(i.invoice_date).getTime() <= oneWeekMs))
      .reduce((sum, i) => sum + i.total, 0);
    const thisWeekReturns = returnTransactions
      .filter(r => (now - new Date(r.return_date).getTime() <= oneWeekMs))
      .reduce((sum, r) => sum + r.total_return_amount, 0);
    const thisWeekSales = Math.max(0, initialThisWeekSales - thisWeekReturns);

    const initialLastWeekSales = validInvoices
      .filter(i => {
        const diff = now - new Date(i.invoice_date).getTime();
        return diff > oneWeekMs && diff <= 2 * oneWeekMs;
      })
      .reduce((sum, i) => sum + i.total, 0);
    const lastWeekReturns = returnTransactions
      .filter(r => {
        const diff = now - new Date(r.return_date).getTime();
        return diff > oneWeekMs && diff <= 2 * oneWeekMs;
      })
      .reduce((sum, r) => sum + r.total_return_amount, 0);
    const lastWeekSales = Math.max(0, initialLastWeekSales - lastWeekReturns);

    let growthRate = 0;
    if (lastWeekSales > 0) {
      growthRate = Math.round(((thisWeekSales - lastWeekSales) / lastWeekSales) * 100);
    } else if (thisWeekSales > 0) {
      growthRate = 100;
    }

    return {
      totalSales,
      totalCost,
      totalExp,
      grossProfit,
      netProfit,
      totalDiscounts,
      invoiceCount: validInvoices.length,
      growthRate
    };
  }, [invoices, expenses, invoiceItems, returnTransactions, products]);

  // --- Daily Raw Materials Report Math ---
  const daySession = useMemo(() => {
    return dbService.getDailyRawMaterialsSession(selectedDate);
  }, [selectedDate]);

  const dayInvoices = useMemo(() => {
    return invoices.filter(i => i.invoice_date.split('T')[0] === selectedDate && i.invoice_status !== 'CANCELLED');
  }, [invoices, selectedDate]);

  const dayExpenses = useMemo(() => {
    return expenses.filter(e => e.expense_date === selectedDate);
  }, [expenses, selectedDate]);

  const dayItems = useMemo(() => {
    const ids = new Set(dayInvoices.map(i => i.id));
    return invoiceItems.filter(it => ids.has(it.invoice_id));
  }, [invoiceItems, dayInvoices]);

  const dailyReportData = useMemo(() => {
    const todaySessionItems = daySession ? daySession.items : [];

    // Compute totals sold of each product
    const productQuantitiesSold: Record<string, number> = {};
    const productTotalSales: Record<string, number> = {};
    dayItems.forEach(it => {
      productQuantitiesSold[it.product_id] = (productQuantitiesSold[it.product_id] || 0) + it.quantity;
      productTotalSales[it.product_id] = (productTotalSales[it.product_id] || 0) + it.total_price;
    });

    const rawMaterialsReportList: any[] = [];
    const fixedCostList: any[] = [];
    const soldProductIds = Object.keys(productQuantitiesSold);

    // Build raw materials report list
    todaySessionItems.forEach(item => {
      const producedProducts: any[] = [];
      let totalRevenue = 0;
      const isSugar = item.name_ar && (item.name_ar.trim().toLowerCase() === 'سكر' || item.name_ar.trim().toLowerCase() === 'السكر' || item.name_ar.trim().includes('سكر'));

      soldProductIds.forEach(pId => {
        // Exclude PlayStation services from product reports
        if (pId === 'service_playstation' || pId === 'prod_playstation') {
          return;
        }

        const p = products.find(prod => prod.id === pId);
        if (!p) return;

        // Check if this sold product uses this raw material in its recipe ingredients
        const usesThisRM = p.recipe_ingredients?.some(ri => ri.raw_material_id === item.raw_material_id);
        if (usesThisRM) {
          const qtySold = productQuantitiesSold[pId] || 0;
          const revenue = productTotalSales[pId] || 0;

          producedProducts.push({
            productId: pId,
            name_ar: p.name_ar,
            image: p.image,
            quantitySold: qtySold,
            revenue: isSugar ? 0 : revenue
          });

          if (!isSugar) {
            totalRevenue += revenue;
          }
        }
      });

      rawMaterialsReportList.push({
        rawMaterialId: item.raw_material_id,
        name_ar: item.name_ar,
        unit: item.unit,
        startingBalance: item.quantity,
        cost: isSugar ? 0 : item.cost,
        isSugar,
        producedProducts,
        totalRevenue: isSugar ? 0 : totalRevenue,
        initialProfit: isSugar ? 0 : (totalRevenue - item.cost)
      });
    });

    // Now build the fixed cost list (ready-made products)
    let totalFixedSales = 0;
    let totalFixedCost = 0;

    soldProductIds.forEach(pId => {
      if (pId === 'service_playstation' || pId === 'prod_playstation') {
        return;
      }

      const p = products.find(prod => prod.id === pId);
      if (!p) return;

      // Ready-made products have no recipe ingredients and are not raw materials themselves
      const isPrepared = p.recipe_ingredients && p.recipe_ingredients.length > 0;
      if (!isPrepared && !p.is_raw_material) {
        const qtySold = productQuantitiesSold[pId] || 0;
        const totalSalesPrice = productTotalSales[pId] || 0;
        const totalCostPrice = p.cost_price * qtySold;
        const grossProfit = totalSalesPrice - totalCostPrice;

        fixedCostList.push({
          id: pId,
          name_ar: p.name_ar,
          name_en: p.name_en,
          image: p.image,
          qty: qtySold,
          sales: totalSalesPrice,
          totalCost: totalCostPrice,
          grossProfit
        });

        totalFixedSales += totalSalesPrice;
        totalFixedCost += totalCostPrice;
      }
    });

    const totalExpenses = dayExpenses
      .filter(e => !isPurchaseExpense(e))
      .reduce((sum, e) => sum + e.amount, 0);
    const totalDiscounts = dayInvoices.reduce((sum, inv) => sum + (inv.discount || 0), 0);
    
    // grandTotalSales should be the total of all invoices for that day
    const grandTotalSales = dayInvoices.reduce((sum, inv) => sum + inv.total, 0);
    
    // grandTotalCost is the sum of opening costs of all raw materials (excluding sugar) + cost of ready-made products sold
    const totalRawMaterialsCost = todaySessionItems.reduce((sum, item) => {
      const isSugar = item.name_ar && (item.name_ar.trim().toLowerCase() === 'سكر' || item.name_ar.trim().toLowerCase() === 'السكر' || item.name_ar.trim().includes('سكر'));
      return sum + (isSugar ? 0 : item.cost);
    }, 0);
    const grandTotalCost = totalRawMaterialsCost + totalFixedCost;

    const grossProfit = grandTotalSales - grandTotalCost;
    const netProfit = grossProfit - totalExpenses;

    const dayPartnerDrawingsTotal = partnerDrawingsList
      .filter(d => d.date === selectedDate)
      .reduce((sum, d) => sum + d.amount, 0);

    return {
      rawMaterialsReportList,
      fixedCostList,
      totalFixedSales,
      totalFixedCost,
      totalExpenses,
      grandTotalSales,
      grandTotalCost,
      grossProfit,
      netProfit,
      totalDiscounts,
      dayPartnerDrawingsTotal
    };
  }, [daySession, dayItems, products, dayExpenses, dayInvoices, partnerDrawingsList, selectedDate]);

  // --- Top Selling Products ---
  const topSellingProducts = useMemo(() => {
    const counts: Record<string, { qty: number; sales: number; name: string; image: string }> = {};

    invoices.filter(i => i.invoice_status !== 'CANCELLED').forEach(inv => {
      const items = dbService.getInvoiceItems(inv.id);
      items.forEach(item => {
        // Exclude PlayStation playtime services from product reports
        if (item.product_id === 'service_playstation' || item.product_id === 'prod_playstation') {
          return;
        }

        if (!counts[item.product_id]) {
          counts[item.product_id] = {
            qty: 0,
            sales: 0,
            name: item.product_name_ar,
            image: '☕'
          };
        }
        counts[item.product_id].qty += item.quantity;
        counts[item.product_id].sales += item.total_price;
      });
    });

    return Object.values(counts)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5); // top 5
  }, [invoices]);

  // Payment method aggregated reporting
  const paymentMethodStats = useMemo(() => {
    let cashSales = 0;
    let cashCount = 0;
    let vodafoneSales = 0;
    let vodafoneCount = 0;
    let cardSales = 0;
    let cardCount = 0;
    let bankTransferSales = 0;
    let bankTransferCount = 0;
    let creditSales = 0;
    let creditCount = 0;

    const validInvoices = invoices.filter(i => i.invoice_status !== 'CANCELLED');

    validInvoices.forEach(inv => {
      let method = inv.payment_method || (inv.payment_type === 'CREDIT' ? 'CREDIT' : 'CASH');
      const hasDigitalMetadata = !!(inv.sender_phone || inv.senderPhone || inv.reference_number || inv.referenceNumber || inv.receipt_image_url || inv.receiptImageUrl);
      if ((!method || method === 'CASH') && hasDigitalMetadata) {
        method = (inv.payment_number && inv.payment_number.includes('insta')) ? 'BANK_TRANSFER' : 'VODAFONE_CASH';
      }

      const amount = inv.paid_amount || 0;
      const remaining = inv.remaining_amount || 0;

      if (amount > 0) {
        if (method === 'CASH') {
          cashSales += amount;
          cashCount++;
        } else if (method === 'VODAFONE_CASH') {
          vodafoneSales += amount;
          vodafoneCount++;
        } else if (method === 'BANK_CARD') {
          cardSales += amount;
          cardCount++;
        } else if (method === 'BANK_TRANSFER') {
          bankTransferSales += amount;
          bankTransferCount++;
        } else if (method === 'CREDIT') {
          creditSales += amount;
          creditCount++;
        }
      }

      if (remaining > 0) {
        creditSales += remaining;
        if (amount <= 0) {
          creditCount++;
        }
      }
    });

    const totalStatsAmount = cashSales + vodafoneSales + cardSales + bankTransferSales + creditSales;

    return {
      CASH: { amount: cashSales, count: cashCount, percentage: totalStatsAmount > 0 ? Math.round((cashSales / totalStatsAmount) * 100) : 0 },
      VODAFONE_CASH: { amount: vodafoneSales, count: vodafoneCount, percentage: totalStatsAmount > 0 ? Math.round((vodafoneSales / totalStatsAmount) * 100) : 0 },
      BANK_CARD: { amount: cardSales, count: cardCount, percentage: totalStatsAmount > 0 ? Math.round((cardSales / totalStatsAmount) * 100) : 0 },
      BANK_TRANSFER: { amount: bankTransferSales, count: bankTransferCount, percentage: totalStatsAmount > 0 ? Math.round((bankTransferSales / totalStatsAmount) * 100) : 0 },
      CREDIT: { amount: creditSales, count: creditCount, percentage: totalStatsAmount > 0 ? Math.round((creditSales / totalStatsAmount) * 100) : 0 },
      totalAmount: totalStatsAmount
    };
  }, [invoices]);

  // --- Employee & PlayStation Unified Product Consumption Analytics ---
  const consumptionStats = useMemo(() => {
    // 1. Employee Consumption
    const empTxs = dbService.getEmployeeTransactions();
    const consTxs = empTxs.filter(t => t.type === 'CONSUMPTION');
    
    let totalDeductedVal = 0; // Policy = DEDUCT
    let totalFreeVal = 0; // Policy = FREE
    const empProductCounts: Record<string, { name: string; qty: number; value: number }> = {};

    consTxs.forEach(tx => {
      // If amount > 0, it means policy was DEDUCT
      if (tx.amount > 0) {
        totalDeductedVal += tx.amount;
      } else {
        // If amount === 0, it was FREE, let's sum up selling prices of items
        const subTotal = tx.products?.reduce((sum, p) => sum + p.selling_price * p.quantity, 0) || 0;
        totalFreeVal += subTotal;
      }

      if (tx.products && tx.products.length > 0) {
        tx.products.forEach(p => {
          if (!empProductCounts[p.product_id]) {
            empProductCounts[p.product_id] = { name: p.product_name_ar, qty: 0, value: 0 };
          }
          empProductCounts[p.product_id].qty += p.quantity;
          empProductCounts[p.product_id].value += p.selling_price * p.quantity;
        });
      }
    });

    const topConsumedEmpProducts = Object.values(empProductCounts)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    // 2. PlayStation Sessions Breakdown
    const psSessions = dbService.getPSSessions().filter(s => s.status === 'COMPLETED');
    let totalPlayRevenue = 0;
    let totalSnacksRevenue = 0;

    psSessions.forEach(session => {
      // Each session has total_price which is the combined sum (play + products)
      totalPlayRevenue += session.total_price;
      
      const sessionSnackSum = session.products?.reduce((sum, p) => sum + p.selling_price * p.quantity, 0) || 0;
      totalSnacksRevenue += sessionSnackSum;
    });

    const netPlayRevenue = Math.max(0, totalPlayRevenue - totalSnacksRevenue);

    return {
      totalDeductedVal,
      totalFreeVal,
      topConsumedEmpProducts,
      totalPlayRevenue: netPlayRevenue,
      totalSnacksRevenue,
      totalPSRevenue: totalPlayRevenue,
      totalConsTransactionsCount: consTxs.length
    };
  }, [invoices]);

  // --- Charts SVG Calculations ---
  const chartData = useMemo(() => {
    // Return last 7 days sales
    const days = timeframe === 'WEEK' ? 7 : 30;
    const list = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().split('T')[0];
      
      const salesOnDay = invoices
        .filter(inv => inv.invoice_status !== 'CANCELLED' && inv.invoice_date.startsWith(dayStr))
        .reduce((sum, inv) => sum + inv.total, 0);

      const expensesOnDay = expenses
        .filter(exp => exp.expense_date.startsWith(dayStr) && !isPurchaseExpense(exp))
        .reduce((sum, exp) => sum + exp.amount, 0);

      list.push({
        label: timeframe === 'WEEK' ? d.toLocaleDateString('ar-EG', { weekday: 'short' }) : d.toLocaleDateString('ar-EG', { day: 'numeric' }),
        sales: salesOnDay,
        expenses: expensesOnDay,
        profit: Math.max(0, salesOnDay - expensesOnDay)
      });
    }
    return list;
  }, [invoices, expenses, timeframe]);

  // SVG Chart Dimensions & path generators
  const maxVal = useMemo(() => {
    const vals = chartData.map(d => Math.max(d.sales, d.expenses));
    const rawMax = Math.max(...vals, 1000);
    return Math.ceil(rawMax / 500) * 500; // round up
  }, [chartData]);

  const svgPaths = useMemo(() => {
    const width = 600;
    const height = 180;
    const padding = 35;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;
    
    const pointsSales: string[] = [];
    const pointsExpenses: string[] = [];

    chartData.forEach((d, i) => {
      const x = padding + (i / (chartData.length - 1)) * chartW;
      
      const ySales = height - padding - (d.sales / maxVal) * chartH;
      const yExpenses = height - padding - (d.expenses / maxVal) * chartH;

      pointsSales.push(`${x},${ySales}`);
      pointsExpenses.push(`${x},${yExpenses}`);
    });

    return {
      salesPath: pointsSales.length > 0 ? `M ${pointsSales.join(' L ')}` : '',
      expensesPath: pointsExpenses.length > 0 ? `M ${pointsExpenses.join(' L ')}` : '',
      pointsSales,
      pointsExpenses,
      width,
      height,
      padding,
      chartW,
      chartH
    };
  }, [chartData, maxVal]);

  const [isExporting, setIsExporting] = useState(false);

  const getExportOptions = () => ({
    activeReportTab,
    invoices,
    expenses,
    products,
    invoiceItems,
    drawerHistory,
    returnTransactions,
    partnersList,
    partnerDrawingsList,
    selectedDate,
    selectedPartnerId,
    settings,
    onStart: (msg: string) => onShowSuccessAlert(msg),
    onSuccess: (msg: string) => {
      setIsExporting(false);
      onShowSuccessAlert(msg);
    },
    onError: (msg: string) => {
      setIsExporting(false);
      onShowSuccessAlert(`⚠️ ${msg}`);
    }
  });

  const handleExportExcel = async () => {
    if (isExporting) return;
    setIsExporting(true);
    await exportReportToExcel(getExportOptions());
  };

  const handleExportPDF = async () => {
    if (isExporting) return;
    setIsExporting(true);
    await exportReportToPDF(getExportOptions());
  };

  return (
    <div className="flex flex-col gap-6 w-full animate-fade-in" dir="rtl">
      
      {/* 1. Header with download actions */}
      <div className="bg-luxury-card border border-luxury-border p-6 rounded-3xl shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="text-gold-500 w-6 h-6" />
            منظومة التقارير الشاملة والأداء المالي للمنشأة
          </h2>
          <p className="text-gray-400 text-xs mt-1">عرض الأرباح المجمعة، نسبة المصروفات، وقائمة المنتجات الأكثر شعبية في الكافيه</p>
        </div>

        <div className="flex gap-2">
          <button
            id="export-pdf-report"
            onClick={handleExportPDF}
            disabled={isExporting}
            className="px-5 py-2.5 bg-gradient-to-r from-gold-600 to-gold-700 text-black text-xs font-extrabold rounded-xl transition-all cursor-pointer shadow-md hover:opacity-90 flex items-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-black" />
            {isExporting ? 'جاري التصدير...' : 'تصدير تقرير PDF ملوكي'}
          </button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-gray-800 shrink-0">
        <button
          onClick={() => setActiveReportTab('shifts_handovers')}
          className={`px-6 py-3 border-b-2 font-bold text-xs transition-all cursor-pointer flex items-center gap-2 ${
            activeReportTab === 'shifts_handovers'
              ? 'border-gold-600 text-gold-500 bg-gold-600/5'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <span className="text-base">🔄</span>
          سجل وتسليم الورديات (Shift Handover)
        </button>
        <button
          onClick={() => setActiveReportTab('batch_profit')}
          className={`px-6 py-3 border-b-2 font-bold text-xs transition-all cursor-pointer flex items-center gap-2 ${
            activeReportTab === 'batch_profit'
              ? 'border-gold-600 text-gold-500 bg-gold-600/5'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <span className="text-base">📈</span>
          تحليل ربح الدفعات (Batch Profit)
        </button>
        <button
          onClick={() => setActiveReportTab('daily_raw_materials')}
          className={`px-6 py-3 border-b-2 font-bold text-xs transition-all cursor-pointer flex items-center gap-2 ${
            activeReportTab === 'daily_raw_materials'
              ? 'border-gold-600 text-gold-500 bg-gold-600/5'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <span className="text-base">🌾</span>
          جرد وأرباح المواد الخام اليومية
        </button>
        <button
          onClick={() => setActiveReportTab('general')}
          className={`px-6 py-3 border-b-2 font-bold text-xs transition-all cursor-pointer flex items-center gap-2 ${
            activeReportTab === 'general'
              ? 'border-gold-600 text-gold-500 bg-gold-600/5'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <span className="text-base">📊</span>
          التقارير المالية والرسوم البيانية العامة
        </button>
        <button
          onClick={() => setActiveReportTab('partners_statement')}
          className={`px-6 py-3 border-b-2 font-bold text-xs transition-all cursor-pointer flex items-center gap-2 ${
            activeReportTab === 'partners_statement'
              ? 'border-gold-600 text-gold-500 bg-gold-600/5'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <span className="text-base">🤝</span>
          كشف حساب الشريك والمسحوبات
        </button>
      </div>

      {activeReportTab === 'daily_raw_materials' && (
        <div className="flex flex-col gap-6 w-full animate-fade-in">
          {/* Controls Bar */}
          <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 font-bold">اختر تاريخ جرد اليومية:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 font-bold"
              />
            </div>

            <div className="flex items-center gap-2.5">
              {daySession ? (
                <span className="px-3 py-1 bg-green-950/40 text-green-400 border border-green-900/30 rounded-xl font-bold text-xs flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                  تم تسجيل مخزون البداية لليوم بنجاح ✓
                </span>
              ) : (
                <span className="px-3 py-1 bg-amber-950/40 text-amber-400 border border-amber-900/30 rounded-xl font-bold text-xs flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                  لم يتم تسجيل مخزون لهذا اليوم ⚠️
                </span>
              )}

              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-luxury-bg border border-gray-800 hover:border-gold-600 text-gold-500 hover:text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md flex items-center gap-1.5"
              >
                <span>🖨️</span>
                طباعة تقرير اليومية
              </button>
            </div>
          </div>

          {/* Opening state details if exists */}
          {daySession && (
            <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl">
              <h3 className="text-xs font-black text-white flex items-center gap-2 mb-4">
                <span>🌾</span>
                سجل المواد الخام التي تم افتتاح اليوم بها (تاريخ: {selectedDate})
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {daySession.items.map((item) => (
                  <div key={item.raw_material_id} className="bg-luxury-bg border border-gray-900 p-3.5 rounded-xl text-center">
                    <span className="text-lg block mb-1">🌾</span>
                    <span className="text-[10px] text-gray-400 font-bold block">{item.name_ar}</span>
                    <span className="text-sm font-black text-white font-mono mt-1 block">
                      {item.quantity} <span className="text-[10px] text-gray-500 font-normal">{item.unit}</span>
                    </span>
                    <span className="text-[10px] text-gold-500 font-bold block mt-1">
                      التكلفة: {item.cost.toLocaleString()} {settings.currency}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stats Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
            {/* Total Sales */}
            <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl flex justify-between items-center shadow-lg">
              <div>
                <span className="text-[10px] text-gray-500 font-bold block mb-1">صافي المبيعات اليومية</span>
                <span className="text-lg font-black text-white font-mono">{dailyReportData.grandTotalSales.toLocaleString()} ج.م</span>
                <span className="text-[9px] text-gray-400 block mt-1">حجم المبيعات الفعلي بعد الخصم</span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gold-600/10 border border-gold-600/20 flex items-center justify-center text-gold-500 shrink-0">
                <span>💰</span>
              </div>
            </div>

            {/* Total Discounts */}
            <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl flex justify-between items-center shadow-lg">
              <div>
                <span className="text-[10px] text-gray-400 font-bold block mb-1">خصومات اليوم الممنوحة</span>
                <span className="text-lg font-black text-amber-500 font-mono">{dailyReportData.totalDiscounts.toLocaleString()} ج.م</span>
                <span className="text-[9px] text-gray-500 block mt-1">إجمالي التخفيضات اليومية</span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
                <Percent className="w-5 h-5 text-amber-500" strokeWidth={2.5} />
              </div>
            </div>

            {/* Total Cost */}
            <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl flex justify-between items-center shadow-lg">
              <div>
                <span className="text-[10px] text-gray-500 font-bold block mb-1">تكلفة المبيعات اليومية</span>
                <span className="text-lg font-black text-amber-500 font-mono">{dailyReportData.grandTotalCost.toLocaleString()} ج.م</span>
                <span className="text-[9px] text-gray-400 block mt-1">المواد الخام المستهلكة</span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-950/20 border border-amber-900/30 flex items-center justify-center text-amber-500 shrink-0">
                <span>🌾</span>
              </div>
            </div>

            {/* Expenses */}
            <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl flex justify-between items-center shadow-lg">
              <div>
                <span className="text-[10px] text-gray-500 font-bold block mb-1">المصروفات اليومية</span>
                <span className="text-lg font-black text-red-400 font-mono">{dailyReportData.totalExpenses.toLocaleString()} ج.م</span>
                <span className="text-[9px] text-gray-400 block mt-1">نفقات تشغيلية مسجلة اليوم</span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-red-950/20 border border-red-900/30 flex items-center justify-center text-red-500 shrink-0">
                <span>💸</span>
              </div>
            </div>

            {/* Net Profit */}
            <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl flex justify-between items-center shadow-lg">
              <div>
                <span className="text-[10px] text-gray-500 font-bold block mb-1">صافي أرباح اليوم الفعلي</span>
                <span className={`text-lg font-black font-mono ${dailyReportData.netProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {dailyReportData.netProfit.toLocaleString()} ج.م
                </span>
                <span className="text-[9px] text-gold-500 font-bold block mt-1">الأرباح المتبقية الصافية</span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-green-950/20 border border-green-900/30 flex items-center justify-center text-green-400 shrink-0">
                <span>📈</span>
              </div>
            </div>
          </div>

          {/* Strictly Separate Partner Drawings Section */}
          <div className="bg-amber-950/20 border border-amber-500/30 p-4.5 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold shrink-0 text-base">
                🤝
              </div>
              <div>
                <h4 className="text-xs font-black text-amber-400">إجمالي مسحوبات الشركاء اليوم: {dailyReportData.dayPartnerDrawingsTotal.toLocaleString()} {settings.currency || 'ج.م'}</h4>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  تنبيه محاسبي: مسحوبات الشركاء هي توزيع أرباح ملكية وليست مصاريف تشغيلية، ولا تُخصم من صافي أرباح الكافيه أعلاه.
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveReportTab('partners_statement')}
              className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-xs rounded-xl transition-all cursor-pointer whitespace-nowrap"
            >
              عرض كشف حساب الشركاء ➔
            </button>
          </div>
          {/* Lists */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Raw Materials Report Column */}
            <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl">
              <h3 className="text-xs font-black text-white flex items-center gap-2 mb-3.5 border-b border-gray-800 pb-3">
                <span className="text-base">🌾</span>
                أولاً: جرد وأرباح المواد الخام والمنتجات المحضرة
              </h3>

              {dailyReportData.rawMaterialsReportList.length === 0 ? (
                <p className="text-center text-xs text-gray-500 py-6">لا يوجد سجل لمواد خام مفتتحة في هذا اليوم.</p>
              ) : (
                <div className="space-y-4">
                  {dailyReportData.rawMaterialsReportList.map((rm: any) => (
                    <div key={rm.rawMaterialId} className="bg-luxury-bg/40 border border-gray-900 rounded-xl p-4 flex flex-col gap-3">
                      {/* RM Title Header */}
                      <div className="flex justify-between items-start border-b border-gray-900/60 pb-2">
                        <div className="flex items-center gap-2.5">
                          <span className="text-lg">🌾</span>
                          <div>
                            <span className="text-xs font-black text-white block">{rm.name_ar}</span>
                            <span className="text-[10px] text-gray-500">رصيد البداية: {rm.startingBalance} {rm.unit}</span>
                          </div>
                        </div>
                        <div className="text-left">
                          <span className="text-xs font-black text-amber-500 block">
                            {rm.isSugar ? 'مستثنى (مادة سكر)' : `${rm.cost.toLocaleString()} ج.م`}
                          </span>
                          <span className="text-[9px] text-gray-500">{rm.isSugar ? 'معفي من التكاليف والربح' : 'تكلفة الافتتاح'}</span>
                        </div>
                      </div>

                      {/* Produced Products list */}
                      <div className="space-y-2">
                        <span className="text-[9px] text-gray-400 font-bold block">المنتجات المحضرة والمبيعات الناتجة عنها:</span>
                        {rm.producedProducts.length === 0 ? (
                          <div className="flex items-center gap-1.5 py-1 text-[10px] text-gray-500">
                            <span>⚠️</span>
                            <span>لم تُستهلك هذه المادة اليوم (رصيد باقٍ بالمخزن)</span>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {rm.producedProducts.map((p: any) => (
                              <div key={p.productId} className="flex justify-between items-center text-[10px] bg-black/30 px-2.5 py-1.5 rounded-lg border border-gray-950">
                                <div className="flex items-center gap-2 text-gray-300">
                                  <span>{p.image || '☕'}</span>
                                  <span className="font-bold">{p.name_ar}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-gray-400 font-mono">{p.quantitySold} كوب/وحدة</span>
                                  {!rm.isSugar && (
                                    <span className="text-gold-500 font-black font-mono">{p.revenue.toLocaleString()} ج.م</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Math Summary for RM Card */}
                      {rm.isSugar ? (
                        <div className="bg-[#0b0c10]/60 border border-gold-500/10 rounded-xl p-3 text-[10px] text-gray-400 leading-relaxed font-semibold">
                          🍬 <strong>مادة السكر مضافة في التحضير:</strong> تم استبعاد السكر من حساب التكاليف والأرباح بناءً على رغبتكم، ويقوم النظام برصد أعداد الأكواب والكميات فقط دون أي حساب مالي.
                        </div>
                      ) : (
                        <div className="bg-luxury-bg/90 border border-gray-950 rounded-lg p-2.5 text-[10px] space-y-1 mt-1">
                          <div className="flex justify-between items-center text-gray-400">
                            <span>إجمالي إيراد المشروبات المباعة</span>
                            <span className="font-mono text-white">{rm.totalRevenue.toLocaleString()} ج.م</span>
                          </div>
                          <div className="flex justify-between items-center text-gray-400">
                            <span>تكلفة المادة الخام</span>
                            <span className="font-mono text-red-400">-{rm.cost.toLocaleString()} ج.م</span>
                          </div>
                          <div className="flex justify-between items-center text-white border-t border-gray-900 pt-1.5 mt-1 font-bold text-[11px]">
                            <span>الربح الأولي للمادة</span>
                            <span className={`font-mono ${rm.initialProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                              {rm.initialProfit.toLocaleString()} ج.م
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Ready-made / Prepackaged Products Column */}
            <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl">
              <h3 className="text-xs font-black text-white flex items-center gap-2 mb-3.5 border-b border-gray-800 pb-3">
                <span className="text-base">🥤</span>
                ثانياً: المنتجات المعبأة والمصنعة مسبقاً (ذات التكلفة الثابتة)
              </h3>

              {dailyReportData.fixedCostList.length === 0 ? (
                <p className="text-center text-xs text-gray-500 py-6">لا توجد مبيعات منتجات جاهزة مسجلة في هذا اليوم.</p>
              ) : (
                <div className="space-y-3">
                  {dailyReportData.fixedCostList.map((p: any) => (
                    <div key={p.id} className="bg-luxury-bg/20 border border-gray-900 rounded-xl p-3 flex justify-between items-center">
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg">{p.image || '🥤'}</span>
                        <div>
                          <span className="text-xs font-black text-white block">{p.name_ar}</span>
                          <span className="text-[9px] text-gray-500">تم بيع: {p.qty} قطعة • تكلفة مفردة: {(p.totalCost / p.qty).toFixed(1)} ج.م</span>
                        </div>
                      </div>
                      <div className="text-left">
                        <span className="text-xs font-black text-white block">{p.sales.toLocaleString()} ج.م</span>
                        <span className="text-[9px] text-green-500 block font-bold font-mono">ربح: {p.grossProfit.toLocaleString()} ج.م</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeReportTab === 'general' && (
        <>
          {/* 2. Top statistics grid widgets */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 shrink-0">
        
        {/* Total Revenues */}
        <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl shadow-lg flex justify-between items-center relative overflow-hidden group">
          <div>
            <span className="text-[10px] text-gray-500 font-bold block mb-1">صافي المبيعات (بعد الخصم)</span>
            <span className="text-lg font-black text-white font-mono">{totals.totalSales.toLocaleString()} ج.م</span>
            {totals.growthRate > 0 ? (
              <span className="text-[9px] text-green-500 font-bold block mt-1">↑ {totals.growthRate}% مقارنة بالأسبوع الماضي</span>
            ) : totals.growthRate < 0 ? (
              <span className="text-[9px] text-red-500 font-bold block mt-1">↓ {Math.abs(totals.growthRate)}% مقارنة بالأسبوع الماضي</span>
            ) : (
              <span className="text-[9px] text-gray-500 font-bold block mt-1">0% مقارنة بالأسبوع الماضي</span>
            )}
          </div>
          <div className="w-12 h-12 rounded-xl bg-gold-600/10 border border-gold-600/20 flex items-center justify-center text-gold-500 shrink-0">
            <Coins className="w-5 h-5" />
          </div>
        </div>

        {/* Total Discounts */}
        <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl shadow-lg flex justify-between items-center relative overflow-hidden group">
          <div>
            <span className="text-[10px] text-gray-400 font-bold block mb-1">إجمالي الخصومات الممنوحة</span>
            <span className="text-lg font-black text-amber-500 font-mono">{totals.totalDiscounts.toLocaleString()} ج.م</span>
            <span className="text-[9px] text-gray-500 block mt-1">إجمالي التخفيضات بالفترة</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
            <Percent className="w-5 h-5" strokeWidth={2.5} />
          </div>
        </div>

        {/* Expenses */}
        <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl shadow-lg flex justify-between items-center relative overflow-hidden group">
          <div>
            <span className="text-[10px] text-gray-500 font-bold block mb-1">إجمالي المصروفات التشغيلية</span>
            <span className="text-lg font-black text-red-400 font-mono">{totals.totalExp.toLocaleString()} ج.م</span>
            <span className="text-[9px] text-gray-500 block mt-1">تضم الأجور، الإيجارات، الفواتير</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-red-950/20 border border-red-900/30 flex items-center justify-center text-red-500 shrink-0">
            <ArrowUpRight className="w-5 h-5 transform rotate-90" />
          </div>
        </div>

        {/* Net Profit */}
        <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl shadow-lg flex justify-between items-center relative overflow-hidden group">
          <div>
            <span className="text-[10px] text-gray-500 font-bold block mb-1">صافي الأرباح المحققة</span>
            <span className={`text-lg font-black font-mono ${totals.netProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {totals.netProfit.toLocaleString()} ج.م
            </span>
            <span className="text-[9px] text-gold-500 font-bold block mt-1">صافي الربح الفعلي للمحل</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-green-950/20 border border-green-900/30 flex items-center justify-center text-green-400 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* Cash In Drawer */}
        <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl shadow-lg flex justify-between items-center relative overflow-hidden group">
          <div>
            <span className="text-[10px] text-gray-500 font-bold block mb-1">عدد الفواتير الصالحة</span>
            <span className="text-lg font-black text-white font-mono">{totals.invoiceCount} فاتورة</span>
            <span className="text-[9px] text-gray-500 block mt-1">لا تشمل العمليات الملغية</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-luxury-bg border border-gray-800 flex items-center justify-center text-gray-400 shrink-0">
            <Users className="w-5 h-5" />
          </div>
        </div>

      </div>

      {/* 3. Mid Grid: Trendlines & Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Trendline Area (2/3 width) */}
        <div className="bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-lg lg:col-span-2 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-4.5 h-4.5 text-gold-500" />
                تحليل حركة المبيعات مقابل النفقات
              </h3>
              
              <div className="flex bg-luxury-bg p-1 rounded-xl border border-gray-900 text-[10px] font-bold">
                <button
                  onClick={() => setTimeframe('WEEK')}
                  className={`px-3 py-1 rounded-lg cursor-pointer ${timeframe === 'WEEK' ? 'bg-gold-600 text-black font-bold' : 'text-gray-400'}`}
                >
                  آخر 7 أيام
                </button>
                <button
                  onClick={() => setTimeframe('MONTH')}
                  className={`px-3 py-1 rounded-lg cursor-pointer ${timeframe === 'MONTH' ? 'bg-gold-600 text-black font-bold' : 'text-gray-400'}`}
                >
                  آخر 30 يوم
                </button>
              </div>
            </div>

            {/* SVG Visual graph chart */}
            <div className="relative w-full overflow-hidden my-3">
              <svg
                viewBox={`0 0 ${svgPaths.width} ${svgPaths.height}`}
                className="w-full h-auto overflow-visible"
              >
                {/* Horizontal grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                  const y = svgPaths.padding + ratio * svgPaths.chartH;
                  const labelVal = Math.round(maxVal * (1 - ratio));
                  return (
                    <g key={idx}>
                      <line
                        x1={svgPaths.padding}
                        y1={y}
                        x2={svgPaths.width - svgPaths.padding}
                        y2={y}
                        stroke="#222"
                        strokeWidth="1"
                        strokeDasharray="4 4"
                      />
                      <text
                        x={svgPaths.padding - 8}
                        y={y + 3}
                        fill="#555"
                        fontSize="8"
                        fontFamily="monospace"
                        textAnchor="end"
                      >
                        {labelVal}
                      </text>
                    </g>
                  );
                })}

                {/* Sales Line (Gold) */}
                <path
                  d={svgPaths.salesPath}
                  fill="none"
                  stroke="#D4AF37"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                {/* Expenses Line (Red) */}
                <path
                  d={svgPaths.expensesPath}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />

                {/* Sales points */}
                {svgPaths.pointsSales.map((pt, i) => {
                  const [x, y] = pt.split(',');
                  return (
                    <circle
                      key={i}
                      cx={x}
                      cy={y}
                      r="4"
                      fill="#1E1E1E"
                      stroke="#D4AF37"
                      strokeWidth="2"
                    />
                  );
                })}

                {/* X axis labels */}
                {chartData.map((d, i) => {
                  const x = svgPaths.padding + (i / (chartData.length - 1)) * svgPaths.chartW;
                  return (
                    <text
                      key={i}
                      x={x}
                      y={svgPaths.height - 10}
                      fill="#666"
                      fontSize="8"
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      {d.label}
                    </text>
                  );
                })}
              </svg>
            </div>

            {/* Legend indicators */}
            <div className="flex justify-center gap-6 text-[10px] text-gray-400 font-bold mt-4">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-1 bg-gold-500 rounded-full" />
                مبيعات الإيرادات (ج.م)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-1 bg-red-500 rounded-full" />
                المصروفات التشغيلية (ج.م)
              </span>
            </div>
          </div>

          <div className="text-[10px] text-gray-500 text-center border-t border-gray-900 pt-3 mt-4">
            الرسوم البيانية مشتقة آلياً وتحديثها فوري طبقاً لمخططات SQLite المحملة محلياً
          </div>
        </div>

        {/* Top 5 Products Leaderboard */}
        <div className="bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-lg flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-white mb-5 flex items-center gap-2">
              <Coffee className="w-4.5 h-4.5 text-gold-500" />
              الأكثر مبيعاً ورواجاً بالكافيه
            </h3>

            <div className="space-y-4">
              {topSellingProducts.length === 0 ? (
                <div className="text-center py-10 text-gray-500 text-xs font-semibold">
                  بانتظار تسجيل المبيعات الأولى لرسم قائمة الأوائل
                </div>
              ) : (
                topSellingProducts.map((p, idx) => {
                  const colors = ['bg-gold-500 text-black', 'bg-gray-700 text-white', 'bg-amber-800 text-white', 'bg-gray-900 text-gray-400', 'bg-gray-950 text-gray-500'];
                  return (
                    <div key={idx} className="flex justify-between items-center bg-luxury-bg/50 border border-gray-900 p-3 rounded-xl">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black ${colors[idx] || 'bg-gray-900 text-gray-500'}`}>
                          {idx + 1}
                        </span>
                        <div>
                          <span className="text-xs font-bold text-white block">{p.name}</span>
                          <span className="text-[9px] text-gray-500 mt-0.5">تم سحب {p.qty} كوب / قطعة</span>
                        </div>
                      </div>

                      <span className="font-mono text-xs font-bold text-gold-500 shrink-0">
                        {p.sales.toLocaleString()} ج.م
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="text-[10px] text-gray-500 text-center border-t border-gray-900 pt-3 mt-4">
            تحليل النسبة المئوية مستقر وآمن 100%
          </div>
        </div>

      </div>

      {/* تقرير وسائل الدفع الإلكترونية والنقدية */}
      <div className="bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-lg">
        <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
          <Coins className="w-4.5 h-4.5 text-gold-500" />
          تقرير وسائل الدفع الإلكترونية والنقدية (Multi-Payment Analytics)
        </h3>
        <p className="text-[11px] text-gray-400 mb-5">مقارنة أداء وتوزيع مبيعات المنشأة النقدية، والإلكترونية والآجلة</p>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* CASH CARD */}
          <div className="bg-luxury-bg/50 border border-gray-900 rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-300 font-bold">نقدي (Cash)</span>
              <span className="text-xs font-mono font-bold text-gold-500">{paymentMethodStats.CASH.percentage}%</span>
            </div>
            <div className="h-2 bg-gray-950 rounded-full overflow-hidden">
              <div style={{ width: `${paymentMethodStats.CASH.percentage}%` }} className="h-full bg-gold-600 rounded-full" />
            </div>
            <div className="flex justify-between items-center text-[10px] text-gray-500">
              <span>{paymentMethodStats.CASH.count} فواتير</span>
              <span className="font-mono text-white font-bold">{paymentMethodStats.CASH.amount.toLocaleString()} ج.م</span>
            </div>
          </div>

          {/* VODAFONE CASH CARD */}
          <div className="bg-luxury-bg/50 border border-gray-900 rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-300 font-bold">فودافون كاش</span>
              <span className="text-xs font-mono font-bold text-red-500">{paymentMethodStats.VODAFONE_CASH.percentage}%</span>
            </div>
            <div className="h-2 bg-gray-950 rounded-full overflow-hidden">
              <div style={{ width: `${paymentMethodStats.VODAFONE_CASH.percentage}%` }} className="h-full bg-red-600 rounded-full" />
            </div>
            <div className="flex justify-between items-center text-[10px] text-gray-500">
              <span>{paymentMethodStats.VODAFONE_CASH.count} فواتير</span>
              <span className="font-mono text-white font-bold">{paymentMethodStats.VODAFONE_CASH.amount.toLocaleString()} ج.م</span>
            </div>
          </div>

          {/* BANK CARD CARD */}
          <div className="bg-luxury-bg/50 border border-gray-900 rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-300 font-bold">بطاقة بنكية</span>
              <span className="text-xs font-mono font-bold text-cyan-500">{paymentMethodStats.BANK_CARD.percentage}%</span>
            </div>
            <div className="h-2 bg-gray-950 rounded-full overflow-hidden">
              <div style={{ width: `${paymentMethodStats.BANK_CARD.percentage}%` }} className="h-full bg-cyan-500 rounded-full" />
            </div>
            <div className="flex justify-between items-center text-[10px] text-gray-500">
              <span>{paymentMethodStats.BANK_CARD.count} فواتير</span>
              <span className="font-mono text-white font-bold">{paymentMethodStats.BANK_CARD.amount.toLocaleString()} ج.م</span>
            </div>
          </div>

          {/* BANK TRANSFER CARD */}
          <div className="bg-luxury-bg/50 border border-gray-900 rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-300 font-bold">إنستا باي / تحويل بنكي</span>
              <span className="text-xs font-mono font-bold text-purple-500">{paymentMethodStats.BANK_TRANSFER.percentage}%</span>
            </div>
            <div className="h-2 bg-gray-950 rounded-full overflow-hidden">
              <div style={{ width: `${paymentMethodStats.BANK_TRANSFER.percentage}%` }} className="h-full bg-purple-500 rounded-full" />
            </div>
            <div className="flex justify-between items-center text-[10px] text-gray-500">
              <span>{paymentMethodStats.BANK_TRANSFER.count} فواتير</span>
              <span className="font-mono text-white font-bold">{paymentMethodStats.BANK_TRANSFER.amount.toLocaleString()} ج.م</span>
            </div>
          </div>

          {/* CREDIT CARD */}
          <div className="bg-luxury-bg/50 border border-gray-900 rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-300 font-bold">آجل / ذمم</span>
              <span className="text-xs font-mono font-bold text-amber-500">{paymentMethodStats.CREDIT.percentage}%</span>
            </div>
            <div className="h-2 bg-gray-950 rounded-full overflow-hidden">
              <div style={{ width: `${paymentMethodStats.CREDIT.percentage}%` }} className="h-full bg-amber-500 rounded-full" />
            </div>
            <div className="flex justify-between items-center text-[10px] text-gray-500">
              <span>{paymentMethodStats.CREDIT.count} عملاء</span>
              <span className="font-mono text-white font-bold">{paymentMethodStats.CREDIT.amount.toLocaleString()} ج.م</span>
            </div>
          </div>
        </div>

        {/* --- DYNAMIC REPORT SECTION: PRODUCT CONSUMPTION & PLAYSTATION REVENUE DETAILS --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 border-t border-gray-900/50 pt-5">
          
          {/* PlayStation Devices Session & Snack Revenue */}
          <div className="bg-luxury-bg/50 border border-gray-900 rounded-2xl p-5 space-y-4">
            <h4 className="text-xs font-black text-white flex items-center gap-2">
              <span className="text-purple-400">🎮</span>
              تحليل مبيعات جهاز البلايستيشن والمشروبات المصاحبة
            </h4>
            <p className="text-[10px] text-gray-400 leading-relaxed">يوضح هذا التحليل العوائد المجمعة من فترات اللعب الفعلية مقارنة بطلبات المأكولات والمشروبات المدمجة بنفس فواتير الجلسات.</p>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-black/40 p-3 rounded-xl text-center border border-gray-950">
                <span className="text-[9px] text-gray-500 block mb-0.5">إجمالي عوائد الـ PS</span>
                <span className="text-xs font-mono font-bold text-white">{(consumptionStats.totalPSRevenue).toLocaleString()} ج.م</span>
              </div>
              <div className="bg-black/40 p-3 rounded-xl text-center border border-gray-950">
                <span className="text-[9px] text-purple-400 block mb-0.5">رسوم وقت اللعب</span>
                <span className="text-xs font-mono font-bold text-purple-400">{(consumptionStats.totalPlayRevenue).toLocaleString()} ج.م</span>
              </div>
              <div className="bg-black/40 p-3 rounded-xl text-center border border-gray-950">
                <span className="text-[9px] text-gold-500 block mb-0.5">قيمة المشروبات المباعة</span>
                <span className="text-xs font-mono font-bold text-gold-500">{(consumptionStats.totalSnacksRevenue).toLocaleString()} ج.م</span>
              </div>
            </div>

            {/* Visual ratio bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[9px] text-gray-400 font-bold">
                <span>نسبة مبيعات المشروبات باللعب</span>
                <span>{consumptionStats.totalPSRevenue > 0 ? Math.round((consumptionStats.totalSnacksRevenue / consumptionStats.totalPSRevenue) * 100) : 0}%</span>
              </div>
              <div className="h-2 bg-gray-950 rounded-full overflow-hidden flex">
                <div style={{ width: `${consumptionStats.totalPSRevenue > 0 ? (consumptionStats.totalPlayRevenue / consumptionStats.totalPSRevenue) * 100 : 100}%` }} className="h-full bg-purple-600" title="وقت اللعب" />
                <div style={{ width: `${consumptionStats.totalPSRevenue > 0 ? (consumptionStats.totalSnacksRevenue / consumptionStats.totalPSRevenue) * 100 : 0}%` }} className="h-full bg-gold-500" title="المشروبات والسناكس" />
              </div>
              <div className="flex justify-between text-[8px] text-gray-500 pt-0.5">
                <span>🟣 رسوم اللعب</span>
                <span>🟡 مبيعات البوفيه للجلسة</span>
              </div>
            </div>
          </div>

          {/* Employee Product Consumption Statistics */}
          <div className="bg-luxury-bg/50 border border-gray-900 rounded-2xl p-5 space-y-4">
            <h4 className="text-xs font-black text-white flex items-center gap-2">
              <span className="text-amber-500">👥</span>
              تقرير استهلاك وسحب الموظفين (Welfare & Deductions)
            </h4>
            <p className="text-[10px] text-gray-400 leading-relaxed">ملخص فوري لمنتجات ومشروبات الكافيه المسحوبة لصالح العمال والمنقسمة ما بين الخصم المباشر من الرواتب أو الوجبات والضيافة المجانية.</p>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-black/40 p-3 rounded-xl text-center border border-gray-950">
                <span className="text-[9px] text-gray-500 block mb-0.5">عدد السحبيات</span>
                <span className="text-xs font-mono font-bold text-white">{consumptionStats.totalConsTransactionsCount} عملية</span>
              </div>
              <div className="bg-black/40 p-3 rounded-xl text-center border border-gray-950">
                <span className="text-[9px] text-amber-500 block mb-0.5">مستقطع من الراتب</span>
                <span className="text-xs font-mono font-bold text-amber-500">{(consumptionStats.totalDeductedVal).toLocaleString()} ج.م</span>
              </div>
              <div className="bg-black/40 p-3 rounded-xl text-center border border-gray-950">
                <span className="text-[9px] text-green-400 block mb-0.5">ضيافة مجانية</span>
                <span className="text-xs font-mono font-bold text-green-400">{(consumptionStats.totalFreeVal).toLocaleString()} ج.م</span>
              </div>
            </div>

            {/* Top Employee Consumed Products list */}
            <div>
              <span className="text-[9px] text-gray-400 font-extrabold block mb-1.5 uppercase">المنتجات الأكثر طلباً واستهلاكاً للعمال:</span>
              {consumptionStats.topConsumedEmpProducts.length === 0 ? (
                <div className="text-center py-2 text-gray-600 text-[10px]">لا توجد سحبيات منتجات للموظفين حتى الآن.</div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {consumptionStats.topConsumedEmpProducts.map((p, idx) => (
                    <div key={idx} className="bg-black/35 p-2 rounded-lg border border-gray-950 flex justify-between items-center text-[10px]">
                      <span className="text-gray-300 font-bold truncate max-w-[120px]">{p.name}</span>
                      <span className="font-mono text-gray-500">x{p.qty}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Detailed Transactions List for Electronic/Ref payments */}
        <div className="mt-6 border-t border-gray-900/50 pt-5 space-y-3">
          <h4 className="text-xs font-bold text-gray-300">أحدث المعاملات الإلكترونية والتحويلات المسجلة:</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-gray-900 text-gray-500 font-bold">
                  <th className="pb-2 px-1">رقم الفاتورة</th>
                  <th className="pb-2 px-1">التاريخ والوقت</th>
                  <th className="pb-2 px-1 text-center">الوسيلة</th>
                  <th className="pb-2 px-1">رقم المحول</th>
                  <th className="pb-2 px-1">رقم المرجع</th>
                  <th className="pb-2 px-1">الإيصال</th>
                  <th className="pb-2 px-1">العميل</th>
                  <th className="pb-2 px-1">ملاحظات الدفع</th>
                  <th className="pb-2 px-1 text-left">المبلغ المسدد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-900/30">
                {invoices.filter(i => i.invoice_status !== 'CANCELLED' && i.payment_method && i.payment_method !== 'CASH').length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-6 text-gray-600 font-semibold">
                      لم يتم استقبال مدفوعات إلكترونية أو تحويلات فودافون كاش حتى الآن
                    </td>
                  </tr>
                ) : (
                  invoices
                    .filter(i => i.invoice_status !== 'CANCELLED' && i.payment_method && i.payment_method !== 'CASH')
                    .slice(0, 15)
                    .map((inv, idx) => {
                      const receiptUrl = inv.receipt_image_url || inv.receiptImageUrl;
                      const senderP = inv.sender_phone || inv.senderPhone;
                      const refNo = inv.reference_number || inv.referenceNumber;
                      return (
                        <tr key={idx} className="hover:bg-gray-950/20">
                          <td className="py-2.5 px-1 font-mono text-gold-500 font-bold">{inv.invoice_number}</td>
                          <td className="py-2.5 px-1 text-gray-400">{inv.payment_date || inv.invoice_date} {inv.payment_time}</td>
                          <td className="py-2.5 px-1 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              inv.payment_method === 'VODAFONE_CASH' ? 'bg-red-950/30 text-red-400 border border-red-950' :
                              inv.payment_method === 'BANK_CARD' ? 'bg-cyan-950/30 text-cyan-400 border border-cyan-950' :
                              'bg-purple-950/30 text-purple-400 border border-purple-950'
                            }`}>
                              {inv.payment_method === 'VODAFONE_CASH' ? 'فودافون كاش' :
                               inv.payment_method === 'BANK_CARD' ? 'بطاقة بنكية' : 'إنستا باي / تحويل'}
                            </span>
                          </td>
                          <td className="py-2.5 px-1 font-mono text-amber-400 font-bold select-all">{senderP || '-'}</td>
                          <td className="py-2.5 px-1 font-mono text-gray-300 font-bold select-all">{refNo || '-'}</td>
                          <td className="py-2.5 px-1">
                            {receiptUrl ? (
                              <button
                                type="button"
                                onClick={() => setViewReceiptModalUrl(receiptUrl)}
                                className="flex items-center gap-1.5 px-2 py-1 bg-luxury-card border border-gold-600/40 text-gold-400 hover:bg-gray-800 rounded-lg text-[10px] font-bold transition-all cursor-pointer"
                              >
                                <img src={receiptUrl} alt="Thumbnail" className="w-5 h-5 object-cover rounded" />
                                <span>عرض</span>
                              </button>
                            ) : (
                              <span className="text-gray-600 text-[10px]">بدون إيصال</span>
                            )}
                          </td>
                          <td className="py-2.5 px-1 text-gray-300">{inv.customer_name || 'زبون عام'}</td>
                          <td className="py-2.5 px-1 text-gray-400 max-w-xs truncate">{inv.payment_notes || '-'}</td>
                          <td className="py-2.5 px-1 text-left font-mono text-white font-bold">{(inv.paid_amount || inv.total).toLocaleString()} ج.م</td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 4. Drawer Logs (Cash Flow) */}
      <div className="bg-luxury-card border border-luxury-border rounded-3xl p-5 shadow-lg">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-1.5">
          <Briefcase className="w-4.5 h-4.5 text-gold-500" />
          سجل غلق صناديق الكاش وفروقات الميزانية التاريخية (Cash Flow Log)
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="border-b border-gray-900 text-gray-400 font-bold">
                <th className="pb-3 pt-1 px-2">رقم الجلسة</th>
                <th className="pb-3 pt-1 px-2">تاريخ الفتح والغلق</th>
                <th className="pb-3 pt-1 px-2">الكاشير المسؤول</th>
                <th className="pb-3 pt-1 px-2 text-left">الرصيد الافتتاحي</th>
                <th className="pb-3 pt-1 px-2 text-left">المبيعات المقبوضة</th>
                <th className="pb-3 pt-1 px-2 text-left">المصروفات النقدية</th>
                <th className="pb-3 pt-1 px-2 text-left">الرصيد الفعلي المقفل</th>
                <th className="pb-3 pt-1 px-2 text-center font-bold">العجز والزيادة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-900/40">
              {drawerHistory.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-gray-500">
                    لا توجد جلسات خزينة مغلقة في النظام حالياً
                  </td>
                </tr>
              ) : (
                drawerHistory.map(log => {
                  const expected = log.opening_balance + log.cash_in - log.cash_out;
                  const diff = log.closing_balance !== null ? (log.closing_balance - expected) : 0;

                  return (
                    <tr key={log.id} className="hover:bg-luxury-bg/40 transition-colors">
                      <td className="py-3 px-2 font-mono font-bold text-white">#{log.id.slice(-4)}</td>
                      <td className="py-3 px-2 text-gray-400 font-medium">
                        <div>
                          <span>يوم: {log.business_date}</span>
                          <span className="text-gray-600 mx-1">•</span>
                          <span className="text-gray-500 text-[10px]">حالة: {log.closing_balance !== null ? 'مغلق' : 'نشط'}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2 font-semibold text-gray-300">{settings.owner_name || 'أدمن النظام'}</td>
                      <td className="py-3 px-2 text-left font-mono text-gray-400">{log.opening_balance.toLocaleString()} ج.م</td>
                      <td className="py-3 px-2 text-left font-mono text-green-400 font-bold">+{log.cash_in.toLocaleString()} ج.م</td>
                      <td className="py-3 px-2 text-left font-mono text-red-400">-{log.cash_out.toLocaleString()} ج.م</td>
                      <td className="py-3 px-2 text-left font-mono font-bold text-white">
                        {log.closing_balance !== null ? `${log.closing_balance.toLocaleString()} ج.م` : 'قيد العمل'}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {log.closing_balance === null ? (
                          <span className="px-2 py-0.5 bg-yellow-950/40 text-yellow-500 border border-yellow-950 rounded-md font-bold text-[10px]">
                            الوردية مفتوحة
                          </span>
                        ) : diff === 0 ? (
                          <span className="px-2 py-0.5 bg-green-950/40 text-green-400 border border-green-950 rounded-md font-bold text-[10px]">
                            متطابق تماماً (0)
                          </span>
                        ) : diff > 0 ? (
                          <span className="px-2 py-0.5 bg-emerald-950/40 text-emerald-400 border border-emerald-950 rounded-md font-bold text-[10px]">
                            زيادة +{diff} ج.م
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-red-950/40 text-red-500 border border-red-950 rounded-md font-bold text-[10px] animate-pulse">
                            عجز {diff} ج.م
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {activeReportTab === 'batch_profit' && (
        <BatchProfitReportView />
      )}

      {activeReportTab === 'partners_statement' && (
        <div className="flex flex-col gap-6 w-full animate-fade-in">
          {/* Controls Bar */}
          <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 font-bold">تصفية حسب الشريك:</span>
              <select
                value={selectedPartnerId}
                onChange={(e) => setSelectedPartnerId(e.target.value)}
                className="bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 font-bold cursor-pointer"
              >
                <option value="ALL">جميع الشركاء المسجلين</option>
                {partnersList.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.ownership_percent}%)</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-luxury-bg border border-gray-800 hover:border-gold-600 text-gold-500 hover:text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                طباعة كشف الحساب
              </button>
            </div>
          </div>

          {/* Overview Statement Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl">
              <span className="text-[10px] text-gray-400 font-bold block mb-1">إجمالي أرباح المنشأة الصافية (الكافيه)</span>
              <span className="text-xl font-black text-emerald-400 font-mono">{totals.netProfit.toLocaleString()} {settings.currency || 'ج.م'}</span>
              <span className="text-[9px] text-gray-500 block mt-1">الأساس المحاسبي لتوزيع الأرباح</span>
            </div>

            <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl">
              <span className="text-[10px] text-gray-400 font-bold block mb-1">إجمالي المسحوبات المسجلة</span>
              <span className="text-xl font-black text-amber-400 font-mono">
                {partnerDrawingsList
                  .filter(d => selectedPartnerId === 'ALL' || d.partner_id === selectedPartnerId)
                  .reduce((sum, d) => sum + d.amount, 0).toLocaleString()} {settings.currency || 'ج.م'}
              </span>
              <span className="text-[9px] text-gray-500 block mt-1">توزيعات نقدية مدفوعة للشركاء</span>
            </div>

            <div className="bg-luxury-card border border-luxury-border p-5 rounded-2xl">
              <span className="text-[10px] text-gray-400 font-bold block mb-1">عدد الشركاء المسجلين</span>
              <span className="text-xl font-black text-gold-400 font-mono">{partnersList.length} شركاء</span>
              <span className="text-[9px] text-gray-500 block mt-1">
                إجمالي نسبة الملكية: {partnersList.reduce((s, p) => s + p.ownership_percent, 0)}%
              </span>
            </div>
          </div>

          {/* Partners Individual Breakdown Cards */}
          <div className="bg-luxury-card border border-luxury-border p-6 rounded-3xl shadow-lg">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2 border-b border-gray-900 pb-3">
              <Users className="w-4 h-4 text-gold-500" />
              <span>تفاصيل مستحقات ومسحوبات كل شريك (كشف حساب)</span>
            </h3>

            {partnersList.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-8">لا يوجد شركاء مسجلين. يمكنك إضافة الشركاء من شاشة الإعدادات.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {partnersList
                  .filter(p => selectedPartnerId === 'ALL' || p.id === selectedPartnerId)
                  .map(partner => {
                    const earnedShare = totals.netProfit * (partner.ownership_percent / 100);
                    const partnerDrawings = partnerDrawingsList
                      .filter(d => d.partner_id === partner.id)
                      .reduce((sum, d) => sum + d.amount, 0);
                    const remainingBalance = earnedShare - partnerDrawings;

                    return (
                      <div key={partner.id} className="bg-luxury-bg border border-gray-800/80 rounded-2xl p-4.5 space-y-3">
                        <div className="flex justify-between items-start border-b border-gray-800 pb-2.5">
                          <div>
                            <h4 className="text-xs font-black text-white">{partner.name}</h4>
                            <span className="text-[10px] text-gray-400 font-mono">{partner.phone || 'بدون هاتف'}</span>
                          </div>
                          <span className="px-2.5 py-1 bg-gold-600/10 border border-gold-600/30 text-gold-400 font-mono font-bold text-[10px] rounded-lg">
                            ملكية {partner.ownership_percent}%
                          </span>
                        </div>

                        <div className="space-y-1.5 text-[11px] font-mono">
                          <div className="flex justify-between text-gray-400">
                            <span>حصة الأرباح الصافية المستحقة:</span>
                            <span className="text-emerald-400 font-bold">{earnedShare.toLocaleString()} ج.م</span>
                          </div>
                          <div className="flex justify-between text-gray-400">
                            <span>إجمالي المسحوبات الشخصية:</span>
                            <span className="text-amber-400 font-bold">-{partnerDrawings.toLocaleString()} ج.م</span>
                          </div>
                          <div className="flex justify-between pt-2 border-t border-gray-800 text-xs">
                            <span className="font-bold text-gray-300">الرصيد المتبقي المستحق:</span>
                            <span className={`font-black ${remainingBalance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {remainingBalance.toLocaleString()} ج.م
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Transactions Log Table */}
          <div className="bg-luxury-card border border-luxury-border p-6 rounded-3xl shadow-lg">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2 border-b border-gray-900 pb-3">
              <Coins className="w-4 h-4 text-amber-500" />
              <span>سجل حركات المسحوبات التفصيلي</span>
            </h3>

            {partnerDrawingsList.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-8">لا يوجد مسحوبات مسجلة حتى الآن.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-400 text-[11px]">
                      <th className="py-2.5 px-3 font-bold">التاريخ والوقت</th>
                      <th className="py-2.5 px-3 font-bold">اسم الشريك</th>
                      <th className="py-2.5 px-3 font-bold">المبلغ المسحوب</th>
                      <th className="py-2.5 px-3 font-bold">السبب / الغرض</th>
                      <th className="py-2.5 px-3 font-bold">الملاحظات</th>
                      <th className="py-2.5 px-3 font-bold">بواسطة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {partnerDrawingsList
                      .filter(d => selectedPartnerId === 'ALL' || d.partner_id === selectedPartnerId)
                      .map(drawing => (
                        <tr key={drawing.id} className="hover:bg-gray-900/30 transition-colors">
                          <td className="py-3 px-3 font-mono text-gray-300">{drawing.date} {drawing.time || ''}</td>
                          <td className="py-3 px-3 font-black text-white">{drawing.partner_name}</td>
                          <td className="py-3 px-3 font-mono font-bold text-amber-400">{drawing.amount.toLocaleString()} {settings.currency || 'ج.م'}</td>
                          <td className="py-3 px-3 text-gray-300">{drawing.reason || '—'}</td>
                          <td className="py-3 px-3 text-gray-400 text-[11px]">{drawing.notes || '—'}</td>
                          <td className="py-3 px-3 text-gray-400">{drawing.created_by || 'المدير'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SHIFT HANDOVER REPORTS TAB */}
      {activeReportTab === 'shifts_handovers' && (
        <div className="flex flex-col gap-6 w-full animate-fade-in">
          <div className="bg-luxury-card border border-luxury-border p-5 rounded-3xl shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <span>🔄</span> سجل وتسليم الورديات (Shift Handover Audit Logs)
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                تتبع تفصيلي لورديات النهار والمساء، المبيعات والمصروفات، الفروقات (عجز/زيادة) والتوثيق الإداري.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 bg-gray-900 border border-gray-800 text-gold-400 rounded-xl text-xs font-bold font-mono">
                إجمالي الورديات المسجلة: {shiftsList.length}
              </span>
            </div>
          </div>

          {/* Table of Shifts */}
          <div className="bg-luxury-card border border-luxury-border rounded-3xl p-5 shadow-xl">
            <h4 className="text-xs font-black text-gold-400 mb-4 flex items-center gap-2">
              <span>📋</span> قائمة الورديات وسجلات التسليم والاستلام
            </h4>

            {shiftsList.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-xs font-bold">
                لا يوجد ورديات مسجلة حتى الآن.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-400 text-[11px]">
                      <th className="py-3 px-3 font-bold">نوع الوردية</th>
                      <th className="py-3 px-3 font-bold">المسؤول</th>
                      <th className="py-3 px-3 font-bold">الحالة</th>
                      <th className="py-3 px-3 font-bold">وقت البداية / النهاية</th>
                      <th className="py-3 px-3 font-bold">الافتتاحي</th>
                      <th className="py-3 px-3 font-bold">المبيعات</th>
                      <th className="py-3 px-3 font-bold">المصروفات</th>
                      <th className="py-3 px-3 font-bold">المتوقع</th>
                      <th className="py-3 px-3 font-bold">عد الكاشير</th>
                      <th className="py-3 px-3 font-bold">مقبوض الأدمن</th>
                      <th className="py-3 px-3 font-bold">الفرق والسبب</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {shiftsList.map((shift) => {
                      const metrics = dbService.calculateShiftMetrics(shift);
                      return (
                        <tr key={shift.id} className="hover:bg-gray-900/40 transition-colors">
                          <td className="py-3.5 px-3">
                            {shift.shift_type === 'DAY' ? (
                              <span className="px-2.5 py-1 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 font-black text-[11px] inline-flex items-center gap-1">
                                ☀️ وردية النهار
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 font-black text-[11px] inline-flex items-center gap-1">
                                🌙 وردية المساء
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-3 font-black text-white">{shift.cashier_name}</td>
                          <td className="py-3.5 px-3">
                            {shift.status === 'COMPLETED' ? (
                              <span className="px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold text-[10px]">
                                مكتملة ومستلمة
                              </span>
                            ) : shift.status === 'PENDING_HANDOVER' ? (
                              <span className="px-2.5 py-1 rounded-xl bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bold text-[10px] animate-pulse">
                                ⏳ معلقة بانتظار الأدمن
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/30 font-bold text-[10px]">
                                🟢 نشطة حاليًا
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-3 font-mono text-[11px] text-gray-300">
                            <div>من: {new Date(shift.started_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</div>
                            {shift.ended_at && (
                              <div className="text-gray-400 text-[10px]">إلى: {new Date(shift.ended_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</div>
                            )}
                          </td>
                          <td className="py-3.5 px-3 font-mono font-bold text-amber-400">{metrics.opening_balance} ج.م</td>
                          <td className="py-3.5 px-3 font-mono font-bold text-emerald-400">+{metrics.cash_in} ج.م</td>
                          <td className="py-3.5 px-3 font-mono font-bold text-rose-400">-{metrics.cash_out} ج.م</td>
                          <td className="py-3.5 px-3 font-mono font-black text-gold-300">{metrics.expected_cash} ج.م</td>
                          <td className="py-3.5 px-3 font-mono font-bold text-amber-300">
                            {shift.declared_cash !== undefined ? `${shift.declared_cash} ج.م` : '—'}
                          </td>
                          <td className="py-3.5 px-3 font-mono font-bold text-emerald-300">
                            {shift.actual_received_cash !== undefined ? `${shift.actual_received_cash} ج.م` : '—'}
                          </td>
                          <td className="py-3.5 px-3 text-[11px]">
                            {shift.discrepancy !== undefined ? (
                              <div>
                                <span className={`font-mono font-black ${
                                  shift.discrepancy === 0 ? 'text-emerald-400' : shift.discrepancy > 0 ? 'text-emerald-300' : 'text-rose-400'
                                }`}>
                                  {shift.discrepancy === 0 ? 'بدون فرق (0)' : `${shift.discrepancy > 0 ? '+' : ''}${shift.discrepancy} ج.م`}
                                </span>
                                {shift.discrepancy_reason && (
                                  <div className="text-[10px] text-gray-400 mt-0.5 max-w-[150px] truncate" title={shift.discrepancy_reason}>
                                    السبب: {shift.discrepancy_reason}
                                  </div>
                                )}
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Full Screen Receipt Preview Modal */}
      {viewReceiptModalUrl && (
        <div
          className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-fade-in"
          onClick={() => setViewReceiptModalUrl(null)}
          dir="rtl"
        >
          <div
            className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center justify-center bg-luxury-card border border-gold-600/30 rounded-3xl p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between pb-3 border-b border-gray-800 mb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-gold-500" />
                <h3 className="text-sm font-bold text-white">إيصال التحويل الإلكتروني - معاينة كاملة</h3>
              </div>
              <button
                onClick={() => setViewReceiptModalUrl(null)}
                className="p-1.5 bg-gray-800 hover:bg-red-600 text-gray-300 hover:text-white rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="w-full overflow-auto max-h-[75vh] flex items-center justify-center rounded-2xl bg-black/80 p-2">
              <img
                src={viewReceiptModalUrl}
                alt="Full Size Receipt"
                className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-lg"
              />
            </div>
            <div className="w-full flex items-center justify-between pt-3 mt-3 border-t border-gray-800">
              <a
                href={viewReceiptModalUrl}
                download="electronic_receipt.jpg"
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 px-4 bg-luxury-card border border-gold-600/40 hover:bg-gray-800 text-gold-400 text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                تحميل صورة الإيصال
              </a>
              <button
                onClick={() => setViewReceiptModalUrl(null)}
                className="py-2 px-6 bg-gold-600 hover:bg-gold-500 text-black font-extrabold text-xs rounded-xl cursor-pointer"
              >
                إغلاق النافذة
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
