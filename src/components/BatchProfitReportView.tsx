import React, { useState, useMemo, useEffect } from 'react';
import { EldeebLogoHeader } from './EldeebLogo';
import { motion, AnimatePresence } from 'motion/react';
import {
  TrendingUp,
  Coins,
  Package,
  Layers,
  Calendar,
  User,
  ArrowUpDown,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Printer,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Percent,
  Activity,
  ArrowUpRight,
  ClipboardList,
  Coffee,
  Database,
  Check
} from 'lucide-react';
import { dbService } from '../dbService';
import { InventoryBatch, Invoice, InvoiceItem, Product, RawMaterial } from '../types';

export function BatchProfitReportView() {
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [batchConsumptions, setBatchConsumptions] = useState<any[]>([]);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'raw_material' | 'ready_product'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ACTIVE' | 'COMPLETED' | 'EXPIRED'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'profit' | 'revenue' | 'roi'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Load database entities
  useEffect(() => {
    try {
      setBatches(dbService.getInventoryBatches());
      setProducts(dbService.getProducts());
      setRawMaterials(dbService.getRawMaterials());
      setInvoices(dbService.getInvoices());
      setInvoiceItems(dbService.getInvoiceItems());
      setBatchConsumptions(dbService.getBatchConsumptions());
    } catch (e) {
      console.error('Error loading data for batch profit report:', e);
    }
  }, []);

  // Helper to format currency in EGP Arabic
  const formatEGP = (num: number) => {
    return `${num.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
  };

  const handleCompleteBatch = (id: string) => {
    if (window.confirm('هل أنت متأكد من رغبتك في إكمال وإغلاق هذه الدفعة يدوياً؟ هذا الإجراء سيعتبر الكمية المتبقية مستهلكة بالكامل وسيقوم بتثبيت حساب أرباح الدفعة وتصفير المتبقي في المخزن.')) {
      const updatedBatches = dbService.completeInventoryBatch(id);
      setBatches(updatedBatches);
      setBatchConsumptions(dbService.getBatchConsumptions());
    }
  };

  // Helper to check if batch is expired
  const isBatchExpired = (batch: InventoryBatch): boolean => {
    if (!batch.expiry_date) return false;
    const exp = new Date(batch.expiry_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return exp < today;
  };

  // Main FIFO Allocation Logic for Batch Profits
  const analyzedBatches = useMemo(() => {
    if (batches.length === 0) return [];

    // Filter valid (non-cancelled) invoices
    const validInvoices = invoices.filter(i => i.invoice_status !== 'CANCELLED');
    const validInvoiceIds = new Set(validInvoices.map(i => i.id));
    const activeConsumptions = batchConsumptions.filter(cons => validInvoiceIds.has(cons.invoice_id));

    // Sort batches globally by purchase_date and ID to guarantee FIFO consistency
    const sortedBatches = [...batches].sort((a, b) => {
      const dateA = new Date(a.purchase_date).getTime();
      const dateB = new Date(b.purchase_date).getTime();
      if (dateA !== dateB) return dateA - dateB;
      return a.created_at.localeCompare(b.created_at);
    });

    // Group sorted batches by item_id (which could be raw material product ID or ready product ID)
    const batchesByItem: Record<string, InventoryBatch[]> = {};
    sortedBatches.forEach(b => {
      const key = b.item_id || b.item_name;
      if (!batchesByItem[key]) {
        batchesByItem[key] = [];
      }
      batchesByItem[key].push(b);
    });

    // Helper to get raw material conversion ratio
    const getRawMaterialRatio = (unit: string): number => {
      const u = (unit || '').trim().toLowerCase();
      if (
        u === 'كيلوجرام' ||
        u === 'كجم' ||
        u === 'kg' ||
        u === 'kilogram' ||
        u === 'كيلو' ||
        u === 'كيلو جرام' ||
        u === 'لتر' ||
        u === 'l' ||
        u === 'liter'
      ) {
        return 1000;
      }
      return 1;
    };

    // We will build evaluated statistics for each batch
    const batchStatsMap: Record<string, {
      totalSales: number;
      totalCupsCount: number;
      producedDrinks: Record<string, { count: number; revenue: number }>;
    }> = {};

    // Initialize map
    sortedBatches.forEach(b => {
      batchStatsMap[b.id] = {
        totalSales: 0,
        totalCupsCount: 0,
        producedDrinks: {},
      };
    });

    // 1. Populate stats using REAL database consumptions first
    sortedBatches.forEach(b => {
      const bCons = activeConsumptions.filter(c => c.batch_id === b.id);
      if (bCons.length > 0) {
        const stats = batchStatsMap[b.id];
        bCons.forEach(cons => {
          stats.totalSales += cons.total_revenue || 0;
          
          const ratio = b.unit ? getRawMaterialRatio(b.unit) : 1;
          const countVal = cons.product_quantity !== undefined 
            ? cons.product_quantity 
            : (b.item_type === 'raw_material' ? (cons.quantity_consumed * ratio) : cons.quantity_consumed);

          stats.totalCupsCount += countVal || 0;

          const pName = cons.product_name || b.item_name;
          if (!stats.producedDrinks[pName]) {
            stats.producedDrinks[pName] = { count: 0, revenue: 0 };
          }
          stats.producedDrinks[pName].count += countVal || 0;
          stats.producedDrinks[pName].revenue += cons.total_revenue || 0;
        });
      }
    });

    // 2. For any batches/groups that don't have recorded consumptions yet, run simulation
    Object.entries(batchesByItem).forEach(([itemKey, itemBatches]) => {
      // If any batch in this group already has real DB logs, skip virtual simulation to avoid double counting
      const hasRealLogs = itemBatches.some(b => activeConsumptions.some(c => c.batch_id === b.id));
      if (hasRealLogs) return;

      const activeInvoiceItems = invoiceItems.filter(item => validInvoiceIds.has(item.invoice_id));
      const consumptionEvents: Array<{
        productName: string;
        consumedQty: number; // in raw material units or ready product units
        productQty: number; // count of products (cups or units) sold
        totalPrice: number; // revenue of this item sale
        invoiceNum: string;
        date: string;
      }> = [];

      // Look at all active invoice items
      activeInvoiceItems.forEach(item => {
        const prod = products.find(p => p.id === item.product_id);
        if (!prod) return;

        // Fetch parent invoice date & number
        const parentInv = validInvoices.find(v => v.id === item.invoice_id);
        const invoiceNum = parentInv?.invoice_number || '';
        const invoiceDate = parentInv?.invoice_date || '';

        // Case A: This group is for ready-to-sell products (e.g. Cans, Water, Chips)
        const isReadyProductGroup = itemBatches[0].item_type === 'ready_product';
        if (isReadyProductGroup) {
          const nameMatch = prod.name_ar && itemBatches.some(b => b.item_name.trim().toLowerCase() === prod.name_ar.trim().toLowerCase());
          const idMatch = prod.id === itemKey || itemBatches.some(b => b.item_id === prod.id);
          if (idMatch || nameMatch) {
            consumptionEvents.push({
              productName: prod.name_ar,
              consumedQty: item.quantity,
              productQty: item.quantity,
              totalPrice: item.total_price,
              invoiceNum,
              date: invoiceDate,
            });
          }
        } else {
          // Case B: This group is for raw materials (e.g. Coffee Beans, Sugar, Milk)
          // We check if this sold menu item uses this raw material in its recipe
          const recipeIng = prod.recipe_ingredients?.find(ri => {
            const ingIdMatch = ri.raw_material_id === itemKey;
            const ingNameMatch = itemBatches.some(b => {
              const targetRM = rawMaterials.find(r => r.id === ri.raw_material_id);
              return targetRM && b.item_name.trim().toLowerCase() === targetRM.name.trim().toLowerCase();
            });
            return ingIdMatch || ingNameMatch;
          });
          if (recipeIng) {
            const targetRM = rawMaterials.find(r => r.id === recipeIng.raw_material_id);
            const rmRatio = targetRM ? getRawMaterialRatio(targetRM.unit) : 1;
            const rawConsumed = (recipeIng.quantity * item.quantity) / rmRatio;
            consumptionEvents.push({
              productName: prod.name_ar,
              consumedQty: rawConsumed,
              productQty: item.quantity,
              totalPrice: item.total_price,
              invoiceNum,
              date: invoiceDate,
            });
          }
        }
      });

      // Sort consumption events chronologically
      consumptionEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Create mutable allocations queue
      const allocations = itemBatches.map(b => ({
        id: b.id,
        original_quantity: b.original_quantity,
        remainingCapacity: b.original_quantity,
      }));

      // Distribute each event in FIFO order
      consumptionEvents.forEach(event => {
        let needed = event.consumedQty;

        for (let i = 0; i < allocations.length; i++) {
          const alloc = allocations[i];
          if (needed <= 0) break;
          if (alloc.remainingCapacity <= 0) continue;

          const allocatedQty = Math.min(alloc.remainingCapacity, needed);
          alloc.remainingCapacity -= allocatedQty;
          needed -= allocatedQty;

          // Calculate fraction of this sale allocated to this batch
          const ratio = event.consumedQty > 0 ? (allocatedQty / event.consumedQty) : 1;

          // Update batch stats
          const stats = batchStatsMap[alloc.id];
          if (stats) {
            stats.totalSales += event.totalPrice * ratio;
            stats.totalCupsCount += event.productQty * ratio;

            if (!stats.producedDrinks[event.productName]) {
              stats.producedDrinks[event.productName] = { count: 0, revenue: 0 };
            }
            stats.producedDrinks[event.productName].count += event.productQty * ratio;
            stats.producedDrinks[event.productName].revenue += event.totalPrice * ratio;
          }
        }
      });
    });

    // Filter out Sugar batches completely from profit report
    const nonSugarBatches = sortedBatches.filter(b => {
      const isSugar = b.item_name && (b.item_name.trim().toLowerCase() === 'سكر' || b.item_name.trim().toLowerCase() === 'السكر' || b.item_name.includes('سكر'));
      return !isSugar;
    });

    // Now map non-sugar batches with their computed stats
    return nonSugarBatches.map(b => {
      const stats = batchStatsMap[b.id] || { totalSales: 0, totalCupsCount: 0, producedDrinks: {} };
      const isSugar = b.item_name && (b.item_name.trim().toLowerCase() === 'سكر' || b.item_name.trim().toLowerCase() === 'السكر' || b.item_name.includes('سكر'));
      const totalCost = isSugar ? 0 : b.purchase_price;
      const totalSales = isSugar ? 0 : (b.total_revenue || stats.totalSales);
      const totalProfit = isSugar ? 0 : (totalSales - totalCost);

      // Calculate ROI (Return on Cost) and Margin (Profit / Sales)
      const roi = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;
      const profitMargin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
      const isExpired = isBatchExpired(b);

      return {
        ...b,
        isSugar,
        isExpired,
        totalCost,
        totalSales,
        totalProfit,
        roi,
        profitMargin,
        totalCupsCount: stats.totalCupsCount,
        producedDrinks: stats.producedDrinks,
      };
    });
  }, [batches, invoices, invoiceItems, products, rawMaterials, batchConsumptions]);

  // Apply search query, type, and status filters
  const filteredBatches = useMemo(() => {
    let result = [...analyzedBatches];

    // Search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        b =>
          b.item_name.toLowerCase().includes(query) ||
          b.batch_serial.toLowerCase().includes(query) ||
          (b.supplier && b.supplier.toLowerCase().includes(query)) ||
          (b.invoice_number && b.invoice_number.toLowerCase().includes(query))
      );
    }

    // Type filter
    if (typeFilter !== 'all') {
      result = result.filter(b => b.item_type === typeFilter);
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(b => {
        if (statusFilter === 'EXPIRED') return b.isExpired;
        if (statusFilter === 'COMPLETED') return b.remaining_quantity <= 0;
        if (statusFilter === 'ACTIVE') return b.remaining_quantity > 0 && !b.isExpired;
        return true;
      });
    }

    // Sorting
    result.sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

      if (sortBy === 'date') {
        valA = new Date(a.purchase_date).getTime();
        valB = new Date(b.purchase_date).getTime();
      } else if (sortBy === 'profit') {
        valA = a.totalProfit;
        valB = b.totalProfit;
      } else if (sortBy === 'revenue') {
        valA = a.totalSales;
        valB = b.totalSales;
      } else if (sortBy === 'roi') {
        valA = a.roi;
        valB = b.roi;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [analyzedBatches, searchQuery, typeFilter, statusFilter, sortBy, sortOrder]);

  // Summary Metrics Card Calculations
  const reportSummary = useMemo(() => {
    let totalCost = 0;
    let totalSales = 0;
    let totalProfit = 0;
    let activeCount = 0;
    let completedCount = 0;
    let expiredCount = 0;

    filteredBatches.forEach(b => {
      totalCost += b.totalCost;
      totalSales += b.totalSales;
      totalProfit += b.totalProfit;

      if (b.isExpired) {
        expiredCount++;
      } else if (b.remaining_quantity <= 0) {
        completedCount++;
      } else {
        activeCount++;
      }
    });

    const averageRoi = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

    return {
      totalCost,
      totalSales,
      totalProfit,
      activeCount,
      completedCount,
      expiredCount,
      averageRoi,
      totalBatches: filteredBatches.length
    };
  }, [filteredBatches]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="w-full text-right space-y-6 print:p-0 print:bg-white print:text-black" dir="rtl" id="batch-profit-report-container">
      {/* 1. Report Header Section with Official Logo */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-gold-500/10 pb-5 gap-4 print:border-b-2 print:border-black">
        <div>
          <EldeebLogoHeader className="h-12 mb-3" />
          <h2 className="text-xl font-extrabold text-gold-500 flex items-center gap-2 print:text-black print:text-2xl">
            <TrendingUp className="w-6 h-6 text-gold-500 print:hidden" />
            <span>تقرير تحليل ربح الدفعات التفصيلي</span>
            <span className="text-[10px] bg-gold-500/10 text-gold-400 px-2.5 py-0.5 rounded-full border border-gold-500/20 font-mono print:hidden">
              نظام الاستقراء المالي المعتمد
            </span>
          </h2>
          <p className="text-xs text-gray-400 mt-1 print:text-black">
            تحليل مالي تراكمي لكل دفعة شراء بشكل مستقل (FIFO) لتتبع أرباح المواد الخام والمنتجات بدقة متناهية.
          </p>
        </div>

        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4 text-gold-400" />
            <span>طباعة التقرير</span>
          </button>
        </div>
      </div>

      {/* 2. Key Metrics Widgets Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-4">
        {/* Metric 1 */}
        <div className="bg-zinc-950/80 border border-zinc-900 rounded-2xl p-4 flex flex-col justify-between shadow-xl print:border-zinc-300 print:bg-white">
          <span className="text-[10px] text-gray-500 font-bold block mb-1 print:text-zinc-600">إجمالي المبيعات المحققة</span>
          <div>
            <span className="text-lg font-black text-emerald-400 font-mono print:text-black">
              {formatEGP(reportSummary.totalSales)}
            </span>
            <span className="text-[9px] text-gray-400 block mt-1">من مبيعات الدفعات المفصلة</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-zinc-950/80 border border-zinc-900 rounded-2xl p-4 flex flex-col justify-between shadow-xl print:border-zinc-300 print:bg-white">
          <span className="text-[10px] text-gray-500 font-bold block mb-1 print:text-zinc-600">إجمالي تكلفة الشراء</span>
          <div>
            <span className="text-lg font-black text-red-400 font-mono print:text-black">
              {formatEGP(reportSummary.totalCost)}
            </span>
            <span className="text-[9px] text-gray-400 block mt-1">كلفة الدفعات الأصلية</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-zinc-950/80 border border-zinc-900 rounded-2xl p-4 flex flex-col justify-between shadow-xl print:border-zinc-300 print:bg-white">
          <span className="text-[10px] text-gray-500 font-bold block mb-1 print:text-zinc-600">صافي ربح الدفعات</span>
          <div>
            <span className="text-lg font-black text-gold-400 font-mono print:text-black">
              {formatEGP(reportSummary.totalProfit)}
            </span>
            <span className={`text-[9px] font-bold block mt-1 ${reportSummary.totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              نسبة العائد الإجمالي: {reportSummary.averageRoi.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-zinc-950/80 border border-zinc-900 rounded-2xl p-4 flex flex-col justify-between shadow-xl print:border-zinc-300 print:bg-white">
          <span className="text-[10px] text-gray-500 font-bold block mb-1 print:text-zinc-600">حالة الدفعات المرصودة</span>
          <div>
            <span className="text-md font-bold text-white block print:text-black">
              {reportSummary.totalBatches} دفعة شراء
            </span>
            <span className="text-[9px] text-gray-400 block mt-1">
              نشطة: <span className="text-emerald-400 font-bold">{reportSummary.activeCount}</span> • 
              منتهية: <span className="text-zinc-400 font-bold">{reportSummary.completedCount}</span> • 
              هالكة/تالفة: <span className="text-red-400 font-bold">{reportSummary.expiredCount}</span>
            </span>
          </div>
        </div>
      </div>

      {/* 3. Search and Filters Control bar */}
      <div className="bg-zinc-950/70 border border-zinc-900/60 p-4 rounded-2xl shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-3.5 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="ابحث باسم الصنف، كود الدفعة، المورد أو رقم الفاتورة..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-950 text-white rounded-xl py-3 pr-10 pl-4 text-xs font-semibold border border-zinc-900 focus:border-[#D4AF37] focus:outline-none transition-all placeholder:text-gray-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Item Type filter */}
          <div className="flex items-center gap-1.5 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-900">
            <span className="text-[10px] text-gray-500 font-bold">النوع:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-black text-white">الكل</option>
              <option value="raw_material" className="bg-black text-white">مواد خام</option>
              <option value="ready_product" className="bg-black text-white">منتجات جاهزة</option>
            </select>
          </div>

          {/* Batch Status filter */}
          <div className="flex items-center gap-1.5 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-900">
            <span className="text-[10px] text-gray-500 font-bold">الحالة:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-black text-white">الكل</option>
              <option value="ACTIVE" className="bg-black text-white">نشطة ومتاحة</option>
              <option value="COMPLETED" className="bg-black text-white">منتهية ومستهلكة</option>
              <option value="EXPIRED" className="bg-black text-white">منتهية الصلاحية / تالفة</option>
            </select>
          </div>

          {/* Sort selection */}
          <div className="flex items-center gap-1.5 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-900">
            <span className="text-[10px] text-gray-500 font-bold">ترتيب حسب:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer"
            >
              <option value="date" className="bg-black text-white">تاريخ الشراء</option>
              <option value="profit" className="bg-black text-white">صافي الربح</option>
              <option value="revenue" className="bg-black text-white">إجمالي المبيعات</option>
              <option value="roi" className="bg-black text-white">نسبة العائد (ROI)</option>
            </select>
            <button
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="p-1 hover:bg-zinc-900 rounded text-gold-500 cursor-pointer"
              title="تغيير اتجاه الترتيب"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Reset Filters button */}
          {(searchQuery || typeFilter !== 'all' || statusFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setTypeFilter('all');
                setStatusFilter('all');
              }}
              className="text-xs text-red-400 hover:text-red-300 font-bold px-3 py-1.5 bg-red-950/20 border border-red-900/30 rounded-xl transition-all cursor-pointer"
            >
              إعادة ضبط الفلاتر
            </button>
          )}
        </div>
      </div>

      {/* 4. Main Batch Profits Table/Card Grid Layout */}
      {filteredBatches.length === 0 ? (
        <div className="bg-zinc-950 border border-zinc-900/50 rounded-3xl p-16 text-center shadow-lg">
          <Package className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-white mb-1">لا توجد دفعات تطابق معايير البحث والفلترة</h3>
          <p className="text-xs text-gray-500">سجل دفعات شراء جديدة أو قم بتغيير الفلاتر لتظهر النتائج.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBatches.map((batch) => {
            const isExpanded = expandedBatchId === batch.id;
            const consumedCount = batch.original_quantity - batch.remaining_quantity;
            const hasSales = batch.totalSales > 0;

            return (
              <motion.div
                layout
                key={batch.id}
                className={`bg-zinc-950 border rounded-2xl overflow-hidden shadow-xl transition-all duration-300 ${
                  isExpanded ? 'border-gold-500/40' : 'border-zinc-900 hover:border-zinc-800'
                } print:border-zinc-300 print:shadow-none`}
              >
                {/* Header info row */}
                <div
                  onClick={() => setExpandedBatchId(isExpanded ? null : batch.id)}
                  className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-zinc-900/20 transition-all select-none print:bg-zinc-50 print:border-b"
                >
                  {/* Left segment: Batch Info */}
                  <div className="flex items-start gap-3">
                    <div className={`p-2.5 rounded-xl text-xs shrink-0 ${
                      batch.item_type === 'raw_material' 
                        ? 'bg-blue-950/30 text-blue-400 border border-blue-900/30' 
                        : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                    } print:bg-zinc-200 print:text-black`}>
                      {batch.item_type === 'raw_material' ? 'مواد خام' : 'منتج جاهز'}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-black text-white hover:text-gold-500 transition-colors print:text-black">
                          {batch.item_name}
                        </h4>
                        <span className="text-[10px] font-bold text-gold-500 font-mono bg-gold-500/10 px-2 py-0.5 rounded-full border border-gold-500/20 print:border-zinc-300 print:text-black">
                          {batch.batch_serial}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[11px] text-gray-400 print:text-zinc-600">
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-gray-500" />
                          <span>المورد: <span className="text-gray-300 font-semibold">{batch.supplier}</span></span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-gray-500" />
                          <span>الشراء: <span className="font-mono text-gray-300">{batch.purchase_date}</span></span>
                        </span>
                        {batch.invoice_number && (
                          <span className="font-mono bg-zinc-900 px-1.5 py-0.5 rounded text-[10px] text-gray-400 print:border">
                            فاتورة #{batch.invoice_number}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Mid segment: Quantities progress */}
                  <div className="flex flex-col gap-1.5 min-w-[150px] md:max-w-[200px] w-full md:w-auto">
                    <div className="flex justify-between items-center text-[10px] text-gray-400">
                      <span>الكمية: <span className="font-mono text-white font-bold">{batch.remaining_quantity}</span> من <span className="font-mono text-gray-300">{batch.original_quantity}</span> {batch.item_type === 'raw_material' ? (batch.yield_unit || 'كوب') : batch.unit}</span>
                      <span className="font-bold font-mono text-emerald-400">
                        {((batch.remaining_quantity / batch.original_quantity) * 100).toFixed(0)}% متبقي
                      </span>
                    </div>
                    {/* Visual progress bar */}
                    <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden p-0.5 border border-zinc-800 print:border-zinc-300">
                      <div
                        className={`h-full rounded-full ${
                          batch.remaining_quantity <= 0 
                            ? 'bg-zinc-700' 
                            : batch.isExpired 
                              ? 'bg-red-500' 
                              : 'bg-gradient-to-r from-gold-600 to-gold-400'
                        }`}
                        style={{ width: `${(batch.remaining_quantity / batch.original_quantity) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Right segment: Financial snapshot */}
                  <div className="flex items-center gap-6 self-end md:self-auto">
                    <div className="text-left">
                      <span className="text-[10px] text-gray-500 font-bold block">التكلفة الإجمالية</span>
                      <span className="text-xs font-bold font-mono text-red-400 print:text-black">
                        {formatEGP(batch.totalCost)}
                      </span>
                    </div>

                    <div className="text-left">
                      <span className="text-[10px] text-gray-500 font-bold block">إجمالي المبيعات</span>
                      <span className="text-xs font-bold font-mono text-emerald-400 print:text-black">
                        {formatEGP(batch.totalSales)}
                      </span>
                    </div>

                    <div className="text-left bg-black/40 px-3 py-1.5 rounded-xl border border-zinc-900 print:border-transparent">
                      <span className="text-[9px] text-gray-500 font-bold block">صافي الربح</span>
                      <span className={`text-xs font-black font-mono ${batch.totalProfit >= 0 ? 'text-gold-400' : 'text-red-400'} print:text-black`}>
                        {batch.isSugar ? '-' : (batch.totalProfit >= 0 ? '+' : '') + formatEGP(batch.totalProfit)}
                      </span>
                    </div>

                    <div className="print:hidden">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Details section */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      className="overflow-hidden border-t border-zinc-900 bg-zinc-950/40 print:bg-white print:border-zinc-300"
                    >
                      <div className="p-4 space-y-4">
                        {/* Summary Details inside expansion */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-semibold text-gray-400">
                          <div>
                            <span className="text-[10px] text-gray-500 block mb-0.5">سعر شراء الوحدة</span>
                            <span className="text-white font-bold font-mono print:text-black">
                              {formatEGP(batch.purchase_price)} / {batch.unit}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] text-gray-500 block mb-0.5">تاريخ انتهاء الصلاحية</span>
                            <span className={`font-bold font-mono ${batch.isExpired ? 'text-red-500 underline font-black animate-pulse' : 'text-gray-300 print:text-black'}`}>
                              {batch.expiry_date || 'غير محدد'}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] text-gray-500 block mb-0.5">هامش الربح الإجمالي</span>
                            <span className={`font-bold font-mono ${batch.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'} print:text-black`}>
                              {batch.profitMargin.toFixed(1)}% من المبيعات
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] text-gray-500 block mb-0.5">العائد على الاستثمار (ROI)</span>
                            <span className={`font-bold font-mono ${batch.roi >= 0 ? 'text-gold-400' : 'text-red-400'} print:text-black`}>
                              {batch.roi.toFixed(1)}% على الكلفة
                            </span>
                          </div>
                        </div>

                        {/* Batch Type specific details */}
                        <div className="border-t border-zinc-900/60 pt-4 print:border-zinc-300">
                          {batch.isSugar ? (
                            <div className="space-y-3">
                              <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl flex items-center justify-between text-xs text-amber-400">
                                <span className="font-bold flex items-center gap-1.5">
                                  <Coffee className="w-4 h-4" />
                                  مادة خام مشتركة (تقرير استهلاك فقط)
                                </span>
                                <span className="text-[10px] text-gray-400">لا يدخل في حساب أرباح المشروبات مباشرة</span>
                              </div>

                              <div className="grid grid-cols-3 gap-3 bg-zinc-950 p-3 rounded-xl border border-zinc-900 text-center">
                                <div>
                                  <span className="text-[10px] text-gray-500 block mb-0.5">الكمية الأصلية بالدفعة:</span>
                                  <span className="text-xs font-mono font-bold text-white">{batch.original_quantity} {batch.item_type === 'raw_material' ? (batch.yield_unit || 'كوب') : batch.unit}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-gray-500 block mb-0.5">المستخرج / المستهلك حتى الآن:</span>
                                  <span className="text-xs font-mono font-bold text-amber-400">{batch.consumed_quantity} {batch.item_type === 'raw_material' ? (batch.yield_unit || 'كوب') : batch.unit}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-gray-500 block mb-0.5">المتبقي بالدفعة:</span>
                                  <span className="text-xs font-mono font-bold text-emerald-400">{batch.remaining_quantity} {batch.item_type === 'raw_material' ? (batch.yield_unit || 'كوب') : batch.unit}</span>
                                </div>
                              </div>

                              {Object.keys(batch.producedDrinks).length > 0 ? (
                                <div className="space-y-2">
                                  <span className="text-[11px] font-bold text-gray-300 block">المشروبات التي استخدمت هذه المادة الخام:</span>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {Object.entries(batch.producedDrinks).map(([drinkName, stats]: [string, any]) => (
                                      <div key={drinkName} className="bg-zinc-900/40 p-2.5 rounded-xl border border-zinc-900 flex justify-between items-center text-xs">
                                        <span className="text-gray-200 font-bold">{drinkName}</span>
                                        <span className="text-amber-400 font-mono font-extrabold">{Math.round(stats.count)} كوب</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-center p-4 bg-black/20 rounded-xl border border-zinc-900/40 text-gray-500 text-xs">
                                  لم يتم تسجيل أي استهلاك لهذه المادة المشتركة بعد.
                                </div>
                              )}
                            </div>
                          ) : batch.item_type === 'raw_material' ? (
                            <div className="space-y-3">
                              <h5 className="text-[11px] font-black text-gold-500 flex items-center gap-1.5 print:text-black">
                                <Coffee className="w-4 h-4 text-gold-500" />
                                <span>المنتجات والمشروبات الناتجة من هذه الدفعة:</span>
                              </h5>

                              {Object.keys(batch.producedDrinks).length === 0 ? (
                                <div className="text-center p-6 bg-black/20 rounded-xl border border-zinc-900/40 text-gray-500">
                                  لا توجد مبيعات مسجلة حتى الآن استهلكت من هذه الدفعة مخزنياً.
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <div className="grid grid-cols-3 gap-2 px-3 py-1 bg-black/60 rounded-lg text-[10px] text-gray-500 font-bold print:border">
                                    <span>اسم الصنف المنتج</span>
                                    <span className="text-center">الكمية / الأكواب المنتجة</span>
                                    <span className="text-left">إجمالي قيمة المبيعات</span>
                                  </div>
                                  
                                  {Object.entries(batch.producedDrinks).map(([drinkName, stats]: [string, any]) => (
                                    <div key={drinkName} className="grid grid-cols-3 gap-2 px-3 py-2 bg-zinc-900/30 rounded-xl text-xs font-semibold text-gray-300 print:border">
                                      <span className="text-white font-bold">{drinkName}</span>
                                      <span className="text-center font-mono text-gray-200">
                                        {Math.round(stats.count)} كوب / وحدة
                                      </span>
                                      <span className="text-left font-mono text-emerald-400 font-bold">
                                        {formatEGP(stats.revenue)}
                                      </span>
                                    </div>
                                  ))}

                                  <div className="flex justify-between items-center bg-gold-600/5 border border-gold-500/10 p-3 rounded-xl mt-2 text-xs font-bold text-gold-500 print:border print:text-black">
                                    <span>إجمالي أكواب المشروبات المنتجة من هذه الدفعة:</span>
                                    <span className="font-mono text-base font-extrabold">{Math.round(batch.totalCupsCount)} كوب</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <h5 className="text-[11px] font-black text-gold-500 flex items-center gap-1.5 print:text-black">
                                <Database className="w-4 h-4 text-gold-500" />
                                <span>تفاصيل مبيعات الصنف الجاهز والمنتجات الناتجة:</span>
                              </h5>

                              {!hasSales ? (
                                <div className="text-center p-6 bg-black/20 rounded-xl border border-zinc-900/40 text-gray-500">
                                  لا توجد أي مبيعات مسجلة لهذا الصنف الجاهز حتى الآن.
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {/* List of produced/sold items from producedDrinks */}
                                  {Object.keys(batch.producedDrinks).length > 0 && (
                                    <div className="space-y-1.5 mb-3 bg-zinc-950 p-3 rounded-xl border border-zinc-900/40">
                                      <span className="text-[10px] text-gray-400 font-bold block mb-1">المنتجات المباعة من هذه الدفعة:</span>
                                      <div className="grid grid-cols-3 gap-2 px-2 py-1 bg-black/40 rounded-lg text-[9px] text-gray-500 font-bold">
                                        <span>اسم المنتج</span>
                                        <span className="text-center">الكمية المباعة</span>
                                        <span className="text-left">قيمة المبيعات</span>
                                      </div>
                                      {Object.entries(batch.producedDrinks).map(([drinkName, stats]: [string, any]) => (
                                        <div key={drinkName} className="grid grid-cols-3 gap-2 px-2 py-1.5 text-xs text-gray-300">
                                          <span className="text-white font-bold">{drinkName}</span>
                                          <span className="text-center font-mono text-gray-400">
                                            {Math.round(stats.count)} عبوة / وحدة
                                          </span>
                                          <span className="text-left font-mono text-emerald-400 font-bold">
                                            {formatEGP(stats.revenue)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  <div className="grid grid-cols-4 gap-2 px-3 py-1 bg-black/60 rounded-lg text-[10px] text-gray-500 font-bold print:border">
                                    <span>اسم الصنف</span>
                                    <span className="text-center">سعر شراء العبوة</span>
                                    <span className="text-center">سعر البيع المفرد (متوسط)</span>
                                    <span className="text-left">عدد العبوات المباعة</span>
                                  </div>

                                  <div className="grid grid-cols-4 gap-2 px-3 py-2 bg-zinc-900/30 rounded-xl text-xs font-semibold text-gray-300 print:border">
                                    <span className="text-white font-bold">{batch.item_name}</span>
                                    <span className="text-center font-mono text-red-400">
                                      {formatEGP(batch.purchase_price)}
                                    </span>
                                    <span className="text-center font-mono text-emerald-400">
                                      {formatEGP(batch.totalSales / (batch.original_quantity - batch.remaining_quantity || 1))}
                                    </span>
                                    <span className="text-left font-mono text-white font-extrabold">
                                      {Math.round(batch.original_quantity - batch.remaining_quantity)} عبوة
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-2 gap-3 bg-zinc-950 p-3 rounded-xl text-xs font-bold border border-zinc-900 mt-2">
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">إجمالي المبيعات الناتجة:</span>
                                      <span className="font-mono text-emerald-400">{formatEGP(batch.totalSales)}</span>
                                    </div>
                                    <div className="flex justify-between border-r border-zinc-900/60 pr-3">
                                      <span className="text-gray-500">إجمالي التكلفة المدفوعة:</span>
                                      <span className="font-mono text-red-400">{formatEGP(batch.totalCost)}</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Batch Status and Notes */}
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 text-[11px] text-gray-500 border-t border-zinc-900/60 pt-3">
                          <div className="flex items-center gap-2">
                            <span>حالة الدفعة بالمخازن:</span>
                            <span className={`font-black flex items-center gap-1 ${
                              batch.remaining_quantity <= 0 
                                ? 'text-gray-400' 
                                : batch.isExpired 
                                  ? 'text-red-500' 
                                  : 'text-emerald-400'
                            }`}>
                              {batch.remaining_quantity <= 0 ? (
                                <>
                                  <XCircle className="w-3.5 h-3.5" />
                                  <span>منتهية ومستهلكة بالكامل (أرشيف الدفعات)</span>
                                </>
                              ) : batch.isExpired ? (
                                <>
                                  <AlertCircle className="w-3.5 h-3.5 text-red-500 animate-pulse" />
                                  <span>منتهية الصلاحية تماماً (هالك/تالف)</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>نشطة وتحت الاستهلاك</span>
                                </>
                              )}
                            </span>
                          </div>

                          {/* Complete Manual button for open batches */}
                          {batch.status !== 'COMPLETED' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCompleteBatch(batch.id);
                              }}
                              className="px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-black rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-lg active:scale-95 self-end sm:self-auto"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>إنهاء الدفعة الحالية وفتح دفعة جديدة</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
