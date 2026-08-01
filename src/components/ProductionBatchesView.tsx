import React, { useState, useEffect, useMemo } from 'react';
import { EldeebLogoHeader } from './EldeebLogo';
import { motion, AnimatePresence } from 'motion/react';
import {
  Package,
  PlusCircle,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  Coins,
  TrendingUp,
  TrendingDown,
  Activity,
  FileText,
  Calendar,
  User,
  AlertCircle,
  Coffee,
  X,
  Filter,
  RefreshCw,
  ChevronLeft,
  Printer,
  Trash2,
  Check,
  Zap,
  ShoppingBag,
  BarChart2,
  Edit,
  ArrowUpRight,
  PieChart,
  ShieldAlert,
  Box
} from 'lucide-react';
import { dbService, isSugarMaterial } from '../dbService';
import { InventoryBatch, InventoryBatchLog, RawMaterial, Product, Category, Invoice, InvoiceItem } from '../types';

interface ProductionBatchesViewProps {
  onShowSuccessAlert: (msg: string) => void;
  onShowWarningAlert: (msg: string) => void;
}

export default function ProductionBatchesView({
  onShowSuccessAlert,
  onShowWarningAlert
}: ProductionBatchesViewProps) {
  // Main Screen Sub-Tabs
  const [activeMainTab, setActiveMainTab] = useState<'raw_batches' | 'ready_products' | 'general_reports'>('raw_batches');

  // Database State
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);

  // Raw Material Batches State & Filters
  const [batchSearchQuery, setBatchSearchQuery] = useState<string>('');
  const [batchStatusFilter, setBatchStatusFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED'>('ALL');
  const [showAddBatchModal, setShowAddBatchModal] = useState<boolean>(false);
  const [selectedBatchForReport, setSelectedBatchForReport] = useState<InventoryBatch | null>(null);
  const [batchToDeleteConfirm, setBatchToDeleteConfirm] = useState<InventoryBatch | null>(null);

  // New Batch Form State
  const [selectedRmId, setSelectedRmId] = useState<string>('');
  const [customRmName, setCustomRmName] = useState<string>('بن');
  const [rawQuantity, setRawQuantity] = useState<string>('1');
  const [rawUnit, setRawUnit] = useState<string>('كجم');
  const [batchCost, setBatchCost] = useState<string>('380');
  const [yieldCups, setYieldCups] = useState<string>('50');
  const [yieldUnit, setYieldUnit] = useState<string>('كوب');
  const [supplierName, setSupplierName] = useState<string>('');
  const [purchaseDate, setPurchaseDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [expiryDate, setExpiryDate] = useState<string>('');

  // Ready Products State & Filters
  const [productSearchQuery, setProductSearchQuery] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');
  const [showAddProductModal, setShowAddProductModal] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Ready Product Form State
  const [prodNameAr, setProdNameAr] = useState<string>('');
  const [prodCategoryId, setProdCategoryId] = useState<string>('');
  const [prodCostPrice, setProdCostPrice] = useState<string>('8');
  const [prodSellingPrice, setProdSellingPrice] = useState<string>('12');
  const [prodStock, setProdStock] = useState<string>('24');
  const [prodMinStock, setProdMinStock] = useState<string>('5');
  const [prodBarcode, setProdBarcode] = useState<string>('');

  // Load Database Data
  const loadAllData = () => {
    try {
      setBatches(dbService.getInventoryBatches());
      setProducts(dbService.getProducts());
      setCategories(dbService.getCategories());
      setRawMaterials(dbService.getRawMaterials());
      setInvoices(dbService.getInvoices());
      setInvoiceItems(dbService.getInvoiceItems());
    } catch (e) {
      console.error('Error loading inventory data:', e);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Update batch form defaults when selecting raw material
  useEffect(() => {
    if (selectedRmId) {
      const rm = rawMaterials.find(r => r.id === selectedRmId);
      if (rm) {
        setCustomRmName(rm.name);
        setRawUnit(rm.unit || 'كجم');
        if (rm.unit_cost) {
          setBatchCost((rm.unit_cost * (parseFloat(rawQuantity) || 1)).toString());
        }
      }
    }
  }, [selectedRmId, rawMaterials, rawQuantity]);

  const resetBatchForm = () => {
    setSelectedRmId('');
    setCustomRmName('بن');
    setRawQuantity('1');
    setRawUnit('كجم');
    setBatchCost('380');
    setYieldCups('50');
    setYieldUnit('كوب');
    setSupplierName('');
    setInvoiceNumber('');
    setExpiryDate('');
    setPurchaseDate(new Date().toISOString().split('T')[0]);
  };

  const resetProductForm = () => {
    setEditingProduct(null);
    setProdNameAr('');
    setProdCategoryId(categories[0]?.id || '');
    setProdCostPrice('8');
    setProdSellingPrice('12');
    setProdStock('24');
    setProdMinStock('5');
    setProdBarcode('');
  };

  // --- ACTIONS: RAW MATERIAL BATCHES ---
  const handleCreateBatch = (e: React.FormEvent) => {
    e.preventDefault();

    const nameToSave = customRmName.trim();
    if (!nameToSave) {
      onShowWarningAlert('يرجى كتابة أو اختيار اسم المادة الخام!');
      return;
    }

    const rawQtyNum = parseFloat(rawQuantity);
    if (isNaN(rawQtyNum) || rawQtyNum <= 0) {
      onShowWarningAlert('يرجى إدخال كمية مادة خام صحيحة بالمخزن (مثال: 1 كجم)!');
      return;
    }

    const costNum = parseFloat(batchCost);
    if (isNaN(costNum) || costNum < 0) {
      onShowWarningAlert('يرجى إدخال تكلفة شراء الدفعة الثابتة (مثال: 380 جنيه)!');
      return;
    }

    const yieldNum = parseInt(yieldCups, 10);
    if (isNaN(yieldNum) || yieldNum <= 0) {
      onShowWarningAlert('يرجى إدخال السعة الإنتاجية الصحيحة (مثال: 50)!');
      return;
    }

    if (!yieldUnit.trim()) {
      onShowWarningAlert('يرجى تحديد أو كتابة وحدة الإنتاج (مثال: كوب، كاس، بولة، حجر شيشة)!');
      return;
    }

    try {
      // Find or register raw material reference
      let finalRmId = selectedRmId;
      const foundRm = rawMaterials.find(r => r.id === selectedRmId || r.name.trim().toLowerCase() === nameToSave.toLowerCase());
      if (foundRm) {
        finalRmId = foundRm.id;
        dbService.saveRawMaterial({
          ...foundRm,
          current_quantity: foundRm.current_quantity + rawQtyNum,
          unit_cost: costNum / rawQtyNum
        });
      } else {
        const newRm: RawMaterial = {
          id: `raw_${Date.now()}`,
          name: nameToSave,
          unit: rawUnit || 'كجم',
          current_quantity: rawQtyNum,
          add_quantity: 0,
          unit_cost: costNum / rawQtyNum,
          total_cost: costNum,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        dbService.saveRawMaterial(newRm);
        finalRmId = newRm.id;
      }

      // Check if Sugar
      const isSugar = isSugarMaterial(nameToSave);
      const totalCapacityCups = (isSugar || yieldNum <= 200) && rawQtyNum > 1
        ? (rawQtyNum * yieldNum)
        : yieldNum;

      // Generate serial e.g. "دفعة بن رقم 1"
      const nextNum = dbService.getNextBatchNumber(nameToSave);
      const batchSerial = `دفعة ${nameToSave} رقم ${nextNum}`;

      const newBatch: InventoryBatch = {
        id: `batch_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        batch_serial: batchSerial,
        item_type: 'raw_material',
        item_id: finalRmId,
        item_name: nameToSave,
        raw_material_qty: rawQtyNum, // 1 kg - static
        unit: rawUnit || 'كجم',
        original_quantity: totalCapacityCups, // e.g. 200 cups capacity
        consumed_quantity: 0, // 0 cups sold
        remaining_quantity: totalCapacityCups, // 200 cups remaining
        yield_capacity: totalCapacityCups,
        remaining_cups: totalCapacityCups,
        yield_unit: yieldUnit || 'كوب',
        purchase_price: costNum, // 380 EGP - STATIC COST
        supplier: supplierName.trim() || 'مورد عام / غير محدد',
        purchase_date: purchaseDate,
        invoice_number: invoiceNumber.trim() || undefined,
        expiry_date: expiryDate || undefined,
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
        total_revenue: 0,
        net_profit: isSugar ? 0 : -costNum,
        profit_margin: isSugar ? 0 : -100
      };

      dbService.saveInventoryBatch(newBatch);

      dbService.addInventoryBatchLog({
        batch_id: newBatch.id,
        batch_serial: newBatch.batch_serial,
        item_name: newBatch.item_name,
        action_type: 'ADD_BATCH',
        quantity_changed: yieldNum,
        previous_quantity: 0,
        new_quantity: yieldNum,
        operator: 'مدير الإنتاج',
        reason: `إنشاء دفعة إنتاج مستقلة تحتوي على ${rawQtyNum} ${rawUnit} بسعة إنتاجية ${yieldNum} ${yieldUnit.trim() || 'كوب'} وتكلفة ثابتة ${costNum} ج.م`
      });

      onShowSuccessAlert(`تم إنشاء "${batchSerial}" بنجاح! 📦 (المادة الخام: ${rawQtyNum} ${rawUnit}، التكلفة: ${costNum} ج.م، السعة الإنتاجية: ${yieldNum} ${yieldUnit.trim() || 'كوب'})`);
      setShowAddBatchModal(false);
      resetBatchForm();
      loadAllData();
    } catch (e) {
      console.error(e);
      onShowWarningAlert('حدث خطأ أثناء حفظ دفعة الإنتاج!');
    }
  };

  // Delete batch safely (Allowed ONLY if sold cups === 0)
  const handleDeleteBatch = (batch: InventoryBatch) => {
    const soldCups = batch.consumed_quantity || 0;
    if (soldCups > 0) {
      onShowWarningAlert('لا يمكن حذف دفعة تم استخدامها في المبيعات حفاظاً على سلامة البيانات المحاسبية.');
      return;
    }
    // Open custom confirmation modal
    setBatchToDeleteConfirm(batch);
  };

  const handleConfirmDeleteBatch = () => {
    if (!batchToDeleteConfirm) return;
    const result = dbService.deleteInventoryBatch(batchToDeleteConfirm.id);
    if (result.success) {
      onShowSuccessAlert('تم حذف الدفعة بنجاح.');
      loadAllData();
    } else {
      onShowWarningAlert(result.message || 'لا يمكن حذف هذه الدفعة!');
    }
    setBatchToDeleteConfirm(null);
  };

  // Manually Complete Batch
  const handleCompleteBatch = (id: string, serial: string) => {
    if (window.confirm(`هل أنت متأكد من إنهاء وإغلاق "${serial}"؟ سيتم إغلاق الأكواب المتبقية وتثبيت صافي الأرباح المحققة.`)) {
      dbService.completeInventoryBatch(id, 'المالك');
      onShowSuccessAlert(`تم إغلاق "${serial}" ونقلها للأرشيف بنجاح.`);
      loadAllData();
    }
  };

  // --- ACTIONS: READY PRODUCTS ---
  const handleSaveReadyProduct = (e: React.FormEvent) => {
    e.preventDefault();

    const name = prodNameAr.trim();
    if (!name) {
      onShowWarningAlert('يرجى كتابة اسم المنتج الجاهز!');
      return;
    }

    const costPrice = parseFloat(prodCostPrice) || 0;
    const sellingPrice = parseFloat(prodSellingPrice) || 0;
    const stock = parseInt(prodStock, 10) || 0;
    const minStock = parseInt(prodMinStock, 10) || 5;

    if (sellingPrice < costPrice) {
      if (!window.confirm('ملاحظة: سعر البيع أقل من سعر التكلفة! هل تريد الاستمرار؟')) {
        return;
      }
    }

    const prodData: Product = {
      id: editingProduct ? editingProduct.id : `prod_${Date.now()}`,
      category_id: prodCategoryId || categories[0]?.id || 'cat_1',
      name_ar: name,
      name_en: name,
      barcode: prodBarcode.trim(),
      image: '🥤',
      selling_price: sellingPrice,
      cost_price: costPrice,
      current_stock: stock,
      minimum_stock: minStock,
      unit: 'قطعة',
      is_favorite: editingProduct ? editingProduct.is_favorite : false,
      is_available: true,
      notes: 'منتج جاهز يباع بالوحدة',
      created_at: editingProduct ? editingProduct.created_at : new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_raw_material: false
    };

    dbService.saveProduct(prodData);
    onShowSuccessAlert(`تم حفظ المنتج الجاهز "${name}" بنجاح! 🥤`);
    setShowAddProductModal(false);
    resetProductForm();
    loadAllData();
  };

  const handleDeleteProduct = (product: Product) => {
    if (window.confirm(`هل أنت متأكد من حذف المنتج الجاهز "${product.name_ar}"؟`)) {
      dbService.deleteProduct(product.id);
      onShowSuccessAlert(`تم حذف "${product.name_ar}" بنجاح.`);
      loadAllData();
    }
  };

  // --- COMPUTATIONS & CALCULATIONS ---

  // Filtered Raw Material Batches
  const filteredBatches = useMemo(() => {
    return batches.filter(b => {
      const matchSearch = batchSearchQuery.trim() === '' ||
        b.item_name.toLowerCase().includes(batchSearchQuery.toLowerCase()) ||
        b.batch_serial.toLowerCase().includes(batchSearchQuery.toLowerCase());

      if (!matchSearch) return false;

      if (batchStatusFilter === 'ACTIVE') return b.status === 'ACTIVE' || b.status === 'LOW';
      if (batchStatusFilter === 'COMPLETED') return b.status === 'COMPLETED';
      return true;
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [batches, batchSearchQuery, batchStatusFilter]);

  // Filtered Ready Products (Non-raw material products or category filtered)
  const readyProductsList = useMemo(() => {
    // A ready product is a product that does not use a recipe of raw materials or is explicitly a direct unit item
    return products.filter(p => {
      const isReady = !p.is_raw_material;
      if (!isReady) return false;

      const matchSearch = productSearchQuery.trim() === '' ||
        p.name_ar.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
        p.barcode.toLowerCase().includes(productSearchQuery.toLowerCase());

      if (!matchSearch) return false;

      if (selectedCategoryId !== 'ALL' && p.category_id !== selectedCategoryId) {
        return false;
      }

      return true;
    });
  }, [products, productSearchQuery, selectedCategoryId]);

  // Compute sold metrics for each ready product from non-cancelled invoices
  const readyProductMetrics = useMemo(() => {
    const validInvoices = invoices.filter(i => i.invoice_status !== 'CANCELLED' && i.invoice_status !== 'REFUNDED');
    const validInvoiceIds = new Set(validInvoices.map(i => i.id));

    const salesByProduct: Record<string, { soldQty: number; totalSalesVal: number }> = {};

    invoiceItems.forEach(item => {
      if (validInvoiceIds.has(item.invoice_id)) {
        if (!salesByProduct[item.product_id]) {
          salesByProduct[item.product_id] = { soldQty: 0, totalSalesVal: 0 };
        }
        salesByProduct[item.product_id].soldQty += item.quantity || 0;
        salesByProduct[item.product_id].totalSalesVal += (item.total_price || (item.quantity * item.unit_price)) || 0;
      }
    });

    return readyProductsList.map(prod => {
      const sales = salesByProduct[prod.id] || { soldQty: 0, totalSalesVal: 0 };
      const currentStock = prod.current_stock || 0;
      const unitCost = prod.cost_price || 0;
      const unitPrice = prod.selling_price || 0;
      const unitProfit = unitPrice - unitCost;

      const remainingStockValue = currentStock * unitCost;
      const expectedSalesValue = currentStock * unitPrice;
      const expectedProfit = expectedSalesValue - remainingStockValue;

      const realizedProfit = sales.soldQty * unitProfit;

      return {
        product: prod,
        soldQty: sales.soldQty,
        totalSalesVal: sales.totalSalesVal,
        currentStock,
        unitCost,
        unitPrice,
        unitProfit,
        remainingStockValue,
        expectedSalesValue,
        expectedProfit,
        realizedProfit
      };
    });
  }, [readyProductsList, invoices, invoiceItems]);

  // Overall Top Executive Statistics
  const topStats = useMemo(() => {
    // Raw Batches stats (Excluding Sugar from batch profit metrics)
    const activeBatches = batches.filter(b => b.status === 'ACTIVE' || b.status === 'LOW');
    const completedBatches = batches.filter(b => b.status === 'COMPLETED');

    const activeBatchesCost = activeBatches.reduce((sum, b) => sum + (b.purchase_price || 0), 0);
    const nonSugarBatches = batches.filter(b => !isSugarMaterial(b.item_name));
    const totalBatchesRevenue = nonSugarBatches.reduce((sum, b) => sum + (b.total_revenue || 0), 0);
    const totalBatchesCost = nonSugarBatches.reduce((sum, b) => sum + (b.purchase_price || 0), 0);
    const totalBatchesProfit = totalBatchesRevenue - totalBatchesCost;

    // Ready Products stats
    const readyProductsCount = readyProductsList.length;
    const readyProductsStockCost = readyProductMetrics.reduce((sum, m) => sum + m.remainingStockValue, 0);
    const readyProductsRealizedProfit = readyProductMetrics.reduce((sum, m) => sum + m.realizedProfit, 0);
    const readyProductsTotalSales = readyProductMetrics.reduce((sum, m) => sum + m.totalSalesVal, 0);

    // Combined Inventory Values
    const totalInventoryValue = activeBatchesCost + readyProductsStockCost;
    const totalCombinedRevenue = totalBatchesRevenue + readyProductsTotalSales;
    const totalCombinedProfit = totalBatchesProfit + readyProductsRealizedProfit;

    return {
      activeBatchesCount: activeBatches.length,
      completedBatchesCount: completedBatches.length,
      readyProductsCount,
      activeBatchesCost,
      readyProductsStockCost,
      totalInventoryValue,
      totalCombinedRevenue,
      totalCombinedProfit
    };
  }, [batches, readyProductsList, readyProductMetrics]);

  const formatEGP = (num: number) => {
    return `${num.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto select-none" dir="rtl">
      {/* --- HEADER --- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-luxury-card via-[#121212] to-luxury-card border border-luxury-border/80 rounded-3xl p-5 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-36 h-36 bg-gold-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center gap-3.5 z-10">
          <div className="w-13 h-13 rounded-2xl bg-gold-600/20 border border-gold-500/40 text-gold-400 flex items-center justify-center font-black shrink-0 shadow-lg">
            <Package className="w-7 h-7 text-gold-400" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
              <span>إدارة المخزون والإنتاج</span>
              <span className="text-[10px] bg-gold-500/20 text-gold-400 border border-gold-500/40 px-2.5 py-0.5 rounded-full font-bold">
                Professional Batch & Inventory
              </span>
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              نظام محمي محاسبياً: المواد الخام بنظام دفعات الإنتاج (1 كجم = 50 كوب = تكلفة ثابتة)، والمنتجات الجاهزة بالوحدة
            </p>
          </div>
        </div>

        {/* Action Buttons based on active main tab */}
        <div className="flex items-center gap-2 z-10">
          {activeMainTab === 'raw_batches' && (
            <button
              onClick={() => {
                resetBatchForm();
                setShowAddBatchModal(true);
              }}
              className="px-4 py-2.5 bg-gradient-to-r from-gold-600 to-gold-500 hover:from-gold-500 hover:to-gold-400 text-black font-black rounded-xl text-xs shadow-xl cursor-pointer transition-all flex items-center gap-2 active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>إضافة دفعة إنتاج مادة خام</span>
            </button>
          )}

          {activeMainTab === 'ready_products' && (
            <button
              onClick={() => {
                resetProductForm();
                setShowAddProductModal(true);
              }}
              className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-black rounded-xl text-xs shadow-xl cursor-pointer transition-all flex items-center gap-2 active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>إضافة منتج جاهز بالوحدة</span>
            </button>
          )}
        </div>
      </div>

      {/* --- TOP EXECUTIVE STATS CARDS --- */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-luxury-card border border-emerald-900/60 p-3.5 rounded-2xl flex flex-col justify-between shadow-lg">
          <span className="text-[10px] font-bold text-emerald-400 block mb-1">دفعات المواد الخام النشطة</span>
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-black text-emerald-400 font-mono">{topStats.activeBatchesCount}</span>
            <Activity className="w-4 h-4 text-emerald-500 animate-pulse" />
          </div>
        </div>

        <div className="bg-luxury-card border border-luxury-border p-3.5 rounded-2xl flex flex-col justify-between shadow-lg">
          <span className="text-[10px] font-bold text-gray-400 block mb-1">الدفعات المنتهية والأرشيف</span>
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-black text-gray-300 font-mono">{topStats.completedBatchesCount}</span>
            <CheckCircle2 className="w-4 h-4 text-gray-500" />
          </div>
        </div>

        <div className="bg-luxury-card border border-blue-900/60 p-3.5 rounded-2xl flex flex-col justify-between shadow-lg">
          <span className="text-[10px] font-bold text-blue-400 block mb-1">المنتجات الجاهزة بالوحدة</span>
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-black text-blue-300 font-mono">{topStats.readyProductsCount} أصناف</span>
            <ShoppingBag className="w-4 h-4 text-blue-400" />
          </div>
        </div>

        <div className="bg-luxury-card border border-gold-900/60 p-3.5 rounded-2xl flex flex-col justify-between shadow-lg">
          <span className="text-[10px] font-bold text-gold-400 block mb-1">إجمالي تكلفة المخزون الحالي</span>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-black text-gold-400 font-mono">{formatEGP(topStats.totalInventoryValue)}</span>
            <Coins className="w-4 h-4 text-gold-500" />
          </div>
        </div>

        <div className="bg-luxury-card border border-blue-900/60 p-3.5 rounded-2xl flex flex-col justify-between shadow-lg">
          <span className="text-[10px] font-bold text-blue-400 block mb-1">إجمالي المبيعات الإجمالية</span>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-black text-blue-300 font-mono">{formatEGP(topStats.totalCombinedRevenue)}</span>
            <TrendingUp className="w-4 h-4 text-blue-400" />
          </div>
        </div>

        <div className={`bg-luxury-card border p-3.5 rounded-2xl flex flex-col justify-between shadow-lg ${
          topStats.totalCombinedProfit >= 0 ? 'border-emerald-800' : 'border-red-900'
        }`}>
          <span className="text-[10px] font-bold text-gray-400 block mb-1">صافي الأرباح الإجمالية</span>
          <div className="flex items-baseline justify-between">
            <span className={`text-sm font-black font-mono ${topStats.totalCombinedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatEGP(topStats.totalCombinedProfit)}
            </span>
            <Zap className="w-4 h-4 text-gold-500" />
          </div>
        </div>
      </div>

      {/* --- MAIN TABS SWITCHER --- */}
      <div className="flex items-center gap-2 bg-black/60 p-1.5 rounded-2xl border border-gray-800">
        <button
          onClick={() => setActiveMainTab('raw_batches')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black cursor-pointer transition-all flex items-center justify-center gap-2 ${
            activeMainTab === 'raw_batches'
              ? 'bg-gradient-to-r from-gold-600 to-gold-500 text-black shadow-lg scale-[1.01]'
              : 'text-gray-400 hover:text-white hover:bg-gray-900/40'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>القسم الأول: المواد الخام (Production Batches)</span>
          <span className="text-[10px] bg-black/30 text-black/80 px-2 py-0.5 rounded-full font-mono">
            {batches.length}
          </span>
        </button>

        <button
          onClick={() => setActiveMainTab('ready_products')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black cursor-pointer transition-all flex items-center justify-center gap-2 ${
            activeMainTab === 'ready_products'
              ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg scale-[1.01]'
              : 'text-gray-400 hover:text-white hover:bg-gray-900/40'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>القسم الثاني: المنتجات الجاهزة (Unit Inventory)</span>
          <span className="text-[10px] bg-black/30 text-white px-2 py-0.5 rounded-full font-mono">
            {readyProductsList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveMainTab('general_reports')}
          className={`py-2.5 px-5 rounded-xl text-xs font-black cursor-pointer transition-all flex items-center justify-center gap-2 ${
            activeMainTab === 'general_reports'
              ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg scale-[1.01]'
              : 'text-gray-400 hover:text-white hover:bg-gray-900/40'
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          <span>التقارير الشاملة والأرباح</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: RAW MATERIAL BATCHES (Production Batch System)                     */}
      {/* ========================================================================= */}
      {activeMainTab === 'raw_batches' && (
        <div className="space-y-4">
          {/* Rules Banner */}
          <div className="bg-gradient-to-r from-amber-950/40 via-black to-amber-950/40 border border-amber-800/50 rounded-2xl p-3.5 flex items-center justify-between text-xs text-amber-300">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-gold-400 shrink-0" />
              <div>
                <p className="font-extrabold text-gold-400">القواعد المحاسبية لدفعات المواد الخام (Batch Production Logic):</p>
                <p className="text-[11px] text-gray-300">
                  عند إضافة 1 كجم بن بسعر 380 ج.م ينتج 50 كوب: تظل كمية المادة الخام (1 كجم) والتكلفة (380 ج.م) ثابتين، والذي يتناقص أثناء البيع هو عدد الأكواب فقط (50 ← 49 ← 0).
                </p>
              </div>
            </div>
            <span className="hidden sm:inline-block text-[10px] bg-gold-500/20 text-gold-400 px-2.5 py-1 rounded-lg border border-gold-500/30 font-bold shrink-0">
              محمي ضد الأخطاء
            </span>
          </div>

          {/* Search & Status Filters */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-luxury-card border border-luxury-border rounded-2xl p-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-gray-500 absolute right-3 top-2.5" />
              <input
                type="text"
                placeholder="بحث باسم المادة الخام أو رقم الدفعة..."
                value={batchSearchQuery}
                onChange={(e) => setBatchSearchQuery(e.target.value)}
                className="w-full bg-black/50 border border-gray-800 text-white rounded-xl pr-9 pl-3 py-1.5 text-xs focus:outline-none focus:border-gold-600"
              />
            </div>

            <div className="flex items-center gap-1 bg-black/60 p-1 rounded-xl border border-gray-800 w-full sm:w-auto justify-center">
              <button
                onClick={() => setBatchStatusFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                  batchStatusFilter === 'ALL' ? 'bg-gold-600 text-black shadow-md' : 'text-gray-400 hover:text-white'
                }`}
              >
                جميع الدفعات ({batches.length})
              </button>
              <button
                onClick={() => setBatchStatusFilter('ACTIVE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                  batchStatusFilter === 'ACTIVE' ? 'bg-emerald-600 text-white shadow-md' : 'text-gray-400 hover:text-white'
                }`}
              >
                النشطة فقط ({batches.filter(b => b.status === 'ACTIVE' || b.status === 'LOW').length})
              </button>
              <button
                onClick={() => setBatchStatusFilter('COMPLETED')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                  batchStatusFilter === 'COMPLETED' ? 'bg-gray-800 text-gray-300 shadow-md' : 'text-gray-400 hover:text-white'
                }`}
              >
                المنتهية ({batches.filter(b => b.status === 'COMPLETED').length})
              </button>
            </div>
          </div>

          {/* Batches Table */}
          {filteredBatches.length === 0 ? (
            <div className="bg-luxury-card border border-luxury-border rounded-3xl p-12 text-center text-gray-500 space-y-3">
              <Package className="w-12 h-12 text-gray-600 mx-auto" />
              <p className="text-sm font-bold text-gray-400">لا توجد دفعات إنتاج مطابقة لشرط البحث!</p>
              <p className="text-xs text-gray-600">اضغط على زر "إضافة دفعة إنتاج مادة خام" للبدء.</p>
            </div>
          ) : (
            <div className="bg-luxury-card border border-luxury-border rounded-3xl overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-black/60 text-gray-400 font-extrabold border-b border-gray-800 text-[11px]">
                    <tr>
                      <th className="py-3.5 px-4">رقم الدفعة</th>
                      <th className="py-3.5 px-4">المادة الخام</th>
                      <th className="py-3.5 px-4">كمية المادة الخام</th>
                      <th className="py-3.5 px-4">تكلفة الدفعة الثابتة</th>
                      <th className="py-3.5 px-4">السعة الإنتاجية</th>
                      <th className="py-3.5 px-4">الكمية المتبقية</th>
                      <th className="py-3.5 px-4">المباع</th>
                      <th className="py-3.5 px-4">الإيرادات المحققة</th>
                      <th className="py-3.5 px-4">صافي الربح</th>
                      <th className="py-3.5 px-4">الحالة</th>
                      <th className="py-3.5 px-4">تاريخ البداية</th>
                      <th className="py-3.5 px-4 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-900/60 font-bold">
                    {filteredBatches.map(batch => {
                      const totalYield = batch.yield_capacity || batch.original_quantity || 50;
                      const soldCups = batch.consumed_quantity || 0;
                      const remainingCups = batch.yield_capacity
                        ? Math.max(0, batch.yield_capacity - soldCups)
                        : batch.remaining_quantity;
                      const progressPct = Math.min(100, Math.round((soldCups / totalYield) * 100));

                      const revenue = batch.total_revenue || 0;
                      const netProfit = revenue - batch.purchase_price;

                      return (
                        <tr key={batch.id} className="hover:bg-gray-900/40 transition-colors">
                          {/* Batch Serial */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-gold-500" />
                              <span className="font-extrabold text-white">{batch.batch_serial}</span>
                            </div>
                          </td>

                          {/* Raw Material Name */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5">
                              <span className="text-gold-400 font-bold">{batch.item_name}</span>
                              {isSugarMaterial(batch.item_name) && (
                                <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-md font-semibold shrink-0">
                                  مادة مساعدة
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Raw Material Qty (Static) */}
                          <td className="py-3.5 px-4">
                            <span className="text-gray-300 font-mono">
                              {batch.raw_material_qty || 1} {batch.unit || 'كجم'}
                            </span>
                          </td>

                          {/* Batch Fixed Cost */}
                          <td className="py-3.5 px-4">
                            <span className="text-amber-400 font-black font-mono">
                              {formatEGP(batch.purchase_price)}
                            </span>
                          </td>

                          {/* Total Cups */}
                          <td className="py-3.5 px-4">
                            <span className="text-gray-200 font-mono">
                              {totalYield} {batch.yield_unit || 'كوب'}
                            </span>
                          </td>

                          {/* Remaining Cups */}
                          <td className="py-3.5 px-4">
                            <div className="flex flex-col gap-1 min-w-[90px]">
                              <span className={`font-black font-mono text-xs ${
                                remainingCups > 10 ? 'text-emerald-400' : remainingCups > 0 ? 'text-amber-400' : 'text-gray-500'
                              }`}>
                                {remainingCups} {batch.yield_unit || 'كوب'}
                              </span>
                              <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all ${
                                    remainingCups === 0 ? 'bg-gray-600' : remainingCups <= 5 ? 'bg-amber-500' : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${100 - progressPct}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          {/* Sold Cups */}
                          <td className="py-3.5 px-4">
                            <span className="text-gray-300 font-mono">{soldCups} {batch.yield_unit || 'كوب'}</span>
                          </td>

                          {/* Revenue */}
                          <td className="py-3.5 px-4">
                            {isSugarMaterial(batch.item_name) ? (
                              <span className="text-gray-500 text-xs font-semibold">- (مادة مساعدة)</span>
                            ) : (
                              <span className="text-blue-400 font-black font-mono">
                                {formatEGP(revenue)}
                              </span>
                            )}
                          </td>

                          {/* Net Profit */}
                          <td className="py-3.5 px-4">
                            {isSugarMaterial(batch.item_name) ? (
                              <span className="text-gray-500 text-xs font-semibold">مستثناة</span>
                            ) : (
                              <span className={`font-black font-mono ${netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {formatEGP(netProfit)}
                              </span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-4">
                            {batch.status === 'COMPLETED' ? (
                              <span className="inline-flex items-center gap-1 bg-gray-800 text-gray-400 px-2 py-0.5 rounded-lg text-[10px] font-bold border border-gray-700">
                                <CheckCircle2 className="w-3 h-3" />
                                منتهية
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 px-2 py-0.5 rounded-lg text-[10px] font-bold animate-pulse">
                                <Activity className="w-3 h-3 text-emerald-400" />
                                نشطة
                              </span>
                            )}
                          </td>

                          {/* Date */}
                          <td className="py-3.5 px-4 text-gray-400 font-mono text-[11px]">
                            {batch.purchase_date || new Date(batch.created_at).toLocaleDateString('ar-EG')}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => setSelectedBatchForReport(batch)}
                                className="p-1.5 bg-gray-800 hover:bg-gray-700 text-gold-400 rounded-lg cursor-pointer transition-all"
                                title="تقرير الدفعة"
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </button>

                              {batch.status !== 'COMPLETED' && (
                                <button
                                  onClick={() => handleCompleteBatch(batch.id, batch.batch_serial)}
                                  className="px-2 py-1 bg-amber-950/60 hover:bg-amber-800 text-amber-300 border border-amber-800/60 rounded-lg text-[10px] font-bold cursor-pointer transition-all"
                                  title="إكمال الدفعة"
                                >
                                  إكمال
                                </button>
                              )}

                              {/* Delete Button: Disabled or checked if soldCups > 0 */}
                              <button
                                onClick={() => handleDeleteBatch(batch)}
                                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                                  soldCups > 0
                                    ? 'bg-gray-900 text-gray-600 opacity-60 hover:bg-gray-900 cursor-not-allowed'
                                    : 'bg-red-950/60 hover:bg-red-800 text-red-400 border border-red-900/60'
                                }`}
                                title={soldCups > 0 ? 'ممنوع الحذف: تم البيع من هذه الدفعة' : 'حذف الدفعة'}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: READY PRODUCTS INVENTORY (Unit Inventory System)                  */}
      {/* ========================================================================= */}
      {activeMainTab === 'ready_products' && (
        <div className="space-y-4">
          {/* Rules Banner */}
          <div className="bg-gradient-to-r from-blue-950/40 via-black to-blue-950/40 border border-blue-800/50 rounded-2xl p-3.5 flex items-center justify-between text-xs text-blue-300">
            <div className="flex items-center gap-3">
              <ShoppingBag className="w-5 h-5 text-blue-400 shrink-0" />
              <div>
                <p className="font-extrabold text-blue-300">مخزون المنتجات الجاهزة (Unit Stock Logic):</p>
                <p className="text-[11px] text-gray-300">
                  المنتجات المباعة كما هي (المياه، الكانز، العصائر، الشيكولاتة). يتم تتبع الكمية بالوحدة ومتابعة تكلفة الشراء وسعر البيع وأرباح كل قطعة.
                </p>
              </div>
            </div>
            <span className="hidden sm:inline-block text-[10px] bg-blue-500/20 text-blue-300 px-2.5 py-1 rounded-lg border border-blue-500/30 font-bold shrink-0">
              تتبع بالقطعة
            </span>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-luxury-card border border-luxury-border rounded-2xl p-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-gray-500 absolute right-3 top-2.5" />
              <input
                type="text"
                placeholder="بحث باسم المنتج الجاهز أو البارcode..."
                value={productSearchQuery}
                onChange={(e) => setProductSearchQuery(e.target.value)}
                className="w-full bg-black/50 border border-gray-800 text-white rounded-xl pr-9 pl-3 py-1.5 text-xs focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                className="bg-black/60 border border-gray-800 text-white rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">جميع التصنيفات</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name_ar}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Ready Products Table */}
          {readyProductMetrics.length === 0 ? (
            <div className="bg-luxury-card border border-luxury-border rounded-3xl p-12 text-center text-gray-500 space-y-3">
              <ShoppingBag className="w-12 h-12 text-gray-600 mx-auto" />
              <p className="text-sm font-bold text-gray-400">لا توجد منتجات جاهزة مطابقة للبحث!</p>
              <p className="text-xs text-gray-600">قم بإضافة منتج جاهز جديد لبدء تتبع المخزون بالوحدة.</p>
            </div>
          ) : (
            <div className="bg-luxury-card border border-luxury-border rounded-3xl overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-black/60 text-gray-400 font-extrabold border-b border-gray-800 text-[11px]">
                    <tr>
                      <th className="py-3.5 px-4">اسم المنتج الجاهز</th>
                      <th className="py-3.5 px-4">التصنيف</th>
                      <th className="py-3.5 px-4">سعر الشراء (الوحدة)</th>
                      <th className="py-3.5 px-4">سعر البيع (الوحدة)</th>
                      <th className="py-3.5 px-4">ربح القطعة</th>
                      <th className="py-3.5 px-4">المخزون المتاح</th>
                      <th className="py-3.5 px-4">الكمية المباعة</th>
                      <th className="py-3.5 px-4">تكلفة مخزون المتبقي</th>
                      <th className="py-3.5 px-4">قيمة البيع المتوقعة</th>
                      <th className="py-3.5 px-4">الأرباح المحققة</th>
                      <th className="py-3.5 px-4">حالة المخزون</th>
                      <th className="py-3.5 px-4 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-900/60 font-bold">
                    {readyProductMetrics.map(({ product, soldQty, unitCost, unitPrice, unitProfit, currentStock, remainingStockValue, expectedSalesValue, realizedProfit }) => {
                      const categoryName = categories.find(c => c.id === product.category_id)?.name_ar || 'عام';
                      const isLow = currentStock <= product.minimum_stock;

                      return (
                        <tr key={product.id} className="hover:bg-gray-900/40 transition-colors">
                          {/* Product Name */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{product.image || '🥤'}</span>
                              <div>
                                <span className="font-extrabold text-white block">{product.name_ar}</span>
                                {product.barcode && (
                                  <span className="text-[9px] text-gray-500 font-mono">{product.barcode}</span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Category */}
                          <td className="py-3.5 px-4">
                            <span className="text-gray-400 font-bold">{categoryName}</span>
                          </td>

                          {/* Cost Price */}
                          <td className="py-3.5 px-4">
                            <span className="text-amber-400 font-mono">{formatEGP(unitCost)}</span>
                          </td>

                          {/* Selling Price */}
                          <td className="py-3.5 px-4">
                            <span className="text-blue-400 font-mono">{formatEGP(unitPrice)}</span>
                          </td>

                          {/* Unit Profit */}
                          <td className="py-3.5 px-4">
                            <span className="text-emerald-400 font-mono">+{formatEGP(unitProfit)}</span>
                          </td>

                          {/* Remaining Stock */}
                          <td className="py-3.5 px-4">
                            <span className={`font-black font-mono text-sm ${
                              currentStock <= 0 ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-emerald-400'
                            }`}>
                              {currentStock} قطعة
                            </span>
                          </td>

                          {/* Sold Quantity */}
                          <td className="py-3.5 px-4">
                            <span className="text-gray-300 font-mono">{soldQty} قطعة</span>
                          </td>

                          {/* Remaining Stock Cost */}
                          <td className="py-3.5 px-4">
                            <span className="text-amber-300 font-mono">{formatEGP(remainingStockValue)}</span>
                          </td>

                          {/* Expected Sales Value */}
                          <td className="py-3.5 px-4">
                            <span className="text-blue-300 font-mono">{formatEGP(expectedSalesValue)}</span>
                          </td>

                          {/* Realized Profit */}
                          <td className="py-3.5 px-4">
                            <span className="text-emerald-400 font-black font-mono">
                              {formatEGP(realizedProfit)}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-4">
                            {currentStock <= 0 ? (
                              <span className="bg-red-950/80 text-red-400 border border-red-800 px-2 py-0.5 rounded-lg text-[10px] font-bold">
                                منتهى!
                              </span>
                            ) : isLow ? (
                              <span className="bg-amber-950/80 text-amber-400 border border-amber-800 px-2 py-0.5 rounded-lg text-[10px] font-bold animate-pulse">
                                ينفذ قريباً
                              </span>
                            ) : (
                              <span className="bg-emerald-950/80 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-lg text-[10px] font-bold">
                                متوفر
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => {
                                  setEditingProduct(product);
                                  setProdNameAr(product.name_ar);
                                  setProdCategoryId(product.category_id);
                                  setProdCostPrice(product.cost_price.toString());
                                  setProdSellingPrice(product.selling_price.toString());
                                  setProdStock(product.current_stock.toString());
                                  setProdMinStock(product.minimum_stock.toString());
                                  setProdBarcode(product.barcode || '');
                                  setShowAddProductModal(true);
                                }}
                                className="p-1.5 bg-gray-800 hover:bg-gray-700 text-blue-400 rounded-lg cursor-pointer transition-all"
                                title="تعديل بيانات المنتج والمخزون"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handleDeleteProduct(product)}
                                className="p-1.5 bg-red-950/60 hover:bg-red-800 text-red-400 border border-red-900/60 rounded-lg cursor-pointer transition-all"
                                title="حذف المنتج"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: GENERAL UNIFIED REPORTS                                            */}
      {/* ========================================================================= */}
      {activeMainTab === 'general_reports' && (
        <div className="space-y-6">
          <div className="bg-luxury-card border border-luxury-border rounded-3xl p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
              <div className="flex items-center gap-3">
                <EldeebLogoHeader className="h-14 shrink-0" />
                <div>
                  <h3 className="text-base font-black text-white">التقرير الموحد لإدارة المخزون والأرباح</h3>
                  <p className="text-xs text-gray-400">تحليل الموقف المالي الشامل لدفعات المواد الخام والمنتجات الجاهزة</p>
                </div>
              </div>

              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-xl text-xs cursor-pointer flex items-center gap-2"
              >
                <Printer className="w-4 h-4 text-gold-400" />
                <span>طباعة التقرير الشامل</span>
              </button>
            </div>

            {/* Financial Summaries Comparison */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Raw Materials Batches Summary */}
              <div className="bg-black/50 border border-gold-900/50 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                  <h4 className="text-xs font-black text-gold-400 flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    قسم المواد الخام (Production Batches)
                  </h4>
                  <span className="text-[10px] text-gray-400">{batches.length} دفعات</span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400">عدد الدفعات النشطة:</span>
                    <span className="text-emerald-400 font-mono font-bold">{topStats.activeBatchesCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">عدد الدفعات المنتهية:</span>
                    <span className="text-gray-300 font-mono font-bold">{topStats.completedBatchesCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">إجمالي تكلفة الشراء المخصصة:</span>
                    <span className="text-amber-400 font-mono font-bold">{formatEGP(batches.reduce((s, b) => s + b.purchase_price, 0))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">إجمالي الإيرادات المحققة:</span>
                    <span className="text-blue-400 font-mono font-bold">{formatEGP(batches.reduce((s, b) => s + (b.total_revenue || 0), 0))}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-800 text-sm font-extrabold">
                    <span className="text-white">صافي ربح الدفعات:</span>
                    <span className="text-emerald-400 font-mono">
                      {formatEGP(batches.reduce((s, b) => s + (b.total_revenue || 0), 0) - batches.reduce((s, b) => s + b.purchase_price, 0))}
                    </span>
                  </div>
                </div>
              </div>

              {/* Ready Products Summary */}
              <div className="bg-black/50 border border-blue-900/50 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                  <h4 className="text-xs font-black text-blue-400 flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4" />
                    قسم المنتجات الجاهزة (Ready Products)
                  </h4>
                  <span className="text-[10px] text-gray-400">{readyProductsList.length} أصناف</span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400">إجمالي الوحدات المباعة:</span>
                    <span className="text-blue-300 font-mono font-bold">
                      {readyProductMetrics.reduce((sum, m) => sum + m.soldQty, 0)} قطعة
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">إجمالي الوحدات المتاحة بالمخزن:</span>
                    <span className="text-emerald-400 font-mono font-bold">
                      {readyProductMetrics.reduce((sum, m) => sum + m.currentStock, 0)} قطعة
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">تكلفة مخزون الوحدات الحالية:</span>
                    <span className="text-amber-400 font-mono font-bold">{formatEGP(topStats.readyProductsStockCost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">إجمالي مبيعات المنتجات الجاهزة:</span>
                    <span className="text-blue-400 font-mono font-bold">
                      {formatEGP(readyProductMetrics.reduce((sum, m) => sum + m.totalSalesVal, 0))}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-800 text-sm font-extrabold">
                    <span className="text-white">صافي أرباح المنتجات الجاهزة:</span>
                    <span className="text-emerald-400 font-mono">
                      {formatEGP(readyProductMetrics.reduce((sum, m) => sum + m.realizedProfit, 0))}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Total Grand Summary */}
            <div className="bg-gradient-to-r from-luxury-card via-black to-luxury-card border-2 border-gold-600/40 p-5 rounded-2xl text-center space-y-2">
              <span className="text-xs font-bold text-gold-400 block">صافي الأرباح الكلية المحققة من كافة أقسام المخزون</span>
              <span className={`text-2xl font-black font-mono block ${topStats.totalCombinedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatEGP(topStats.totalCombinedProfit)}
              </span>
              <p className="text-[11px] text-gray-400">
                محسوبة بدقة متناهية: (إجمالي إيرادات الدفعات والمنتجات الجاهزة) - (تكلفة الدفعات وتكلفة المبيعات)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE / ADD PRODUCTION BATCH                                     */}
      {/* ========================================================================= */}
      {showAddBatchModal && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4 animate-fade-in overflow-y-auto" dir="rtl">
          <form onSubmit={handleCreateBatch} className="bg-luxury-card border border-luxury-border rounded-3xl w-full max-w-lg p-6 relative my-auto shadow-2xl space-y-4">
            <button
              type="button"
              onClick={() => setShowAddBatchModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-gray-800 pb-3">
              <div className="w-10 h-10 rounded-xl bg-gold-600/20 border border-gold-500/40 text-gold-400 flex items-center justify-center shrink-0 font-bold">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white">إضافة دفعة إنتاج مادة خام جديدة</h3>
                <p className="text-[10px] text-gray-400">تسجيل كمية المادة الخام بالمخزن وتكلفتها الثابتة وطاقتها بالأكواب</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              {/* Raw Material Selection */}
              <div>
                <label className="text-[11px] text-gray-400 font-bold block mb-1">اسم المادة الخام *</label>
                <div className="flex gap-2">
                  <select
                    value={selectedRmId}
                    onChange={(e) => setSelectedRmId(e.target.value)}
                    className="w-1/2 bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600"
                  >
                    <option value="">-- اختر مادة سابقة --</option>
                    {rawMaterials.map(rm => (
                      <option key={rm.id} value={rm.id}>{rm.name} ({rm.unit})</option>
                    ))}
                  </select>

                  <input
                    type="text"
                    required
                    placeholder="أو اكتب اسماً جديداً (مثل: بن برازيلي)"
                    value={customRmName}
                    onChange={(e) => {
                      setSelectedRmId('');
                      setCustomRmName(e.target.value);
                    }}
                    className="w-1/2 bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600"
                  />
                </div>
              </div>

              {/* Raw Material Qty & Unit */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-gray-400 font-bold block mb-1">كمية المادة الخام بالمخزن *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="مثال: 1"
                    value={rawQuantity}
                    onChange={(e) => setRawQuantity(e.target.value)}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs font-mono focus:outline-none focus:border-gold-600"
                  />
                  <span className="text-[9px] text-gray-500 block mt-0.5">ثابتة لا تتغير أثناء بيع الأكواب</span>
                </div>

                <div>
                  <label className="text-[11px] text-gray-400 font-bold block mb-1">وحدة المادة الخام *</label>
                  <select
                    value={rawUnit}
                    onChange={(e) => setRawUnit(e.target.value)}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600"
                  >
                    <option value="كجم">كيلوجرام (كجم)</option>
                    <option value="جرام">جرام</option>
                    <option value="لتر">لتر</option>
                    <option value="علبة">علبة / عبوة</option>
                  </select>
                </div>
              </div>

              {/* Cost & Capacity Box */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-black/50 p-3.5 rounded-2xl border border-gold-900/50">
                <div>
                  <label className="text-[11px] text-gold-400 font-bold block mb-1">تكلفة الشراء الإجمالية للدفعة (EGP) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="مثال: 380"
                    value={batchCost}
                    onChange={(e) => setBatchCost(e.target.value)}
                    className="w-full bg-luxury-bg border border-gold-600/40 text-gold-300 font-black rounded-xl py-2 px-3 text-xs font-mono focus:outline-none focus:border-gold-500"
                  />
                  <span className="text-[9px] text-gray-400 block mt-0.5">تكلفة الشراء الكلية الثابتة</span>
                </div>

                <div>
                  <label className="text-[11px] text-gold-400 font-bold block mb-1">السعة الإنتاجية (الكمية) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="مثال: 50"
                    value={yieldCups}
                    onChange={(e) => setYieldCups(e.target.value)}
                    className="w-full bg-luxury-bg border border-gold-600/40 text-gold-300 font-black rounded-xl py-2 px-3 text-xs font-mono focus:outline-none focus:border-gold-500"
                  />
                  <span className="text-[9px] text-gray-400 block mt-0.5">إجمالي كمية الإنتاج من الدفعة</span>
                </div>

                <div>
                  <label className="text-[11px] text-gold-400 font-bold block mb-1">وحدة الإنتاج / التقديم *</label>
                  <input
                    type="text"
                    list="batch-yield-units-list"
                    required
                    placeholder="كوب، كاس، بولة، حجر..."
                    value={yieldUnit}
                    onChange={(e) => setYieldUnit(e.target.value)}
                    className="w-full bg-luxury-bg border border-gold-600/40 text-gold-300 font-bold rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-500"
                  />
                  <datalist id="batch-yield-units-list">
                    <option value="كوب">كوب (أكواب)</option>
                    <option value="كاس">كاس</option>
                    <option value="بولة">بولة (آيس كريم/شوربة)</option>
                    <option value="حجر شيشة">حجر شيشة</option>
                    <option value="قطعة">قطعة</option>
                    <option value="زجاجة">زجاجة</option>
                    <option value="براد">براد</option>
                    <option value="جرعة">جرعة (Shot)</option>
                    <option value="كجم">كيلوجرام</option>
                    <option value="لتر">لتر</option>
                    <option value="علبة">علبة</option>
                  </datalist>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {['كوب', 'كاس', 'بولة', 'حجر شيشة', 'قطعة', 'زجاجة', 'كجم'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setYieldUnit(preset)}
                        className={`text-[9px] px-1.5 py-0.5 rounded-md border transition-all cursor-pointer ${
                          yieldUnit === preset
                            ? 'bg-gold-500/20 text-gold-300 border-gold-500/50 font-bold'
                            : 'bg-zinc-900/60 text-gray-400 border-gray-800 hover:text-white'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Supplier & Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-gray-400 font-bold block mb-1">المورد (اختياري)</label>
                  <input
                    type="text"
                    placeholder="مثال: شركة البن الملوكي"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-gray-400 font-bold block mb-1">رقم الفاتورة (اختياري)</label>
                  <input
                    type="text"
                    placeholder="مثال: INV-900"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-gray-400 font-bold block mb-1">تاريخ الإنشاء والبداية</label>
                  <input
                    type="date"
                    required
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 font-mono"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-gray-400 font-bold block mb-1">الصلاحية (اختياري)</label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-gold-600 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="submit"
                className="flex-1 py-3 bg-gradient-to-r from-gold-600 to-gold-500 hover:from-gold-500 hover:to-gold-400 text-black font-black rounded-xl text-xs shadow-lg cursor-pointer transition-all"
              >
                حفظ وإنشاء دفعة الإنتاج 📦
              </button>
              <button
                type="button"
                onClick={() => setShowAddBatchModal(false)}
                className="py-3 px-4 bg-gray-900 hover:bg-gray-800 text-gray-400 rounded-xl text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE / EDIT READY PRODUCT                                        */}
      {/* ========================================================================= */}
      {showAddProductModal && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4 animate-fade-in overflow-y-auto" dir="rtl">
          <form onSubmit={handleSaveReadyProduct} className="bg-luxury-card border border-luxury-border rounded-3xl w-full max-w-lg p-6 relative my-auto shadow-2xl space-y-4">
            <button
              type="button"
              onClick={() => setShowAddProductModal(false)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-gray-800 pb-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400 flex items-center justify-center shrink-0 font-bold">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white">
                  {editingProduct ? `تعديل المنتج الجاهز: ${editingProduct.name_ar}` : 'إضافة منتج جاهز جديد بالوحدة'}
                </h3>
                <p className="text-[10px] text-gray-400">تتبع مخزون المنتجات المباعة كما هي (مياه، كانز، عصائر)</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] text-gray-400 font-bold block mb-1">اسم المنتج الجاهز *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: مياه معدنية 500 مل / كانز كولا"
                  value={prodNameAr}
                  onChange={(e) => setProdNameAr(e.target.value)}
                  className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-gray-400 font-bold block mb-1">التصنيف *</label>
                  <select
                    value={prodCategoryId}
                    onChange={(e) => setProdCategoryId(e.target.value)}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-blue-500"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name_ar}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-gray-400 font-bold block mb-1">الباركود (اختياري)</label>
                  <input
                    type="text"
                    placeholder="مثال: 6221000123"
                    value={prodBarcode}
                    onChange={(e) => setProdBarcode(e.target.value)}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Price & Cost */}
              <div className="grid grid-cols-2 gap-3 bg-black/50 p-3 rounded-2xl border border-blue-900/50">
                <div>
                  <label className="text-[11px] text-amber-400 font-bold block mb-1">سعر الشراء للقطعة (EGP) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="مثال: 8"
                    value={prodCostPrice}
                    onChange={(e) => setProdCostPrice(e.target.value)}
                    className="w-full bg-luxury-bg border border-gray-800 text-amber-300 font-bold rounded-xl py-2 px-3 text-xs font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-blue-400 font-bold block mb-1">سعر البيع للقطعة (EGP) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="مثال: 12"
                    value={prodSellingPrice}
                    onChange={(e) => setProdSellingPrice(e.target.value)}
                    className="w-full bg-luxury-bg border border-gray-800 text-blue-300 font-bold rounded-xl py-2 px-3 text-xs font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Stock Qty & Min Alert */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-gray-400 font-bold block mb-1">الكمية المتاحة بالقطع *</label>
                  <input
                    type="number"
                    required
                    placeholder="مثال: 24"
                    value={prodStock}
                    onChange={(e) => setProdStock(e.target.value)}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-gray-400 font-bold block mb-1">حد التنبيه للنفاد</label>
                  <input
                    type="number"
                    required
                    placeholder="مثال: 5"
                    value={prodMinStock}
                    onChange={(e) => setProdMinStock(e.target.value)}
                    className="w-full bg-luxury-bg border border-gray-800 text-white rounded-xl py-2 px-3 text-xs font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="submit"
                className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-black rounded-xl text-xs shadow-lg cursor-pointer transition-all"
              >
                {editingProduct ? 'حفظ تعديلات المنتج' : 'إضافة المنتج الجاهز للمخزون 🥤'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddProductModal(false)}
                className="py-3 px-4 bg-gray-900 hover:bg-gray-800 text-gray-400 rounded-xl text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DETAILED BATCH REPORT                                             */}
      {/* ========================================================================= */}
      {selectedBatchForReport && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4 animate-fade-in overflow-y-auto" dir="rtl">
          <div className="bg-luxury-card border border-luxury-border rounded-3xl w-full max-w-xl p-6 relative my-auto shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSelectedBatchForReport(null)}
              className="absolute top-4 left-4 text-gray-500 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-gray-800 pb-3">
              <div className="w-10 h-10 rounded-xl bg-gold-600/20 border border-gold-500/40 text-gold-400 flex items-center justify-center font-bold shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white">{selectedBatchForReport.batch_serial}</h3>
                <p className="text-xs text-gold-400 font-bold">تقرير تفصيلي لدفعة {selectedBatchForReport.item_name}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-bold">
              <div className="bg-black/50 p-3 rounded-2xl border border-gray-800">
                <span className="text-[10px] text-gray-400 block mb-1">كمية المادة الخام بالمخزن</span>
                <span className="text-white font-mono text-sm">
                  {selectedBatchForReport.raw_material_qty || 1} {selectedBatchForReport.unit || 'كجم'}
                </span>
              </div>

              <div className="bg-black/50 p-3 rounded-2xl border border-amber-900/60">
                <span className="text-[10px] text-amber-400 block mb-1">تكلفة الدفعة الثابتة</span>
                <span className="text-amber-300 font-mono text-sm">
                  {formatEGP(selectedBatchForReport.purchase_price)}
                </span>
              </div>

              <div className="bg-black/50 p-3 rounded-2xl border border-gray-800">
                <span className="text-[10px] text-gray-400 block mb-1">السعة الإنتاجية الكلية</span>
                <span className="text-gray-200 font-mono text-sm">
                  {selectedBatchForReport.yield_capacity || selectedBatchForReport.original_quantity || 50} {selectedBatchForReport.yield_unit || 'كوب'}
                </span>
              </div>

              <div className="bg-black/50 p-3 rounded-2xl border border-gray-800">
                <span className="text-[10px] text-gray-400 block mb-1">الكمية المستهلكة / المباعة</span>
                <span className="text-blue-400 font-mono text-sm">
                  {selectedBatchForReport.consumed_quantity || 0} {selectedBatchForReport.yield_unit || 'كوب'}
                </span>
              </div>

              <div className="bg-black/50 p-3 rounded-2xl border border-gray-800">
                <span className="text-[10px] text-gray-400 block mb-1">الكمية المتبقية</span>
                <span className="text-emerald-400 font-mono text-sm">
                  {selectedBatchForReport.yield_capacity ? Math.max(0, selectedBatchForReport.yield_capacity - selectedBatchForReport.consumed_quantity) : selectedBatchForReport.remaining_quantity} {selectedBatchForReport.yield_unit || 'كوب'}
                </span>
              </div>

              <div className="bg-black/50 p-3 rounded-2xl border border-gray-800">
                <span className="text-[10px] text-gray-400 block mb-1">متوسط تكلفة {selectedBatchForReport.yield_unit || 'البراد/الكوب'}</span>
                <span className="text-gray-300 font-mono text-sm">
                  {formatEGP(selectedBatchForReport.purchase_price / (selectedBatchForReport.yield_capacity || selectedBatchForReport.original_quantity || 50))} / {selectedBatchForReport.yield_unit || 'وحدة'}
                </span>
              </div>
            </div>

            {/* Financial Performance Box */}
            <div className="bg-gradient-to-r from-luxury-card via-black to-luxury-card p-4 rounded-2xl border border-gold-600/30 space-y-3">
              <h4 className="text-xs font-black text-gold-400 flex items-center gap-2">
                <Coins className="w-4 h-4" />
                الموقف المالي والأرباح المحققة
              </h4>

              <div className="grid grid-cols-2 gap-3 text-xs font-bold">
                <div>
                  <span className="text-[10px] text-gray-400 block">إجمالي إيرادات المبيعات:</span>
                  <span className="text-blue-400 text-sm font-mono font-black">{formatEGP(selectedBatchForReport.total_revenue || 0)}</span>
                </div>

                <div>
                  <span className="text-[10px] text-gray-400 block">صافي الربح المكتسب:</span>
                  <span className={`text-sm font-mono font-black ${(selectedBatchForReport.total_revenue || 0) >= selectedBatchForReport.purchase_price ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatEGP((selectedBatchForReport.total_revenue || 0) - selectedBatchForReport.purchase_price)}
                  </span>
                </div>
              </div>
            </div>

            {/* Timestamps */}
            <div className="text-[10px] text-gray-500 space-y-1 bg-black/30 p-3 rounded-xl border border-gray-900 font-mono">
              <div className="flex justify-between">
                <span>تاريخ بداية الدفعة:</span>
                <span className="text-gray-400">{new Date(selectedBatchForReport.created_at).toLocaleString('ar-EG')}</span>
              </div>
              {selectedBatchForReport.ended_at && (
                <div className="flex justify-between text-emerald-400 font-bold">
                  <span>تاريخ انتهاء وإكتمال الدفعة:</span>
                  <span>{new Date(selectedBatchForReport.ended_at).toLocaleString('ar-EG')}</span>
                </div>
              )}
              {selectedBatchForReport.supplier && (
                <div className="flex justify-between">
                  <span>المورد:</span>
                  <span className="text-gray-400">{selectedBatchForReport.supplier}</span>
                </div>
              )}
            </div>

            <div className="pt-2">
              <button
                onClick={() => setSelectedBatchForReport(null)}
                className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 text-gray-300 font-bold rounded-xl text-xs cursor-pointer"
              >
                إغلاق التقرير
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Batch Confirmation Modal */}
      <AnimatePresence>
        {batchToDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn" dir="rtl">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-luxury-card border-2 border-red-900/80 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 text-right relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/10 rounded-full blur-2xl pointer-events-none" />

              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 border-b border-gray-800">
                <div className="flex items-center gap-2 text-red-400 font-extrabold text-base">
                  <Trash2 className="w-5 h-5 text-red-500" />
                  <span>حذف دفعة إنتاج</span>
                </div>
                <button
                  onClick={() => setBatchToDeleteConfirm(null)}
                  className="p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-xl transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Message */}
              <div className="space-y-3">
                <p className="text-sm font-extrabold text-white text-center">
                  هل تريد حذف هذه الدفعة؟
                </p>

                <div className="bg-black/60 border border-gray-800 rounded-2xl p-4 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 font-bold">رقم الدفعة:</span>
                    <span className="text-gold-400 font-extrabold">{batchToDeleteConfirm.batch_serial}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 font-bold">المادة الخام:</span>
                    <span className="text-gray-200 font-bold">{batchToDeleteConfirm.item_name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 font-bold">الكمية المباعة:</span>
                    <span className="text-emerald-400 font-bold">{batchToDeleteConfirm.consumed_quantity || 0} {batchToDeleteConfirm.yield_unit || 'كوب'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 font-bold">الكمية المتبقية:</span>
                    <span className="text-blue-400 font-bold">{batchToDeleteConfirm.original_quantity || batchToDeleteConfirm.yield_capacity || 50} {batchToDeleteConfirm.yield_unit || 'كوب'} (العدد الأصلي)</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-gray-800">
                    <span className="text-gray-400 font-bold">التكلفة الثابتة:</span>
                    <span className="text-amber-400 font-black">{formatEGP(batchToDeleteConfirm.purchase_price)}</span>
                  </div>
                </div>
              </div>

              {/* Modal Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleConfirmDeleteBatch}
                  className="flex-1 py-2.5 px-4 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-extrabold rounded-xl text-xs shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  <Check className="w-4 h-4" />
                  <span>نعم</span>
                </button>
                <button
                  onClick={() => setBatchToDeleteConfirm(null)}
                  className="flex-1 py-2.5 px-4 bg-gray-800 hover:bg-gray-700 text-gray-300 font-extrabold rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span>إلغاء</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
