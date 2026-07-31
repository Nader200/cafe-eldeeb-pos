/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  PlusCircle,
  Search,
  Layers,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Clock,
  History,
  TrendingDown,
  TrendingUp,
  Package,
  Activity,
  Trash2,
  X,
  FileText,
  User,
  SlidersHorizontal,
  ChevronLeft,
  ArrowDownCircle,
  ArrowUpCircle,
  ClipboardList,
  AlertCircle,
  CheckCircle2,
  Layers2,
  CornerDownLeft,
  ChevronsUpDown,
  RefreshCw,
  Info,
  Coffee
} from 'lucide-react';
import { dbService } from '../dbService';
import { BatchProfitReportView } from './BatchProfitReportView';
import { InventoryBatch, InventoryBatchLog, RawMaterial, Product, Supplier } from '../types';

interface RawMaterialsViewProps {
  onShowSuccessAlert: (msg: string) => void;
  onShowWarningAlert: (msg: string) => void;
}

export default function RawMaterialsView({
  onShowSuccessAlert,
  onShowWarningAlert
}: RawMaterialsViewProps) {
  // Navigation & Sub-views
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'logs' | 'reports'>('dashboard');

  // Core Data
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [logs, setLogs] = useState<InventoryBatchLog[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [batchConsumptions, setBatchConsumptions] = useState<any[]>([]);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'raw_material' | 'ready_product'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ACTIVE' | 'LOW' | 'COMPLETED' | 'EXPIRED'>('all');

  // Modals & Forms State
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showDetailsModal, setShowDetailsModal] = useState<boolean>(false);
  const [showAdjustModal, setShowAdjustModal] = useState<boolean>(false);
  const [showDepletedModal, setShowDepletedModal] = useState<boolean>(false);

  // Selected Items for Details/Actions
  const [selectedBatch, setSelectedBatch] = useState<InventoryBatch | null>(null);
  const [adjustBatch, setAdjustBatch] = useState<InventoryBatch | null>(null);
  const [depletedBatch, setDepletedBatch] = useState<{ id: string; name: string } | null>(null);

  // Form Fields - New Batch
  const [itemType, setItemType] = useState<'raw_material' | 'ready_product'>('raw_material');
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [customItemName, setCustomItemName] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [unit, setUnit] = useState<string>('كيلوجرام');
  const [purchasePrice, setPurchasePrice] = useState<string>('');
  const [supplierName, setSupplierName] = useState<string>('');
  const [purchaseDate, setPurchaseDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [yieldCapacity, setYieldCapacity] = useState<string>('50');
  const [yieldUnit, setYieldUnit] = useState<string>('كوب');

  // Form Fields - Adjustment
  const [adjustType, setAdjustType] = useState<'DEDUCT' | 'ADD' | 'INVENTORY_CHECK'>('DEDUCT');
  const [adjustQuantity, setAdjustQuantity] = useState<string>('');
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [confirmDeleteBatchId, setConfirmDeleteBatchId] = useState<string | null>(null);

  // Load Data on Mount
  const loadAllData = () => {
    try {
      setBatches(dbService.getInventoryBatches());
      setLogs(dbService.getInventoryBatchLogs());
      setRawMaterials(dbService.getRawMaterials());
      setProducts(dbService.getProducts());
      setSuppliers(dbService.getSuppliers());
      setBatchConsumptions(dbService.getBatchConsumptions());
    } catch (e) {
      console.error('Error loading inventory batch data:', e);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Expiry check helper (Expired if expiry_date is defined and is in the past)
  const isBatchExpired = (batch: InventoryBatch): boolean => {
    if (!batch.expiry_date) return false;
    const exp = new Date(batch.expiry_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return exp < today;
  };

  // Helper to format currency
  const formatEGP = (num: number) => {
    return `${num.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
  };

  // Populate Add Form when item is selected
  useEffect(() => {
    if (selectedItemId) {
      if (itemType === 'raw_material') {
        const found = rawMaterials.find(r => r.id === selectedItemId);
        if (found) {
          setCustomItemName(found.name);
          setUnit(found.unit || 'كيلوجرام');
          setPurchasePrice(found.unit_cost ? found.unit_cost.toString() : '');
        }
      } else {
        const found = products.find(p => p.id === selectedItemId);
        if (found) {
          setCustomItemName(found.name_ar);
          setUnit(found.unit || 'عدد');
          setPurchasePrice(found.cost_price ? found.cost_price.toString() : '');
        }
      }
    } else {
      setCustomItemName('');
      setUnit(itemType === 'raw_material' ? 'كيلوجرام' : 'عدد');
      setPurchasePrice('');
    }
  }, [selectedItemId, itemType, rawMaterials, products]);

  // Clean form fields
  const resetAddForm = () => {
    setSelectedItemId('');
    setCustomItemName('');
    setQuantity('');
    setPurchasePrice('');
    setSupplierName('');
    setPurchaseDate(new Date().toISOString().split('T')[0]);
    setInvoiceNumber('');
    setExpiryDate('');
    setYieldCapacity('50');
    setYieldUnit('كوب');
  };

  // Add Batch
  const handleAddBatchSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const nameToSave = customItemName.trim();
    if (!nameToSave) {
      onShowWarningAlert('يرجى إدخال أو اختيار اسم المنتج!');
      return;
    }

    const qtyNum = parseFloat(quantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      onShowWarningAlert('يرجى إدخال كمية صحيحة أكبر من الصفر!');
      return;
    }

    const priceNum = parseFloat(purchasePrice) || 0;
    if (priceNum < 0) {
      onShowWarningAlert('سعر الشراء لا يمكن أن يكون سالباً!');
      return;
    }

    try {
      // Calculate next batch serial, e.g. "دفعة كوكاكولا رقم 4"
      const nextNum = dbService.getNextBatchNumber(nameToSave);
      const batchSerial = `دفعة ${nameToSave} رقم ${nextNum}`;

      let finalItemId = selectedItemId;
      if (itemType === 'raw_material') {
        const found = rawMaterials.find(r => r.id === selectedItemId || r.name.trim().toLowerCase() === nameToSave.toLowerCase());
        if (found) {
          finalItemId = found.id;
          dbService.saveRawMaterial({
            ...found,
            current_quantity: found.current_quantity + qtyNum,
            unit_cost: priceNum || found.unit_cost
          });
        } else {
          // Brand new raw material! Register it!
          const newRm: RawMaterial = {
            id: `raw_${Date.now()}`,
            name: nameToSave,
            unit: unit || 'كيلوجرام',
            current_quantity: qtyNum,
            add_quantity: 0,
            unit_cost: priceNum,
            total_cost: qtyNum * priceNum,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          dbService.saveRawMaterial(newRm);
          finalItemId = newRm.id;
        }
      } else {
        const found = products.find(p => p.id === selectedItemId || (p.name_ar || '').trim().toLowerCase() === nameToSave.toLowerCase());
        if (found) {
          finalItemId = found.id;
        }
      }

      const yieldCapNum = itemType === 'raw_material' ? (parseFloat(yieldCapacity) || 50) : undefined;

      const newBatch: InventoryBatch = {
        id: `batch_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        batch_serial: batchSerial,
        item_type: itemType,
        item_id: finalItemId || `custom_${Date.now()}`,
        item_name: nameToSave,
        raw_material_qty: qtyNum,
        original_quantity: itemType === 'raw_material' ? (yieldCapNum || 50) : qtyNum,
        consumed_quantity: 0,
        remaining_quantity: itemType === 'raw_material' ? (yieldCapNum || 50) : qtyNum,
        unit: unit,
        yield_unit: itemType === 'raw_material' ? (yieldUnit.trim() || 'كوب') : unit,
        purchase_price: priceNum,
        supplier: supplierName.trim() || 'مورد عام / غير محدد',
        purchase_date: purchaseDate,
        invoice_number: invoiceNumber.trim() || undefined,
        expiry_date: expiryDate || undefined,
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
        yield_capacity: yieldCapNum,
        remaining_cups: yieldCapNum
      };

      // Save Batch
      dbService.saveInventoryBatch(newBatch);

      // Save Log
      dbService.addInventoryBatchLog({
        batch_id: newBatch.id,
        batch_serial: newBatch.batch_serial,
        item_name: newBatch.item_name,
        action_type: 'ADD_BATCH',
        quantity_changed: qtyNum,
        previous_quantity: 0,
        new_quantity: qtyNum,
        operator: 'نادر الديب',
        reason: invoiceNumber.trim() ? `شراء بموجب فاتورة رقم ${invoiceNumber}` : 'إدخال مخزون دفعة جديدة'
      });

      onShowSuccessAlert(`تم تسجيل "${batchSerial}" بنجاح! 🚀`);
      setShowAddModal(false);
      resetAddForm();
      loadAllData();
    } catch (err) {
      console.error(err);
      onShowWarningAlert('حدث خطأ أثناء حفظ الدفعة!');
    }
  };

  // Handle manual stock adjustment (deduction, addition, jard)
  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustBatch) return;

    const qtyNum = parseFloat(adjustQuantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      onShowWarningAlert('يرجى إدخال كمية صحيحة أكبر من الصفر!');
      return;
    }

    if (!adjustReason.trim()) {
      onShowWarningAlert('يرجى كتابة سبب التعديل!');
      return;
    }

    const previousQty = adjustBatch.remaining_quantity;
    let newQty = previousQty;
    let qtyChanged = qtyNum;

    if (adjustType === 'DEDUCT') {
      if (qtyNum > previousQty) {
        onShowWarningAlert('الكمية المراد خصمها أكبر من الكمية المتبقية في هذه الدفعة!');
        return;
      }
      newQty = previousQty - qtyNum;
      qtyChanged = -qtyNum;
    } else if (adjustType === 'ADD') {
      newQty = previousQty + qtyNum;
      qtyChanged = qtyNum;
    } else if (adjustType === 'INVENTORY_CHECK') {
      newQty = qtyNum;
      qtyChanged = qtyNum - previousQty;
    }

    try {
      const isDeduction = adjustType === 'DEDUCT';
      const updatedConsumed = isDeduction 
        ? adjustBatch.consumed_quantity + qtyNum 
        : adjustBatch.consumed_quantity - (adjustType === 'ADD' ? qtyNum : (previousQty - qtyNum));

      const updatedBatch: InventoryBatch = {
        ...adjustBatch,
        consumed_quantity: Math.max(0, updatedConsumed),
        remaining_quantity: newQty
      };

      // Auto update status inside dbService.saveInventoryBatch
      dbService.saveInventoryBatch(updatedBatch);

      // Save Log
      dbService.addInventoryBatchLog({
        batch_id: adjustBatch.id,
        batch_serial: adjustBatch.batch_serial,
        item_name: adjustBatch.item_name,
        action_type: adjustType === 'DEDUCT' ? 'MANUAL_DEDUCT' : adjustType === 'ADD' ? 'MANUAL_ADD' : 'INVENTORY_CHECK',
        quantity_changed: qtyChanged,
        previous_quantity: previousQty,
        new_quantity: newQty,
        operator: 'النظام',
        reason: adjustReason.trim()
      });

      onShowSuccessAlert('تم تحديث كمية الدفعة وحفظ الحركة بسجل الجرد! 🗃️');
      setShowAdjustModal(false);
      setAdjustQuantity('');
      setAdjustReason('');

      // Critical requirement check: if remaining quantity drops to exactly 0, trigger alert popup
      if (newQty === 0) {
        setDepletedBatch({ id: adjustBatch.id, name: adjustBatch.item_name });
        setShowDepletedModal(true);
      }

      loadAllData();
    } catch (err) {
      console.error(err);
      onShowWarningAlert('حدث خطأ أثناء تعديل كمية المخزون!');
    }
  };

  // Delete Batch
  const handleDeleteBatch = (id: string, serial: string) => {
    try {
      const batchToDelete = batches.find(b => b.id === id);
      dbService.deleteInventoryBatch(id);

      dbService.addInventoryBatchLog({
        batch_id: id,
        batch_serial: serial,
        item_name: batchToDelete?.item_name || 'دفعة محذوفة',
        action_type: 'DELETE_BATCH',
        quantity_changed: -(batchToDelete?.remaining_quantity || 0),
        previous_quantity: batchToDelete?.remaining_quantity || 0,
        new_quantity: 0,
        operator: 'نادر الديب',
        reason: 'حذف يدوي لدفعة المخزن'
      });

      onShowSuccessAlert(`تم حذف الدفعة "${serial}" بنجاح! 🗑️`);
      setShowDetailsModal(false);
      setConfirmDeleteBatchId(null);
      loadAllData();
    } catch (err) {
      console.error(err);
      onShowWarningAlert('حدث خطأ أثناء حذف الدفعة!');
    }
  };

  // Filter & Search Batches list
  const filteredBatches = useMemo(() => {
    return batches.filter(b => {
      // 1. Search Query
      const matchesSearch = b.item_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.batch_serial.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.supplier.toLowerCase().includes(searchQuery.toLowerCase());

      // 2. Type filter
      const matchesType = typeFilter === 'all' || b.item_type === typeFilter;

      // 3. Status filter
      let matchesStatus = true;
      if (statusFilter !== 'all') {
        const expired = isBatchExpired(b);
        if (statusFilter === 'EXPIRED') {
          matchesStatus = expired;
        } else if (statusFilter === 'COMPLETED') {
          matchesStatus = b.remaining_quantity <= 0;
        } else if (statusFilter === 'LOW') {
          matchesStatus = !expired && b.remaining_quantity > 0 && (b.remaining_quantity / b.original_quantity <= 0.2);
        } else if (statusFilter === 'ACTIVE') {
          matchesStatus = !expired && b.remaining_quantity > 0 && (b.remaining_quantity / b.original_quantity > 0.2);
        }
      }

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [batches, searchQuery, typeFilter, statusFilter]);

  // Expiration/Warning stats for warnings panel
  const { lowStockBatches, expiredBatches, activeBatchesCount, totalInventoryValue } = useMemo(() => {
    let low = 0;
    let exp = 0;
    let active = 0;
    let totalVal = 0;

    batches.forEach(b => {
      const isExp = isBatchExpired(b);
      const isLow = !isExp && b.remaining_quantity > 0 && (b.remaining_quantity / b.original_quantity <= 0.2);

      if (b.remaining_quantity > 0) {
        active++;
        totalVal += b.remaining_quantity * b.purchase_price;
      }

      if (isExp) exp++;
      if (isLow) low++;
    });

    return { lowStockBatches: low, expiredBatches: exp, activeBatchesCount: active, totalInventoryValue: totalVal };
  }, [batches]);

  return (
    <div className="w-full text-right" dir="rtl">
      {/* 1. Header Hero section */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between border-b border-gold-500/10 pb-5 gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-gold-500 flex items-center gap-2">
            <Layers className="w-6 h-6 text-gold-500" />
            <span>نظام إدارة دفعات المخزون الاحترافي</span>
            <span className="text-[10px] bg-gold-500/10 text-gold-400 px-2 py-0.5 rounded-full border border-gold-500/20 font-mono">
              Phase 1 (Batches)
            </span>
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            مراقبة الدفعات، جرد كميات الاستهلاك، تنبيهات فترات الصلاحية، وتقارير الحركات التفصيلية.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Action Trigger Buttons */}
          <button
            onClick={() => {
              setActiveSubTab('dashboard');
              setShowAddModal(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-gold-600 to-gold-500 hover:from-gold-500 hover:to-gold-400 text-black font-extrabold text-xs rounded-xl shadow-lg transition-all transform active:scale-95 cursor-pointer"
          >
            <PlusCircle className="w-4.5 h-4.5" />
            <span>تسجيل دفعة مخزون جديدة</span>
          </button>
        </div>
      </div>

      {/* 2. Top warning notification banners */}
      {(lowStockBatches > 0 || expiredBatches > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          {expiredBatches > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-950/20 border border-red-900/40 p-3 rounded-2xl flex items-start gap-3 text-red-400 text-xs shadow-md"
            >
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5 animate-pulse" />
              <div>
                <strong className="block font-black text-red-500 mb-0.5">تنبيه انتهاء الصلاحية للغذاء والمنتجات 🚨</strong>
                <span>يوجد حالياً <span className="font-bold underline">{expiredBatches}</span> دفعات منتهية الصلاحية تماماً بالمخزن! يرجى فحصها واتخاذ إجراء الهالك المناسب لسلامة العملاء.</span>
              </div>
            </motion.div>
          )}

          {lowStockBatches > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-amber-950/20 border border-amber-900/40 p-3 rounded-2xl flex items-start gap-3 text-amber-400 text-xs shadow-md"
            >
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5 animate-bounce" />
              <div>
                <strong className="block font-black text-amber-500 mb-0.5">تحذير انخفاض المخزن والنفاد ⚠️</strong>
                <span>يوجد حالياً <span className="font-bold underline">{lowStockBatches}</span> دفعات قاربت على النفاد بالكامل (الكمية المتبقية أقل من 20% من الحجم الأصلي).</span>
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* 3. Sub Tabs Bar Navigation */}
      <div className="flex border-b border-gray-900/50 mb-6 bg-black/40 p-1.5 rounded-2xl gap-1">
        <button
          onClick={() => setActiveSubTab('dashboard')}
          className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'dashboard'
              ? 'bg-gradient-to-l from-gold-600/15 to-gold-600/5 border border-gold-500/25 text-gold-400'
              : 'text-gray-400 hover:text-white hover:bg-zinc-950/40'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>الدفعات المخزنية</span>
        </button>

        <button
          onClick={() => setActiveSubTab('logs')}
          className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'logs'
              ? 'bg-gradient-to-l from-gold-600/15 to-gold-600/5 border border-gold-500/25 text-gold-400'
              : 'text-gray-400 hover:text-white hover:bg-zinc-950/40'
          }`}
        >
          <History className="w-4 h-4" />
          <span>سجل حركات الجرد</span>
        </button>

        <button
          onClick={() => setActiveSubTab('reports')}
          className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'reports'
              ? 'bg-gradient-to-l from-gold-600/15 to-gold-600/5 border border-gold-500/25 text-gold-400'
              : 'text-gray-400 hover:text-white hover:bg-zinc-950/40'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>تقارير المخزون</span>
        </button>
      </div>

      {/* 4. CORE CONTROLLERS & VIEWS */}
      <AnimatePresence mode="wait">
        {/* ==================== SUB-TAB 1: DASHBOARD & BATCHES ==================== */}
        {activeSubTab === 'dashboard' && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* Filters and search box */}
            <div className="bg-[#070707] border border-gold-500/10 p-4 rounded-2xl shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="relative flex-1">
                <Search className="absolute right-3.5 top-3.5 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="ابحث عن دفعة بالاسم، المورد، الكود أو الرقم التسلسلي..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-950 text-white rounded-xl py-3 pr-10 pl-4 text-xs font-semibold border border-zinc-900 focus:border-[#D4AF37] focus:outline-none transition-all placeholder:text-gray-600"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Type Filter dropdown */}
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

                {/* Status Filter dropdown */}
                <div className="flex items-center gap-1.5 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-900">
                  <span className="text-[10px] text-gray-500 font-bold">الحالة:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer"
                  >
                    <option value="all" className="bg-black text-white">الكل</option>
                    <option value="ACTIVE" className="bg-black text-white">نشطة وبحالة جيدة</option>
                    <option value="LOW" className="bg-black text-white">قليلة المخزون (&lt;20%)</option>
                    <option value="COMPLETED" className="bg-black text-white">مستهلكة بالكامل</option>
                    <option value="EXPIRED" className="bg-black text-white">منتهية الصلاحية</option>
                  </select>
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

            {/* Quick Metrics mini-cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-zinc-950/70 border border-zinc-900 rounded-2xl p-4 flex flex-col justify-between">
                <span className="text-[10px] text-gray-500 font-bold block mb-1">إجمالي الدفعات المسجلة</span>
                <span className="text-xl font-bold font-mono text-white">{batches.length}</span>
              </div>
              <div className="bg-zinc-950/70 border border-zinc-900 rounded-2xl p-4 flex flex-col justify-between">
                <span className="text-[10px] text-gray-500 font-bold block mb-1">الدفعات النشطة حالياً</span>
                <span className="text-xl font-bold font-mono text-emerald-400">{activeBatchesCount}</span>
              </div>
              <div className="bg-zinc-950/70 border border-zinc-900 rounded-2xl p-4 flex flex-col justify-between">
                <span className="text-[10px] text-gray-500 font-bold block mb-1">قيمة المخزون الإجمالي المتبقي</span>
                <span className="text-md font-bold font-mono text-gold-400">{formatEGP(totalInventoryValue)}</span>
              </div>
              <div className="bg-zinc-950/70 border border-zinc-900 rounded-2xl p-4 flex flex-col justify-between">
                <span className="text-[10px] text-gray-500 font-bold block mb-1">المواد منخفضة / منتهية</span>
                <span className="text-xl font-bold font-mono text-red-400">{lowStockBatches + expiredBatches}</span>
              </div>
            </div>

            {/* Batches Grid Container */}
            {filteredBatches.length === 0 ? (
              <div className="bg-[#070707] border border-zinc-900/40 rounded-3xl p-16 text-center shadow-lg">
                <Package className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                <h3 className="text-sm font-bold text-white mb-1">لا توجد أي دفعات تطابق البحث والفلاتر المحددة</h3>
                <p className="text-xs text-gray-500">جرب البحث بكلمة أخرى أو قم بتسجيل دفعة جديدة للمخزن الآن.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredBatches.map((batch) => {
                  const expired = isBatchExpired(batch);
                  const isLow = !expired && batch.remaining_quantity > 0 && (batch.remaining_quantity / batch.original_quantity <= 0.2);
                  
                  // Calculate percentage consumed
                  const percentConsumed = batch.item_type === 'raw_material'
                    ? (batch.status === 'COMPLETED' ? 100 : 0)
                    : (batch.original_quantity > 0 ? (batch.consumed_quantity / batch.original_quantity) * 100 : 100);
                  
                  const percentRemaining = 100 - percentConsumed;

                  return (
                    <motion.div
                      layout
                      key={batch.id}
                      whileHover={{ scale: 1.01, borderColor: '#D4AF37' }}
                      className={`bg-zinc-950 border rounded-2xl p-4 flex flex-col justify-between relative shadow-lg cursor-pointer transition-all duration-300 ${
                        expired 
                          ? 'border-red-900/40 hover:shadow-red-950/10' 
                          : isLow 
                            ? 'border-amber-900/40 hover:shadow-amber-950/10' 
                            : 'border-zinc-900 hover:shadow-[#D4AF37]/10'
                      }`}
                      onClick={() => {
                        setSelectedBatch(batch);
                        setShowDetailsModal(true);
                      }}
                    >
                      {/* Top row: Batch serial, item type indicator */}
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <div className="text-right">
                          <span className="text-[10px] text-gray-500 font-mono block leading-none mb-1">
                            {batch.invoice_number ? `فاتورة #${batch.invoice_number}` : 'دفعة شراء حرة'}
                          </span>
                          <h4 className="text-xs font-black text-white hover:text-gold-500 transition-colors">
                            {batch.item_name}
                          </h4>
                          <span className="text-[10px] font-bold text-gold-500 block mt-1 font-mono">
                            {batch.batch_serial}
                          </span>
                        </div>

                        {/* Badges based on status */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                            batch.item_type === 'raw_material' 
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' 
                              : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                          }`}>
                            {batch.item_type === 'raw_material' ? 'مادة خام' : 'منتج جاهز'}
                          </span>

                          {expired ? (
                            <span className="text-[9px] font-black bg-red-600 text-white px-2 py-0.5 rounded-full border border-red-700">
                              منتهي الصلاحية!
                            </span>
                          ) : batch.remaining_quantity <= 0 ? (
                            <span className="text-[9px] font-black bg-zinc-800 text-gray-400 px-2 py-0.5 rounded-full border border-zinc-700">
                              مكتملة
                            </span>
                          ) : isLow ? (
                            <span className="text-[9px] font-black bg-amber-500 text-black px-2 py-0.5 rounded-full">
                              نفد تقريباً!
                            </span>
                          ) : (
                            <span className="text-[9px] font-black bg-emerald-950/30 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-900/30">
                              نشط وممتاز
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Quantities display */}
                      <div className="grid grid-cols-3 gap-2 bg-black/40 px-3 py-2 rounded-xl mb-3 text-center">
                        <div>
                          <span className="text-[9px] text-gray-500 block">الدفعة والإنتاجية</span>
                          <span className="text-xs font-bold text-gray-300 font-mono">
                            {batch.original_quantity} <span className="text-[9px]">{batch.unit}</span>
                            {batch.yield_capacity ? <span className="block text-[9px] text-amber-400 font-bold">({batch.yield_capacity} كوب)</span> : null}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] text-gray-500 block">المباع</span>
                          {batch.item_type === 'raw_material' ? (
                            <span className="text-xs font-bold text-amber-400 font-mono">
                              {batch.consumed_quantity} <span className="text-[9px]">كوب/طلب</span>
                            </span>
                          ) : (
                            <span className="text-xs font-bold text-red-500/80 font-mono">
                              {batch.consumed_quantity} <span className="text-[9px]">{batch.unit}</span>
                            </span>
                          )}
                        </div>
                        <div>
                          <span className="text-[9px] text-gray-500 block">المتبقي بالدفعة</span>
                          {batch.item_type === 'raw_material' ? (
                            <span className="text-xs font-black text-emerald-400 font-mono">
                              {batch.yield_capacity 
                                ? Math.max(0, batch.yield_capacity - batch.consumed_quantity) 
                                : batch.remaining_quantity}{' '}
                              <span className="text-[9px]">{batch.yield_capacity ? 'كوب' : batch.unit}</span>
                            </span>
                          ) : (
                            <span className="text-xs font-black text-emerald-400 font-mono">
                              {batch.remaining_quantity} <span className="text-[9px]">{batch.unit}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Display products consumed detailed list for raw material */}
                      {batch.item_type === 'raw_material' && (() => {
                        const bCons = batchConsumptions.filter(c => c.batch_id === batch.id);
                        if (bCons.length === 0) return null;
                        const grouped = bCons.reduce((acc, curr) => {
                          const name = curr.product_name || 'كوب/طلب';
                          acc[name] = (acc[name] || 0) + (curr.product_quantity || 0);
                          return acc;
                        }, {} as Record<string, number>);
                        return (
                          <div className="text-[10px] bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1.5 mb-3 text-emerald-400 font-bold flex flex-wrap gap-1 items-center">
                            <span>الإنتاج المباع:</span>
                            {Object.entries(grouped).map(([name, qty], idx, arr) => (
                              <span key={name} className="whitespace-nowrap">
                                {qty} {name}
                                {idx < arr.length - 1 ? ' و ' : ''}
                              </span>
                            ))}
                          </div>
                        );
                      })()}

                      {/* Expiration warning helper */}
                      {batch.expiry_date && (
                        <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mb-3 font-semibold">
                          <Calendar className={`w-3.5 h-3.5 shrink-0 ${expired ? 'text-red-500' : 'text-gray-500'}`} />
                          <span>تاريخ الانتهاء:</span>
                          <span className={`font-mono ${expired ? 'text-red-400 underline font-black' : 'text-gray-300'}`}>
                            {batch.expiry_date}
                          </span>
                        </div>
                      )}

                      {/* Beautiful Progress bar representing consumption percentage */}
                      <div className="space-y-1.5 mt-auto">
                        <div className="flex justify-between items-center text-[10px] text-gray-400">
                          <span className="font-bold flex items-center gap-1">
                            <Activity className="w-3 h-3 text-gold-500" />
                            <span>نسبة الاستهلاك</span>
                          </span>
                          <span className="font-bold font-mono text-gold-400">{percentConsumed.toFixed(0)}%</span>
                        </div>

                        {/* Progress Bar Track */}
                        <div className="w-full h-2.5 bg-zinc-900 rounded-full overflow-hidden p-0.5 border border-zinc-800">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${percentConsumed}%` }}
                            transition={{ duration: 0.8 }}
                            className={`h-full rounded-full ${
                              percentConsumed >= 100 
                                ? 'bg-red-600' 
                                : percentConsumed >= 80 
                                  ? 'bg-amber-500' 
                                  : 'bg-gradient-to-r from-gold-600 to-gold-400'
                            }`}
                          />
                        </div>
                      </div>

                      {/* Complete Batch Action Button for Active Batches */}
                      {batch.status !== 'COMPLETED' && (
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`هل تريد إنهاء الدفعة الحالية (${batch.batch_serial}) وفتح دفعة جديدة؟\nسيتم إغلاق الدفعة واحتساب أرباحها وعدد الأكواب المستخرجة منها بالكامل.`)) {
                                const updated = dbService.completeInventoryBatch(batch.id, 'المالك');
                                setBatches(updated);
                                onShowSuccessAlert(`تم إنهاء الدفعة (${batch.batch_serial}) بنجاح!`);
                                loadAllData();
                              }
                            }}
                            className="w-full py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>إنهاء الدفعة الحالية وفتح دفعة جديدة</span>
                          </button>
                        </div>
                      )}

                      {/* Quick action overlay trigger hover text */}
                      <div className="mt-3.5 pt-3.5 border-t border-zinc-900/80 flex items-center justify-between text-[10px] font-bold text-gray-400 hover:text-gold-500 transition-colors">
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-gray-500" />
                          <span>المورد: <span className="text-gray-300 font-semibold">{batch.supplier}</span></span>
                        </span>
                        <span className="flex items-center gap-0.5">
                          <span>عرض وتعديل الكمية</span>
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* ==================== SUB-TAB 2: AUDIT TRAIL LOGS ==================== */}
        {activeSubTab === 'logs' && (
          <motion.div
            key="logs"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-4"
          >
            <div className="bg-[#070707] border border-gold-500/10 p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-3">
              <h3 className="text-xs font-black text-gold-500 flex items-center gap-1.5">
                <History className="w-4 h-4 text-gold-500" />
                <span>أرشيف وسجل حركات الجرد والخصم اليدوي</span>
              </h3>
              <p className="text-[10px] text-gray-500">
                يتم رصد وحفظ هذه الحركات تلقائياً لضمان النزاهة الإدارية وتجنب فواقد المواد.
              </p>
            </div>

            {/* Logs Table */}
            {logs.length === 0 ? (
              <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-12 text-center">
                <History className="w-10 h-10 text-gray-800 mx-auto mb-2" />
                <p className="text-xs text-gray-500 font-bold">سجل حركات المخزن فارغ تماماً حتى الآن.</p>
              </div>
            ) : (
              <div className="bg-zinc-950 border border-zinc-900 rounded-2xl overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-black/60 border-b border-zinc-900 text-gray-400 font-bold">
                        <th className="p-3.5">تاريخ الحركة</th>
                        <th className="p-3.5">الدفعة</th>
                        <th className="p-3.5">اسم المنتج</th>
                        <th className="p-3.5">نوع الحركة</th>
                        <th className="p-3.5 text-center">التغيير بالكمية</th>
                        <th className="p-3.5 text-center">الكمية الجديدة</th>
                        <th className="p-3.5">المسؤول</th>
                        <th className="p-3.5">السبب / الملاحظات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900/60 font-semibold text-gray-300">
                      {logs.map((log) => {
                        const isNeg = log.quantity_changed < 0;
                        return (
                          <tr key={log.id} className="hover:bg-zinc-900/40 transition-colors">
                            <td className="p-3.5 font-mono text-[11px]">
                              <span className="block text-white font-bold">{log.date}</span>
                              <span className="text-[9px] text-gray-500 block mt-0.5">{log.time}</span>
                            </td>
                            <td className="p-3.5 text-gold-500 font-bold font-mono">{log.batch_serial}</td>
                            <td className="p-3.5 text-white font-black">{log.item_name}</td>
                            <td className="p-3.5">
                              {log.action_type === 'ADD_BATCH' ? (
                                <span className="bg-emerald-950/30 text-emerald-400 border border-emerald-900/30 px-2 py-0.5 rounded-full text-[10px]">إضافة دفعة</span>
                              ) : log.action_type === 'MANUAL_DEDUCT' ? (
                                <span className="bg-red-950/20 text-red-400 border border-red-900/30 px-2 py-0.5 rounded-full text-[10px]">خصم يدوي</span>
                              ) : log.action_type === 'MANUAL_ADD' ? (
                                <span className="bg-blue-950/20 text-blue-400 border border-blue-900/30 px-2 py-0.5 rounded-full text-[10px]">إضافة يدوية</span>
                              ) : log.action_type === 'DELETE_BATCH' ? (
                                <span className="bg-zinc-900 text-gray-400 border border-zinc-800 px-2 py-0.5 rounded-full text-[10px]">حذف دفعة</span>
                              ) : (
                                <span className="bg-amber-950/20 text-amber-400 border border-amber-900/30 px-2 py-0.5 rounded-full text-[10px]">جرد مخزني</span>
                              )}
                            </td>
                            <td className={`p-3.5 text-center font-mono font-bold ${isNeg ? 'text-red-400' : 'text-emerald-400'}`}>
                              {isNeg ? '' : '+'}{log.quantity_changed}
                            </td>
                            <td className="p-3.5 text-center font-mono font-bold text-gray-200">{log.new_quantity}</td>
                            <td className="p-3.5 flex items-center gap-1.5 mt-2">
                              <div className="w-5 h-5 rounded-full bg-[#D4AF37]/10 text-[#D4AF37] flex items-center justify-center text-[8px] font-black">
                                {log.operator.slice(0, 2)}
                              </div>
                              <span className="text-[11px] font-bold text-gray-300">{log.operator}</span>
                            </td>
                            <td className="p-3.5 text-gray-400 text-[11px] leading-relaxed max-w-xs truncate" title={log.reason}>
                              {log.reason}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ==================== SUB-TAB 3: REPORTS VIEW ==================== */}
        {activeSubTab === 'reports' && (
          <motion.div
            key="reports"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* Reports Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#070707] border border-gold-500/10 rounded-2xl p-4 flex items-center gap-4 shadow-lg">
                <div className="p-3 bg-gold-500/10 rounded-xl text-[#D4AF37]">
                  <Layers2 className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 font-bold block">إجمالي القيمة الشرائية للمخزون</span>
                  <span className="text-md font-bold font-mono text-white mt-1 block">{formatEGP(totalInventoryValue)}</span>
                </div>
              </div>

              <div className="bg-[#070707] border border-gold-500/10 rounded-2xl p-4 flex items-center gap-4 shadow-lg">
                <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500">
                  <AlertTriangle className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 font-bold block">دفعات قاربت على النفاد (LOW)</span>
                  <span className="text-md font-bold font-mono text-amber-400 mt-1 block">{lowStockBatches} دفعات</span>
                </div>
              </div>

              <div className="bg-[#070707] border border-gold-500/10 rounded-2xl p-4 flex items-center gap-4 shadow-lg">
                <div className="p-3 bg-red-500/10 rounded-xl text-red-500">
                  <AlertCircle className="w-6 h-6 animate-bounce" />
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 font-bold block">دفعات منتهية الصلاحية تماماً</span>
                  <span className="text-md font-bold font-mono text-red-400 mt-1 block">{expiredBatches} دفعات</span>
                </div>
              </div>
            </div>

            {/* Custom crafted graphical summaries using styled elements */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Box 1: Material Consumption percentage graph */}
              <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5">
                <h3 className="text-xs font-black text-white mb-4 pb-2 border-b border-zinc-900/60 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-gold-500" />
                  <span>دليل المواد الأكثر استهلاكاً (التصاعدي)</span>
                </h3>

                <div className="space-y-4">
                  {batches.slice(0, 5).map((b) => {
                    const pct = b.original_quantity > 0 ? (b.consumed_quantity / b.original_quantity) * 100 : 0;
                    return (
                      <div key={b.id} className="space-y-1.5">
                        <div className="flex justify-between text-[11px] font-bold">
                          <span className="text-gray-300">{b.item_name} <span className="text-[9px] font-mono text-gold-500">({b.batch_serial})</span></span>
                          <span className="text-gray-400 font-mono">{b.consumed_quantity} {b.unit} من {b.original_quantity} ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="w-full h-2 bg-black rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-gold-600 to-[#D4AF37] rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {batches.length === 0 && (
                    <p className="text-xs text-gray-600 text-center py-8 font-semibold">لا تتوفر أي بيانات إحصائية للدفعات حالياً.</p>
                  )}
                </div>
              </div>

              {/* Box 2: Supplier Purchases Table summary */}
              <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5">
                <h3 className="text-xs font-black text-white mb-4 pb-2 border-b border-zinc-900/60 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-gold-500" />
                  <span>ملخص التوريدات والمشتريات بالمخزن</span>
                </h3>

                <div className="space-y-3">
                  {/* Render dynamic suppliers list and how many batches they completed */}
                  {Array.from(new Set(batches.map(b => b.supplier))).slice(0, 5).map((supName, index) => {
                    const supBatches = batches.filter(b => b.supplier === supName);
                    const totalCost = supBatches.reduce((sum, b) => sum + (b.original_quantity * b.purchase_price), 0);
                    return (
                      <div key={index} className="flex justify-between items-center bg-black/40 p-2.5 rounded-xl border border-zinc-900/60">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gold-600/10 text-[#D4AF37] flex items-center justify-center font-bold text-xs">
                            {index + 1}
                          </div>
                          <div>
                            <span className="text-xs font-bold text-white block">{supName}</span>
                            <span className="text-[9px] text-gray-500 block font-semibold">عدد الدفعات الموردة: {supBatches.length}</span>
                          </div>
                        </div>
                        <span className="text-xs font-black text-emerald-400 font-mono">{formatEGP(totalCost)}</span>
                      </div>
                    );
                  })}
                  {batches.length === 0 && (
                    <p className="text-xs text-gray-600 text-center py-8 font-semibold">لا يوجد أي موردين مسجلين حتى الآن.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-zinc-900/80 pt-6 mt-6">
              <BatchProfitReportView />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================================== MODAL 1: ADD NEW BATCH ==================================== */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-luxury-card border-2 border-gold-500/20 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl text-right my-auto max-h-[92vh] flex flex-col"
              dir="rtl"
            >
              {/* Modal header */}
              <div className="bg-gradient-to-b from-zinc-900 to-black p-5 border-b border-gold-500/10 flex justify-between items-center shrink-0">
                <h3 className="text-sm font-black text-gold-500 flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-gold-500" />
                  <span>تسجيل دفعة مخزون وتوريد جديدة</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="p-1.5 bg-zinc-950 border border-zinc-900 hover:border-red-500 text-gray-500 hover:text-red-500 rounded-lg transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form body */}
              <form onSubmit={handleAddBatchSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 pb-16">
                {/* Switcher: Raw material or finished product */}
                <div className="grid grid-cols-2 gap-3 bg-zinc-950 p-1.5 rounded-2xl border border-zinc-900">
                  <button
                    type="button"
                    onClick={() => {
                      setItemType('raw_material');
                      setSelectedItemId('');
                    }}
                    className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      itemType === 'raw_material'
                        ? 'bg-gradient-to-l from-gold-600/20 to-gold-600/5 text-gold-400 border border-gold-500/25'
                        : 'text-gray-500 hover:text-white'
                    }`}
                  >
                    مواد خام (بن، سكر، حليب...)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setItemType('ready_product');
                      setSelectedItemId('');
                    }}
                    className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      itemType === 'ready_product'
                        ? 'bg-gradient-to-l from-gold-600/20 to-gold-600/5 text-gold-400 border border-gold-500/25'
                        : 'text-gray-500 hover:text-white'
                    }`}
                  >
                    منتجات جاهزة (كولا، مياه غازية، حلويات...)
                  </button>
                </div>

                {/* Unified free input with datalist suggestions */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-gold-500 font-bold block">
                    {itemType === 'raw_material' ? 'اسم المادة الخام (اكتب يدوياً أو اختر من المقترحات):' : 'اسم المنتج الجاهز (اكتب يدوياً أو اختر من المقترحات):'}
                  </label>
                  <input
                    type="text"
                    required
                    list="add-batch-items-suggestions"
                    placeholder={itemType === 'raw_material' ? 'مثال: شاي، بن يمني، سكر...' : 'مثال: كوكاكولا علب، مياه معدنية...'}
                    value={customItemName}
                    onChange={(e) => {
                      const typedValue = e.target.value;
                      setCustomItemName(typedValue);
                      // If it matches an existing item, set its ID and unit automatically
                      if (itemType === 'raw_material') {
                        const matched = rawMaterials.find(r => r.name.trim().toLowerCase() === typedValue.trim().toLowerCase());
                        if (matched) {
                          setSelectedItemId(matched.id);
                          setUnit(matched.unit || 'كيلوجرام');
                          if (matched.unit_cost) {
                            setPurchasePrice(matched.unit_cost.toString());
                          }
                        } else {
                          setSelectedItemId('');
                        }
                      } else {
                        const matched = products.find(p => (p.name_ar || '').trim().toLowerCase() === typedValue.trim().toLowerCase());
                        if (matched) {
                          setSelectedItemId(matched.id);
                          setUnit(matched.unit || 'عدد');
                          if (matched.cost_price) {
                            setPurchasePrice(matched.cost_price.toString());
                          }
                        } else {
                          setSelectedItemId('');
                        }
                      }
                    }}
                    className="w-full bg-zinc-950 text-white rounded-xl py-3 px-4 text-xs font-bold border border-zinc-900 focus:border-[#D4AF37] focus:outline-none transition-all placeholder:text-gray-600 text-right"
                  />
                  <datalist id="add-batch-items-suggestions">
                    {itemType === 'raw_material' ? (
                      rawMaterials.map(rm => (
                        <option key={rm.id} value={rm.name} />
                      ))
                    ) : (
                      products.map(p => (
                        <option key={p.id} value={p.name_ar} />
                      ))
                    )}
                  </datalist>
                </div>

                {/* Quantity and unit cost details */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-400 font-bold block">الكمية المدخلة بالمخزن:</label>
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="مثال: 50"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-full bg-zinc-950 text-white rounded-xl py-3 px-4 text-xs font-bold border border-zinc-900 focus:border-[#D4AF37] focus:outline-none transition-all placeholder:text-gray-600"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-400 font-bold block">وحدة القياس:</label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: كيلوجرام، جرام، كرتونة، عدد"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      className="w-full bg-zinc-950 text-white rounded-xl py-3 px-4 text-xs font-bold border border-zinc-900 focus:border-[#D4AF37] focus:outline-none transition-all placeholder:text-gray-600"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-400 font-bold block">سعر الشراء للوحدة (ج.م):</label>
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="مثال: 120"
                      value={purchasePrice}
                      onChange={(e) => setPurchasePrice(e.target.value)}
                      className="w-full bg-zinc-950 text-white rounded-xl py-3 px-4 text-xs font-bold border border-zinc-900 focus:border-[#D4AF37] focus:outline-none transition-all placeholder:text-gray-600"
                    />
                  </div>
                </div>

                {itemType === 'raw_material' && (
                  <div className="bg-amber-500/10 border border-amber-500/20 p-3.5 rounded-2xl space-y-2">
                    <label className="text-[11px] text-amber-400 font-bold block flex items-center gap-1.5">
                      <Coffee className="w-4 h-4 text-amber-400" />
                      <span>إنتاجية الدفعة للإنتاج / التقديم:</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] text-gray-400 block mb-1">عدد الوحدات/الأكواب الناتجة:</label>
                        <input
                          type="number"
                          min="1"
                          required
                          placeholder="مثال: 50"
                          value={yieldCapacity}
                          onChange={(e) => setYieldCapacity(e.target.value)}
                          className="w-full bg-zinc-950 text-white rounded-xl py-2.5 px-3 text-xs font-bold border border-zinc-900 focus:border-[#D4AF37] focus:outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-gray-400 block mb-1">وحدة التقديم/البيع:</label>
                        <select
                          value={yieldUnit}
                          onChange={(e) => setYieldUnit(e.target.value)}
                          className="w-full bg-zinc-950 text-white rounded-xl py-2.5 px-3 text-xs font-bold border border-zinc-900 focus:border-[#D4AF37] focus:outline-none transition-all cursor-pointer"
                        >
                          <option value="كوب">كوب (أكواب قهوة/شاي/مشروب)</option>
                          <option value="براد">براد</option>
                          <option value="جرعة">جرعة (Shot)</option>
                          <option value="وجبة">وجبة</option>
                          <option value="قطعة">قطعة</option>
                          <option value="عبوة">عبوة</option>
                        </select>
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-400">
                      عند بيع كل وحدات التقديم (مثل {yieldCapacity} {yieldUnit}) سيتم خصم 1 من عدد الوحدات المتبقية (مثال: {yieldCapacity} ➔ {Math.max(0, parseInt(yieldCapacity) - 1 || 49)} {yieldUnit}).
                    </p>
                  </div>
                )}

                {/* Supplier selection & Invoice Info */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-400 font-bold block">اسم المورد:</label>
                    <select
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      className="w-full bg-zinc-950 text-white rounded-xl py-3 px-3 text-xs font-bold border border-zinc-900 focus:border-[#D4AF37] focus:outline-none transition-all cursor-pointer"
                    >
                      <option value="">-- مورد غير محدد --</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.supplier_name} className="bg-black text-white">{s.supplier_name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-400 font-bold block">رقم فاتورة الشراء (اختياري):</label>
                    <input
                      type="text"
                      placeholder="مثال: INV-9023"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      className="w-full bg-zinc-950 text-white rounded-xl py-3 px-4 text-xs font-bold border border-zinc-900 focus:border-[#D4AF37] focus:outline-none transition-all placeholder:text-gray-600"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-400 font-bold block">تاريخ الشراء:</label>
                    <input
                      type="date"
                      required
                      value={purchaseDate}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                      className="w-full bg-zinc-950 text-white rounded-xl py-3 px-4 text-xs font-bold border border-zinc-900 focus:border-[#D4AF37] focus:outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Expiry Date (Optional field with warning prompt) */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-gray-400 font-bold block">تاريخ انتهاء صلاحية الدفعة (اختياري):</label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full bg-zinc-950 text-white rounded-xl py-3 px-4 text-xs font-bold border border-zinc-900 focus:border-[#D4AF37] focus:outline-none transition-all"
                  />
                  <span className="text-[9px] text-gray-500 block">سيقوم النظام بإرسال إشعار أحمر فور تخطي هذا التاريخ لضمان سلامة الأغذية.</span>
                </div>

                {/* CTA Action Buttons */}
                <div className="pt-4 border-t border-zinc-900 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false);
                      resetAddForm();
                    }}
                    className="px-5 py-3 bg-zinc-950 border border-zinc-900 hover:border-gray-700 text-gray-400 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    إلغاء التوريد
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-3 bg-gradient-to-r from-gold-600 to-[#D4AF37] hover:from-[#D4AF37] hover:to-gold-500 text-black font-extrabold text-xs rounded-xl shadow-lg cursor-pointer transition-all active:scale-95"
                  >
                    تأكيد وإدخال الدفعة تلقائياً
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================================== MODAL 2: BATCH DETAILS ==================================== */}
      <AnimatePresence>
        {showDetailsModal && selectedBatch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-luxury-card border border-gold-500/20 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl text-right my-auto max-h-[92vh] flex flex-col"
              dir="rtl"
            >
              {/* Header */}
              <div className="bg-gradient-to-b from-zinc-900 to-black p-5 border-b border-gold-500/10 flex justify-between items-center shrink-0">
                <div>
                  <span className="text-[10px] text-gold-500 block font-bold font-mono">{selectedBatch.batch_serial}</span>
                  <h3 className="text-xs font-black text-white mt-1">تفاصيل ومستوى دفعة المخزن</h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowDetailsModal(false);
                    setConfirmDeleteBatchId(null);
                  }}
                  className="p-1.5 bg-zinc-950 border border-zinc-900 hover:border-red-500 text-gray-500 hover:text-red-500 rounded-lg transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-5 overflow-y-auto flex-1 pb-16">
                {/* Visual statistics overview */}
                <div className="flex items-center gap-4 bg-zinc-950 p-4 rounded-2xl border border-zinc-900">
                  <div className="w-14 h-14 rounded-full bg-gold-600/10 border border-gold-500/20 text-[#D4AF37] flex items-center justify-center font-black text-lg shrink-0">
                    {selectedBatch.item_name.slice(0, 2)}
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-white">{selectedBatch.item_name}</h4>
                    <span className="text-[10px] text-gray-500 block mt-0.5">نوع الدفعة: {selectedBatch.item_type === 'raw_material' ? 'مواد خام للمنيو' : 'منتج جاهز للبيع المباشر'}</span>
                  </div>
                </div>

                 {/* Progress bar info */}
                <div className="space-y-1.5 bg-zinc-950 p-4 rounded-2xl border border-zinc-900">
                  <div className="flex justify-between items-center text-xs text-gray-400">
                    <span className="font-bold flex items-center gap-1">
                      <Activity className="w-4 h-4 text-gold-500" />
                      <span>نسبة الاستهلاك الإجمالية</span>
                    </span>
                    <span className="font-black font-mono text-gold-400">
                      {(selectedBatch.item_type === 'raw_material'
                        ? (selectedBatch.status === 'COMPLETED' ? 100 : 0)
                        : ((selectedBatch.consumed_quantity / selectedBatch.original_quantity) * 100)
                      ).toFixed(0)}%
                    </span>
                  </div>
                  <div className="w-full h-3 bg-black rounded-full overflow-hidden p-0.5 border border-zinc-800">
                    <div
                      className="h-full bg-gradient-to-r from-gold-600 to-gold-400 rounded-full"
                      style={{
                        width: `${selectedBatch.item_type === 'raw_material'
                          ? (selectedBatch.status === 'COMPLETED' ? 100 : 0)
                          : ((selectedBatch.consumed_quantity / selectedBatch.original_quantity) * 100)
                        }%`
                      }}
                    />
                  </div>
                </div>

                {/* Metadata List of Batch */}
                <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4 divide-y divide-zinc-900/60 text-xs">
                  <div className="py-2.5 flex justify-between">
                    <span className="text-gray-500">سعة الدفعة بالإنتاج:</span>
                    <span className="font-bold text-white font-mono">
                      {selectedBatch.item_type === 'raw_material' ? (selectedBatch.yield_capacity || selectedBatch.original_quantity) : selectedBatch.original_quantity}{' '}
                      {selectedBatch.item_type === 'raw_material' ? (selectedBatch.yield_unit || 'كوب') : selectedBatch.unit}
                      {selectedBatch.item_type === 'raw_material' && selectedBatch.raw_material_qty && (
                        <span className="text-gray-500 font-sans text-[10px] mr-1">
                          (من {selectedBatch.raw_material_qty} {selectedBatch.unit})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-gray-500">الكمية المتبقية حالياً بالدفعة:</span>
                    <span className="font-bold text-emerald-400 font-mono">
                      {selectedBatch.item_type === 'raw_material' ? (selectedBatch.yield_capacity ? Math.max(0, selectedBatch.yield_capacity - selectedBatch.consumed_quantity) : selectedBatch.remaining_quantity) : selectedBatch.remaining_quantity}{' '}
                      {selectedBatch.item_type === 'raw_material' ? (selectedBatch.yield_unit || 'كوب') : selectedBatch.unit}
                    </span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-gray-500">سعر الشراء الفردي:</span>
                    <span className="font-bold text-gray-300 font-mono">{formatEGP(selectedBatch.purchase_price)}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-gray-500">تاريخ التوريد:</span>
                    <span className="font-bold text-gray-300 font-mono">{selectedBatch.purchase_date}</span>
                  </div>
                  {selectedBatch.expiry_date && (
                    <div className="py-2.5 flex justify-between">
                      <span className="text-gray-500">تاريخ انتهاء الصلاحية:</span>
                      <span className="font-bold text-red-400 font-mono">{selectedBatch.expiry_date}</span>
                    </div>
                  )}
                  <div className="py-2.5 flex justify-between">
                    <span className="text-gray-500">المورد المعتمد:</span>
                    <span className="font-bold text-gray-300">{selectedBatch.supplier}</span>
                  </div>

                  {selectedBatch.item_type === 'raw_material' && (() => {
                    const bCons = batchConsumptions.filter(c => c.batch_id === selectedBatch.id);
                    const grouped = bCons.reduce((acc, curr) => {
                      const name = curr.product_name || 'كوب/طلب';
                      acc[name] = (acc[name] || 0) + (curr.product_quantity || 0);
                      return acc;
                    }, {} as Record<string, number>);
                    const totalRevenue = bCons.reduce((acc, curr) => acc + (curr.total_revenue || 0), 0);
                    return (
                      <div className="py-2.5 space-y-2">
                        <span className="text-gray-500 block font-bold text-gold-500">تفاصيل المبيعات المستخرجة:</span>
                        <div className="bg-black/40 rounded-xl p-3 border border-zinc-900 space-y-2 text-right">
                          {bCons.length === 0 ? (
                            <span className="text-gray-400 block">لا توجد مبيعات مسجلة بعد على هذه الدفعة</span>
                          ) : (
                            <>
                              <div className="flex flex-wrap gap-1.5">
                                {Object.entries(grouped).map(([name, qty]) => (
                                  <span key={name} className="bg-gold-500/10 border border-gold-500/20 text-gold-400 font-bold px-2 py-1 rounded-lg text-[10px]">
                                    {name}: {qty} كوب/طلب
                                  </span>
                                ))}
                              </div>
                              <div className="flex justify-between text-[11px] font-bold pt-1.5 border-t border-zinc-900/40 text-emerald-400">
                                <span>إجمالي مبيعات الدفعة:</span>
                                <span className="font-mono">{formatEGP(totalRevenue)}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Primary Action: End Batch Button */}
                {selectedBatch.status !== 'COMPLETED' && (
                  <button
                    onClick={() => {
                      if (window.confirm(`هل أنت متأكد من إنهاء الدفعة الحالية (${selectedBatch.batch_serial})؟\nسوف يتم إغلاق هذه الدفعة رسمياً، احتساب أرباحها وعدد الأكواب المستخرجة منها، والبدء بالدفعة الجديدة.`)) {
                        const updated = dbService.completeInventoryBatch(selectedBatch.id, 'المالك');
                        setBatches(updated);
                        onShowSuccessAlert(`تم إنهاء الدفعة (${selectedBatch.batch_serial}) بنجاح!`);
                        setShowDetailsModal(false);
                        loadAllData();
                      }
                    }}
                    className="w-full py-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-95 transition-all mb-2"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <span>إنهاء الدفعة الحالية وفتح دفعة جديدة</span>
                  </button>
                )}

                {/* Detail action buttons */}
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => {
                      setAdjustBatch(selectedBatch);
                      setAdjustType('DEDUCT');
                      setShowAdjustModal(true);
                      setShowDetailsModal(false);
                    }}
                    className="py-3 bg-gradient-to-r from-red-600 to-red-500 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-lg active:scale-95 transition-all"
                  >
                    <ArrowDownCircle className="w-4.5 h-4.5" />
                    <span>سحب / خصم استهلاك يدوي</span>
                  </button>

                  <button
                    onClick={() => {
                      setAdjustBatch(selectedBatch);
                      setAdjustType('ADD');
                      setShowAdjustModal(true);
                      setShowDetailsModal(false);
                    }}
                    className="py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-lg active:scale-95 transition-all"
                  >
                    <ArrowUpCircle className="w-4.5 h-4.5" />
                    <span>إضافة كمية تكميلية للدفعة</span>
                  </button>
                </div>

                {/* Audit and purge row */}
                <div className="pt-4 border-t border-zinc-900 flex justify-between items-center">
                  <button
                    onClick={() => {
                      setAdjustBatch(selectedBatch);
                      setAdjustType('INVENTORY_CHECK');
                      setShowAdjustModal(true);
                      setShowDetailsModal(false);
                    }}
                    className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 bg-amber-950/20 border border-amber-900/30 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    <span>عملية جرد مخزني للدفعة</span>
                  </button>

                  {confirmDeleteBatchId === selectedBatch.id ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteBatch(selectedBatch.id, selectedBatch.batch_serial)}
                      className="text-xs text-white hover:bg-red-700 font-black flex items-center gap-1 bg-red-600 border border-red-500 px-3 py-1.5 rounded-xl transition-all cursor-pointer animate-pulse"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>تأكيد الحذف نهائياً؟ ⚠️</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteBatchId(selectedBatch.id)}
                      className="text-xs text-red-500 hover:text-red-400 font-bold flex items-center gap-1 bg-red-950/20 border border-red-900/30 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>حذف نهائي</span>
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================================== MODAL 3: MANUAL ADJUSTMENT ==================================== */}
      <AnimatePresence>
        {showAdjustModal && adjustBatch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-luxury-card border-2 border-gold-500/20 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl text-right my-auto max-h-[92vh] flex flex-col"
              dir="rtl"
            >
              <div className="bg-gradient-to-b from-zinc-900 to-black p-5 border-b border-gold-500/10 flex justify-between items-center shrink-0">
                <h3 className="text-xs font-black text-gold-500 flex items-center gap-2">
                  <Activity className="w-4.5 h-4.5 text-gold-500" />
                  <span>
                    {adjustType === 'DEDUCT' ? 'خصم وسحب كمية مستهلكة' : adjustType === 'ADD' ? 'إضافة كمية للدفعة' : 'إجراء جرد وتعديل الكمية المتبقية'}
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="p-1.5 bg-zinc-950 border border-zinc-900 hover:border-red-500 text-gray-500 hover:text-red-500 rounded-lg transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form adjustment body */}
              <form onSubmit={handleAdjustSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 pb-16">
                <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-900 text-xs">
                  <span className="text-gray-500 block leading-none mb-1">تعديل كمية دفعة:</span>
                  <span className="text-white font-black block">{adjustBatch.item_name} ({adjustBatch.batch_serial})</span>
                  <span className="text-[11px] text-gray-400 block mt-2 font-bold">
                    الكمية المتبقية حالياً في الدفعة: <span className="text-emerald-400 font-mono">
                      {adjustBatch.item_type === 'raw_material' ? (adjustBatch.yield_capacity ? Math.max(0, adjustBatch.yield_capacity - adjustBatch.consumed_quantity) : adjustBatch.remaining_quantity) : adjustBatch.remaining_quantity}{' '}
                      {adjustBatch.item_type === 'raw_material' ? (adjustBatch.yield_unit || 'كوب') : adjustBatch.unit}
                    </span>
                  </span>
                </div>

                {/* Switch adjusting type if they want */}
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-400 font-bold block">نوع المعاملة الجارية:</label>
                  <div className="grid grid-cols-3 gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-900">
                    <button
                      type="button"
                      onClick={() => setAdjustType('DEDUCT')}
                      className={`py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                        adjustType === 'DEDUCT' ? 'bg-red-600 text-white' : 'text-gray-500 hover:text-white'
                      }`}
                    >
                      خصم واستهلاك
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustType('ADD')}
                      className={`py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                        adjustType === 'ADD' ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-white'
                      }`}
                    >
                      إضافة توريد
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustType('INVENTORY_CHECK')}
                      className={`py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                        adjustType === 'INVENTORY_CHECK' ? 'bg-amber-600 text-white' : 'text-gray-500 hover:text-white'
                      }`}
                    >
                      جرد وتصحيح
                    </button>
                  </div>
                </div>

                {/* Form fields */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-gray-400 font-bold block">الكمية للتعديل ({adjustBatch.unit}):</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="مثال: 5"
                    value={adjustQuantity}
                    onChange={(e) => setAdjustQuantity(e.target.value)}
                    className="w-full bg-zinc-950 text-white rounded-xl py-3 px-4 text-xs font-bold border border-zinc-900 focus:border-[#D4AF37] focus:outline-none transition-all placeholder:text-gray-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-gray-400 font-bold block">سبب الحركة / الملاحظات لإدراجها بالسجل:</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: سحب لصناعة قهوة، تالف قهوة، تصحيح جرد نهاية الأسبوع..."
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    className="w-full bg-zinc-950 text-white rounded-xl py-3 px-4 text-xs font-bold border border-zinc-900 focus:border-[#D4AF37] focus:outline-none transition-all placeholder:text-gray-600"
                  />
                </div>

                {/* Action buttons */}
                <div className="pt-4 border-t border-zinc-900 flex justify-end gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdjustModal(false);
                      setAdjustQuantity('');
                      setAdjustReason('');
                    }}
                    className="px-5 py-3 bg-zinc-950 border border-zinc-900 hover:border-gray-700 text-gray-400 rounded-xl font-bold cursor-pointer"
                  >
                    إلغاء التعديل
                  </button>
                  <button
                    type="submit"
                    className={`px-6 py-3 text-black font-extrabold rounded-xl shadow-lg transition-all active:scale-95 cursor-pointer ${
                      adjustType === 'DEDUCT' 
                        ? 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400' 
                        : adjustType === 'ADD' 
                          ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400' 
                          : 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400'
                    }`}
                  >
                    حفظ الحركة وتأكيد الجرد
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================================== MODAL 4: DEPLETION WARNING ==================================== */}
      <AnimatePresence>
        {showDepletedModal && depletedBatch && (
          <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="bg-[#050505] border-2 border-red-600/50 rounded-3xl w-full max-w-md p-6 text-center space-y-5 shadow-2xl relative my-auto max-h-[92vh] overflow-y-auto pb-16"
            >
              {/* Glow background indicator red */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

              <div className="w-16 h-16 bg-red-600/10 text-red-500 border border-red-600/20 rounded-full flex items-center justify-center mx-auto animate-bounce shadow-inner">
                <AlertCircle className="w-8 h-8" />
              </div>

              <div className="space-y-1.5 relative z-10">
                <h3 className="text-sm font-black text-white">تنبيه هام: نفاد كمية الدفعة بالكامل! ⚠️</h3>
                <p className="text-xs text-gray-300">
                  لقد تم استهلاك دفعة <strong className="text-red-400 underline font-extrabold">({depletedBatch.name})</strong> بالكامل وأصبح رصيدها صفر جراء الحركة الأخيرة.
                </p>
              </div>

              <p className="text-[11px] text-gray-500 relative z-10 leading-relaxed">
                يرجى تسجيل دفعة جديدة للمخزن على الفور للحفاظ على تدفق العمليات وتأمين كود المبيعات لـ Cafe Eldeeb.
              </p>

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-2.5 pt-3 relative z-10 text-xs">
                <button
                  onClick={() => {
                    const b = batches.find(x => x.id === depletedBatch.id);
                    if (b) {
                      setItemType(b.item_type);
                      setCustomItemName(b.item_name);
                      setUnit(b.unit);
                      setPurchasePrice(b.purchase_price.toString());
                      setSupplierName(b.supplier);
                    }
                    setShowDepletedModal(false);
                    setShowAddModal(true);
                  }}
                  className="py-3 bg-gradient-to-r from-gold-600 to-[#D4AF37] hover:from-[#D4AF37] hover:to-gold-500 text-black font-extrabold rounded-xl shadow-lg transition-all active:scale-95 cursor-pointer"
                >
                  إضافة دفعة جديدة
                </button>

                <button
                  onClick={() => {
                    const b = batches.find(x => x.id === depletedBatch.id);
                    if (b) {
                      setSelectedBatch(b);
                      setShowDetailsModal(true);
                    }
                    setShowDepletedModal(false);
                  }}
                  className="py-3 bg-zinc-950 border border-zinc-900 hover:border-gray-700 text-gray-400 font-bold rounded-xl transition-all cursor-pointer"
                >
                  عرض تفاصيل الدفعة
                </button>
              </div>

              <button
                onClick={() => setShowDepletedModal(false)}
                className="absolute top-2.5 right-2.5 p-1 text-gray-500 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
